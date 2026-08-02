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
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  }
}

export interface SttSession {
  stop: () => void | Promise<void>;
  abort: () => void;
}

function mergeAudioChunks(chunks: Float32Array[]) {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
}

// Encoding a full answer is a multi-million iteration loop. Running it in one
// go freezes the main thread for hundreds of milliseconds right after the user
// taps stop, which reads as the whole UI hanging. Yield back to the browser
// every slice so React can paint the processing state and buttons stay live.
const ENCODE_SLICE = 100_000;

// Both Azure's short-audio endpoint and Tencent's sentence recognition reject
// anything past 60s, but candidates are expected to answer for up to 3 minutes.
// 45s leaves room for the silence-seeking split to drift later.
const SEGMENT_TARGET_SECONDS = 45;
const SILENCE_SEARCH_SECONDS = 4;

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

async function downsampleAudio(input: Float32Array, inputSampleRate: number, outputSampleRate: number) {
  if (inputSampleRate === outputSampleRate) return input;
  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      sum += input[inputIndex];
    }
    output[index] = sum / Math.max(1, end - start);
    if (index % ENCODE_SLICE === ENCODE_SLICE - 1) await yieldToBrowser();
  }

  return output;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

async function encodePcmWav(samples: Float32Array, sampleRate = 16000) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += bytesPerSample;
    if (index % ENCODE_SLICE === ENCODE_SLICE - 1) await yieldToBrowser();
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export function canUseSpeechRecognition() {
  return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function canUseMicrophoneRecording() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    Boolean(window.AudioContext || window.webkitAudioContext)
  );
}

export async function startAzureSpeechRecognition(callbacks: {
  existingText: string;
  transcribe: (audio: Blob) => Promise<string>;
  onStatus: (status: SttStatus, message: string) => void;
  onText: (text: string, isFinal: boolean) => void;
  onDuration: (durationSec: number) => void;
}): Promise<SttSession> {
  if (!canUseMicrophoneRecording()) {
    callbacks.onStatus("unsupported", "当前浏览器不支持麦克风录音，请手动输入或编辑答案。");
    return {
      stop: () => {},
      abort: () => {}
    };
  }

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  const startedAt = Date.now();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true
    }
  });
  const audioContext = new AudioContextConstructor();
  // Read this up front: cleanup() closes the context before we encode, and a
  // closed context is not a reliable place to ask for the sample rate.
  const sourceSampleRate = audioContext.sampleRate;
  // Mobile webviews hand back a suspended context when it was not created
  // inside a user gesture. onaudioprocess never fires while suspended, so the
  // recording would come back empty.
  if (audioContext.state === "suspended") {
    await audioContext.resume().catch(() => undefined);
  }
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  // Segments already handed to the recognizer, in spoken order. Each entry
  // settles to its own transcript so a single bad segment cannot lose the rest.
  const segmentTranscripts: Promise<string>[] = [];
  const segmentSampleTarget = Math.round(SEGMENT_TARGET_SECONDS * sourceSampleRate);
  let bufferedSamples = 0;
  let flushing = false;
  let stopped = false;
  let aborted = false;

  function drainBuffer() {
    const merged = mergeAudioChunks(chunks);
    chunks.length = 0;
    bufferedSamples = 0;
    return merged;
  }

  function queueSegment(samples: Float32Array) {
    if (samples.length === 0) return;
    segmentTranscripts.push(
      (async () => {
        const downsampled = await downsampleAudio(samples, sourceSampleRate, 16000);
        const wav = await encodePcmWav(downsampled);
        return (await callbacks.transcribe(wav)).trim();
      })()
    );
  }

  // Cutting a segment mid-word garbles it, so the split point is nudged to the
  // quietest moment in the tail of the buffer rather than an exact timestamp.
  function splitAtQuietestPoint(samples: Float32Array) {
    const searchSpan = Math.min(
      samples.length,
      Math.round(SILENCE_SEARCH_SECONDS * sourceSampleRate)
    );
    const windowSize = Math.max(1, Math.round(0.1 * sourceSampleRate));
    const searchStart = samples.length - searchSpan;
    let quietestEnergy = Number.POSITIVE_INFINITY;
    let cutIndex = samples.length;

    for (let start = searchStart; start + windowSize <= samples.length; start += windowSize) {
      let energy = 0;
      for (let index = start; index < start + windowSize; index += 1) {
        energy += samples[index] * samples[index];
      }
      if (energy < quietestEnergy) {
        quietestEnergy = energy;
        cutIndex = start + Math.floor(windowSize / 2);
      }
    }

    return {
      segment: samples.subarray(0, cutIndex),
      remainder: new Float32Array(samples.subarray(cutIndex))
    };
  }

  async function flushSegment() {
    if (flushing) return;
    flushing = true;
    try {
      const buffered = drainBuffer();
      const { segment, remainder } = splitAtQuietestPoint(buffered);
      queueSegment(segment);
      if (remainder.length > 0) {
        chunks.push(remainder);
        bufferedSamples += remainder.length;
      }
    } finally {
      flushing = false;
    }
  }

  processor.onaudioprocess = (event) => {
    if (stopped || aborted) return;
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    bufferedSamples += event.inputBuffer.length;
    // Recognizers cap a single request at 60s of audio, so long answers are cut
    // into segments while the candidate is still talking. By the time they stop,
    // only the tail is still in flight.
    if (bufferedSamples >= segmentSampleTarget) void flushSegment();
  };

  source.connect(processor);
  processor.connect(audioContext.destination);
  callbacks.onStatus("recording", "正在录音，停止后会提交服务端识别；当前文本会保留。");

  async function cleanup() {
    processor.disconnect();
    source.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    if (audioContext.state !== "closed") {
      await audioContext.close().catch(() => undefined);
    }
  }

  return {
    stop: async () => {
      if (stopped || aborted) return;
      stopped = true;
      const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      callbacks.onDuration(durationSec);
      await cleanup();

      try {
        callbacks.onStatus("recording", "录音已停止，正在整理音频。");
        queueSegment(drainBuffer());
        callbacks.onStatus(
          "recording",
          segmentTranscripts.length > 1
            ? `正在提交语音识别（共 ${segmentTranscripts.length} 段）。`
            : "正在提交语音识别。"
        );

        const settled = await Promise.allSettled(segmentTranscripts);
        const failedCount = settled.filter((result) => result.status === "rejected").length;
        if (settled.length > 0 && failedCount === settled.length) {
          const firstRejection = settled.find(
            (result): result is PromiseRejectedResult => result.status === "rejected"
          );
          throw firstRejection?.reason instanceof Error
            ? firstRejection.reason
            : new Error("语音识别失败，已保留当前文本，可重试或手动编辑。");
        }

        const transcript = settled
          .map((result) => (result.status === "fulfilled" ? result.value : ""))
          .filter(Boolean)
          .join(" ")
          .trim();
        const nextText = [callbacks.existingText.trim(), transcript].filter(Boolean).join(callbacks.existingText.trim() ? " " : "");
        callbacks.onText(nextText, true);
        callbacks.onStatus(
          transcript ? "success" : "manual",
          transcript
            ? failedCount > 0
              ? `识别完成，但有 ${failedCount} 段未能识别，请检查后补充。`
              : "识别完成，可继续编辑答案。"
            : "未识别到文本，可手动输入。"
        );
      } catch (error) {
        callbacks.onStatus(
          "failed",
          error instanceof Error ? error.message : "语音识别失败，已保留当前文本，可重试或手动编辑。"
        );
      }
    },
    abort: () => {
      if (stopped || aborted) return;
      aborted = true;
      void cleanup();
    }
  };
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
