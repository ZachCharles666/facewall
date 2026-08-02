"use client";

import { AppErrorFallback } from "@/components/observability/AppErrorFallback";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AppErrorFallback error={error} reset={reset} />;
}
