"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { generateQuestions, generateReport, generateReportStream, parseProfile, regenerateQuestionReport } from "@/lib/api/client";
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

export function InterviewCoachApp({ initialVisualTheme = "figma" }: { initialVisualTheme?: VisualTheme }) {
  const isFigmaTheme = initialVisualTheme === "figma";
  const [step, setStep] = useState<SessionStep>("setup");
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
      interviewerStyleId: demoScenario.defaultInterviewerStyleId
    });
    setStatus({ kind: "success", message: "已填入演示兜底样例，可直接开始生成画像。" });
  }

  async function fillDemoAndStart() {
    const nextForm: SetupForm = {
      resumeText: demoScenario.resumeText,
      jdText: demoScenario.jdText,
      interviewerStyleId: demoScenario.defaultInterviewerStyleId
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
      const nextProfile = await parseProfile(nextForm);
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
        questionCount: 3
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
        questionCount: 3
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
      answers: nextAnswers
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
      answers
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
        questionId
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

      {step === "setup" && (
        <SetupPanel
          form={form}
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
          onFigmaNext={() => setFigmaProfileStage("selectInterviewer")}
          onStartInterview={() => setStep("interview")}
        />
      )}

      {step === "interview" && (
        <InterviewPanel
          answers={answers}
          interviewerStyleId={form.interviewerStyleId}
          questions={questions}
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

  if (stage === "confirmInterviewer") {
    return (
      <section className="figma-phone-stage" aria-label="Selected interviewer">
        <div className="figma-phone-card figma-confirm-card">
          <div className="figma-statusbar">
            <span>9:41</span>
            <span>Selected</span>
          </div>
          <div className={`figma-interviewer-hero hero-${selectedStyle.id}`} aria-hidden="true" />
          <div className="figma-copy centered">
            <p className="figma-kicker">Your interviewer</p>
            <h2>{selectedStyle.label}</h2>
            <p>{selectedStyle.description}</p>
          </div>
          <div className="figma-actions figma-actions-stacked">
            <button className="primary" onClick={onStart}>
              开始面试
            </button>
            <button onClick={onBack}>重新选择</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="figma-phone-stage" aria-label="Select interviewer">
      <div className="figma-phone-card figma-select-card">
        <div className="figma-statusbar">
          <span>9:41</span>
          <span>Select</span>
        </div>
        <div className="figma-copy">
          <p className="figma-kicker">Choose Interviewer</p>
          <h2>Select interviewer</h2>
          <p>选择本轮面试官风格，系统会基于画像生成对应的 3 道题。</p>
        </div>
        <div className="figma-interviewer-grid" role="radiogroup" aria-label="面试官风格">
          {INTERVIEWER_STYLES.map((style) => (
            <button
              className={selectedStyleId === style.id ? `figma-interviewer selected hero-${style.id}` : `figma-interviewer hero-${style.id}`}
              key={style.id}
              onClick={() => onSelect(style.id)}
              role="radio"
              aria-checked={selectedStyleId === style.id}
            >
              <span className="figma-avatar" aria-hidden="true" />
              <strong>{style.label}</strong>
              <span>{style.description}</span>
            </button>
          ))}
        </div>
        <div className="figma-actions">
          <button onClick={onBack}>Back</button>
        </div>
      </div>
    </section>
  );
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
