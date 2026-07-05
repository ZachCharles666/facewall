import { useEffect, useRef, useState } from "react";
import { shouldInjectClientFault } from "@/lib/dev/clientControls";
import type { InterviewAnswer, InterviewQuestion, InterviewReport, QuestionReport } from "@/lib/types";

const dimensionLabels: Record<string, string> = {
  jobRelevance: "岗位相关",
  structure: "结构表达",
  evidence: "证据力度",
  professionalExpression: "职业表达",
  truthBoundary: "事实边界",
  completeness: "完整度"
};

type VisualTheme = "classic" | "figma";

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

export function ReportPanel({
  report,
  questions,
  answers,
  state,
  streamedQuestionReports,
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

  if (visualTheme === "figma") {
    if (!report) {
      return (
        <section className="figma-phone-stage" aria-label="Report loading">
          <div className="figma-phone-card figma-home-card figma-report-card figma-report-loading-card">
            <div className="figma-statusbar">
              <FigmaReportClock />
              <span>Facewall</span>
            </div>
            <div className="figma-report-loading-orb" aria-hidden="true" />
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
    const pitfallItems = [
      selectedQuestionReport?.fatalIssue,
      selectedQuestionReport?.diagnosis,
      ...(selectedQuestionReport?.riskTags ?? [])
    ].filter(Boolean).slice(0, 3);
    const optimizationText = report.finalReport.actionItems[0] || selectedQuestionReport?.optimizedAnswer || report.finalReport.summary;

    return (
      <section className="figma-phone-stage figma-report-stage" aria-label="Report">
        <div className="figma-phone-card figma-home-card figma-report-card figma-report-page-card">
          <div className="figma-statusbar">
            <FigmaReportClock />
          </div>

          <section className="figma-report-score-hero">
            <div className="figma-report-person" aria-hidden="true" />
            <p>面试评分</p>
            <h2>{report.finalReport.overallScore}</h2>
            <div className="figma-report-summary-card">
              <section>
                <h3>最终报告</h3>
                <p>{report.finalReport.summary}</p>
              </section>
              <section>
                <h3>Top 风险</h3>
                <ul>
                  {report.finalReport.topRisks.map((risk) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h3>行动项</h3>
                <ul>
                  {report.finalReport.actionItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            </div>
          </section>

          {(state.usedFallback || missingAnswers.length > 0 || copyState !== "idle") && (
            <div className={copyState === "success" ? "figma-report-toast success" : "figma-report-toast warning"}>
              {copyState !== "idle"
                ? copyMessage
                : state.usedFallback
                  ? "当前展示演示兜底报告。"
                  : `缺失答案：${missingAnswers.map((question) => question.id).join(" / ")}`}
            </div>
          )}

          <section className="figma-report-body">
            <div className="figma-report-tabs" role="tablist" aria-label="题目报告">
              {questions.slice(0, 3).map((question, index) => (
                <button
                  className={index === figmaReportQuestionIndex ? "active" : ""}
                  key={question.id}
                  onClick={() => setFigmaReportQuestionIndex(index)}
                  role="tab"
                  aria-selected={index === figmaReportQuestionIndex}
                >
                  Q{index + 1}
                </button>
              ))}
            </div>

            <article className="figma-report-question-detail" key={selectedQuestionReport?.questionId ?? selectedQuestion?.id ?? figmaReportQuestionIndex}>
              <section className="figma-report-detail-block question">
                <h3>面试题目</h3>
                <p>{selectedQuestion?.questionText ?? selectedQuestion?.title ?? "暂无题目内容。"}</p>
              </section>

              <section className="figma-report-metric-cards" aria-label="题目评估信息">
                <div>
                  <h4>考察维度</h4>
                  <p>{dimensionSummary}</p>
                </div>
                <div>
                  <h4>适用职级</h4>
                  <p>{seniorityText}</p>
                </div>
                <div>
                  <h4>出题意图</h4>
                  <p>{intentText}</p>
                </div>
              </section>

              <section className="figma-report-detail-block pitfalls">
                <h3>面试官避坑指南</h3>
                <p className="figma-report-small">如果候选人在回答时踩中以下雷区，需要谨慎评估：</p>
                {pitfallItems.map((item, index) => (
                  <p key={`${item}-${index}`}>
                    <strong>{index === 0 ? "关键雷区：" : index === 1 ? "表达雷区：" : "风险标签："}</strong>
                    {item}
                  </p>
                ))}
              </section>

              <section className="figma-report-detail-block answer">
                <h3>您的回答</h3>
                <p>{selectedAnswer?.answerText.trim() || "本题暂无有效回答，报告会保守标记为缺失答案。"}</p>
              </section>

              <section className="figma-report-optimization">
                <h3>优化方向</h3>
                <p>{optimizationText}</p>
              </section>

              {selectedQuestionReport && (
                <div className="figma-report-page-actions">
                  <button onClick={() => copyReport()}>复制整份报告</button>
                  <button onClick={() => copyQuestion(selectedQuestionReport, "optimized")}>复制优化答案</button>
                  <button onClick={() => onRegenerateQuestion(selectedQuestionReport.questionId)}>重生成</button>
                </div>
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
                    <span className="helper">{dimensionLabels[name] ?? name}</span>
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

function MissingAnswerNotice({ missingAnswers }: { missingAnswers: InterviewQuestion[] }) {
  return (
    <div className="status warning">
      缺失答案：{missingAnswers.map((question) => `${question.id} ${question.title}`).join("；")}。报告会标记缺失，不会生成假回答。
    </div>
  );
}
