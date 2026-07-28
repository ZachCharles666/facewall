"use client";

import { useEffect, useState } from "react";

import { getDevRequestHeaders } from "@/lib/dev/clientControls";
import type { VisualTheme } from "@/lib/types";

interface FeedbackRecord {
  id: string;
  rating: number;
  comment: string | null;
}

async function emitClientEvent(
  eventName: "report_viewed" | "feedback_skipped",
  sessionId: string,
  visualTheme: VisualTheme
) {
  await fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventName,
      sessionId,
      idempotencyKey: crypto.randomUUID(),
      properties: { theme: visualTheme }
    })
  }).catch(() => undefined);
}

export function FeedbackPanel({
  sessionId,
  visualTheme
}: {
  sessionId: string | null;
  visualTheme: VisualTheme;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [record, setRecord] = useState<FeedbackRecord | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "saving" | "error" | "skipped">(
    "idle"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setState("loading");
    Promise.all([
      fetch(`/api/interview-sessions/${sessionId}/feedback`, {
        cache: "no-store"
      }).then((response) => (response.ok ? response.json() : null)),
      emitClientEvent("report_viewed", sessionId, visualTheme)
    ])
      .then(([body]) => {
        if (cancelled) return;
        const existing = (body?.data as FeedbackRecord | null) ?? null;
        setRecord(existing);
        if (existing) {
          setRating(existing.rating);
          setComment(existing.comment || "");
        }
        setState("idle");
      })
      .catch(() => {
        if (!cancelled) {
          setState("error");
          setMessage("反馈状态加载失败，不影响查看和复制报告。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, visualTheme]);

  async function submit() {
    if (!sessionId || rating < 1) return;
    setState("saving");
    setMessage("正在保存反馈…");
    try {
      const response = await fetch(
        `/api/interview-sessions/${sessionId}/feedback`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...getDevRequestHeaders("database")
          },
          body: JSON.stringify({
            rating,
            comment,
            idempotencyKey: crypto.randomUUID()
          })
        }
      );
      const body = await response.json();
      if (!response.ok) {
        setState("error");
        setMessage(body.error?.message || "反馈保存失败，报告仍可正常使用。");
        return;
      }
      setRecord(body.data as FeedbackRecord);
      setState("idle");
      setMessage("感谢反馈，已保存。");
    } catch {
      setState("error");
      setMessage("反馈保存失败，报告仍可正常使用，可稍后重试。");
    }
  }

  if (!sessionId) return null;

  return (
    <section className={`feedback-panel feedback-theme-${visualTheme}`}>
      <div>
        <p className="auth-eyebrow">OPTIONAL FEEDBACK</p>
        <h2>{record ? "感谢你的反馈" : "这份复盘对你有帮助吗？"}</h2>
        <p>反馈完全自愿；跳过不会影响报告查看、复制或离开。</p>
      </div>
      <div className="feedback-stars" aria-label="反馈评分">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            aria-label={`${value} 星`}
            aria-pressed={rating === value}
            disabled={Boolean(record) || state === "saving"}
            key={value}
            onClick={() => setRating(value)}
            type="button"
          >
            {value} ★
          </button>
        ))}
      </div>
      <label>
        一句话反馈（可选，最多 500 字）
        <textarea
          disabled={Boolean(record) || state === "saving"}
          maxLength={500}
          onChange={(event) => setComment(event.target.value)}
          placeholder="例如：风险点很具体，希望优化答案更简洁。"
          value={comment}
        />
      </label>
      {!record && (
        <div className="feedback-actions">
          <button
            className="auth-primary"
            disabled={rating < 1 || state === "saving"}
            onClick={submit}
            type="button"
          >
            {state === "saving" ? "提交中…" : "提交反馈"}
          </button>
          <button
            disabled={state === "saving"}
            onClick={() => {
              setState("skipped");
              setMessage("已跳过反馈，报告仍可继续使用。");
              void emitClientEvent("feedback_skipped", sessionId, visualTheme);
            }}
            type="button"
          >
            暂时跳过
          </button>
        </div>
      )}
      <p className="feedback-message" role="status">
        {message || (state === "loading" ? "正在恢复反馈状态…" : "")}
      </p>
    </section>
  );
}
