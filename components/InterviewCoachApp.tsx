"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  generateQuestions,
  generateReport,
  generateReportStream,
  getActivePromptOverrides,
  parseProfile,
  regenerateQuestionReport,
  saveActivePromptOverrides
} from "@/lib/api/client";
import { buildFallbackReport } from "@/lib/demo/fallback";
import { demoScenario } from "@/lib/demo/scenario";
import { INTERVIEWER_STYLES, SESSION_STEPS } from "@/lib/state/constants";
import type {
  CandidateProfile,
  InterviewAnswer,
  InterviewQuestion,
  InterviewReport,
  InterviewerStyleId,
  QuestionReport,
  SessionStep,
  SetupForm
} from "@/lib/types";
import { InterviewPanel } from "@/components/interview/InterviewPanel";
import { DevOpsPanel } from "@/components/dev/DevOpsPanel";
import { cloneDefaultPromptOverrides, PromptDebugPanel } from "@/components/dev/PromptDebugPanel";
import { ReportPanel } from "@/components/report/ReportPanel";
import { SetupPanel } from "@/components/setup/SetupPanel";

const stepLabels: Record<SessionStep, string> = {
  setup: "Setup",
  profile: "Profile",
  questions: "Questions",
  interview: "Interview",
  report: "Report"
};

type VisualTheme = "figma" | "classic";
type FigmaSetupStep = "home" | "jd";

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

export function InterviewCoachApp({ initialVisualTheme = "figma" }: { initialVisualTheme?: VisualTheme }) {
  const isFigmaTheme = initialVisualTheme === "figma";
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
    if (isFigmaTheme || typeof window === "undefined") return;

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
  }, [isFigmaTheme]);

  const activePromptOverrides = isFigmaTheme ? undefined : promptOverrides;

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

  function resetDownstream(nextForm: SetupForm) {
    setForm(nextForm);
    setProfile(null);
    setQuestions([]);
    setAnswers([]);
    setReport(null);
    setStreamedQuestionReports([]);
    setReportState({ kind: "idle", message: "", usedFallback: false });
    setFigmaProfileStage("profile");
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

    try {
      setStatus({ kind: "loading", message: "正在生成候选人画像..." });
      const nextProfile = await parseProfile({ ...nextForm, promptOverrides: activePromptOverrides });
      setProfile(nextProfile);
      setFigmaProfileStage("profile");
      setStep("profile");
      setStatus({ kind: "success", message: isFigmaTheme ? "画像已生成，点击 Next 选择面试官。" : "画像已生成，下一步生成 3 道面试题。" });
    } catch (error) {
      setProfile(demoScenario.candidateProfile);
      setFigmaProfileStage("profile");
      setStep("profile");
      setStatus({
        kind: "error",
        message: `${error instanceof Error ? error.message : "画像生成失败"} 已使用演示兜底画像继续。${isFigmaTheme ? " 点击 Next 选择面试官。" : ""}`
      });
    }
  }

  async function handleGenerateQuestions() {
    const sourceProfile = profile ?? demoScenario.candidateProfile;
    try {
      setStatus({ kind: "loading", message: "正在生成面试题..." });
      const data = await generateQuestions({
        candidateProfile: sourceProfile,
        interviewerStyleId: form.interviewerStyleId,
        questionCount: 3,
        promptOverrides: activePromptOverrides
      });
      setQuestions(data.questions);
      setAnswers(
        data.questions.map((question) => ({
          questionId: question.id,
          answerText: "",
          inputMode: "text",
          durationSec: 0,
          sttStatus: "manual"
        }))
      );
      setStep("questions");
      setStatus({ kind: "success", message: "已生成 3 道题，可进入答题。" });
    } catch (error) {
      setQuestions(demoScenario.questions);
      setAnswers(
        demoScenario.questions.map((question) => ({
          questionId: question.id,
          answerText: "",
          inputMode: "text",
          durationSec: 0,
          sttStatus: "manual"
        }))
      );
      setStep("questions");
      setStatus({
        kind: "error",
        message: `${error instanceof Error ? error.message : "题目生成失败"} 已使用演示题目继续。`
      });
    }
  }

  async function handleGenerateQuestionsAndStartInterview() {
    const sourceProfile = profile ?? demoScenario.candidateProfile;
    try {
      setStatus({ kind: "loading", message: "正在生成面试题..." });
      const data = await generateQuestions({
        candidateProfile: sourceProfile,
        interviewerStyleId: form.interviewerStyleId,
        questionCount: 3,
        promptOverrides: activePromptOverrides
      });
      setQuestions(data.questions);
      setAnswers(
        data.questions.map((question) => ({
          questionId: question.id,
          answerText: "",
          inputMode: "text",
          durationSec: 0,
          sttStatus: "manual"
        }))
      );
      setStep("interview");
      setStatus({ kind: "success", message: "已生成 3 道题，开始答题。" });
    } catch (error) {
      setQuestions(demoScenario.questions);
      setAnswers(
        demoScenario.questions.map((question) => ({
          questionId: question.id,
          answerText: "",
          inputMode: "text",
          durationSec: 0,
          sttStatus: "manual"
        }))
      );
      setStep("interview");
      setStatus({
        kind: "error",
        message: `${error instanceof Error ? error.message : "题目生成失败"} 已使用演示题目进入答题。`
      });
    }
  }

  async function handleGenerateReport(nextAnswers = answers) {
    const sourceProfile = profile ?? demoScenario.candidateProfile;
    const sourceQuestions = questions.length === 3 ? questions : demoScenario.questions;
    const reportPayload = {
      candidateProfile: sourceProfile,
      questions: sourceQuestions,
      answers: nextAnswers,
      promptOverrides: activePromptOverrides
    };

    try {
      setStep("report");
      setReport(null);
      setStreamedQuestionReports([]);
      setReportState({ kind: "streaming", message: "正在启动流式复盘报告...", usedFallback: false });
      setStatus({ kind: "loading", message: "正在流式生成复盘报告..." });
      const nextReport = await generateReportStream(reportPayload, {
        onProgress: (progress) => {
          setReportState({ kind: "streaming", message: progress.message, usedFallback: false });
        },
        onQuestionReport: (questionReport) => {
          setStreamedQuestionReports((current) => upsertQuestionReport(current, questionReport));
          setReportState({ kind: "streaming", message: questionReport.message ?? "单题报告已生成。", usedFallback: false });
        }
      });
      setReport(nextReport);
      setReportState({ kind: "ready", message: "报告已生成。", usedFallback: false });
      setStatus({ kind: "success", message: "报告已生成，可复制优化答案和复盘报告。" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "流式报告生成失败";
      setReportState({ kind: "loading", message: `${message} 正在切换到非流式保底...`, usedFallback: false });
      setStatus({ kind: "loading", message: `${message} 正在切换到非流式保底...` });
      await handleGenerateReportNonStreaming(reportPayload, "流式报告失败，已使用非流式保底生成报告。");
    }
  }

  async function handleGenerateReportNonStreaming(
    reportPayload = {
      candidateProfile: profile ?? demoScenario.candidateProfile,
      questions: questions.length === 3 ? questions : demoScenario.questions,
      answers,
      promptOverrides: activePromptOverrides
    },
    successMessage = "已使用非流式保底生成报告。"
  ) {
    try {
      setStep("report");
      setReportState({ kind: "loading", message: "正在调用非流式报告保底...", usedFallback: false });
      const nextReport = await generateReport(reportPayload);
      setReport(nextReport);
      setStreamedQuestionReports([]);
      setReportState({ kind: "ready", message: successMessage, usedFallback: false });
      setStatus({ kind: "success", message: successMessage });
    } catch (error) {
      const message = error instanceof Error ? error.message : "报告生成失败";
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

  function handleUseFallbackReport() {
    const sourceQuestions = questions.length === 3 ? questions : demoScenario.questions;
    const fallbackReport = buildFallbackReport(sourceQuestions, answers);
    setReport(fallbackReport);
    setStreamedQuestionReports([]);
    setReportState({ kind: "ready", message: "已使用演示兜底报告。", usedFallback: true });
    setStatus({ kind: "success", message: "已使用演示兜底报告，可复制优化答案和复盘报告。" });
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

  return (
    <main className={`app-shell theme-${initialVisualTheme}`}>
      <header className="topbar">
        <div>
          <h1>面试嘴替教练</h1>
          <p>输入简历和 JD，选择面试官风格，完成 3 题答题后生成复盘报告。</p>
        </div>
        <div className="soft-box">
          <strong>{selectedStyle.label}</strong>
          <p className="helper">{selectedStyle.description}</p>
        </div>
      </header>

      <div className="visual-switcher" aria-label="视觉版本切换">
        <a className={initialVisualTheme === "figma" ? "active" : ""} href="/?theme=figma">
          Phase 9 新视觉
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

      {!isFigmaTheme && (
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
      )}

      {step === "setup" && (
        <SetupPanel
          form={form}
          initialFigmaStep={figmaSetupInitialStep}
          visualTheme={initialVisualTheme}
          onChange={resetDownstream}
          onFillDemo={fillDemo}
          onFillDemoAndStart={fillDemoAndStart}
          onStart={() => handleParseProfile()}
        />
      )}

      {isFigmaTheme && step === "profile" && figmaProfileStage !== "profile" ? (
        <FigmaInterviewerPanel
          selectedStyleId={form.interviewerStyleId}
          stage={figmaProfileStage}
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
      )}

      {step === "interview" && (
        <InterviewPanel
          answers={answers}
          interviewerStyleId={form.interviewerStyleId}
          questions={questions}
          visualTheme={initialVisualTheme}
          onAnswersChange={setAnswers}
          onGenerateReport={handleGenerateReport}
        />
      )}

      {step === "report" && (
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
          onUseFallback={handleUseFallbackReport}
          onRegenerateQuestion={handleRegenerateQuestion}
        />
      )}
    </main>
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
        {visualTheme === "figma" && currentStep === "profile" ? (
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
          <span>Facewall</span>
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
  onBack,
  onSelect,
  onStart
}: {
  selectedStyleId: InterviewerStyleId;
  stage: "selectInterviewer" | "confirmInterviewer";
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
            <span>Facewall</span>
          </div>
          <button className="figma-jd-back-button figma-interviewer-back-button" aria-label="重新选择面试官" onClick={onBack}>
            <span aria-hidden="true" />
          </button>
          <div className={`figma-interviewer-portrait figma-interviewer-portrait-detail hero-${selectedStyle.id}`} aria-hidden="true" />
          <div className="figma-interviewer-detail-copy">
            <h2>{selectedOption.name}</h2>
            <p className="figma-interviewer-role">{selectedOption.role}</p>
            <p className="figma-interviewer-description">{selectedStyle.description}</p>
          </div>
          <button className="figma-interviewer-start-button" onClick={onStart}>
            开始面试
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="figma-phone-stage" aria-label="Select interviewer">
      <div className="figma-phone-card figma-home-card figma-interviewer-card figma-select-card">
        <div className="figma-statusbar">
          <StatusBarClock />
          <span>Facewall</span>
        </div>
        <button className="figma-jd-back-button figma-interviewer-back-button" aria-label="返回候选人画像" onClick={onBack}>
          <span aria-hidden="true" />
        </button>
        <div className="figma-interviewer-title">
          <h2>Hey Dark !</h2>
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
    strictHr: { name: "温柔HR小姐姐", role: "HR" },
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
