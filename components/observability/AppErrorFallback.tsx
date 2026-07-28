"use client";

import { useEffect } from "react";

import { reportClientError } from "@/lib/observability/client";

export function AppErrorFallback({
  error,
  reset,
  global = false
}: {
  error: Error & { digest?: string };
  reset: () => void;
  global?: boolean;
}) {
  useEffect(() => {
    reportClientError(error, { source: "error-boundary" });
  }, [error]);

  const content = (
    <main className="observability-error-page">
      <section className="observability-error-card" role="alert">
        <p className="eyebrow">PASSBUDDY</p>
        <h1>页面暂时出了点问题</h1>
        <p>你的输入草稿不会因为这条提示被主动清空。可以先重试，仍失败时请联系内测群并提供页面上的请求编号。</p>
        <button type="button" onClick={reset}>重试</button>
      </section>
    </main>
  );
  return global ? <html lang="zh-CN"><body>{content}</body></html> : content;
}
