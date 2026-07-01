export type DevDemoMode = "auto" | "force-fallback";

export interface DevControlState {
  demoMode: DevDemoMode;
  faults: {
    llm: boolean;
    tts: boolean;
    stt: boolean;
    clipboard: boolean;
  };
}

export const DEV_CONTROL_STORAGE_KEY = "facewall.devControls";

export const defaultDevControlState: DevControlState = {
  demoMode: "auto",
  faults: {
    llm: false,
    tts: false,
    stt: false,
    clipboard: false
  }
};

export function canUseDevControls() {
  return process.env.NODE_ENV !== "production";
}

export function readDevControls(): DevControlState {
  if (!canUseDevControls() || typeof window === "undefined") {
    return defaultDevControlState;
  }

  try {
    const rawValue = window.localStorage.getItem(DEV_CONTROL_STORAGE_KEY);
    if (!rawValue) return defaultDevControlState;
    const parsed = JSON.parse(rawValue) as Partial<DevControlState>;
    return {
      demoMode: parsed.demoMode === "force-fallback" ? "force-fallback" : "auto",
      faults: {
        llm: Boolean(parsed.faults?.llm),
        tts: Boolean(parsed.faults?.tts),
        stt: Boolean(parsed.faults?.stt),
        clipboard: Boolean(parsed.faults?.clipboard)
      }
    };
  } catch {
    return defaultDevControlState;
  }
}

export function writeDevControls(nextState: DevControlState) {
  if (!canUseDevControls() || typeof window === "undefined") return;
  window.localStorage.setItem(DEV_CONTROL_STORAGE_KEY, JSON.stringify(nextState));
}

export function resetDevControls() {
  if (!canUseDevControls() || typeof window === "undefined") return;
  window.localStorage.removeItem(DEV_CONTROL_STORAGE_KEY);
}

export function getDevRequestHeaders(kind?: "llm" | "tts") {
  const controls = readDevControls();
  const headers: Record<string, string> = {};

  if (controls.demoMode === "force-fallback") {
    headers["x-facewall-demo-mode"] = "force-fallback";
  }

  if (kind && controls.faults[kind]) {
    headers["x-facewall-fault"] = kind;
  }

  return headers;
}

export function shouldInjectClientFault(kind: "stt" | "clipboard") {
  return readDevControls().faults[kind];
}
