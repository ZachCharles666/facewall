"use client";

import { useEffect } from "react";

import { reportClientError } from "@/lib/observability/client";

export function ClientErrorMonitor() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportClientError(event.error ?? event.message, { source: "window-error" });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportClientError(event.reason, { source: "unhandled-rejection" });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);
  return null;
}
