"use client";

import { useEffect } from "react";

import { reportClientError } from "@/lib/observability/client";
import { initializeTencentRum } from "@/lib/observability/tencentRum";

export function ClientErrorMonitor() {
  useEffect(() => {
    void initializeTencentRum();
    const onError = (event: Event) => {
      if (event instanceof ErrorEvent) {
        reportClientError(event.error ?? event.message, {
          source: "window-error"
        });
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLScriptElement ||
        target instanceof HTMLLinkElement ||
        target instanceof HTMLImageElement ||
        target instanceof HTMLMediaElement
      ) {
        const resource =
          ("src" in target && target.src) ||
          ("href" in target && target.href) ||
          "/";
        let path = "/";
        try {
          path = new URL(resource, window.location.origin).pathname;
        } catch {
          path = "/";
        }
        reportClientError(
          new Error(`ResourceLoadError: ${target.tagName.toLowerCase()} ${path}`),
          { source: "resource-error" }
        );
      }
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportClientError(event.reason, { source: "unhandled-rejection" });
    };
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);
  return null;
}
