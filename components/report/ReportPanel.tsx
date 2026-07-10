import { type CSSProperties, useEffect, useRef, useState } from "react";
import { shouldInjectClientFault } from "@/lib/dev/clientControls";
import { JujuOrb } from "@/components/JujuOrb";
import type {
  DimensionScores,
  InterviewAnswer,
  InterviewerStyleId,
  InterviewQuestion,
  InterviewReport,
  QuestionReport,
  VisualTheme
} from "@/lib/types";

const dimensionOrder: Array<keyof DimensionScores> = [
  "jobRelevance",
  "structure",
  "evidence",
  "professionalExpression",
  "truthBoundary",
  "completeness"
];

const dimensionLabels: Record<keyof DimensionScores, string> = {
  jobRelevance: "岗位相关",
  structure: "结构表达",
  evidence: "证据力度",
  professionalExpression: "职业表达",
  truthBoundary: "事实边界",
  completeness: "完整度"
};

const zeroDimensionScores: DimensionScores = {
  jobRelevance: 0,
  structure: 0,
  evidence: 0,
  professionalExpression: 0,
  truthBoundary: 0,
  completeness: 0
};

function FigmaReportClock() {
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

function FigmaAbilityRadar({ note, scores }: { note?: string; scores: DimensionScores }) {
  const center = 92;
  const radius = 58;
  const labelRadius = 78;
  const pointFor = (index: number, valueRadius: number) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / dimensionOrder.length;
    return {
      x: center + Math.cos(angle) * valueRadius,
      y: center + Math.sin(angle) * valueRadius
    };
  };
  const axisPoints = dimensionOrder.map((_, index) => pointFor(index, radius));
  const scorePoints = dimensionOrder.map((key, index) => pointFor(index, radius * Math.max(0, Math.min(20, scores[key])) / 20));
  const labelPoints = dimensionOrder.map((_, index) => pointFor(index, labelRadius));
  const polygonPoints = scorePoints.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="figma-report-radar" aria-label="能力象限图">
      <svg viewBox="0 0 184 184" role="img" aria-label="六维能力评分图">
        {[0.33, 0.66, 1].map((scale) => (
          <polygon
            className="figma-report-radar-grid"
            key={scale}
            points={axisPoints.map((point) => `${center + (point.x - center) * scale},${center + (point.y - center) * scale}`).join(" ")}
          />
        ))}
        {axisPoints.map((point, index) => (
          <line className="figma-report-radar-axis" key={dimensionOrder[index]} x1={center} y1={center} x2={point.x} y2={point.y} />
        ))}
        <polygon className="figma-report-radar-score" points={polygonPoints} />
        {scorePoints.map((point, index) => (
          <circle className="figma-report-radar-dot" key={dimensionOrder[index]} cx={point.x} cy={point.y} r="3" />
        ))}
        {labelPoints.map((point, index) => (
          <text className="figma-report-radar-label" key={dimensionOrder[index]} x={point.x} y={point.y}>
            {dimensionLabels[dimensionOrder[index]]}
          </text>
        ))}
      </svg>
      <div className="figma-report-radar-scores">
        {dimensionOrder.map((key) => (
          <span key={key}>
            {dimensionLabels[key]} {scores[key]}
          </span>
        ))}
      </div>
      {note && <p className="figma-report-radar-note">{note}</p>}
    </div>
  );
}

export function ReportPanel({
  report,
  questions,
  answers,
  state,
  streamedQuestionReports,
  interviewerStyleId = "strictHr",
  visualTheme = "classic",
  onRetry,
  onUseNonStreamingFallback,
  onUseFallback,
  onRegenerateQuestion
}: {
  report: InterviewReport | null;
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
  state: {
    kind: "idle" | "loading" | "streaming" | "ready" | "error";
    message: string;
    usedFallback: boolean;
  };
  streamedQuestionReports: QuestionReport[];
  interviewerStyleId?: InterviewerStyleId;
  visualTheme?: VisualTheme;
  onRetry: () => void;
  onUseNonStreamingFallback: () => void;
  onUseFallback: () => void;
  onRegenerateQuestion: (questionId: string) => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "success" | "failed">("idle");
  const [copyMessage, setCopyMessage] = useState("");
  const [manualCopyVisible, setManualCopyVisible] = useState(false);
  const [manualCopyText, setManualCopyText] = useState("");
  const [figmaReportQuestionIndex, setFigmaReportQuestionIndex] = useState(0);
  const copyTextRef = useRef<HTMLTextAreaElement | null>(null);
  const figmaReportStageRef = useRef<HTMLElement | null>(null);
  const figmaReportCardRef = useRef<HTMLDivElement | null>(null);
  const figmaReportTopRef = useRef<HTMLDivElement | null>(null);
  const figmaQuestionDetailRef = useRef<HTMLElement | null>(null);
  const [figmaReportPageHeight, setFigmaReportPageHeight] = useState(1565);
  const [figmaReportBodyTop, setFigmaReportBodyTop] = useState(812);
  const [figmaTabsDock, setFigmaTabsDock] = useState({ left: 20, pinned: false, top: 8 });

  function fallbackCopy(text: string) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  }

  function selectManualCopyText(text: string) {
    setManualCopyText(text);
    setManualCopyVisible(true);
    window.setTimeout(() => {
      copyTextRef.current?.focus();
      copyTextRef.current?.select();
    }, 0);
  }

  function showClipboardFailureFallback() {
    if (!report) return;
    setCopyState("failed");
    setCopyMessage("剪贴板权限失败，已选中整份报告文本，可按 Ctrl/Cmd + C 手动复制。");
    selectManualCopyText(report.finalReport.copyText);
  }

  async function copyReport() {
    if (!report) return;
    await copyText(report.finalReport.copyText, "已复制优化答案和复盘报告。");
  }

  async function copyQuestion(questionReport: QuestionReport, mode: "optimized" | "oral") {
    const title = mode === "optimized" ? "优化答案" : "60 秒口述版";
    const text = `${questionReport.questionId} ${title}\n${mode === "optimized" ? questionReport.optimizedAnswer : questionReport.oralVersion60s}`;
    await copyText(text, `已复制 ${questionReport.questionId} ${title}。`);
  }

  async function copyText(text: string, successMessage: string) {
    if (shouldInjectClientFault("clipboard")) {
      setCopyState("failed");
      setCopyMessage("剪贴板权限失败，已选中对应文本，可按 Ctrl/Cmd + C 手动复制。");
      selectManualCopyText(text);
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyState("success");
      setCopyMessage(successMessage);
      setManualCopyVisible(false);
    } catch {
      if (fallbackCopy(text)) {
        setCopyState("success");
        setCopyMessage(successMessage);
        setManualCopyVisible(false);
        return;
      }
      setCopyState("failed");
      setCopyMessage("剪贴板权限失败，已选中对应文本，可按 Ctrl/Cmd + C 手动复制。");
      selectManualCopyText(text);
    }
  }

  const answeredCount = answers.filter((answer) => answer.answerText.trim()).length;
  const missingAnswers = questions.filter(
    (question) => !answers.find((answer) => answer.questionId === question.id)?.answerText.trim()
  );

  useEffect(() => {
    if (visualTheme !== "figma" || !report) {
      return;
    }

    const element = figmaQuestionDetailRef.current;
    if (!element) {
      return;
    }
    const topStack = figmaReportTopRef.current;

    let animationFrame = 0;
    const updateHeight = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        // The top region (score hero + summary/risk cards) is variable-height.
        // Push the tabbed body below its real bottom so long risk/action lists
        // never collide with the tab strip pinned at the body top.
        const cardRect = figmaReportCardRef.current?.getBoundingClientRect();
        const topStackRect = topStack?.getBoundingClientRect();
        const bodyTop =
          cardRect && topStackRect
            ? Math.max(812, Math.ceil(topStackRect.bottom - cardRect.top + 20))
            : 812;
        setFigmaReportBodyTop((current) => (current === bodyTop ? current : bodyTop));

        const bottomPadding = 96;
        const nextHeight = Math.max(1565, Math.ceil(bodyTop + element.offsetTop + element.scrollHeight + bottomPadding));
        setFigmaReportPageHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
      });
    };

    updateHeight();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateHeight);
    resizeObserver?.observe(element);
    if (topStack) {
      resizeObserver?.observe(topStack);
    }
    window.addEventListener("resize", updateHeight);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [answers, figmaReportQuestionIndex, report, streamedQuestionReports, visualTheme]);

  useEffect(() => {
    // On mobile the whole page scrolls (the stage is not its own scroll
    // container), so tab pinning is disabled and tabs flow with the content.
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches;
    if (visualTheme !== "figma" || !report || isMobile) {
      setFigmaTabsDock((current) => (current.pinned ? { left: 20, pinned: false, top: 8 } : current));
      return;
    }

    const stage = figmaReportStageRef.current;
    const card = figmaReportCardRef.current;
    if (!stage || !card) {
      return;
    }

    let animationFrame = 0;
    const updateDock = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const stageRect = stage.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const stickyTop = Math.max(stageRect.top, 0) + 8;
        const tabNormalTop = cardRect.top + figmaReportBodyTop;
        const nextDock = {
          left: cardRect.left,
          pinned: tabNormalTop <= stickyTop,
          top: stickyTop
        };

        setFigmaTabsDock((current) =>
          current.pinned === nextDock.pinned &&
          Math.abs(current.left - nextDock.left) < 0.5 &&
          Math.abs(current.top - nextDock.top) < 0.5
            ? current
            : nextDock
        );
      });
    };

    updateDock();
    stage.addEventListener("scroll", updateDock, { passive: true });
    window.addEventListener("scroll", updateDock, { passive: true });
    window.addEventListener("resize", updateDock);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      stage.removeEventListener("scroll", updateDock);
      window.removeEventListener("scroll", updateDock);
      window.removeEventListener("resize", updateDock);
    };
  }, [report, visualTheme, figmaReportBodyTop]);

  if (visualTheme === "figma" || visualTheme === "juju") {
    if (!report) {
      return (
        <section className="figma-phone-stage" aria-label="Report loading">
          <div className="figma-phone-card figma-home-card figma-report-card figma-report-loading-card">
            <div className="figma-statusbar">
              <FigmaReportClock />
              <span>Facewall</span>
            </div>
            {visualTheme === "juju" ? (
              <JujuOrb className="juju-report-loading-orb" />
            ) : (
              <div className="figma-report-loading-orb" aria-hidden="true" />
            )}
            <section className="figma-report-loading-copy">
              <h2>正在生成复盘报告</h2>
              <p>{state.message || "正在整理 3 道题的回答、风险和优化答案。"}</p>
            </section>
            {streamedQuestionReports.length > 0 && (
              <div className="figma-report-stream-list">
                {streamedQuestionReports.map((questionReport) => (
                  <article key={questionReport.questionId}>
                    <strong>{questionReport.questionId} 已生成</strong>
                    <span>{questionReport.score} 分</span>
                  </article>
                ))}
              </div>
            )}
            {state.kind === "error" && (
              <div className="figma-report-loading-actions">
                <button className="primary" onClick={onRetry}>
                  重试
                </button>
                <button onClick={onUseNonStreamingFallback}>非流式</button>
                <button onClick={onUseFallback}>演示报告</button>
              </div>
            )}
          </div>
        </section>
      );
    }

    if (visualTheme === "juju") {
      return (
        <JujuReportPanel
          report={report}
          questions={questions}
          answers={answers}
          answeredCount={answeredCount}
          missingAnswers={missingAnswers}
          copyText={copyText}
          copyState={copyState}
          copyMessage={copyMessage}
          manualCopyVisible={manualCopyVisible}
          manualCopyText={manualCopyText}
          copyTextRef={copyTextRef}
          state={state}
          interviewerStyleId={interviewerStyleId}
        />
      );
    }

    const figmaQuestionReports = report.questionReports.length > 0 ? report.questionReports : streamedQuestionReports;
    const selectedQuestionReport = figmaQuestionReports[Math.min(figmaReportQuestionIndex, figmaQuestionReports.length - 1)] ?? figmaQuestionReports[0];
    const selectedQuestion = questions.find((item) => item.id === selectedQuestionReport?.questionId) ?? questions[figmaReportQuestionIndex];
    const selectedAnswer = answers.find((item) => item.questionId === selectedQuestionReport?.questionId || item.questionId === selectedQuestion?.id);
    const dimensionSummary = selectedQuestion?.expectedSignals.join("、") || selectedQuestionReport?.riskTags.join("、") || "结合岗位要求、表达结构和证据质量综合评估。";
    const seniorityText =
      selectedQuestion?.difficulty === "hard"
        ? "高压追问 / 资深候选人"
        : selectedQuestion?.difficulty === "medium"
          ? "进阶练习 / 中级候选人"
          : "基础练习 / 初次面试";
    const intentText = selectedQuestion?.intent || selectedQuestionReport?.diagnosis || "考察候选人是否能用真实证据支撑判断。";
    const figmaRiskTags = selectedQuestionReport?.riskTags.slice(0, 3) ?? [];
    const missingAnswerIds = missingAnswers.map((question) => question.id).join(" / ");
    const selectedAnswerText = selectedAnswer?.answerText.trim() ?? "";
    const isSelectedQuestionMissing = !selectedAnswerText || selectedQuestionReport?.riskTags.includes("缺失答案");
    const selectedQuestionScoreText = isSelectedQuestionMissing ? "暂无评分" : `${selectedQuestionReport?.score ?? 0}`;
    const radarScores = isSelectedQuestionMissing ? zeroDimensionScores : selectedQuestionReport?.dimensionScores ?? zeroDimensionScores;
    const radarNote = isSelectedQuestionMissing ? "缺失答案，六维分数为 0，暂不评估能力表现。" : undefined;
    const figmaReportPageStyle = {
      "--figma-report-page-height": `${figmaReportPageHeight}px`,
      "--figma-report-body-top": `${figmaReportBodyTop}px`,
      "--figma-report-tabs-fixed-left": `${figmaTabsDock.left}px`,
      "--figma-report-tabs-fixed-top": `${figmaTabsDock.top}px`
    } as CSSProperties;
    const tabItems = questions.slice(0, 3).map((question, index) => ({
      id: question.id,
      label: `Q${index + 1}`
    }));

    return (
      <section className="figma-phone-stage figma-report-stage" ref={figmaReportStageRef} aria-label="Report">
        <div className="figma-phone-card figma-home-card figma-report-card figma-report-page-card" ref={figmaReportCardRef} style={figmaReportPageStyle}>
          <div className="figma-statusbar">
            <FigmaReportClock />
          </div>

          <section className="figma-report-score-hero">
            <div className={`figma-report-person hero-${interviewerStyleId}`} aria-hidden="true" />
            <p>面试评分</p>
            <h2>{report.finalReport.overallScore}</h2>
            <div className="figma-report-card-stack" ref={figmaReportTopRef}>
              <section className="figma-report-summary-card figma-report-final-card">
                <h3>最终报告</h3>
                <p className="figma-report-final-score">总分：{report.finalReport.overallScore}</p>
                <p>{report.finalReport.summary}</p>
                <p className="figma-report-answer-status">
                  <span className={missingAnswers.length > 0 ? "warning" : undefined}>
                    已作答 {answeredCount} / {questions.length}
                  </span>
                  {missingAnswers.length > 0 && (
                    <>
                      <span className="warning">；</span>
                      <span className="warning">缺失答案：{missingAnswerIds}</span>
                    </>
                  )}
                </p>
              </section>
              <section className="figma-report-summary-card figma-report-risk-action-card">
                <h3>Top 风险</h3>
                <ul>
                  {report.finalReport.topRisks.map((risk) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
                <h3>行动项</h3>
                <ul>
                  {report.finalReport.actionItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            </div>
          </section>

          {(state.usedFallback || copyState !== "idle") && (
            <div className={copyState === "success" ? "figma-report-toast success" : "figma-report-toast warning"}>
              {copyState !== "idle"
                ? copyMessage
                : "当前展示演示兜底报告。"}
            </div>
          )}

          <section className="figma-report-body">
            <div className={`figma-report-tabs active-${figmaReportQuestionIndex}${figmaTabsDock.pinned ? " is-pinned" : ""}`} role="tablist" aria-label="题目报告">
              {tabItems.map((tab, index) => (
                <button
                  className={index === figmaReportQuestionIndex ? "active" : ""}
                  key={tab.id}
                  onClick={() => setFigmaReportQuestionIndex(index)}
                  role="tab"
                  aria-selected={index === figmaReportQuestionIndex}
                >
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            <article
              className="figma-report-question-detail"
              key={selectedQuestionReport?.questionId ?? selectedQuestion?.id ?? figmaReportQuestionIndex}
              ref={figmaQuestionDetailRef}
            >
              <section className="figma-report-detail-block question">
                <div className="figma-report-question-score-line">
                  <h3>本题分数</h3>
                  <strong className={isSelectedQuestionMissing ? "empty" : undefined}>{selectedQuestionScoreText}</strong>
                </div>
                <p>{selectedQuestion?.questionText ?? selectedQuestion?.title ?? "暂无题目内容。"}</p>
              </section>

              <section className="figma-report-detail-card">
                <h3>面试题目详情</h3>
                <dl>
                  <div>
                    <dt>考察维度</dt>
                    <dd>{dimensionSummary}</dd>
                  </div>
                  <div>
                    <dt>适用职级</dt>
                    <dd>{seniorityText}</dd>
                  </div>
                  <div>
                    <dt>出题意图</dt>
                    <dd>{intentText}</dd>
                  </div>
                  <div>
                    <dt>您的回答</dt>
                    <dd>{selectedAnswer?.answerText.trim() || "本题暂无有效回答，报告会保守标记为缺失答案。"}</dd>
                  </div>
                </dl>
              </section>

              <FigmaAbilityRadar note={radarNote} scores={radarScores} />

              <section className="figma-report-risk-tags">
                <h3>风险标签</h3>
                <div>
                  {(figmaRiskTags.length > 0 ? figmaRiskTags : ["暂无风险标签"]).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </section>

              <section className="figma-report-text-card fatal">
                <h3>致命问题</h3>
                <p>{selectedQuestionReport?.fatalIssue ?? "暂无致命问题。"}</p>
              </section>

              <section className="figma-report-text-card diagnosis">
                <h3>诊断</h3>
                <p>{selectedQuestionReport?.diagnosis ?? "暂无诊断。"}</p>
              </section>

              {selectedQuestionReport && (
                <section className="figma-report-text-card oral">
                  <div className="figma-report-card-title-row">
                    <h3>60 秒口述版</h3>
                    <button className="figma-report-copy-icon-button" onClick={() => copyQuestion(selectedQuestionReport, "oral")} aria-label="复制 60 秒口述版">
                      <svg
                        viewBox="0 0 24 24"
                        width="15"
                        height="15"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="9" y="9" width="12" height="12" rx="2.4" />
                        <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
                      </svg>
                    </button>
                  </div>
                  <p>{selectedQuestionReport.oralVersion60s}</p>
                </section>
              )}
            </article>

            {manualCopyVisible && (
              <label className="figma-report-manual-copy figma-report-page-copy" htmlFor="figmaCopyText">
                <span>手动复制内容</span>
                <textarea ref={copyTextRef} id="figmaCopyText" readOnly value={manualCopyText || report.finalReport.copyText} />
              </label>
            )}
          </section>

          <div className="figma-report-home-indicator" aria-hidden="true" />
        </div>
      </section>
    );
  }

  if (!report) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Report</h2>
            <p>报告生成前会保留当前 3 道题和已填答案。</p>
          </div>
        </div>
        {state.kind === "error" ? (
          <div className="status error">{state.message}</div>
        ) : state.kind === "streaming" ? (
          <div className="status">{state.message || "正在流式生成报告..."}</div>
        ) : (
          <div className="status">{state.message || "报告生成中。如果长时间无响应，可重试。"}</div>
        )}
        {missingAnswers.length > 0 && <MissingAnswerNotice missingAnswers={missingAnswers} />}
        {streamedQuestionReports.length > 0 && (
          <div className="report-grid panel">
            {streamedQuestionReports.map((questionReport) => (
              <article className="question-card" key={questionReport.questionId}>
                <strong>
                  {questionReport.questionId} · 已生成单题片段 · {questionReport.score} 分
                </strong>
                <p className="helper">{questionReport.diagnosis}</p>
                <div className="report-block">
                  <h3>优化答案</h3>
                  <p>{questionReport.optimizedAnswer}</p>
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="inline-actions">
          <button className="primary" onClick={onRetry} disabled={state.kind === "loading" || state.kind === "streaming"}>
            重试生成报告
          </button>
          {state.kind === "error" && (
            <>
              <button onClick={onUseNonStreamingFallback}>使用非流式保底</button>
              <button onClick={onUseFallback}>使用演示兜底报告</button>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Report</h2>
          <p>报告按 questionId 和答案关联；复制内容覆盖优化答案和复盘报告。</p>
        </div>
        <div className="inline-actions compact-actions">
          <button className="primary" onClick={() => copyReport()}>
            一键复制
          </button>
          <button onClick={() => selectManualCopyText(report.finalReport.copyText)}>手动复制</button>
        </div>
      </div>

      {state.usedFallback && <div className="status warning">当前展示演示兜底报告；问题和答案仍按本次会话 questionId 对齐。</div>}
      {missingAnswers.length > 0 && <MissingAnswerNotice missingAnswers={missingAnswers} />}
      {state.message && state.kind === "ready" && <div className="status success">{state.message}</div>}
      {copyState === "success" && <div className="status success">{copyMessage || "已复制。"}</div>}
      {copyState === "failed" && <div className="status warning">{copyMessage || "剪贴板权限失败，已选中下方文本，可按 Ctrl/Cmd + C 手动复制。"}</div>}

      <div className="profile-columns">
        <div className="soft-box">
          <h3>最终报告</h3>
          <p className="score-line">总分：<strong>{report.finalReport.overallScore}</strong></p>
          <p>{report.finalReport.summary}</p>
          <p className="helper">已作答 {answeredCount} / {questions.length}</p>
        </div>
        <div className="soft-box">
          <h3>Top 风险</h3>
          <ul className="list">
            {report.finalReport.topRisks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
          <h3>行动项</h3>
          <ul className="list">
            {report.finalReport.actionItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="report-grid panel">
        {report.questionReports.map((questionReport) => {
          const question = questions.find((item) => item.id === questionReport.questionId);
          const answer = answers.find((item) => item.questionId === questionReport.questionId);
          return (
            <article className="question-card" key={questionReport.questionId}>
              <strong>
                {questionReport.questionId} · {question?.title ?? "未知题目"} · {questionReport.score} 分
              </strong>
              <p className="helper">
                答案状态：{answer?.answerText.trim() ? `${answer.inputMode} / ${answer.sttStatus} / ${answer.durationSec}s` : "缺失答案"}
              </p>
              <div className="metric-grid">
                {Object.entries(questionReport.dimensionScores).map(([name, score]) => (
                  <div className="metric" key={name}>
                    <span className="helper">{dimensionLabels[name as keyof DimensionScores] ?? name}</span>
                    <strong>{score}</strong>
                  </div>
                ))}
              </div>
              <div className="report-block">
                <h3>风险标签</h3>
                <p>{questionReport.riskTags.join(" / ") || "暂无"}</p>
              </div>
              <div className="report-block">
                <h3>致命问题</h3>
                <p>{questionReport.fatalIssue}</p>
              </div>
              <div className="report-block">
                <h3>诊断</h3>
                <p>{questionReport.diagnosis}</p>
              </div>
              <div className="report-block">
                <h3>优化答案</h3>
                <p>{questionReport.optimizedAnswer}</p>
                <div className="inline-actions compact-actions">
                  <button onClick={() => copyQuestion(questionReport, "optimized")}>复制优化答案</button>
                  <button onClick={() => copyQuestion(questionReport, "oral")}>复制 60 秒版</button>
                  <button onClick={() => onRegenerateQuestion(questionReport.questionId)}>重新生成本题</button>
                </div>
              </div>
              <div className="report-block">
                <h3>60 秒口述版</h3>
                <p>{questionReport.oralVersion60s}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div className={manualCopyVisible || copyState === "failed" ? "field" : "field visually-muted"}>
        <label htmlFor="copyText">可复制内容</label>
        <textarea ref={copyTextRef} className="copy-box" id="copyText" readOnly value={manualCopyText || report.finalReport.copyText} />
        <button className="copy-failure-check" onClick={showClipboardFailureFallback}>
          验证剪贴板失败兜底
        </button>
      </div>
    </section>
  );
}

function JujuReportPanel({
  report,
  questions,
  answers,
  answeredCount,
  missingAnswers,
  copyText,
  copyState,
  copyMessage,
  manualCopyVisible,
  manualCopyText,
  copyTextRef,
  state,
  interviewerStyleId
}: {
  report: InterviewReport;
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
  answeredCount: number;
  missingAnswers: InterviewQuestion[];
  copyText: (text: string, successMessage: string) => Promise<void>;
  copyState: "idle" | "success" | "failed";
  copyMessage: string;
  manualCopyVisible: boolean;
  manualCopyText: string;
  copyTextRef: React.RefObject<HTMLTextAreaElement | null>;
  state: {
    kind: "idle" | "loading" | "streaming" | "ready" | "error";
    message: string;
    usedFallback: boolean;
  };
  interviewerStyleId: InterviewerStyleId;
}) {
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [sheet, setSheet] = useState<"risks" | "actions" | null>(null);
  const questionReports = report.questionReports;
  const selectedReport = questionReports[Math.min(selectedQuestionIndex, Math.max(0, questionReports.length - 1))] ?? questionReports[0];
  const selectedQuestion = questions.find((question) => question.id === selectedReport?.questionId) ?? questions[selectedQuestionIndex];
  const summaryText = buildJujuSummaryText(report, answeredCount, questions.length, missingAnswers);
  const selectedMouthpieceText = selectedReport?.oralVersion60s || "暂无嘴替答案。";
  const riskAnalysis = buildJujuRiskAnalysis(selectedReport);
  const tabs = questions.slice(0, 3).map((question, index) => ({
    id: question.id,
    label: `Q${index + 1}`
  }));
  const interviewerName =
    interviewerStyleId === "strictHr" ? "温婉HR小姐姐" : interviewerStyleId === "techBro" ? "技术老哥" : "资深业务大佬";
  const interviewerRole =
    interviewerStyleId === "strictHr" ? "HR" : interviewerStyleId === "techBro" ? "Tech Lead" : "业务负责人";
  const dimensionSummary =
    selectedQuestion?.expectedSignals.join("、") || selectedReport?.riskTags.join("、") || "结合岗位要求、表达结构和证据质量综合评估。";
  const seniorityText =
    selectedQuestion?.difficulty === "hard"
      ? "高压追问 / 资深候选人"
      : selectedQuestion?.difficulty === "medium"
        ? "进阶练习 / 中级候选人"
        : "基础练习 / 初次面试";
  const intentText = selectedQuestion?.intent || selectedReport?.diagnosis || "考察候选人是否能用真实证据支撑判断。";

  return (
    <section className="figma-phone-stage juju-report-stage" aria-label="Juju report">
      <div className="figma-phone-card figma-home-card figma-report-card juju-report-card">
        <div className="figma-statusbar">
          <FigmaReportClock />
          <span>Facewall</span>
        </div>

        <div className="juju-report-scroll">
          <section className="juju-report-hero">
            <div className={`juju-report-person hero-${interviewerStyleId}`} aria-hidden="true" />
            <div className="juju-report-hero-score">
              <p>本次得分</p>
              <h2>{report.finalReport.overallScore}</h2>
              <span>
                评分来自 {interviewerName} · {interviewerRole}
              </span>
            </div>
          </section>

          <section className="juju-report-summary-card">
            <JujuClampText
              className="juju-report-summary-text"
              expanded={summaryExpanded}
              lines={3}
              text={summaryText}
            />
            <button type="button" onClick={() => setSummaryExpanded((current) => !current)}>
              {summaryExpanded ? "收起" : "展开"}
            </button>
          </section>

          <div className="juju-report-stat-grid">
            <JujuReportStatCard
              count={report.finalReport.topRisks.length}
              iconSrc="/juju/profile/dot-risk.svg?v=2026071003"
              label="TOP 风险"
              onClick={() => setSheet("risks")}
            />
            <JujuReportStatCard
              count={report.finalReport.actionItems.length}
              iconSrc="/juju/profile/dot-suggestion.svg?v=2026071003"
              label="行动项"
              onClick={() => setSheet("actions")}
            />
          </div>

          <section className="juju-report-tabs-panel">
            <div className="juju-report-tabs" role="tablist" aria-label="题目报告">
              {tabs.map((tab, index) => (
                <button
                  className={index === selectedQuestionIndex ? "active" : ""}
                  key={tab.id}
                  onClick={() => setSelectedQuestionIndex(index)}
                  role="tab"
                  aria-selected={index === selectedQuestionIndex}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <article className="juju-report-question-pane">
              <section className="juju-report-question-block">
                <h3>面试题目</h3>
                <JujuTruncatedText
                  key={`question-${selectedQuestion?.id ?? selectedQuestionIndex}`}
                  text={selectedQuestion?.questionText ?? selectedQuestion?.title ?? "暂无题目内容。"}
                />
              </section>

              <section className="juju-report-diagnosis-block">
                <h3>诊断</h3>
                <JujuTruncatedText
                  key={`diagnosis-${selectedReport?.questionId ?? selectedQuestionIndex}`}
                  text={selectedReport?.diagnosis ?? "暂无诊断。"}
                />
              </section>

              <section className="juju-report-mouthpiece-inline">
                <div className="juju-report-mouthpiece-inline-body">
                  <div className="juju-report-section-heading">
                    <img src="/juju/profile/dot-match.svg?v=2026071003" alt="" aria-hidden="true" />
                    <h3>嘴替</h3>
                  </div>
                  <p>{selectedMouthpieceText}</p>
                </div>
                <button
                  type="button"
                  className="juju-report-copy-inline"
                  onClick={() => copyText(selectedMouthpieceText, `已复制 ${tabs[selectedQuestionIndex]?.label ?? "当前题"} 嘴替内容。`)}
                >
                  <svg
                    viewBox="0 0 16 16"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="6" y="6" width="8" height="8" rx="1.6" />
                    <path d="M3.3 10H2.7A1.3 1.3 0 0 1 1.4 8.7v-6A1.3 1.3 0 0 1 2.7 1.4h6A1.3 1.3 0 0 1 10 2.7v0.6" />
                  </svg>
                  <span aria-hidden="true">复制答案</span>
                </button>
              </section>

              <section className="juju-report-analysis-card">
                <div className="juju-report-block-heading">
                  <img className="juju-report-heading-icon" src="/juju/report/analyze.svg?v=2026071017" alt="" aria-hidden="true" />
                  <h3>面试题目分析</h3>
                </div>
                <div className="juju-report-block-body">
                  <dl>
                    <div>
                      <dt>考察维度</dt>
                      <dd>{dimensionSummary}</dd>
                    </div>
                    <div>
                      <dt>适用职级</dt>
                      <dd>{seniorityText}</dd>
                    </div>
                    <div>
                      <dt>出题意图</dt>
                      <dd>{intentText}</dd>
                    </div>
                  </dl>
                </div>
              </section>

              <section className="juju-report-risk-analysis">
                <div className="juju-report-block-heading">
                  <img className="juju-report-heading-icon" src="/juju/report/guide.svg?v=2026071017" alt="" aria-hidden="true" />
                  <h3>风险分析</h3>
                </div>
                <div className="juju-report-block-body">
                  {riskAnalysis.map((item) => (
                    <article key={item.title}>
                      <h4>{item.title}</h4>
                      <p>{item.content}</p>
                    </article>
                  ))}
                </div>
              </section>
            </article>
          </section>

          {(state.usedFallback || copyState !== "idle") && (
            <div className={copyState === "success" ? "juju-report-toast success" : "juju-report-toast warning"}>
              {copyState !== "idle" ? copyMessage : "当前展示演示兜底报告。"}
            </div>
          )}

          {manualCopyVisible && (
            <label className="figma-report-manual-copy juju-report-manual-copy" htmlFor="jujuReportCopyText">
              <span>手动复制内容</span>
              <textarea ref={copyTextRef} id="jujuReportCopyText" readOnly value={manualCopyText || report.finalReport.copyText} />
            </label>
          )}
        </div>

        {sheet && (
          <JujuReportSheet
            items={sheet === "risks" ? report.finalReport.topRisks : report.finalReport.actionItems}
            title={sheet === "risks" ? "TOP 风险" : "行动项"}
            iconSrc={sheet === "risks" ? "/juju/profile/dot-risk.svg?v=2026071003" : "/juju/profile/dot-suggestion.svg?v=2026071003"}
            onClose={() => setSheet(null)}
          />
        )}
      </div>
    </section>
  );
}

function JujuTruncatedText({
  text,
  collapsedLines = 2,
  thresholdLines = 2
}: {
  text: string;
  collapsedLines?: number;
  thresholdLines?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  // null = content fits within thresholdLines, no expand affordance at all
  const [truncatedText, setTruncatedText] = useState<string | null>(null);
  const measureRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const measure = () => {
      const element = measureRef.current;
      if (!element) return;
      const lineHeight = parseFloat(window.getComputedStyle(element).lineHeight) || 20;
      element.textContent = text;
      const fullLines = Math.ceil(element.scrollHeight / lineHeight);
      if (fullLines <= thresholdLines) {
        setTruncatedText(null);
        return;
      }
      const suffix = " ... 展开";
      let low = 0;
      let high = text.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        element.textContent = `${text.slice(0, mid)}${suffix}`;
        if (Math.ceil(element.scrollHeight / lineHeight) <= collapsedLines) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }
      setTruncatedText(text.slice(0, low));
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, collapsedLines, thresholdLines]);

  return (
    <div className="juju-truncate">
      <p ref={measureRef} className="juju-truncate-measure" aria-hidden="true" />
      {truncatedText === null ? (
        <p>{text}</p>
      ) : expanded ? (
        <>
          <p>{text}</p>
          <button type="button" onClick={() => setExpanded(false)}>
            收起
          </button>
        </>
      ) : (
        <p>
          {truncatedText}
          <span className="juju-truncate-ellipsis" aria-hidden="true">
            {" ... "}
          </span>
          <button type="button" className="juju-truncate-inline" onClick={() => setExpanded(true)}>
            展开
          </button>
        </p>
      )}
    </div>
  );
}

function JujuClampText({
  className,
  expanded,
  lines,
  text
}: {
  className: string;
  expanded: boolean;
  lines: number;
  text: string;
}) {
  return (
    <p
      className={expanded ? `${className} expanded` : className}
      style={{ "--juju-clamp-lines": lines } as CSSProperties}
    >
      {text}
    </p>
  );
}

function JujuReportStatCard({
  count,
  iconSrc,
  label,
  onClick
}: {
  count: number;
  iconSrc: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="juju-report-stat-card" type="button" onClick={onClick}>
      <div className="juju-report-stat-inner">
        <img src={iconSrc} alt="" aria-hidden="true" />
        <strong>{count}</strong>
        <span>
          {label}
          <img src="/juju/profile/expand-toggle.svg?v=2026071003" alt="" aria-hidden="true" />
        </span>
      </div>
    </button>
  );
}

function JujuReportSheet({
  iconSrc,
  items,
  title,
  onClose
}: {
  iconSrc: string;
  items: string[];
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="juju-report-sheet-overlay" role="presentation" onClick={onClose}>
      <div
        className="juju-report-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="juju-report-section-heading">
          <img src={iconSrc} alt="" aria-hidden="true" />
          <h3>{title}</h3>
        </div>
        <div className="juju-report-sheet-list">
          {(items.length > 0 ? items : ["暂无信息"]).map((item, index) => (
            <p key={`${title}-${item}-${index}`}>{item}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildJujuSummaryText(
  report: InterviewReport,
  answeredCount: number,
  questionCount: number,
  missingAnswers: InterviewQuestion[]
) {
  const status =
    missingAnswers.length > 0
      ? `当前有 ${missingAnswers.length} 道题缺少答案。系统保留问题和已填答案，不会编造缺失内容。`
      : `已完成 ${answeredCount}/${questionCount} 道题作答。`;
  return `${report.finalReport.summary} ${status}`.trim();
}

function buildJujuRiskAnalysis(questionReport: QuestionReport | undefined) {
  const tags = questionReport?.riskTags.slice(0, 2) ?? [];
  const fallbackTags = tags.length > 0 ? tags : ["事实边界", "表达结构"];
  const fatalIssue = questionReport?.fatalIssue || "当前回答的关键风险需要结合岗位要求继续收敛。";
  const diagnosis = questionReport?.diagnosis || "建议优先补充可验证事实、个人动作和结果复盘，避免泛泛而谈。";
  return fallbackTags.map((tag, index) => ({
    title: tag,
    content: index === 0 ? fatalIssue : diagnosis
  }));
}

function MissingAnswerNotice({ missingAnswers }: { missingAnswers: InterviewQuestion[] }) {
  return (
    <div className="status warning">
      缺失答案：{missingAnswers.map((question) => `${question.id} ${question.title}`).join("；")}。报告会标记缺失，不会生成假回答。
    </div>
  );
}
