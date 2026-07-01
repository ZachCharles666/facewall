export type DevFaultKind = "llm" | "tts";

const DEMO_MODE_HEADER = "x-facewall-demo-mode";
const FAULT_HEADER = "x-facewall-fault";

function isDevelopmentRuntime() {
  return process.env.NODE_ENV !== "production";
}

function splitFaults(value: string | null | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function shouldForceDemoFallback(request?: Request) {
  if (!isDevelopmentRuntime()) return false;
  const headerMode = request?.headers.get(DEMO_MODE_HEADER);
  const envMode = process.env.FACEWALL_DEMO_MODE;
  return headerMode === "force-fallback" || envMode === "fallback";
}

export function shouldInjectDevFault(request: Request | undefined, fault: DevFaultKind) {
  if (!isDevelopmentRuntime()) return false;
  const requestFaults = splitFaults(request?.headers.get(FAULT_HEADER));
  const envFaults = splitFaults(process.env.FACEWALL_DEV_FAULTS);
  return requestFaults.includes(fault) || envFaults.includes(fault);
}
