// iOS Safari and the WeChat webview refuse to start audio that is not tied to a
// user gesture. A gesture only unlocks the element it touched, and only if the
// play() call happens in the same task — awaiting a TTS fetch first is already
// too late. So we keep one shared element, unlock it on a real tap, and reuse
// that same element for every later playback.

const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

let sharedAudio: HTMLAudioElement | null = null;
let unlocked = false;
let weChatHookInstalled = false;

interface WeixinJSBridge {
  invoke: (api: string, params: Record<string, unknown>, callback: () => void) => void;
}

declare global {
  interface Window {
    WeixinJSBridge?: WeixinJSBridge;
  }
}

export function isWeChatBrowser() {
  return typeof navigator !== "undefined" && /micromessenger/i.test(navigator.userAgent);
}

export function isAudioUnlocked() {
  return unlocked;
}

export function getSharedAudioElement() {
  if (typeof window === "undefined") return null;
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "auto";
    // Keeps iOS from taking over the screen with its native player.
    sharedAudio.setAttribute("playsinline", "true");
  }
  return sharedAudio;
}

function installWeChatHook() {
  if (weChatHookInstalled || typeof window === "undefined") return;
  weChatHookInstalled = true;

  // WeChat on iOS only lifts the autoplay restriction once its JS bridge is
  // ready, and the documented way to trigger that is any bridge invoke.
  const enable = () => {
    window.WeixinJSBridge?.invoke("getNetworkType", {}, () => {
      void primeSharedAudio();
    });
  };

  if (window.WeixinJSBridge) {
    enable();
    return;
  }
  document.addEventListener("WeixinJSBridgeReady", enable, { once: true });
}

async function primeSharedAudio() {
  const audio = getSharedAudioElement();
  if (!audio) return false;
  try {
    audio.src = SILENT_WAV;
    audio.muted = true;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    unlocked = true;
    return true;
  } catch {
    audio.muted = false;
    return false;
  }
}

/**
 * Call this synchronously from inside a real user gesture (a click/tap handler).
 * Safe to call repeatedly.
 */
export async function unlockAudioPlayback() {
  if (typeof window === "undefined") return false;
  if (isWeChatBrowser()) installWeChatHook();
  if (unlocked) return true;
  return primeSharedAudio();
}
