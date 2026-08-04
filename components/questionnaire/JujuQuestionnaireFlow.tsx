"use client";

import { useEffect, useMemo, useState } from "react";

import { getDevRequestHeaders } from "@/lib/dev/clientControls";
import questionnaireInviteVisual from "@/面壁者/Gemini_Generated_Image_eiqufreiqufreiqu_1__388-1104@2x.png";
import type {
  QuestionnaireAnswers,
  QuestionnaireConfig
} from "@/lib/questionnaire/schema";

type QuestionnaireSnapshot = {
  config: QuestionnaireConfig;
  eligible: boolean;
  response: { id: string } | null;
};

function QuestionnaireClock() {
  const [time, setTime] = useState("9:41");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(`${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}`);
    };
    update();
    const timer = window.setInterval(update, 15000);
    return () => window.clearInterval(timer);
  }, []);
  return <span>{time}</span>;
}

async function emitQuestionnaireEvent(
  eventName: "questionnaire_invite_viewed" | "questionnaire_started",
  sessionId: string
) {
  await fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventName,
      sessionId,
      idempotencyKey: crypto.randomUUID(),
      properties: { theme: "juju" }
    })
  }).catch(() => undefined);
}

export function JujuQuestionnaireFlow({
  sessionId,
  promptToken = 0,
  onReturnHome
}: {
  sessionId: string | null;
  /**
   * Bumped when the app sends the candidate back here because the
   * questionnaire is still outstanding. Re-opens the invite so returning
   * lands on the thing that is being asked for.
   */
  promptToken?: number;
  onReturnHome: () => void;
}) {
  const [snapshot, setSnapshot] = useState<QuestionnaireSnapshot | null>(null);
  const [stage, setStage] = useState<"report" | "invite" | "form" | "submitted">(
    "report"
  );
  const [answers, setAnswers] = useState<QuestionnaireAnswers>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(Boolean(sessionId));
  const [snapshotFailed, setSnapshotFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!sessionId) {
      setSnapshotLoading(false);
      return;
    }
    let cancelled = false;
    setSnapshotLoading(true);
    setSnapshotFailed(false);
    fetch(`/api/interview-sessions/${sessionId}/questionnaire`, {
      cache: "no-store"
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("questionnaire unavailable");
        return response.json();
      })
      .then((body) => {
        if (!cancelled) setSnapshot(body.data as QuestionnaireSnapshot);
      })
      .catch(() => {
        if (!cancelled) {
          setSnapshot(null);
          setSnapshotFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken, sessionId]);

  useEffect(() => {
    if (promptToken <= 0 || !snapshot) return;
    if (snapshot.response || !snapshot.eligible) return;
    setStage("invite");
    if (sessionId) void emitQuestionnaireEvent("questionnaire_invite_viewed", sessionId);
  }, [promptToken, sessionId, snapshot]);

  const missingRequired = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.config.questions.filter((question) => {
      if (!question.required) return false;
      const answer = answers[question.id];
      if (question.type === "multiple") {
        return !Array.isArray(answer) || answer.length === 0;
      }
      return answer === undefined || answer === "";
    });
  }, [answers, snapshot]);

  function confirmAndReturn() {
    if (!sessionId) {
      setMessage("当前报告尚未关联面试记录，请刷新后重试。");
      return;
    }
    if (!snapshot) {
      setMessage(
        snapshotFailed
          ? "问卷状态加载失败，正在重试…"
          : "问卷状态仍在加载，请稍候。"
      );
      if (snapshotFailed) setReloadToken((current) => current + 1);
      return;
    }
    if (snapshot.response || !snapshot.eligible) {
      onReturnHome();
      return;
    }
    setStage("invite");
    void emitQuestionnaireEvent("questionnaire_invite_viewed", sessionId);
  }

  function startQuestionnaire() {
    if (!sessionId) return;
    setStage("form");
    void emitQuestionnaireEvent("questionnaire_started", sessionId);
  }

  function setAnswer(questionId: string, value: number | string | string[]) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    setMessage("");
  }

  async function submit() {
    if (!sessionId || !snapshot) return;
    if (missingRequired.length > 0) {
      setMessage(`请先完成 ${missingRequired.length} 道必答题。`);
      return;
    }
    setSaving(true);
    setMessage("正在提交问卷…");
    try {
      const response = await fetch(
        `/api/interview-sessions/${sessionId}/questionnaire`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...getDevRequestHeaders("database")
          },
          body: JSON.stringify({
            questionnaireVersion: snapshot.config.version,
            answers,
            idempotencyKey: crypto.randomUUID()
          })
        }
      );
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error?.message || "问卷提交失败，请稍后重试。");
        return;
      }
      setStage("submitted");
      setMessage("感谢参与，问卷已保存。");
    } catch {
      setMessage("问卷提交失败，当前选择仍保留，可稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        className="juju-report-confirm-home"
        disabled={snapshotLoading}
        onClick={confirmAndReturn}
        type="button"
      >
        {snapshotFailed ? "重试加载问卷" : "确认并返回首页"}
      </button>

      {stage === "invite" && snapshot && (
        <div className="juju-questionnaire-invite-overlay" role="presentation">
          <section
            aria-labelledby="juju-questionnaire-invite-title"
            aria-modal="true"
            className="juju-questionnaire-invite"
            role="dialog"
          >
            <button
              aria-label="暂不参与并返回报告"
              className="juju-questionnaire-invite-close"
              onClick={() => setStage("report")}
              type="button"
            >
              ×
            </button>
            <div className="juju-questionnaire-invite-visual" aria-hidden="true">
              <img
                alt=""
                className="juju-questionnaire-invite-image"
                height={195}
                src={questionnaireInviteVisual.src}
                width={247}
              />
            </div>
            <div className="juju-questionnaire-invite-copy">
              <h2 id="juju-questionnaire-invite-title">
                {snapshot.config.inviteTitle}
              </h2>
              <p>{snapshot.config.inviteDescription}</p>
              <button onClick={startQuestionnaire} type="button">
                立即参与
              </button>
            </div>
          </section>
        </div>
      )}

      {(stage === "form" || stage === "submitted") && snapshot && (
        <section
          aria-label="参与内测反馈"
          className="juju-questionnaire-screen"
        >
          <div className="figma-statusbar juju-questionnaire-statusbar">
            <QuestionnaireClock />
            <span>PassBuddy</span>
          </div>
          {stage === "submitted" ? (
            <div className="juju-questionnaire-complete">
              <span aria-hidden="true">✓</span>
              <h2>感谢你的反馈</h2>
              <p>你的建议已保存，将用于改进后续面试体验。</p>
              <button onClick={onReturnHome} type="button">
                返回首页
              </button>
            </div>
          ) : (
            <div className="juju-questionnaire-scroll">
              <header>
                <h1>{snapshot.config.title}</h1>
                <p>{snapshot.config.subtitle}</p>
              </header>
              <div className="juju-questionnaire-list">
                {snapshot.config.questions.map((question) => (
                  <section
                    aria-label={question.prompt}
                    className={`juju-questionnaire-card is-${question.type}`}
                    key={question.id}
                    role="group"
                  >
                    <p className="juju-questionnaire-prompt">{question.prompt}</p>
                    {question.type === "rating" && (
                      <div className="juju-questionnaire-stars">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            aria-label={`${value} 星`}
                            aria-pressed={answers[question.id] === value}
                            key={value}
                            onClick={() => setAnswer(question.id, value)}
                            type="button"
                          >
                            {Number(answers[question.id] ?? 0) >= value ? "★" : "☆"}
                          </button>
                        ))}
                      </div>
                    )}
                    {(question.type === "single" ||
                      question.type === "multiple") && (
                      <div className="juju-questionnaire-options">
                        {question.options.map((option) => {
                          const current = answers[question.id];
                          const checked =
                            question.type === "multiple"
                              ? Array.isArray(current) && current.includes(option.id)
                              : current === option.id;
                          return (
                            <label key={option.id}>
                              <input
                                checked={checked}
                                name={question.id}
                                onChange={() => {
                                  if (question.type === "single") {
                                    setAnswer(question.id, option.id);
                                    return;
                                  }
                                  const values = Array.isArray(current) ? current : [];
                                  setAnswer(
                                    question.id,
                                    checked
                                      ? values.filter((item) => item !== option.id)
                                      : [...values, option.id]
                                  );
                                }}
                                type={
                                  question.type === "single" ? "radio" : "checkbox"
                                }
                              />
                              <span>{option.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {question.type === "text" && (
                      <textarea
                        maxLength={question.maxLength ?? 500}
                        onChange={(event) =>
                          setAnswer(question.id, event.target.value)
                        }
                        placeholder="您的反馈是我们成长的动力"
                        value={
                          typeof answers[question.id] === "string"
                            ? (answers[question.id] as string)
                            : ""
                        }
                      />
                    )}
                  </section>
                ))}
              </div>
              <p className="juju-questionnaire-message" role="status">
                {message}
              </p>
              <button
                className="juju-questionnaire-submit"
                disabled={saving}
                onClick={submit}
                type="button"
              >
                {saving ? "提交中…" : "提交"}
              </button>
            </div>
          )}
          <div className="figma-home-indicator" aria-hidden="true" />
        </section>
      )}
    </>
  );
}
