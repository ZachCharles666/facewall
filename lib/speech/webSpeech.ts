import type { InterviewerStyleId, SpeechTuning } from "@/lib/types";

export function canUseWebSpeech() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function getWebSpeechVoices() {
  if (!canUseWebSpeech()) return [];
  return window.speechSynthesis.getVoices();
}

function scoreVoiceForPersona(voice: SpeechSynthesisVoice, persona: InterviewerStyleId) {
  const name = voice.name.toLowerCase();
  if (persona === "strictHr") {
    return /male|yunxi|kangkang|huihui|男|康康|云希|慧慧/i.test(name) ? 2 : 0;
  }
  if (persona === "techBro") {
    return /male|yunxi|kangkang|yunjian|男|康康|云希|云健/i.test(name) ? 2 : 0;
  }
  return /female|xiaoxiao|huihui|xiaoyi|tingting|女|晓晓|慧慧|晓伊|婷婷/i.test(name) ? 2 : 0;
}

export function chooseWebSpeechVoice(voiceName: string, persona: InterviewerStyleId) {
  const voices = getWebSpeechVoices();
  if (voices.length === 0) return null;

  if (voiceName && voiceName !== "auto") {
    return voices.find((voice) => voice.voiceURI === voiceName || voice.name === voiceName) ?? null;
  }

  const zhVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("zh"));
  const candidates = zhVoices.length > 0 ? zhVoices : voices;
  return (
    [...candidates].sort((a, b) => scoreVoiceForPersona(b, persona) - scoreVoiceForPersona(a, persona))[0] ??
    candidates.find((voice) => voice.default) ??
    candidates[0] ??
    null
  );
}

export function speakWithWebSpeech(
  text: string,
  persona: InterviewerStyleId,
  tuning: SpeechTuning,
  callbacks?: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: () => void;
  }
) {
  if (!canUseWebSpeech()) {
    throw new Error("当前浏览器不支持 Web Speech API。");
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = tuning.rate;
  utterance.pitch = tuning.pitch;
  utterance.volume = tuning.volume;
  const voice = chooseWebSpeechVoice(tuning.voiceName, persona);
  if (voice) utterance.voice = voice;
  utterance.onstart = () => callbacks?.onStart?.();
  utterance.onend = () => callbacks?.onEnd?.();
  utterance.onerror = () => callbacks?.onError?.();
  window.speechSynthesis.speak(utterance);
  return utterance;
}
