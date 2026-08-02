import { captureServerException } from "@/lib/observability/monitor";

export async function register() {
  // Provider-neutral by default. A real provider can configure the adapter here.
}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string> },
  context: { routerKind: string; routePath: string; routeType: string }
) {
  await captureServerException(error, {
    path: request.path.split("?")[0],
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType
  });
}
