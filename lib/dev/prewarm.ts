const DEV_PREWARM_ROUTES = [
  "/api/profile/parse",
  "/api/questions/generate",
  "/api/report/generate-stream",
  "/api/report/generate"
] as const;

let prewarmStarted = false;

export function prewarmDevRoutes(
  fetcher: typeof fetch = fetch
) {
  if (process.env.NODE_ENV === "production" || prewarmStarted) return;

  prewarmStarted = true;
  void Promise.allSettled(
    DEV_PREWARM_ROUTES.map((route) =>
      fetcher(route, {
        method: "OPTIONS",
        cache: "no-store"
      })
    )
  );
}
