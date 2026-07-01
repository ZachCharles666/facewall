import type { SttStatus } from "@/lib/types";

type SpeechRecognitionConstructor = new () => SpeechRecognition;

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface SttSession {
  stop: () => void;
  abort: () => void;
}

export function canUseSpeechRecognition() {
  return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function startSpeechRecognition(callbacks: {
  existingText: string;
  onStatus: (status: SttStatus, message: string) => void;
  onText: (text: string, isFinal: boolean) => void;
  onDuration: (durationSec: number) => void;
}): SttSession {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    callbacks.onStatus("unsupported", "当前浏览器不支持语音识别，请手动输入或编辑答案。");
    return {
      stop: () => {},
      abort: () => {}
    };
  }

  const recognition = new Recognition();
  const startedAt = Date.now();
  let finalText = callbacks.existingText.trim();
  let stoppedByUser = false;

  recognition.lang = "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    callbacks.onStatus("recording", "正在识别语音，已识别文本会实时保留在答案框。");
  };

  recognition.onresult = (event) => {
    let interimText = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result[0]?.transcript?.trim() ?? "";
      if (!transcript) continue;
      if (result.isFinal) {
        finalText = [finalText, transcript].filter(Boolean).join(finalText ? " " : "");
      } else {
        interimText = [interimText, transcript].filter(Boolean).join(" ");
      }
    }

    callbacks.onText([finalText, interimText].filter(Boolean).join(finalText && interimText ? " " : ""), interimText.length === 0);
  };

  recognition.onerror = (event) => {
    const status = event.error === "not-allowed" || event.error === "service-not-allowed" ? "unsupported" : "failed";
    callbacks.onDuration(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
    callbacks.onStatus(
      status,
      status === "unsupported" ? "语音识别权限或能力不可用，已切换为手动编辑。" : "语音识别失败，已保留当前文本，可重试或手动编辑。"
    );
  };

  recognition.onend = () => {
    callbacks.onDuration(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
    if (stoppedByUser) {
      callbacks.onStatus(finalText ? "success" : "manual", finalText ? "识别已停止，可继续编辑答案。" : "未识别到文本，可手动输入。");
    }
  };

  recognition.start();

  return {
    stop: () => {
      stoppedByUser = true;
      recognition.stop();
    },
    abort: () => {
      stoppedByUser = true;
      recognition.abort();
    }
  };
}
