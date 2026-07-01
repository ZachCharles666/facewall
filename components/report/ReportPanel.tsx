import { useRef, useState } from "react";
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

export function ReportPanel({
  report,
  questions,
  answers,
  state,
  streamedQuestionReports,
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
  onRetry: () => void;
  onUseNonStreamingFallback: () => void;
  onUseFallback: () => void;
  onRegenerateQuestion: (questionId: string) => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "success" | "failed">("idle");
  const [copyMessage, setCopyMessage] = useState("");
  const [manualCopyVisible, setManualCopyVisible] = useState(false);
  const [manualCopyText, setManualCopyText] = useState("");
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
