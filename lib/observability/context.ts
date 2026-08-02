import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  route: string;
  method: string;
  startedAt: number;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

function normalizeRequestId(value: string | null) {
  if (!value) return null;
  const normalized = value.trim();
  return /^[a-zA-Z0-9._:-]{8,128}$/.test(normalized) ? normalized : null;
}

export function resolveRequestId(request: Request) {
  return (
    normalizeRequestId(request.headers.get("x-request-id")) ??
    `req-${crypto.randomUUID()}`
  );
}

export function runWithRequestContext<T>(
  context: RequestContext,
  operation: () => Promise<T>
) {
  return requestContextStorage.run(context, operation);
}

export function getRequestContext() {
  return requestContextStorage.getStore();
}

export function getCurrentRequestId() {
  return getRequestContext()?.requestId;
}
