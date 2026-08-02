"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiClientError,
  completePersistedInterviewSession,
  createPersistedInterviewSession,
  generateQuestions,
  generateReport,
  generateReportStream,
  getActivePromptOverrides,
  getCurrentPersistedInterviewSession,
  getPersistedInterviewSession,
  parseProfile,
  regenerateQuestionReport,
  savePersistedAnswer,
  savePersistedMilestone,
  savePersistedReport,
  saveActivePromptOverrides
} from "@/lib/api/client";
import type { InterviewPersistenceMode } from "@/lib/config/internalBeta";
import { buildFallbackReport } from "@/lib/demo/fallback";
import { demoScenario } from "@/lib/demo/scenario";
import { INTERVIEWER_STYLES, SESSION_STEPS } from "@/lib/state/constants";
import type {
  CandidateProfile,
  GenerationMeasurement,
  GenerationSource,
  InterviewAnswer,
  InterviewQuestion,
  InterviewReport,
  InterviewSessionSnapshot,
  InterviewerStyleId,
  QuestionReport,
  SessionStep,
  SetupForm,
  VisualTheme
} from "@/lib/types";
import { InterviewPanel } from "@/components/interview/InterviewPanel";
import { DevOpsPanel } from "@/components/dev/DevOpsPanel";
import { cloneDefaultPromptOverrides, PromptDebugPanel } from "@/components/dev/PromptDebugPanel";
import { JujuOrb } from "@/components/JujuOrb";
import { ReportPanel } from "@/components/report/ReportPanel";
import { FeedbackPanel } from "@/components/feedback/FeedbackPanel";
import { QuestionnaireConfigPanel } from "@/components/questionnaire/QuestionnaireConfigPanel";
import { SetupPanel } from "@/components/setup/SetupPanel";
import { ProviderStatusPanel } from "@/components/ProviderStatusPanel";

const stepLabels: Record<SessionStep, string> = {
  setup: "Setup",
  profile: "Profile",
  questions: "Questions",
  interview: "Interview",
  report: "Report"
};

const activeSessionStorageKey = "passbuddy:active-interview-session:v1";

type FigmaSetupStep = "home" | "jd";

function localFallbackMeasurement(): GenerationMeasurement {
  return {
    source: "demo_fallback",
    provider: "local_demo",
    model: null,
    latencyMs: null,
    attempts: null,
    inputTokens: null,
    outputTokens: null,
    requestId: null
  };
}

function formatPromptTimestamp(value: string | null) {
  if (!value) return "未保存";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

// Status-bar clock: renders the "9:41" placeholder on the server and first client
// render (so hydration matches), then shows the real system time and ticks it.
function StatusBarClock() {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(`${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}`);
    };
    update();
    const timer = window.setInterval(update, 15000);
    return () => window.clearInterval(timer);
  }, []);
  return <span suppressHydrationWarning>{time ?? "9:41"}</span>;
}

export function InterviewCoachApp({
  initialVisualTheme = "juju",
  initialPersistenceMode = "off"
}: {
  initialVisualTheme?: VisualTheme;
  initialPersistenceMode?: InterviewPersistenceMode;
}) {
  const isFigmaLikeTheme = initialVisualTheme === "figma" || initialVisualTheme === "juju";
  const [step, setStep] = useState<SessionStep>("setup");
  const [figmaSetupInitialStep, setFigmaSetupInitialStep] = useState<FigmaSetupStep>("home");
  const [figmaProfileStage, setFigmaProfileStage] = useState<"profile" | "selectInterviewer" | "confirmInterviewer">("profile");
  const [form, setForm] = useState<SetupForm>({
    resumeText: "",
    jdText: "",
    interviewerStyleId: demoScenario.defaultInterviewerStyleId
  });
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [answers, setAnswers] = useState<InterviewAnswer[]>([]);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [persistedSessionId, setPersistedSessionId] = useState<string | null>(null);
  const [persistedVersion, setPersistedVersion] = useState(0);
  const [persistedStatus, setPersistedStatus] =
    useState<InterviewSessionSnapshot["status"] | null>(null);
  const [persistedSessionNumber, setPersistedSessionNumber] = useState<number | null>(null);
  const [profileGenerationPending, setProfileGenerationPending] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [quotaExhaustedDialogOpen, setQuotaExhaustedDialogOpen] = useState(false);
  const [streamedQuestionReports, setStreamedQuestionReports] = useState<QuestionReport[]>([]);
  const [reportState, setReportState] = useState<{
    kind: "idle" | "loading" | "streaming" | "ready" | "error";
    message: string;
    usedFallback: boolean;
  }>({
    kind: "idle",
    message: "",
    usedFallback: false
  });
  const [status, setStatus] = useState<{ kind: "idle" | "loading" | "error" | "success"; message: string }>({
    kind: "idle",
    message: "等待输入简历和 JD。"
  });
  const [promptOverrides, setPromptOverrides] = useState(cloneDefaultPromptOverrides);
  const [promptStoreUpdatedAt, setPromptStoreUpdatedAt] = useState<string | null>(null);
  const [promptSaveState, setPromptSaveState] = useState<{
    kind: "idle" | "loading" | "success" | "error";
    message: string;
  }>({ kind: "idle", message: "当前为本页草稿；保存后会成为 figma 主题和全局接口默认 Prompt。" });
  const createIdempotencyKeyRef = useRef(crypto.randomUUID());
  const persistedSessionIdRef = useRef<string | null>(null);
  const persistedVersionRef = useRef(0);
  const answersRef = useRef<InterviewAnswer[]>([]);
  const answerSaveTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>()
  );

  const selectedStyle = useMemo(
    () => INTERVIEWER_STYLES.find((style) => style.id === form.interviewerStyleId) ?? INTERVIEWER_STYLES[0],
    [form.interviewerStyleId]
  );

  useEffect(() => {
    document.body.dataset.visualTheme = initialVisualTheme;
    return () => {
      delete document.body.dataset.visualTheme;
    };
  }, [initialVisualTheme]);

  useEffect(() => {
    persistedSessionIdRef.current = persistedSessionId;
  }, [persistedSessionId]);

  useEffect(() => {
    persistedVersionRef.current = persistedVersion;
  }, [persistedVersion]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    return () => {
      answerSaveTimersRef.current.forEach((timer) => clearTimeout(timer));
      answerSaveTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (initialPersistenceMode !== "source") return;
    let cancelled = false;

    async function restorePersistedSession() {
      try {
        const storedId =
          typeof window === "undefined"
            ? null
            : window.localStorage.getItem(activeSessionStorageKey);
        let snapshot: InterviewSessionSnapshot | null = null;
        if (storedId) {
          snapshot = await getPersistedInterviewSession(storedId).catch(() => null);
        }
        // Completed sessions are restored only while the first-session
        // questionnaire is still required. This prevents a stale localStorage
        // id from reopening an already-unlocked report after submission.
        if (!snapshot || snapshot.status === "completed") {
          snapshot = await getCurrentPersistedInterviewSession();
        }
        if (cancelled || !snapshot) return;
        applyPersistedSnapshot(snapshot);
        setStatus({
          kind: "success",
          message: "已从数据库恢复上次提交的面试进度。"
        });
      } catch (error) {
        if (!cancelled) {
          setStatus({
            kind: "error",
            message: `${error instanceof Error ? error.message : "恢复失败"} 可保留当前页面草稿后重试。`
          });
        }
      }
    }

    void restorePersistedSession();
    return () => {
      cancelled = true;
    };
  }, [initialPersistenceMode]);

  useEffect(() => {
    if (isFigmaLikeTheme || typeof window === "undefined") return;

    let cancelled = false;
    async function loadActivePrompt() {
      try {
        const snapshot = await getActivePromptOverrides();
        if (cancelled) return;
        setPromptOverrides(snapshot.promptOverrides);
        setPromptStoreUpdatedAt(snapshot.updatedAt);
        setPromptSaveState({
          kind: "success",
          message: snapshot.updatedAt
            ? `已加载全局 Prompt，保存时间：${formatPromptTimestamp(snapshot.updatedAt)}`
            : "尚未保存过全局 Prompt，当前加载产品默认 Prompt。"
        });
      } catch (error) {
        if (cancelled) return;
        setPromptSaveState({
          kind: "error",
          message: error instanceof Error ? error.message : "读取全局 Prompt 失败，当前使用产品默认 Prompt。"
        });
      }
    }

    loadActivePrompt();
    return () => {
      cancelled = true;
    };
  }, [isFigmaLikeTheme]);

  const activePromptOverrides = isFigmaLikeTheme ? undefined : promptOverrides;

  async function handleSaveGlobalPrompt() {
    try {
      setPromptSaveState({ kind: "loading", message: "正在保存为全局 Prompt..." });
      const snapshot = await saveActivePromptOverrides(promptOverrides);
      setPromptOverrides(snapshot.promptOverrides);
      setPromptStoreUpdatedAt(snapshot.updatedAt);
      setPromptSaveState({
        kind: "success",
        message: `已保存为全局 Prompt。figma 主题和后续 LLM 请求会默认使用这份 Prompt。保存时间：${formatPromptTimestamp(snapshot.updatedAt)}`
      });
    } catch (error) {
      setPromptSaveState({
        kind: "error",
        message: error instanceof Error ? error.message : "保存全局 Prompt 失败。"
      });
    }
  }

  async function handleReloadGlobalPrompt() {
    try {
      setPromptSaveState({ kind: "loading", message: "正在重新加载全局 Prompt..." });
      const snapshot = await getActivePromptOverrides();
      setPromptOverrides(snapshot.promptOverrides);
      setPromptStoreUpdatedAt(snapshot.updatedAt);
      setPromptSaveState({
        kind: "success",
        message: snapshot.updatedAt
          ? `已重新加载全局 Prompt，保存时间：${formatPromptTimestamp(snapshot.updatedAt)}`
          : "尚未保存过全局 Prompt，已恢复产品默认 Prompt。"
      });
    } catch (error) {
      setPromptSaveState({
        kind: "error",
        message: error instanceof Error ? error.message : "重新加载全局 Prompt 失败。"
      });
    }
  }

  function rememberPersistedSession(snapshot: InterviewSessionSnapshot) {
    setPersistedSessionId(snapshot.sessionId);
    setPersistedVersion(snapshot.version);
    setPersistedStatus(snapshot.status);
    persistedSessionIdRef.current = snapshot.sessionId;
    persistedVersionRef.current = snapshot.version;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(activeSessionStorageKey, snapshot.sessionId);
    }
  }

  function applyPersistedSnapshot(snapshot: InterviewSessionSnapshot) {
    rememberPersistedSession(snapshot);
    setForm({
      resumeText: snapshot.resumeText,
      jdText: snapshot.jdText,
      interviewerStyleId: snapshot.interviewerStyleId
    });
    setProfile(snapshot.candidateProfile);
    setQuestions(snapshot.questions);
    const restoredAnswers =
      snapshot.questions.length > 0
        ? snapshot.questions.map(
            (question) =>
              snapshot.answers.find(
                (answer) => answer.questionId === question.id
              ) ?? {
                questionId: question.id,
                answerText: "",
                inputMode: "text" as const,
                durationSec: 0,
                sttStatus: "manual" as const
              }
          )
        : snapshot.answers;
    setAnswers(restoredAnswers);
    setReport(snapshot.report);
    setStreamedQuestionReports([]);
    if (snapshot.report) {
      setStep("report");
      setReportState({
        kind: "ready",
        message: "已恢复数据库中的复盘报告。",
        usedFallback: snapshot.generationSource !== "llm"
      });
    } else if (
      snapshot.status === "questions_ready" ||
      snapshot.status === "in_progress"
    ) {
      setStep("interview");
      setReportState({ kind: "idle", message: "", usedFallback: false });
    } else if (snapshot.candidateProfile) {
      setStep("profile");
      setFigmaProfileStage("profile");
    } else {
      setStep("setup");
    }
  }

  function clearPersistedSession() {
    setPersistedSessionId(null);
    setPersistedVersion(0);
    setPersistedStatus(null);
    setPersistedSessionNumber(null);
    persistedSessionIdRef.current = null;
    persistedVersionRef.current = 0;
    createIdempotencyKeyRef.current = crypto.randomUUID();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(activeSessionStorageKey);
    }
  }

  async function ensurePersistedSession(nextForm: SetupForm) {
    if (initialPersistenceMode === "off") return null;
    if (persistedSessionIdRef.current) {
      return {
        sessionId: persistedSessionIdRef.current,
        version: persistedVersionRef.current
      };
    }
    try {
      const created = await createPersistedInterviewSession({
        ...nextForm,
        idempotencyKey: createIdempotencyKeyRef.current
      });
      setPersistedSessionId(created.sessionId);
      setPersistedVersion(created.version);
      setPersistedStatus(created.status);
      setPersistedSessionNumber(created.quota.used);
      persistedSessionIdRef.current = created.sessionId;
      persistedVersionRef.current = created.version;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(activeSessionStorageKey, created.sessionId);
      }
      return created;
    } catch (error) {
      if (initialPersistenceMode === "source") throw error;
      console.warn("[persistence/mirror] create failed");
      return null;
    }
  }

  async function persistMilestone(
    milestone: "profile_ready" | "questions_ready",
    value: CandidateProfile | InterviewQuestion[],
    generationSource: GenerationSource,
    measurement?: GenerationMeasurement
  ) {
    const sessionId = persistedSessionIdRef.current;
    if (initialPersistenceMode === "off" || !sessionId) return null;
    try {
      const snapshot = await savePersistedMilestone(sessionId, {
        expectedVersion: persistedVersionRef.current,
        milestone,
        candidateProfile:
          milestone === "profile_ready"
            ? (value as CandidateProfile)
            : undefined,
        questions:
          milestone === "questions_ready"
            ? (value as InterviewQuestion[])
            : undefined,
        generationSource,
        measurement,
        idempotencyKey: crypto.randomUUID()
      });
      rememberPersistedSession(snapshot);
      return snapshot;
    } catch (error) {
      if (initialPersistenceMode === "source") throw error;
      console.warn("[persistence/mirror] milestone failed");
      return null;
    }
  }

  async function persistAnswersNow(nextAnswers: InterviewAnswer[]) {
    const sessionId = persistedSessionIdRef.current;
    if (initialPersistenceMode === "off" || !sessionId) return;
    answerSaveTimersRef.current.forEach((timer) => clearTimeout(timer));
    answerSaveTimersRef.current.clear();
    for (const answer of nextAnswers) {
      try {
        const snapshot = await savePersistedAnswer(
          sessionId,
          answer,
          crypto.randomUUID()
        );
        rememberPersistedSession(snapshot);
      } catch (error) {
        if (initialPersistenceMode === "source") throw error;
        console.warn("[persistence/mirror] answer failed");
      }
    }
  }

  function handleAnswersChange(nextAnswers: InterviewAnswer[]) {
    setAnswers(nextAnswers);
    answersRef.current = nextAnswers;
    const sessionId = persistedSessionIdRef.current;
    if (initialPersistenceMode === "off" || !sessionId) return;
    nextAnswers.forEach((answer) => {
      const existing = answerSaveTimersRef.current.get(answer.questionId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        answerSaveTimersRef.current.delete(answer.questionId);
        void savePersistedAnswer(
          sessionId,
          answer,
          crypto.randomUUID()
        )
          .then(rememberPersistedSession)
          .catch(() => {
            setStatus({
              kind: "error",
              message: "答案保存失败，当前输入仍保留在页面中，可继续编辑或重试生成报告。"
            });
          });
      }, 700);
      answerSaveTimersRef.current.set(answer.questionId, timer);
    });
  }

  function resetDownstream(nextForm: SetupForm) {
    if (persistedSessionIdRef.current) clearPersistedSession();
    setForm(nextForm);
    setProfile(null);
    setQuestions([]);
    setAnswers([]);
    setReport(null);
    setStreamedQuestionReports([]);
    setReportState({ kind: "idle", message: "", usedFallback: false });
    setFigmaProfileStage("profile");
    setSetupError("");
    setQuotaExhaustedDialogOpen(false);
    setStep("setup");
    setStatus({ kind: "idle", message: "已切换输入，后续画像、题目和报告会重新生成。" });
  }

  function updateFormWithoutReset(patch: Partial<SetupForm>) {
    setForm((current) => ({
      ...current,
      ...patch
    }));
    setQuestions([]);
    setAnswers([]);
    setReport(null);
    setStreamedQuestionReports([]);
    setReportState({ kind: "idle", message: "", usedFallback: false });
  }

  function fillDemo() {
    resetDownstream({
      resumeText: demoScenario.resumeText,
      jdText: demoScenario.jdText,
      interviewerStyleId: form.interviewerStyleId
    });
    setStatus({ kind: "success", message: "已填入演示兜底样例，可直接开始生成画像。" });
  }

  async function fillDemoAndStart() {
    const nextForm: SetupForm = {
      resumeText: demoScenario.resumeText,
      jdText: demoScenario.jdText,
      interviewerStyleId: form.interviewerStyleId
    };
    resetDownstream(nextForm);
    await handleParseProfile(nextForm);
  }

  async function handleParseProfile(nextForm = form) {
    if (!nextForm.resumeText.trim() || !nextForm.jdText.trim()) {
      setStatus({ kind: "error", message: "简历和 JD 都不能为空。" });
      return;
    }

    setSetupError("");
    setStep("setup");
    setProfileGenerationPending(true);
    setStatus({ kind: "loading", message: "正在检查面试额度并生成候选人画像..." });
    try {
      await ensurePersistedSession(nextForm);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "SESSION_QUOTA_EXHAUSTED") {
        setStatus({ kind: "idle", message: "等待输入简历和 JD。" });
        setSetupError("");
        setQuotaExhaustedDialogOpen(true);
        setProfileGenerationPending(false);
        return;
      }
      // The questionnaire only ever appears on the report page of the session
      // that is blocking us. Telling the user to "go fill it in" is a dead end
      // because there is no way back to that report, so take them there.
      if (error instanceof ApiClientError && error.code === "QUESTIONNAIRE_REQUIRED") {
        const blockingSession = await getCurrentPersistedInterviewSession().catch(() => null);
        setProfileGenerationPending(false);
        if (blockingSession) {
          applyPersistedSnapshot(blockingSession);
          setSetupError("");
          setStatus({
            kind: "success",
            message: "开始新面试前请先完成上一场的调研问卷，已为你打开该场报告。"
          });
          return;
        }
        const message = "请先完成上一场面试的调研问卷，再开始新的面试。";
        setStatus({ kind: "error", message });
        setSetupError(message);
        return;
      }
      const message = error instanceof Error ? error.message : "创建面试 Session 失败，输入已保留。";
      setStatus({
        kind: "error",
        message
      });
      setSetupError(message);
      setProfileGenerationPending(false);
      return;
    }

    let nextProfile: CandidateProfile;
    let generationSource: GenerationSource = "mixed";
    let measurement: GenerationMeasurement | undefined;
    let generationMessage = "";
    try {
      setStatus({ kind: "loading", message: "正在生成候选人画像..." });
      const generated = await parseProfile({
        ...nextForm,
        promptOverrides: activePromptOverrides
      });
      nextProfile = generated.data;
      generationSource = generated.measurement.source;
      measurement = generated.measurement;
    } catch (error) {
      nextProfile = demoScenario.candidateProfile;
      generationSource = "demo_fallback";
      measurement = localFallbackMeasurement();
      generationMessage = `${error instanceof Error ? error.message : "画像生成失败"} 已使用演示兜底画像继续。`;
    }

    setProfile(nextProfile);
    try {
      await persistMilestone(
        "profile_ready",
        nextProfile,
        generationSource,
        measurement
      );
      setFigmaProfileStage("profile");
      setStep("profile");
      setStatus({
        kind: generationSource === "demo_fallback" ? "error" : "success",
        message:
          generationMessage ||
          (isFigmaLikeTheme
            ? "画像已生成并保存，点击 Next 选择面试官。"
            : "画像已生成并保存，下一步生成 3 道面试题。")
      });
      setProfileGenerationPending(false);
    } catch (error) {
      setFigmaProfileStage("profile");
      setStep("profile");
      setStatus({
        kind: "error",
        message: `${error instanceof Error ? error.message : "画像保存失败"} 画像草稿仍保留，可再次点击下一步重试保存。`
      });
      setProfileGenerationPending(false);
    }
  }

  function returnToFreshSetup() {
    setFigmaSetupInitialStep("home");
    resetDownstream({
      resumeText: "",
      jdText: "",
      interviewerStyleId: form.interviewerStyleId
    });
  }

  async function handleGenerateQuestions() {
    await generateAndPersistQuestions(false);
  }

  async function generateAndPersistQuestions(startInterview: boolean) {
    const sourceProfile = profile ?? demoScenario.candidateProfile;
    let nextQuestions: InterviewQuestion[];
    let generationSource: GenerationSource = "mixed";
    let measurement: GenerationMeasurement | undefined;
    let generationMessage = "";
    try {
      if (
        initialPersistenceMode !== "off" &&
        persistedStatus !== "profile_ready" &&
        persistedStatus !== "questions_ready" &&
        persistedStatus !== "in_progress"
      ) {
        await persistMilestone("profile_ready", sourceProfile, "mixed");
      }
      setStatus({ kind: "loading", message: "正在生成面试题..." });
      const data = await generateQuestions({
        candidateProfile: sourceProfile,
        interviewerStyleId: form.interviewerStyleId,
        questionCount: 3,
        promptOverrides: activePromptOverrides
      });
      nextQuestions = data.data.questions;
      generationSource = data.measurement.source;
      measurement = data.measurement;
    } catch (error) {
      nextQuestions = demoScenario.questions;
      generationSource = "demo_fallback";
      measurement = localFallbackMeasurement();
      generationMessage = `${error instanceof Error ? error.message : "题目生成失败"} 已使用演示题目继续。`;
    }
    const nextAnswers = nextQuestions.map((question) => ({
      questionId: question.id,
      answerText: "",
      inputMode: "text" as const,
      durationSec: 0,
      sttStatus: "manual" as const
    }));
    setQuestions(nextQuestions);
    setAnswers(nextAnswers);
    try {
      await persistMilestone(
        "questions_ready",
        nextQuestions,
        generationSource,
        measurement
      );
      setStep(startInterview ? "interview" : "questions");
      setStatus({
        kind: generationSource === "demo_fallback" ? "error" : "success",
        message:
          generationMessage ||
          (startInterview
            ? "已生成并保存 3 道题，开始答题。"
            : "已生成并保存 3 道题，可进入答题。")
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message: `${error instanceof Error ? error.message : "题目保存失败"} 题目草稿仍保留，请重试。`
      });
    }
  }

  async function handleGenerateQuestionsAndStartInterview() {
    await generateAndPersistQuestions(true);
  }

  async function handleGenerateReport(nextAnswers = answers) {
    const sourceProfile = profile ?? demoScenario.candidateProfile;
    const sourceQuestions = questions.length === 3 ? questions : demoScenario.questions;
    const reportPayload = {
      candidateProfile: sourceProfile,
      questions: sourceQuestions,
      answers: nextAnswers,
      interviewerStyleId: form.interviewerStyleId,
      promptOverrides: activePromptOverrides
    };

    setStep("report");
    setReport(null);
    setStreamedQuestionReports([]);
    setReportState({ kind: "streaming", message: "正在保存答案并启动真实复盘报告...", usedFallback: false });
    setStatus({ kind: "loading", message: "正在保存答案并启动真实复盘报告..." });

    try {
      await persistAnswersNow(nextAnswers);
    } catch (error) {
      setReportState({
        kind: "error",
        message: "答案保存失败，真实复盘报告尚未开始。当前答案草稿仍保留，请重新生成。",
        usedFallback: false
      });
      setStatus({
        kind: "error",
        message: `${error instanceof Error ? error.message : "答案保存失败"} 当前答案草稿仍保留，请重试。`
      });
      return;
    }

    setReportState({ kind: "streaming", message: "正在启动流式复盘报告...", usedFallback: false });
    setStatus({ kind: "loading", message: "正在流式生成复盘报告..." });
    let nextReport: InterviewReport;
    let measurement: GenerationMeasurement;
    try {
      const generated = await generateReportStream(reportPayload, {
        onProgress: (progress) => {
          setReportState({ kind: "streaming", message: progress.message, usedFallback: false });
        },
        onQuestionReport: (questionReport) => {
          setStreamedQuestionReports((current) => upsertQuestionReport(current, questionReport));
          setReportState({ kind: "streaming", message: questionReport.message ?? "单题报告已生成。", usedFallback: false });
        }
      });
      nextReport = generated.data;
      measurement = generated.measurement;
    } catch (error) {
      const message = error instanceof Error ? error.message : "流式报告生成失败";
      if (initialVisualTheme === "juju") {
        setReport(null);
        setReportState({
          kind: "error",
          message: "真实复盘报告生成超时或服务暂时不可用。你的题目和答案已经保存，请重新生成。",
          usedFallback: false
        });
        setStatus({
          kind: "error",
          message: "真实复盘报告尚未生成；题目和答案已经保存。"
        });
        return;
      }
      setReportState({ kind: "loading", message: `${message} 正在切换到非流式保底...`, usedFallback: false });
      setStatus({ kind: "loading", message: `${message} 正在切换到非流式保底...` });
      await handleGenerateReportNonStreaming(reportPayload, "流式报告失败，已使用非流式保底生成报告。");
      return;
    }

    try {
      const saved = await persistReportSnapshot(
        nextReport,
        measurement.source,
        measurement
      );
      setReport(nextReport);
      setReportState({ kind: "ready", message: "报告已生成并保存。", usedFallback: false });
      setStatus({ kind: "success", message: "报告已生成并保存，可复制优化答案和复盘报告。" });
      schedulePersistedCompletion(saved);
    } catch (error) {
      setReport(nextReport);
      setReportState({
        kind: "error",
        message: "报告已生成但保存失败；页面内容已保留，请重试保存或生成。",
        usedFallback: false
      });
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "报告保存失败，页面内容已保留。"
      });
    }
  }

  async function handleGenerateReportNonStreaming(
    reportPayload = {
      candidateProfile: profile ?? demoScenario.candidateProfile,
      questions: questions.length === 3 ? questions : demoScenario.questions,
      answers,
      interviewerStyleId: form.interviewerStyleId,
      promptOverrides: activePromptOverrides
    },
    successMessage = "已使用非流式保底生成报告。"
  ) {
    try {
      await persistAnswersNow(reportPayload.answers);
    } catch (error) {
      setStatus({
        kind: "error",
        message: `${error instanceof Error ? error.message : "答案保存失败"} 当前答案草稿仍保留，请重试。`
      });
      return;
    }
    try {
      setStep("report");
      setReportState({ kind: "loading", message: "正在调用非流式报告保底...", usedFallback: false });
      const generated = await generateReport(reportPayload);
      const nextReport = generated.data;
      try {
        const saved = await persistReportSnapshot(
          nextReport,
          generated.measurement.source,
          generated.measurement
        );
        setReport(nextReport);
        setStreamedQuestionReports([]);
        setReportState({ kind: "ready", message: successMessage, usedFallback: false });
        setStatus({ kind: "success", message: successMessage });
        schedulePersistedCompletion(saved);
      } catch (error) {
        setReport(nextReport);
        setReportState({
          kind: "error",
          message: "报告已生成但保存失败；页面内容已保留，请重试。",
          usedFallback: false
        });
        setStatus({
          kind: "error",
          message: error instanceof Error ? error.message : "报告保存失败。"
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "报告生成失败";
      if (initialVisualTheme === "juju") {
        setReport(null);
        setReportState({
          kind: "error",
          message: "真实复盘报告生成失败。你的题目和答案已经保存，请重新生成。",
          usedFallback: false
        });
        setStatus({
          kind: "error",
          message: "真实复盘报告尚未生成；题目和答案已经保存。"
        });
        return;
      }
      setReport(null);
      setReportState({
        kind: "error",
        message: `${message} 问题和答案已保留，可重试、使用非流式保底或使用演示兜底报告。`,
        usedFallback: false
      });
      setStatus({
        kind: "error",
        message: `${message} 问题和答案已保留，可重试、使用非流式保底或使用演示兜底报告。`
      });
    }
  }

  async function persistReportSnapshot(
    nextReport: InterviewReport,
    generationSource: GenerationSource,
    measurement?: GenerationMeasurement
  ) {
    const sessionId = persistedSessionIdRef.current;
    if (initialPersistenceMode === "off" || !sessionId) return null;
    try {
      const snapshot = await savePersistedReport(sessionId, {
        expectedVersion: persistedVersionRef.current,
        report: nextReport,
        generationSource,
        measurement,
        idempotencyKey: crypto.randomUUID()
      });
      rememberPersistedSession(snapshot);
      return snapshot;
    } catch (error) {
      if (initialPersistenceMode === "source") throw error;
      console.warn("[persistence/mirror] report failed");
      return null;
    }
  }

  function schedulePersistedCompletion(snapshot: InterviewSessionSnapshot | null) {
    if (!snapshot || initialPersistenceMode === "off") return;
    window.setTimeout(() => {
      void completePersistedInterviewSession(
        snapshot.sessionId,
        snapshot.version,
        crypto.randomUUID()
      )
        .then(rememberPersistedSession)
        .catch(() => {
          setStatus({
            kind: "error",
            message: "报告已保存，但完成状态同步失败；刷新后可继续当前 Session。"
          });
        });
    }, 0);
  }

  async function handleUseFallbackReport(
    sourceAnswers = answers,
    successMessage = "已使用演示兜底报告。"
  ) {
    const sourceQuestions = questions.length === 3 ? questions : demoScenario.questions;
    const fallbackReport = buildFallbackReport(sourceQuestions, sourceAnswers);
    try {
      await persistAnswersNow(sourceAnswers);
      const saved = await persistReportSnapshot(
        fallbackReport,
        "demo_fallback",
        localFallbackMeasurement()
      );
      schedulePersistedCompletion(saved);
    } catch (error) {
      setStatus({
        kind: "error",
        message: `${error instanceof Error ? error.message : "兜底报告保存失败"} 页面内容仍会保留。`
      });
    }
    setReport(fallbackReport);
    setStreamedQuestionReports([]);
    setReportState({ kind: "ready", message: successMessage, usedFallback: true });
    setStatus({ kind: "success", message: `${successMessage} 可复制优化答案和复盘报告。` });
  }

  async function handleRegenerateQuestion(questionId: string) {
    if (!report) return;

    const sourceProfile = profile ?? demoScenario.candidateProfile;
    const sourceQuestions = questions.length === 3 ? questions : demoScenario.questions;
    const previousReport = report;

    try {
      setReportState({ kind: "ready", message: `正在重新生成 ${questionId} 的嘴替答案...`, usedFallback: false });
      const nextQuestionReport = await regenerateQuestionReport({
        candidateProfile: sourceProfile,
        questions: sourceQuestions,
        answers,
        questionId,
        interviewerStyleId: form.interviewerStyleId,
        promptOverrides: activePromptOverrides
      });
      const nextReport = mergeQuestionReport(previousReport, nextQuestionReport);
      setReport(nextReport);
      setReportState({ kind: "ready", message: `${questionId} 已重新生成，其他题报告和答案未清空。`, usedFallback: false });
      setStatus({ kind: "success", message: `${questionId} 已重新生成，其他题报告和答案未清空。` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "单题重新生成失败";
      setReport(previousReport);
      setReportState({ kind: "ready", message: `${message} 已保留旧的 ${questionId} 报告。`, usedFallback: false });
      setStatus({ kind: "error", message: `${message} 已保留旧的 ${questionId} 报告。` });
    }
  }

  const statusClass = status.kind === "error" ? "status error" : status.kind === "success" ? "status success" : "status";
  const showJujuThinking =
    initialVisualTheme === "juju" &&
    (status.kind === "loading" || profileGenerationPending);
  const shellClassName = ["app-shell", `theme-${initialVisualTheme}`, isFigmaLikeTheme && initialVisualTheme !== "figma" ? "theme-figma" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <main className={shellClassName}>
      <header className="topbar">
        <div>
          <h1>面试嘴替教练</h1>
          <p>输入简历和 JD，选择面试官风格，完成 3 题答题后生成复盘报告。</p>
        </div>
        <div className="soft-box">
          <strong>{selectedStyle.label}</strong>
          <p className="helper">{selectedStyle.description}</p>
          {(persistedStatus === "report_ready" ||
            persistedStatus === "completed") && (
            <button
              type="button"
              onClick={() =>
                resetDownstream({
                  resumeText: "",
                  jdText: "",
                  interviewerStyleId: form.interviewerStyleId
                })
              }
            >
              开始新的面试
            </button>
          )}
        </div>
      </header>

      <div className="visual-switcher" aria-label="视觉版本切换">
        <a className={initialVisualTheme === "figma" ? "active" : ""} href="/?theme=figma">
          Phase 9 新视觉
        </a>
        <a className={initialVisualTheme === "juju" ? "active" : ""} href="/?theme=juju">
          Juju 新风格
        </a>
        <a className={initialVisualTheme === "classic" ? "active" : ""} href="/?theme=classic">
          旧版低保真
        </a>
      </div>

      <nav className="stepper" aria-label="流程步骤">
        {SESSION_STEPS.map((item) => (
          <div className={item === step ? "step active" : "step"} key={item}>
            {stepLabels[item]}
          </div>
        ))}
      </nav>

      <div className={statusClass}>{status.message}</div>

      <DevOpsPanel />

      {!isFigmaLikeTheme && (
        <>
          <ProviderStatusPanel />
          <PromptDebugPanel
            value={promptOverrides}
            saveState={promptSaveState}
            updatedAt={promptStoreUpdatedAt}
            onChange={setPromptOverrides}
            onReload={handleReloadGlobalPrompt}
            onReset={() => {
              setPromptOverrides(cloneDefaultPromptOverrides());
              setPromptSaveState({ kind: "idle", message: "已恢复为产品默认 Prompt 草稿；点击保存后才会覆盖全局 Prompt。" });
            }}
            onSave={handleSaveGlobalPrompt}
          />
          <QuestionnaireConfigPanel />
        </>
      )}

      {showJujuThinking && <JujuThinkingScreen />}

      {!showJujuThinking && step === "setup" && (
        <SetupPanel
          externalError={setupError}
          form={form}
          initialFigmaStep={figmaSetupInitialStep}
          visualTheme={initialVisualTheme}
          onChange={resetDownstream}
          onFillDemo={fillDemo}
          onFillDemoAndStart={fillDemoAndStart}
          onStart={() => handleParseProfile()}
        />
      )}

      {initialVisualTheme === "juju" && quotaExhaustedDialogOpen && (
        <JujuQuotaExhaustedDialog onClose={() => setQuotaExhaustedDialogOpen(false)} />
      )}

      {!showJujuThinking && (isFigmaLikeTheme && step === "profile" && figmaProfileStage !== "profile" ? (
        <FigmaInterviewerPanel
          selectedStyleId={form.interviewerStyleId}
          stage={figmaProfileStage}
          candidateName={extractCandidateDisplayName(form.resumeText)}
          visualTheme={initialVisualTheme}
          onBack={() => setFigmaProfileStage(figmaProfileStage === "confirmInterviewer" ? "selectInterviewer" : "profile")}
          onSelect={(styleId) => {
            updateFormWithoutReset({ interviewerStyleId: styleId });
            setFigmaProfileStage("confirmInterviewer");
          }}
          onStart={handleGenerateQuestionsAndStartInterview}
        />
      ) : (step === "profile" || step === "questions") && (
        <PreparationPanel
          visualTheme={initialVisualTheme}
          jdText={form.jdText}
          profile={profile}
          questions={questions}
          resumeText={form.resumeText}
          currentStep={step}
          onGenerateQuestions={handleGenerateQuestions}
          onFigmaBack={() => {
            setFigmaSetupInitialStep("jd");
            setFigmaProfileStage("profile");
            setStep("setup");
          }}
          onFigmaNext={() => setFigmaProfileStage("selectInterviewer")}
          onStartInterview={() => setStep("interview")}
        />
      ))}

      {!showJujuThinking && step === "interview" && (
        <InterviewPanel
          answers={answers}
          candidateName={extractCandidateDisplayName(form.resumeText)}
          interviewerStyleId={form.interviewerStyleId}
          questions={questions}
          visualTheme={initialVisualTheme}
          onAnswersChange={handleAnswersChange}
          onGenerateReport={handleGenerateReport}
          onExitInterview={() =>
            resetDownstream({
              resumeText: "",
              jdText: "",
              interviewerStyleId: form.interviewerStyleId
            })
          }
        />
      )}

      {!showJujuThinking && step === "report" && (
        <>
          <ReportPanel
            report={report}
            answers={answers}
            questions={questions.length === 3 ? questions : demoScenario.questions}
            state={reportState}
            streamedQuestionReports={streamedQuestionReports}
            interviewerStyleId={form.interviewerStyleId}
            visualTheme={initialVisualTheme}
            onRetry={() => handleGenerateReport()}
            onUseNonStreamingFallback={() => handleGenerateReportNonStreaming()}
            onUseFallback={() => handleUseFallbackReport()}
            onRegenerateQuestion={handleRegenerateQuestion}
            sessionId={persistedSessionId}
            questionnaireAlreadyCompleted={
              persistedSessionNumber !== null && persistedSessionNumber > 1
            }
            onReturnHome={returnToFreshSetup}
          />
          {report && initialVisualTheme !== "juju" && (
            <FeedbackPanel
              sessionId={persistedSessionId}
              visualTheme={initialVisualTheme}
            />
          )}
        </>
      )}
    </main>
  );
}

function JujuQuotaExhaustedDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="juju-quota-dialog-overlay" role="presentation" onClick={onClose}>
      <section
        aria-labelledby="juju-quota-dialog-title"
        aria-modal="true"
        className="juju-quota-dialog"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="juju-quota-dialog-badge" aria-hidden="true">
          3/3
        </div>
        <h2 id="juju-quota-dialog-title">模拟面试额度已用完</h2>
        <p>你已完成 3/3 次模拟面试，当前无法再创建新的面试。</p>
        <p className="juju-quota-dialog-hint">已完成的面试报告仍可正常查看。</p>
        <button autoFocus type="button" onClick={onClose}>
          我知道了
        </button>
      </section>
    </div>
  );
}

function upsertQuestionReport<T extends QuestionReport>(current: T[], next: T) {
  const existingIndex = current.findIndex((item) => item.questionId === next.questionId);
  if (existingIndex < 0) {
    return [...current, next];
  }
  return current.map((item, index) => (index === existingIndex ? next : item));
}

function mergeQuestionReport(report: InterviewReport, nextQuestionReport: QuestionReport): InterviewReport {
  const questionReports = report.questionReports.map((item) =>
    item.questionId === nextQuestionReport.questionId ? nextQuestionReport : item
  );
  const overallScore = Math.round(questionReports.reduce((sum, item) => sum + item.score, 0) / questionReports.length);
  const copyText = [
    "复盘报告",
    report.finalReport.summary,
    "",
    "优化答案",
    ...questionReports.map((item) => `${item.questionId}: ${item.optimizedAnswer}`),
    "",
    "行动建议",
    ...report.finalReport.actionItems.map((item, index) => `${index + 1}. ${item}`)
  ].join("\n");

  return {
    questionReports,
    finalReport: {
      ...report.finalReport,
      overallScore,
      copyText
    }
  };
}

function PreparationPanel({
  visualTheme,
  jdText,
  profile,
  questions,
  resumeText,
  currentStep,
  onGenerateQuestions,
  onFigmaBack,
  onFigmaNext,
  onStartInterview
}: {
  visualTheme: VisualTheme;
  jdText: string;
  profile: CandidateProfile | null;
  questions: InterviewQuestion[];
  resumeText: string;
  currentStep: SessionStep;
  onGenerateQuestions: () => void;
  onFigmaBack: () => void;
  onFigmaNext: () => void;
  onStartInterview: () => void;
}) {
  if (!profile) {
    return (
      <section className="panel">
        <div className="status warning">画像为空。请返回 setup 重新生成，或使用演示兜底样例。</div>
      </section>
    );
  }

  if (visualTheme === "juju" && currentStep === "profile") {
    return (
      <JujuProfilePanel
        profile={profile}
        resumeText={resumeText}
        onBack={onFigmaBack}
        onNext={onFigmaNext}
      />
    );
  }

  if (visualTheme === "figma" && currentStep === "profile") {
    return (
      <FigmaProfilePanel
        jdText={jdText}
        profile={profile}
        resumeText={resumeText}
        onBack={onFigmaBack}
        onNext={onFigmaNext}
      />
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>候选人画像</h2>
          <p>画像字段按 CandidateProfile 契约展示，供后续题目和报告共用。</p>
        </div>
        {(visualTheme === "figma" || visualTheme === "juju") && currentStep === "profile" ? (
          <button className="primary" onClick={onFigmaNext}>
            Next
          </button>
        ) : currentStep === "profile" ? (
          <button className="primary" onClick={onGenerateQuestions}>
            生成 3 道题
          </button>
        ) : (
          <button className="primary" onClick={onStartInterview}>
            开始答题
          </button>
        )}
      </div>

      <div className="profile-columns">
        <div className="soft-box">
          <h3>摘要</h3>
          <p>{profile.summary}</p>
          <h3>匹配点</h3>
          <ul className="list">
            {profile.matchedPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="soft-box">
          <h3>风险点</h3>
          <ul className="list">
            {profile.riskPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>关键词</h3>
          <p>{profile.keywords.join(" / ")}</p>
        </div>
      </div>

      <ProfileSourceReview profile={profile} resumeText={resumeText} jdText={jdText} />

      {questions.length > 0 && (
        <div className="question-grid panel">
          <div className="panel-header">
            <div>
              <h2>面试题</h2>
              <p>固定 3 道题，每题包含 intent 和 expectedSignals。</p>
            </div>
          </div>
          {questions.map((question) => (
            <article className="question-card" key={question.id}>
              <strong>
                {question.id} · {question.title} · {question.difficulty}
              </strong>
              <p>{question.questionText}</p>
              <p className="helper">Intent: {question.intent}</p>
              <p className="helper">Signals: {question.expectedSignals.join(" / ")}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function JujuProfilePanel({
  profile,
  resumeText,
  onBack,
  onNext
}: {
  profile: CandidateProfile;
  resumeText: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const candidateName = extractCandidateDisplayName(resumeText);

  return (
    <section className="figma-phone-stage" aria-label="Candidate profile">
      <div className="figma-phone-card figma-home-card figma-profile-card juju-profile-card">
        <div className="figma-statusbar">
          <StatusBarClock />
          <span>PassBuddy</span>
        </div>
        <button className="figma-jd-back-button figma-profile-back-button" aria-label="返回 JD 输入" onClick={onBack}>
          <span aria-hidden="true" />
        </button>
        <div className="juju-profile-scroll">
          <div className="juju-profile-orb-frame">
            <JujuOrb className="juju-profile-orb" size="small" />
          </div>
          <section className="juju-profile-summary">
            <h2>{candidateName} 我们对您的履历做了总结</h2>
            <p className={summaryExpanded ? "expanded" : ""}>{profile.summary}</p>
            <button type="button" onClick={() => setSummaryExpanded((expanded) => !expanded)}>
              {summaryExpanded ? "收起" : "展开"}
            </button>
          </section>

          <JujuProfileInfoCard
            className="juju-profile-match-card"
            label="匹配点"
            items={profile.matchedPoints}
            footerLabel="匹配点"
            iconSrc="/juju/profile/dot-match.svg?v=2026071003"
            collapsible
          />

          <JujuProfileInfoCard
            className="juju-profile-risk-card"
            label="风险点"
            items={profile.riskPoints}
            footerLabel="风险点"
            iconSrc="/juju/profile/dot-risk.svg?v=2026071003"
            collapsible
          />

          <JujuProfileInfoCard
            className="juju-profile-suggestion-card"
            label="优化建议"
            items={profile.suggestedSupplements}
            footerLabel="优化建议"
            iconSrc="/juju/profile/dot-suggestion.svg?v=2026071003"
            hideFooter
          />
        </div>

        <div className="juju-profile-tabs">
          <button className="figma-profile-next-button juju-profile-next-button" aria-label="确认画像，选择面试官" onClick={onNext}>
            开始面试
          </button>
        </div>
      </div>
    </section>
  );
}

function JujuProfileInfoCard({
  className,
  label,
  items,
  footerLabel,
  iconSrc,
  collapsible = false,
  hideFooter = false
}: {
  className: string;
  label: string;
  items: string[];
  footerLabel: string;
  iconSrc: string;
  collapsible?: boolean;
  hideFooter?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const safeItems = items.length > 0 ? items : ["暂无信息"];
  const visibleItems = collapsible && !expanded ? safeItems.slice(0, 1) : safeItems;

  return (
    <section className={`juju-profile-info-card ${className}`}>
      <div className="juju-profile-info-body">
        <div className="juju-profile-info-heading">
          <img src={iconSrc} alt="" aria-hidden="true" />
          <strong>{label}</strong>
        </div>
        <div className="juju-profile-info-list">
          {visibleItems.map((item, index) => (
            <p key={`${label}-${item}-${index}`}>{item}</p>
          ))}
        </div>
        {collapsible && safeItems.length > 1 && (
          <button
            className={expanded ? "juju-profile-expand-button expanded" : "juju-profile-expand-button"}
            type="button"
            aria-label={expanded ? `收起${footerLabel}` : `展开${footerLabel}`}
            onClick={() => setExpanded((current) => !current)}
          >
            <img src="/juju/profile/expand-toggle.svg?v=2026071003" alt="" aria-hidden="true" />
          </button>
        )}
      </div>
      {!hideFooter && (
        <footer>
          共有 {visibleItems.length}/{safeItems.length} 条{footerLabel}信息。
        </footer>
      )}
    </section>
  );
}

function FigmaProfilePanel({
  jdText,
  profile,
  resumeText,
  onBack,
  onNext
}: {
  jdText: string;
  profile: CandidateProfile;
  resumeText: string;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <section className="figma-phone-stage" aria-label="Candidate profile">
      <div className="figma-phone-card figma-home-card figma-profile-card">
        <div className="figma-statusbar">
          <StatusBarClock />
          <span>PassBuddy</span>
        </div>
        <button className="figma-jd-back-button figma-profile-back-button" aria-label="返回 JD 输入" onClick={onBack}>
          <span aria-hidden="true" />
        </button>
        <div className="figma-profile-navbar">
          <span>候选人画像</span>
        </div>
        <div
          className="figma-home-comp figma-profile-comp"
          aria-hidden="true"
          data-figma-layer="profile / Comp 1024 1"
        >
          <img className="figma-home-comp-asset" src="/figma/home/comp-1024-1@2x.png?v=2026070302" alt="" />
        </div>
        <div className="figma-profile-scroll">
          <section className="figma-profile-hero">
            <p>{profile.summary}</p>
          </section>

          <section className="figma-profile-section">
            <h3>匹配概览</h3>
            <div className="figma-profile-metrics">
              <article>
                <strong>匹配点</strong>
                <span>{profile.matchedPoints.length}</span>
              </article>
              <article>
                <strong>风险点</strong>
                <span>{profile.riskPoints.length}</span>
              </article>
              <article>
                <strong>关键词</strong>
                <span>{profile.keywords.length}</span>
              </article>
            </div>
          </section>

          <section className="figma-profile-section">
            <h3>核心匹配</h3>
            <div className="figma-profile-list">
              {profile.matchedPoints.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </section>

          <section className="figma-profile-section">
            <h3>面试风险</h3>
            <div className="figma-profile-list figma-profile-risk-list">
              {profile.riskPoints.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </section>

          <FigmaProfileSourceReview profile={profile} resumeText={resumeText} jdText={jdText} />

          <section className="figma-profile-section">
            <h3>建议补充</h3>
            <div className="figma-profile-suggestion-list">
              {profile.suggestedSupplements.map((item) => (
                <article key={item}>{item}</article>
              ))}
            </div>
          </section>

          <button className="figma-profile-next-button" aria-label="确认画像，选择面试官" onClick={onNext}>
            <span aria-hidden="true">✓</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function JujuThinkingScreen() {
  return (
    <section className="figma-phone-stage" aria-label="Loading">
      <div className="figma-phone-card figma-home-card juju-thinking-card">
        <div className="figma-statusbar">
          <StatusBarClock />
          <span>PassBuddy</span>
        </div>
        <JujuOrb className="juju-thinking-orb" />
        <p className="juju-thinking-text">面壁者正在思考...</p>
      </div>
    </section>
  );
}

function extractCandidateDisplayName(resumeText: string) {
  const normalized = resumeText.replace(/\s+/g, " ").trim();
  const patterns = [
    /(?:姓名|名字|Name)[:：\s]+([A-Za-z\u4e00-\u9fa5·]{2,12})/i,
    /(?:我叫|我是)([A-Za-z\u4e00-\u9fa5·]{2,8})(?:[，,。.；;\s]|$)/,
    /本人([A-Za-z\u4e00-\u9fa5·]{2,8})(?:[，,。.；;\s]|$)/
  ];
  const invalidFragments = ["本科", "应届", "产品", "经理", "学生", "负责", "目标", "岗位", "项目", "实习"];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate && !invalidFragments.some((fragment) => candidate.includes(fragment))) {
      return candidate;
    }
  }

  return "朋友";
}

function FigmaProfileSourceReview({
  profile,
  resumeText,
  jdText
}: {
  profile: CandidateProfile;
  resumeText: string;
  jdText: string;
}) {
  const [activeSourceTab, setActiveSourceTab] = useState<"resume" | "jd">("resume");
  const activeText = activeSourceTab === "resume" ? resumeText.trim() : jdText.trim();
  const activeTitle = activeSourceTab === "resume" ? "候选人简历" : "目标 JD";
  const activeEvidenceLabel = activeSourceTab === "resume" ? "简历命中" : "JD 命中";
  const activeEvidence = profile.sourceMatches.map((match) =>
    activeSourceTab === "resume" ? match.resumeText : match.jdText
  );

  return (
    <section className="figma-profile-section figma-source-frame15">
      <h3>对比简历 / JD 匹配来源</h3>
      <div className="figma-source-tabs" role="tablist" aria-label="匹配来源切换">
        <button
          className={activeSourceTab === "resume" ? "active" : ""}
          onClick={() => setActiveSourceTab("resume")}
          role="tab"
          aria-selected={activeSourceTab === "resume"}
        >
          简历
        </button>
        <button
          className={activeSourceTab === "jd" ? "active" : ""}
          onClick={() => setActiveSourceTab("jd")}
          role="tab"
          aria-selected={activeSourceTab === "jd"}
        >
          JD
        </button>
      </div>
      <div className="figma-source-tab-panel" role="tabpanel">
        <article className="figma-source-text-card">
          <strong>{activeTitle}</strong>
          <p>{activeText}</p>
        </article>
        <div className="figma-source-match-stack">
          {activeEvidence.map((evidence, index) => (
            <article key={`${activeSourceTab}-${evidence}-${index}`}>
              <div>
                <span>{activeEvidenceLabel}</span>
                <span>{evidence}</span>
              </div>
              <p>{profile.sourceMatches[index]?.reason}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FigmaInterviewerPanel({
  selectedStyleId,
  stage,
  candidateName = "朋友",
  visualTheme = "figma",
  onBack,
  onSelect,
  onStart
}: {
  selectedStyleId: InterviewerStyleId;
  stage: "selectInterviewer" | "confirmInterviewer";
  candidateName?: string;
  visualTheme?: VisualTheme;
  onBack: () => void;
  onSelect: (styleId: InterviewerStyleId) => void;
  onStart: () => void;
}) {
  const selectedStyle = INTERVIEWER_STYLES.find((style) => style.id === selectedStyleId) ?? INTERVIEWER_STYLES[0];
  const selectedOption = getFigmaInterviewerOption(selectedStyle.id);

  if (stage === "confirmInterviewer") {
    return (
      <section className="figma-phone-stage" aria-label="Selected interviewer">
        <div className="figma-phone-card figma-home-card figma-interviewer-card figma-confirm-card">
          <div className="figma-statusbar">
            <StatusBarClock />
            <span>PassBuddy</span>
          </div>
          <button className="figma-jd-back-button figma-interviewer-back-button" aria-label="重新选择面试官" onClick={onBack}>
            <span aria-hidden="true" />
          </button>
          {visualTheme === "juju" && <div className="juju-interviewer-avatar-frame" aria-hidden="true" />}
          <div className={`figma-interviewer-portrait figma-interviewer-portrait-detail hero-${selectedStyle.id}`} aria-hidden="true" />
          <div className="figma-interviewer-detail-copy">
            <h2>{selectedOption.name}</h2>
            <p className="figma-interviewer-role">{selectedOption.role}</p>
            {visualTheme !== "juju" && <p className="figma-interviewer-description">{selectedStyle.description}</p>}
          </div>
          {visualTheme === "juju" && (
            <div className="juju-interviewer-detail-card">
              <p className="juju-interviewer-summary">{selectedStyle.summary}</p>
              <div className="juju-interviewer-detail-inner">
                <p>{selectedStyle.description}</p>
              </div>
            </div>
          )}
          <button className="figma-interviewer-start-button" onClick={onStart}>
            开始面试
          </button>
        </div>
      </section>
    );
  }

  if (visualTheme === "juju") {
    return (
      <section className="figma-phone-stage" aria-label="Select interviewer">
        <div className="figma-phone-card figma-home-card figma-interviewer-card juju-interviewer-select-card">
          <div className="figma-statusbar">
            <StatusBarClock />
            <span>PassBuddy</span>
          </div>
          <button className="figma-jd-back-button figma-interviewer-back-button" aria-label="返回候选人画像" onClick={onBack}>
            <span aria-hidden="true" />
          </button>
          <JujuOrb className="juju-interviewer-select-hero-orb" />
          <div className="juju-interviewer-select-overlay" aria-hidden="true" />
          <section className="juju-interviewer-select-copy">
            <h2>请选择面试官</h2>
            <p>
              3位面试官分别来自不同岗位
              <br />
              每位面试官会根据需要发起提问
            </p>
          </section>
          <div className="juju-interviewer-select-grid" role="list" aria-label="面试官风格">
            {INTERVIEWER_STYLES.map((style, index) => {
              const option = getFigmaInterviewerOption(style.id);
              return (
                <button
                  className={`juju-interviewer-select-option option-${index + 1} hero-${style.id}`}
                  key={style.id}
                  onClick={() => onSelect(style.id)}
                  role="listitem"
                >
                  <span className={`juju-interviewer-select-portrait hero-${style.id}`} aria-hidden="true" />
                  <strong>{option.name}</strong>
                  <span>{option.role}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="figma-phone-stage" aria-label="Select interviewer">
      <div className="figma-phone-card figma-home-card figma-interviewer-card figma-select-card">
        <div className="figma-statusbar">
          <StatusBarClock />
          <span>PassBuddy</span>
        </div>
        <button className="figma-jd-back-button figma-interviewer-back-button" aria-label="返回候选人画像" onClick={onBack}>
          <span aria-hidden="true" />
        </button>
        <div className="figma-interviewer-title">
          <h2>Hey {candidateName} !</h2>
          <p>请选择面试官</p>
        </div>
        <div className="figma-interviewer-grid" role="list" aria-label="面试官风格">
          {INTERVIEWER_STYLES.map((style, index) => {
            const option = getFigmaInterviewerOption(style.id);
            return (
            <button
              className={`figma-interviewer option-${index + 1} hero-${style.id}`}
              key={style.id}
              onClick={() => onSelect(style.id)}
              role="listitem"
            >
              <span className={`figma-interviewer-portrait hero-${style.id}`} aria-hidden="true" />
              <strong>{option.name}</strong>
              <span>{option.role}</span>
            </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function getFigmaInterviewerOption(styleId: InterviewerStyleId) {
  const options: Record<InterviewerStyleId, { name: string; role: string }> = {
    strictHr: { name: "温婉HR小姐姐", role: "HR" },
    techBro: { name: "技术老哥", role: "Tech Lead" },
    gentleSister: { name: "资深业务大佬", role: "业务负责人" }
  };

  return options[styleId];
}

function ProfileSourceReview({
  profile,
  resumeText,
  jdText
}: {
  profile: CandidateProfile;
  resumeText: string;
  jdText: string;
}) {
  const highlightTerms = buildProfileHighlightTerms(profile, resumeText, jdText);

  return (
    <div className="source-review">
      <div className="panel-header compact-header">
        <div>
          <h3>简历 / JD 匹配来源</h3>
          <p>以下展示本次画像使用的原始文本；涂色内容优先来自 LLM 返回的结构化匹配证据。</p>
        </div>
      </div>
      <div className="source-columns">
        <article className="source-box resume-source">
          <div className="source-title">
            <strong>候选人简历</strong>
            <span>简历命中</span>
          </div>
          <div className="source-text">{renderHighlightedText(resumeText, highlightTerms.resume, "resume-hit")}</div>
        </article>
        <article className="source-box jd-source">
          <div className="source-title">
            <strong>目标 JD</strong>
            <span>JD 命中</span>
          </div>
          <div className="source-text">{renderHighlightedText(jdText, highlightTerms.jd, "jd-hit")}</div>
        </article>
      </div>
      <div className="source-match-list">
        {profile.sourceMatches.map((match, index) => (
          <article className="source-match-card" key={`${match.resumeText}-${match.jdText}-${index}`}>
            <div className="match-pair">
              <span className="match-pill resume-pill">{match.resumeText}</span>
              <span className="match-arrow">匹配</span>
              <span className="match-pill jd-pill">{match.jdText}</span>
            </div>
            <p>{match.reason}</p>
            <span className="helper">置信度 {Math.round(match.confidence * 100)}%</span>
          </article>
        ))}
      </div>
    </div>
  );
}

function buildProfileHighlightTerms(profile: CandidateProfile, resumeText: string, jdText: string) {
  const rawTerms = [
    ...profile.sourceMatches.flatMap((match) => [match.resumeText, match.jdText]),
    ...profile.keywords,
    ...profile.matchedPoints,
    ...profile.evidenceMaterials.flatMap((item) => [item.title, item.content])
  ];
  const candidates = normalizeHighlightTerms(rawTerms);

  return {
    resume: candidates.filter((term) => includesTerm(resumeText, term)),
    jd: candidates.filter((term) => includesTerm(jdText, term))
  };
}

function normalizeHighlightTerms(values: string[]) {
  const fragments = values.flatMap((value) =>
    value
      .split(/[，。、；;：:（）()、/｜|和与及\s]+/u)
      .map((item) => item.trim())
  );
  const terms = [...values, ...fragments]
    .map((term) => term.trim())
    .filter(
      (term) =>
        term.length >= 2 &&
        !/^[\d.]+$/.test(term) &&
        !["候选人", "岗位", "要求", "项目", "经历", "匹配"].includes(term)
    );

  return Array.from(new Set(terms)).sort((a, b) => b.length - a.length);
}

function includesTerm(text: string, term: string) {
  return text.toLocaleLowerCase().includes(term.toLocaleLowerCase());
}

function renderHighlightedText(text: string, terms: string[], className: string) {
  const ranges = findHighlightRanges(text, terms);
  if (ranges.length === 0) {
    return text;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      nodes.push(text.slice(cursor, range.start));
    }
    nodes.push(
      <mark className={className} key={`${range.start}-${range.end}-${index}`}>
        {text.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  });
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

function findHighlightRanges(text: string, terms: string[]) {
  const lowerText = text.toLocaleLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];

  terms.forEach((term) => {
    const lowerTerm = term.toLocaleLowerCase();
    let start = lowerText.indexOf(lowerTerm);
    while (start >= 0) {
      const end = start + term.length;
      const overlaps = ranges.some((range) => start < range.end && end > range.start);
      if (!overlaps) {
        ranges.push({ start, end });
      }
      start = lowerText.indexOf(lowerTerm, end);
    }
  });

  return ranges.sort((a, b) => a.start - b.start);
}
