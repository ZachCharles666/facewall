"use client";

import { AppErrorFallback } from "@/components/observability/AppErrorFallback";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AppErrorFallback error={error} reset={reset} global />;
}
