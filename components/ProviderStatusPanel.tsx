"use client";

import { useEffect, useState } from "react";

type ProviderStatus = {
  configured: boolean;
  provider: "tencent" | "azure" | "web-speech";
  region: string;
  llm: {
    configured: boolean;
    provider: string;
    model: string;
  };
};

export function ProviderStatusPanel() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/azure-status", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("provider status unavailable");
        return response.json();
      })
      .then((nextStatus: ProviderStatus) => {
        if (!cancelled) setStatus(nextStatus);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="panel provider-status-panel" aria-label="AI 与语音服务状态">
      <div>
        <p className="eyebrow">Provider status</p>
        <h2>AI 与语音服务</h2>
      </div>
      <div className="provider-status-grid">
        <article>
          <strong>LLM</strong>
          <span>{status?.llm.model || "状态读取中"}</span>
          <small>{status?.llm.configured ? `已配置 · ${status.llm.provider}` : "未配置"}</small>
        </article>
        <article>
          <strong>TTS / STT</strong>
          <span>
            {status?.provider === "tencent"
              ? "腾讯云 TTS / ASR"
              : status?.provider === "azure"
                ? "Azure Speech"
                : status
                  ? "浏览器语音兜底"
                  : "状态读取中"}
          </span>
          <small>{status?.configured ? `已配置 · ${status.region}` : "服务端未配置"}</small>
        </article>
      </div>
    </section>
  );
}
