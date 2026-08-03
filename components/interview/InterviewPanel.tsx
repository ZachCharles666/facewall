import { useEffect, useMemo, useRef, useState } from "react";
import { getActiveSpeechSettings, getAzureSpeechStatus, requestSttTranscript, requestTtsAudio, saveActiveSpeechSettings } from "@/lib/api/client";
import { shouldInjectClientFault } from "@/lib/dev/clientControls";
import { demoScenario } from "@/lib/demo/scenario";
import { azureVoiceOptions, normalizePersonaSpeechTunings, personaSpeechDefaults } from "@/lib/speech/settings";
import { getSharedAudioElement, isWeChatBrowser, unlockAudioPlayback } from "@/lib/speech/audioUnlock";
import { canUseMicrophoneRecording, canUseSpeechRecognition, startAzureSpeechRecognition, startSpeechRecognition, type SttSession } from "@/lib/speech/stt";
import { canUseWebSpeech, getWebSpeechVoices, speakWithWebSpeech } from "@/lib/speech/webSpeech";
import { JujuOrb } from "@/components/JujuOrb";
import type {
  InterviewAnswer,
  InterviewQuestion,
  InterviewerStyleId,
  PersonaSpeechTunings,
  SpeechTuning,
  SttStatus,
  TtsEngine,
  TtsStatus,
  VisualTheme,
  VoiceOption
} from "@/lib/types";
import { VoiceControls } from "@/components/voice/VoiceControls";
import candidateAvatar from "@/面壁者/avatar__342-897@2x.png";
import interviewerGlow from "@/面壁者/B_01__326-805@2x.png";
import interviewerOrb from "@/面壁者/B_01__326-806@2x.png";
import messageIcon from "@/面壁者/message__295-1277@2x.png";
import voiceIcon from "@/面壁者/voice_S__379-1437@2x.png";

type FigmaAnswerPhase = "prompt" | "recording" | "processing";

// Product ceiling for a single answer. Recording stops itself here so a long
// answer ends on our terms instead of failing somewhere downstream.
const MAX_ANSWER_SECONDS = 180;

// Subtitle scroll pace relative to the spoken audio. 1 tracks the voice exactly.
const QUESTION_SCROLL_SPEED = 1.6;

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
type QuestionTextMotionPhase = "idle" | "playing" | "finished";
type JujuVoiceFailureKind = "recording" | "too-short" | "network";
const classicSpeechSettingsStorageKey = "facewall:classic:speech-settings:v1";

function FigmaInterviewClock() {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(`${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}`);
    };
    update();
    const timer = window.setInterval(update, 15000);
    return () => window.clearInterval(timer);
  }, []);
  return <span suppressHydrationWarning>{time ?? "9:41"}</span>;
}

function formatSttStatus(status: SttStatus) {
  const labels: Record<SttStatus, string> = {
    idle: "待作答",
    recording: "识别中",
    success: "已识别",
    failed: "识别失败",
    unsupported: "手动输入",
    manual: "手动输入"
  };
  return labels[status];
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function JujuAnswerHistory({
  answers,
  currentIndex,
  onClose,
  questions
}: {
  answers: InterviewAnswer[];
  currentIndex: number;
  onClose: () => void;
  questions: InterviewQuestion[];
}) {
  const visibleQuestions = questions.slice(0, currentIndex + 1);
  return (
    <section className="figma-phone-stage juju-interview-stage" aria-label="答题记录">
      <div className="figma-phone-card figma-home-card juju-history-card">
        <div className="figma-statusbar">
          <FigmaInterviewClock />
          <span>PassBuddy</span>
        </div>
        <header className="juju-history-header">
          <h2>答题记录</h2>
        </header>
        <div className="juju-history-scroll">
          {visibleQuestions.map((question) => {
            const answer = answers.find((item) => item.questionId === question.id);
            return (
              <div className="juju-history-pair" key={question.id}>
                <article className="juju-history-message interviewer">
                  <span className="juju-history-orb" aria-hidden="true">
                    <img className="juju-history-orb-glow" src={interviewerGlow.src} alt="" />
                    <img className="juju-history-orb-core" src={interviewerOrb.src} alt="" />
                  </span>
                  <p>{question.questionText}</p>
                </article>
                <article className="juju-history-message candidate">
                  <p>{answer?.answerText.trim() || "这道题还没有提交回答。"}</p>
                  <img className="juju-history-avatar" src={candidateAvatar.src} alt="我" />
                </article>
              </div>
            );
          })}
        </div>
        <button
          aria-label="返回当前答题"
          className="juju-history-return"
          onClick={onClose}
          type="button"
        >
          <img src={voiceIcon.src} alt="" />
        </button>
        <div className="figma-home-indicator" aria-hidden="true" />
      </div>
    </section>
  );
}

function readCachedClassicSpeechTunings() {
  if (typeof window === "undefined") return null;
  try {
    const rawValue = window.localStorage.getItem(classicSpeechSettingsStorageKey);
    if (!rawValue) return null;
    const parsedValue = JSON.parse(rawValue) as unknown;
    const value =
      parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue) && "speechTunings" in parsedValue
        ? (parsedValue as { speechTunings?: unknown }).speechTunings
        : parsedValue;
    return normalizePersonaSpeechTunings(value);
  } catch {
    return null;
  }
}

function cacheClassicSpeechTunings(speechTunings: PersonaSpeechTunings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(classicSpeechSettingsStorageKey, JSON.stringify({ speechTunings, updatedAt: new Date().toISOString() }));
  } catch {
    // Local cache is best-effort; server persistence remains the source of truth when available.
  }
}

export function InterviewPanel({
  questions,
  answers,
  interviewerStyleId,
  candidateName = "朋友",
  visualTheme = "classic",
  onAnswersChange,
  onGenerateReport,
  onExitInterview
}: {
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
  interviewerStyleId: InterviewerStyleId;
  candidateName?: string;
  visualTheme?: VisualTheme;
  onAnswersChange: (answers: InterviewAnswer[]) => void;
  onGenerateReport: (answers: InterviewAnswer[]) => void | Promise<void>;
  onExitInterview?: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ttsEngine, setTtsEngine] = useState<TtsEngine>("azure");
  const [ttsStatus, setTtsStatus] = useState<TtsStatus>("idle");
  const [azureConfigured, setAzureConfigured] = useState(false);
  const [speechProvider, setSpeechProvider] = useState<"tencent" | "azure" | "web-speech">("web-speech");
  const [azureVoices, setAzureVoices] = useState<VoiceOption[]>(azureVoiceOptions);
  const [webVoices, setWebVoices] = useState<VoiceOption[]>([{ value: "auto", label: "自动匹配中文发音人" }]);
  const [classicSpeechTunings, setClassicSpeechTunings] = useState<PersonaSpeechTunings>(() => normalizePersonaSpeechTunings(null));
  const [speechSettingsMessage, setSpeechSettingsMessage] = useState("classic 主题可分别锁定 3 位面试官声线，保存后对全站生效。");
  const [voiceMessage, setVoiceMessage] = useState("语音提问优先服务端 TTS，失败后使用浏览器 Web Speech。");
  const [figmaAnswerPhase, setFigmaAnswerPhase] = useState<FigmaAnswerPhase>("prompt");
  // Set when the browser refused to start playback. The only way out is another
  // real tap, so the UI has to offer one instead of failing silently.
  const [ttsBlocked, setTtsBlocked] = useState(false);
  const [figmaElapsedSec, setFigmaElapsedSec] = useState(0);
  const [questionTextMotionPhase, setQuestionTextMotionPhase] = useState<QuestionTextMotionPhase>("idle");
  const [questionTextMotionRun, setQuestionTextMotionRun] = useState(0);
  const [jujuVoiceFailureKind, setJujuVoiceFailureKind] = useState<JujuVoiceFailureKind | null>(null);
  const [jujuRecordingAttemptQuestionId, setJujuRecordingAttemptQuestionId] = useState<string | null>(null);
  const [jujuToast, setJujuToast] = useState("");
  const [showJujuHistory, setShowJujuHistory] = useState(false);
  const [showJujuSkipConfirm, setShowJujuSkipConfirm] = useState(false);
  const [isJujuAdvancing, setIsJujuAdvancing] = useState(false);
  const jujuToastTimerRef = useRef<number | null>(null);
  const [azureStatusReady, setAzureStatusReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const sttSessionRef = useRef<SttSession | null>(null);
  const jujuQuestionViewportRef = useRef<HTMLDivElement | null>(null);
  const jujuQuestionScrollTimerRef = useRef<number | null>(null);
  const jujuQuestionMotionTokenRef = useRef(0);
  const answersRef = useRef(answers);
  const autoPlayedIndexRef = useRef<number | null>(null);
  // Generated audio keyed by question id, so replays and pre-fetched questions
  // never pay the round trip twice.
  const ttsCacheRef = useRef(new Map<string, Blob>());
  const ttsPrefetchedRef = useRef(new Set<string>());
  const pinnedTtsEngineRef = useRef(false);
  const ttsPlaybackTokenRef = useRef(0);
  const ttsAbortControllerRef = useRef<AbortController | null>(null);
  const jujuAdvanceLockRef = useRef(false);
  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers.find((answer) => answer.questionId === currentQuestion?.id);
  const speechTuning = visualTheme === "classic" ? classicSpeechTunings[interviewerStyleId] : personaSpeechDefaults[interviewerStyleId];

  const missingCount = useMemo(
    () => answers.filter((answer) => !answer.answerText.trim()).length,
    [answers]
  );

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    if (visualTheme !== "juju" || !currentAnswer) return;
    if (jujuRecordingAttemptQuestionId !== currentAnswer.questionId) {
      setJujuVoiceFailureKind(null);
      return;
    }
    const isFailure = ["failed", "unsupported", "manual"].includes(currentAnswer.sttStatus);
    if (!isFailure) {
      setJujuVoiceFailureKind(null);
      return;
    }

    const nextFailureKind: JujuVoiceFailureKind =
      /网络|network|fetch|连接|服务暂时不可用|request failed/i.test(voiceMessage)
        ? "network"
        : currentAnswer.durationSec <= 2
          ? "too-short"
          : "recording";
    setJujuVoiceFailureKind(nextFailureKind);
    if (nextFailureKind === "network") setFigmaAnswerPhase("prompt");
  }, [currentAnswer, jujuRecordingAttemptQuestionId, visualTheme, voiceMessage]);

  useEffect(() => {
    if (visualTheme !== "juju" || jujuVoiceFailureKind !== "network") return;
    const timer = window.setTimeout(() => onExitInterview?.(), 5000);
    return () => window.clearTimeout(timer);
  }, [jujuVoiceFailureKind, onExitInterview, visualTheme]);

  useEffect(() => {
    if (visualTheme !== "classic") return;
    let cancelled = false;
    const cachedSpeechTunings = readCachedClassicSpeechTunings();
    if (cachedSpeechTunings) {
      setClassicSpeechTunings(cachedSpeechTunings);
      setSpeechSettingsMessage("已加载本机缓存的 classic 全局声线配置。");
    }

    getActiveSpeechSettings()
      .then((snapshot) => {
        if (cancelled) return;
        const speechTunings = normalizePersonaSpeechTunings(snapshot.speechTunings);
        setClassicSpeechTunings(speechTunings);
        cacheClassicSpeechTunings(speechTunings);
        // An operator's pinned engine outranks whatever the server would pick
        // on its own, so it also outranks the status probe below.
        if (snapshot.ttsEngine) {
          pinnedTtsEngineRef.current = true;
          setTtsEngine(snapshot.ttsEngine);
        }
        setSpeechSettingsMessage(snapshot.updatedAt ? "已加载服务端全局声线配置。" : "当前使用默认声线配置，可调整后保存为全局配置。");
      })
      .catch(() => {
        if (cancelled) return;
        setSpeechSettingsMessage(cachedSpeechTunings ? "服务端声线配置暂不可用，当前使用本机缓存。" : "服务端声线配置暂不可用，当前使用默认配置。");
      });

    return () => {
      cancelled = true;
    };
  }, [visualTheme]);

  useEffect(() => {
    stopTts();
    setFigmaAnswerPhase("prompt");
    setFigmaElapsedSec(0);
    setShowJujuSkipConfirm(false);
    setIsJujuAdvancing(false);
    jujuAdvanceLockRef.current = false;
    resetQuestionTextMotion();
  }, [currentIndex]);

  useEffect(() => {
    if (!showJujuSkipConfirm) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowJujuSkipConfirm(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showJujuSkipConfirm]);

  useEffect(() => {
    if (figmaAnswerPhase !== "recording") return;

    const startedAt = Date.now() - figmaElapsedSec * 1000;
    const timer = window.setInterval(() => {
      setFigmaElapsedSec(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [figmaAnswerPhase, figmaElapsedSec]);

  useEffect(() => {
    if (figmaAnswerPhase !== "recording" || figmaElapsedSec < MAX_ANSWER_SECONDS) return;
    setVoiceMessage(`单题回答上限 ${MAX_ANSWER_SECONDS / 60} 分钟，已自动结束录音并提交识别。`);
    void finishFigmaAnswer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [figmaAnswerPhase, figmaElapsedSec]);

  useEffect(() => {
    let cancelled = false;
    getAzureSpeechStatus()
      .then((status) => {
        if (cancelled) return;
        setAzureConfigured(status.configured);
        setSpeechProvider(status.provider);
        // Start on whichever engine the server actually resolves to, so the
        // selector reflects reality instead of always claiming Azure. A pinned
        // choice from the Classic panel wins.
        if (
          !pinnedTtsEngineRef.current &&
          status.configured &&
          (status.provider === "tencent" || status.provider === "azure")
        ) {
          setTtsEngine(status.provider);
        }
        setAzureVoices(status.voices.length > 0 ? status.voices : azureVoiceOptions);
        setVoiceMessage(
          status.configured
            ? status.provider === "tencent"
              ? "腾讯云语音已配置；提问使用 TTS，答题使用 ASR。"
              : "Azure Speech 已配置；提问使用 TTS，答题使用 STT。"
            : "服务端语音未配置；播放会自动使用 Web Speech API 兜底。"
        );
      })
      .catch(() => {
        if (cancelled) return;
        setAzureConfigured(false);
        setVoiceMessage("语音服务状态不可用；播放会尝试 Web Speech API 兜底。");
      })
      .finally(() => {
        if (!cancelled) setAzureStatusReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!azureStatusReady || !currentQuestion) return;
    if (autoPlayedIndexRef.current === currentIndex) return;
    autoPlayedIndexRef.current = currentIndex;
    playQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, azureStatusReady, currentQuestion]);

  useEffect(() => {
    if (!azureStatusReady) return;
    void prefetchQuestionAudio(currentIndex + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, azureStatusReady]);

  useEffect(() => {
    function syncWebVoices() {
      const voices = getWebSpeechVoices();
      setWebVoices([
        { value: "auto", label: "自动匹配中文发音人" },
        ...voices.map((voice) => ({
          value: voice.voiceURI,
          label: `${voice.name}${voice.lang ? ` (${voice.lang})` : ""}${voice.default ? " / 默认" : ""}`
        }))
      ]);
    }

    syncWebVoices();
    if (canUseWebSpeech()) {
      window.speechSynthesis.onvoiceschanged = syncWebVoices;
    }

    return () => {
      if (canUseWebSpeech()) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      stopTts();
      sttSessionRef.current?.abort();
      if (jujuToastTimerRef.current !== null) {
        window.clearTimeout(jujuToastTimerRef.current);
      }
      clearQuestionTextScrollTimer();
    };
  }, []);

  function getPatchedAnswers(answerPatch: Partial<InterviewAnswer>) {
    if (!currentQuestion) return answers;
    return answersRef.current.map((answer) =>
      answer.questionId === currentQuestion.id
        ? {
            ...answer,
            ...answerPatch
          }
        : answer
    );
  }

  function updateCurrentAnswer(answerPatch: Partial<InterviewAnswer>) {
    const nextAnswers = getPatchedAnswers(answerPatch);
    answersRef.current = nextAnswers;
    onAnswersChange(nextAnswers);
  }

  function fillSampleAnswers() {
    onAnswersChange(
      questions.map((question) => {
        const sample = demoScenario.sampleAnswers.find((answer) => answer.questionId === question.id);
        return (
          sample ?? {
            questionId: question.id,
            answerText: "",
            inputMode: "text",
            durationSec: 0,
            sttStatus: "manual"
          }
        );
      })
    );
  }

  function estimateQuestionSpeechDuration(text: string) {
    const characters = Array.from(text.trim()).length;
    const charactersPerSecond = Math.max(2.4, 4 * speechTuning.rate);
    return Math.min(20, Math.max(4, characters / charactersPerSecond));
  }

  function clearQuestionTextScrollTimer() {
    if (jujuQuestionScrollTimerRef.current !== null) {
      window.clearInterval(jujuQuestionScrollTimerRef.current);
      jujuQuestionScrollTimerRef.current = null;
    }
  }

  function resetQuestionViewportToTop() {
    const viewport = jujuQuestionViewportRef.current;
    if (viewport) viewport.scrollTo({ top: 0, behavior: "auto" });
  }

  function startQuestionTextMotion(text: string, durationSec?: number) {
    clearQuestionTextScrollTimer();
    resetQuestionViewportToTop();
    const motionToken = jujuQuestionMotionTokenRef.current + 1;
    jujuQuestionMotionTokenRef.current = motionToken;
    setQuestionTextMotionRun(motionToken);
    setQuestionTextMotionPhase("playing");

    const spokenDurationSec = durationSec && Number.isFinite(durationSec)
      ? Math.max(2.5, durationSec)
      : estimateQuestionSpeechDuration(text);
    // The subtitle used to crawl at exactly speech pace, which reads as sluggish
    // because the reader is already ahead of the voice.
    const motionDurationSec = Math.max(1.2, spokenDurationSec / QUESTION_SCROLL_SPEED);
    window.requestAnimationFrame(() => {
      if (jujuQuestionMotionTokenRef.current !== motionToken) return;
      const viewport = jujuQuestionViewportRef.current;
      const paragraph = viewport?.querySelector("p");
      if (!viewport || !paragraph) return;
      const lineHeightPx = 22;
      const overflowDistance = Math.max(0, paragraph.scrollHeight - viewport.clientHeight);
      // Short questions still need visible speech progress. Moving the text itself
      // keeps the six-line viewport clipped while avoiding the browser's zero
      // scroll range when the paragraph is shorter than the viewport.
      const motionDistance = Math.max(lineHeightPx * 1.5, overflowDistance);
      paragraph.style.setProperty("--juju-question-scroll-distance", `${motionDistance}px`);
      paragraph.style.setProperty("--juju-question-scroll-duration", `${motionDurationSec}s`);
      paragraph.classList.remove("is-speech-scrolling");
      void paragraph.offsetHeight;
      paragraph.classList.add("is-speech-scrolling");
    });
  }

  function finishQuestionTextMotion() {
    jujuQuestionMotionTokenRef.current += 1;
    clearQuestionTextScrollTimer();
    const paragraph = jujuQuestionViewportRef.current?.querySelector("p");
    paragraph?.classList.remove("is-speech-scrolling");
    paragraph?.style.removeProperty("--juju-question-scroll-distance");
    paragraph?.style.removeProperty("--juju-question-scroll-duration");
    resetQuestionViewportToTop();
    setQuestionTextMotionPhase("finished");
  }

  function resetQuestionTextMotion() {
    jujuQuestionMotionTokenRef.current += 1;
    clearQuestionTextScrollTimer();
    const paragraph = jujuQuestionViewportRef.current?.querySelector("p");
    paragraph?.classList.remove("is-speech-scrolling");
    paragraph?.style.removeProperty("--juju-question-scroll-distance");
    paragraph?.style.removeProperty("--juju-question-scroll-duration");
    resetQuestionViewportToTop();
    setQuestionTextMotionPhase("idle");
  }

  function showJujuToast(message: string) {
    setJujuToast(message);
    if (jujuToastTimerRef.current !== null) {
      window.clearTimeout(jujuToastTimerRef.current);
    }
    jujuToastTimerRef.current = window.setTimeout(() => {
      setJujuToast("");
      jujuToastTimerRef.current = null;
    }, 1800);
  }

  // Generating a question takes 0.3–2s server side. Fetching the next one while
  // the candidate is still answering turns that wait into an instant playback.
  async function prefetchQuestionAudio(index: number) {
    const question = questions[index];
    if (!question || !azureConfigured || ttsEngine === "web") return;
    if (ttsCacheRef.current.has(question.id) || ttsPrefetchedRef.current.has(question.id)) return;
    ttsPrefetchedRef.current.add(question.id);
    try {
      const blob = await requestTtsAudio({
        text: question.questionText,
        styleId: interviewerStyleId,
        engine: ttsEngine,
        voiceName: speechTuning.voiceName,
        tencentVoiceType: speechTuning.tencentVoiceType,
        rate: speechTuning.rate,
        pitch: speechTuning.pitch,
        volume: speechTuning.volume
      });
      ttsCacheRef.current.set(question.id, blob);
    } catch {
      // A failed prefetch is not worth surfacing; the real playback will retry.
      ttsPrefetchedRef.current.delete(question.id);
    }
  }

  async function playQuestion() {
    if (!currentQuestion) return;
    const text = currentQuestion.questionText;
    stopTts();
    const playbackToken = ttsPlaybackTokenRef.current;

    if (ttsEngine !== "web" && azureConfigured) {
      const controller = new AbortController();
      ttsAbortControllerRef.current = controller;
      let providerTimedOut = false;
      const providerTimeout = window.setTimeout(() => {
        providerTimedOut = true;
        controller.abort();
      }, 6000);
      try {
        const cached = currentQuestion ? ttsCacheRef.current.get(currentQuestion.id) : undefined;
        if (!cached) {
          setTtsStatus("loading");
          setVoiceMessage(`正在生成${speechProvider === "tencent" ? "腾讯云" : " Azure"} TTS 音频。`);
        }
        const blob =
          cached ??
          (await requestTtsAudio(
            {
              text,
              styleId: interviewerStyleId,
              engine: ttsEngine,
              voiceName: speechTuning.voiceName,
              tencentVoiceType: speechTuning.tencentVoiceType,
              rate: speechTuning.rate,
              pitch: speechTuning.pitch,
              volume: speechTuning.volume
            },
            { signal: controller.signal }
          ));
        if (currentQuestion && !cached) ttsCacheRef.current.set(currentQuestion.id, blob);
        if (playbackToken !== ttsPlaybackTokenRef.current) return;
        const audioUrl = URL.createObjectURL(blob);
        // Reuse the element that a user gesture already unlocked. A fresh
        // `new Audio()` here would be blocked on iOS and in WeChat.
        const audio = getSharedAudioElement() ?? new Audio();
        audio.src = audioUrl;
        audio.volume = speechTuning.volume;
        audioRef.current = audio;
        audioUrlRef.current = audioUrl;
        audio.onplay = () => {
          if (playbackToken !== ttsPlaybackTokenRef.current || audioRef.current !== audio) {
            audio.pause();
            return;
          }
          setTtsStatus("speaking");
          setVoiceMessage(`${speechProvider === "tencent" ? "腾讯云" : "Azure"} TTS 播放中。`);
          startQuestionTextMotion(text, Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : undefined);
        };
        audio.onended = () => {
          if (playbackToken !== ttsPlaybackTokenRef.current || audioRef.current !== audio) return;
          setTtsStatus("ended");
          setVoiceMessage(`${speechProvider === "tencent" ? "腾讯云" : "Azure"} TTS 播放完成。`);
          finishQuestionTextMotion();
          releaseAudio();
        };
        audio.onerror = () => {
          if (playbackToken !== ttsPlaybackTokenRef.current || audioRef.current !== audio) return;
          setTtsStatus("failed");
          setVoiceMessage("服务端 TTS 播放失败，文本仍可继续。");
          resetQuestionTextMotion();
          releaseAudio();
        };
        await audio.play();
        setTtsBlocked(false);
        return;
      } catch (error) {
        if (playbackToken !== ttsPlaybackTokenRef.current || (!providerTimedOut && controller.signal.aborted)) return;
        // The audio itself is fine — the browser just refused to start it
        // without a gesture. Falling through to Web Speech would fail silently
        // for the same reason, so surface a tap target instead.
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          setTtsStatus("failed");
          setTtsBlocked(true);
          setVoiceMessage(
            isWeChatBrowser()
              ? "微信浏览器拦截了自动播放，点击「播放题目」即可收听。"
              : "浏览器拦截了自动播放，点击「播放题目」即可收听。"
          );
          return;
        }
        releaseAudio();
        setVoiceMessage(providerTimedOut ? "云端 TTS 响应较慢，已切换浏览器语音。" : "服务端 TTS 不可用，正在切换 Web Speech API 兜底。");
      } finally {
        window.clearTimeout(providerTimeout);
        if (ttsAbortControllerRef.current === controller) ttsAbortControllerRef.current = null;
      }
    }

    if (playbackToken !== ttsPlaybackTokenRef.current) return;
    try {
      setTtsStatus("loading");
      speakWithWebSpeech(text, interviewerStyleId, speechTuning, {
        onStart: () => {
          if (playbackToken !== ttsPlaybackTokenRef.current) return;
          setTtsStatus("speaking");
          setVoiceMessage("Web Speech API 播放中；本机发音人效果取决于浏览器和系统。");
          startQuestionTextMotion(text);
        },
        onEnd: () => {
          if (playbackToken !== ttsPlaybackTokenRef.current) return;
          setTtsStatus("ended");
          setVoiceMessage("Web Speech API 播放完成。");
          finishQuestionTextMotion();
        },
        onError: () => {
          if (playbackToken !== ttsPlaybackTokenRef.current) return;
          setTtsStatus("failed");
          setVoiceMessage("Web Speech API 播放失败，文本仍可继续。");
          resetQuestionTextMotion();
        }
      });
    } catch (error) {
      setTtsStatus("unsupported");
      setVoiceMessage(error instanceof Error ? error.message : "当前环境不支持语音播放，文本仍可继续。");
      resetQuestionTextMotion();
    }
  }

  function releaseAudio() {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    audioRef.current = null;
  }

  function stopTts() {
    ttsPlaybackTokenRef.current += 1;
    ttsAbortControllerRef.current?.abort();
    ttsAbortControllerRef.current = null;
    if (audioRef.current) {
      audioRef.current.onplay = null;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    releaseAudio();
    if (canUseWebSpeech()) {
      window.speechSynthesis.cancel();
    }
    resetQuestionTextMotion();
    setTtsStatus((status) => (status === "speaking" || status === "loading" ? "ended" : status));
  }

  async function startStt() {
    if (!currentQuestion || !currentAnswer) return;
    sttSessionRef.current?.abort();

    if (shouldInjectClientFault("stt")) {
      updateCurrentAnswer({ sttStatus: "failed", inputMode: currentAnswer.answerText.trim() ? "edited" : "text" });
      setVoiceMessage("开发故障注入：STT 失败。已保留当前文本，可重试或手动编辑。");
      return;
    }

    if (azureConfigured && !canUseMicrophoneRecording()) {
      updateCurrentAnswer({ sttStatus: "unsupported", inputMode: currentAnswer.answerText.trim() ? "edited" : "text" });
      setVoiceMessage("服务端语音识别已配置，但当前页面无法安全录音。请使用 HTTPS 域名访问后重试，或先手动输入。");
      return;
    }

    if (azureConfigured) {
      updateCurrentAnswer({ sttStatus: "recording", inputMode: "voice" });
      try {
        sttSessionRef.current = await startAzureSpeechRecognition({
          existingText: currentAnswer.answerText,
          transcribe: requestSttTranscript,
          onStatus: (status, message) => {
            updateCurrentAnswer({
              sttStatus: status,
              inputMode: status === "success" || status === "recording" ? "voice" : currentAnswer.answerText.trim() ? "edited" : "text"
            });
            setVoiceMessage(message);
          },
          onText: (text, isFinal) => {
            updateCurrentAnswer({
              answerText: text,
              inputMode: isFinal ? "voice" : "edited",
              sttStatus: isFinal ? "success" : "recording"
            });
          },
          onDuration: (durationSec) => {
            updateCurrentAnswer({ durationSec });
          }
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "服务端语音识别录音启动失败，已切换为手动编辑。";
        updateCurrentAnswer({ sttStatus: "unsupported", inputMode: currentAnswer.answerText.trim() ? "edited" : "text" });
        setVoiceMessage(message.includes("Permission") || message.includes("denied") ? "麦克风权限不可用，已切换为手动编辑。" : message);
        return;
      }
    }

    if (!canUseSpeechRecognition()) {
      updateCurrentAnswer({ sttStatus: "unsupported", inputMode: currentAnswer.answerText.trim() ? "edited" : "text" });
      setVoiceMessage("当前浏览器不支持 STT，已切换为手动编辑。");
      return;
    }

    updateCurrentAnswer({ sttStatus: "recording", inputMode: "voice" });
    sttSessionRef.current = startSpeechRecognition({
      existingText: currentAnswer.answerText,
      onStatus: (status, message) => {
        updateCurrentAnswer({
          sttStatus: status,
          inputMode: status === "success" || status === "recording" ? "voice" : currentAnswer.answerText.trim() ? "edited" : "text"
        });
        setVoiceMessage(message);
      },
      onText: (text, isFinal) => {
        updateCurrentAnswer({
          answerText: text,
          inputMode: isFinal ? "voice" : "edited",
          sttStatus: "recording"
        });
      },
      onDuration: (durationSec) => {
        updateCurrentAnswer({ durationSec });
      }
    });
  }

  async function stopStt() {
    await sttSessionRef.current?.stop();
    sttSessionRef.current = null;
  }

  function startFigmaAnswer() {
    // This runs inside a real tap, which is the only moment iOS and WeChat will
    // let us unlock audio for the rest of the interview.
    void unlockAudioPlayback();
    stopTts();
    setJujuVoiceFailureKind(null);
    setJujuRecordingAttemptQuestionId(currentQuestion?.id ?? null);
    updateCurrentAnswer({ durationSec: 0, sttStatus: "recording", inputMode: "voice" });
    setFigmaAnswerPhase("recording");
    setFigmaElapsedSec(0);
    startStt();
  }

  async function finishFigmaAnswer() {
    if (!currentAnswer || jujuAdvanceLockRef.current) return;
    // Encoding and recognition take a couple of seconds. Flip to a visible
    // processing state before any await so the tap is acknowledged immediately,
    // and hold the lock so a second tap cannot re-enter. The failure paths
    // below release it; the advance paths keep it until the index changes.
    jujuAdvanceLockRef.current = true;
    setFigmaAnswerPhase("processing");
    await stopStt();
    const latestAnswer = answersRef.current.find((answer) => answer.questionId === currentAnswer.questionId) ?? currentAnswer;
    const recordedDurationSec = Math.max(latestAnswer.durationSec, figmaElapsedSec);
    if (recordedDurationSec <= 2) {
      updateCurrentAnswer({
        answerText: "",
        durationSec: recordedDurationSec,
        inputMode: "text",
        sttStatus: "manual"
      });
      setJujuVoiceFailureKind("too-short");
      setVoiceMessage("语音过短，请重新作答。");
      setFigmaAnswerPhase("prompt");
      setFigmaElapsedSec(0);
      jujuAdvanceLockRef.current = false;
      return;
    }
    if (["failed", "unsupported"].includes(latestAnswer.sttStatus)) {
      setJujuVoiceFailureKind(
        /网络|network|fetch|连接|服务暂时不可用|request failed/i.test(voiceMessage) ? "network" : "recording"
      );
      setFigmaAnswerPhase("prompt");
      setFigmaElapsedSec(0);
      jujuAdvanceLockRef.current = false;
      return;
    }
    if (!latestAnswer.answerText.trim()) {
      updateCurrentAnswer({
        durationSec: recordedDurationSec,
        inputMode: "text",
        sttStatus: "failed"
      });
      setJujuVoiceFailureKind("recording");
      setVoiceMessage("录制失败，请重新作答。");
      setFigmaAnswerPhase("prompt");
      setFigmaElapsedSec(0);
      jujuAdvanceLockRef.current = false;
      return;
    }
    const durationSec = Math.max(recordedDurationSec, 30);
    const nextAnswers = getPatchedAnswers({
      durationSec,
      inputMode: latestAnswer.sttStatus === "recording" || latestAnswer.sttStatus === "success" ? "voice" : latestAnswer.inputMode,
      sttStatus: latestAnswer.sttStatus === "recording" ? "success" : latestAnswer.sttStatus
    });
    answersRef.current = nextAnswers;
    onAnswersChange(nextAnswers);
    setFigmaAnswerPhase("prompt");
    setFigmaElapsedSec(0);

    if (currentIndex < questions.length - 1) {
      jujuAdvanceLockRef.current = true;
      setIsJujuAdvancing(true);
      window.setTimeout(() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1)), 360);
      return;
    }

    jujuAdvanceLockRef.current = true;
    setIsJujuAdvancing(true);
    await onGenerateReport(nextAnswers);
    jujuAdvanceLockRef.current = false;
    setIsJujuAdvancing(false);
  }

  function requestJujuSkipConfirmation() {
    if (jujuAdvanceLockRef.current) return;
    stopTts();
    setShowJujuSkipConfirm(true);
  }

  async function confirmJujuSkip() {
    if (jujuAdvanceLockRef.current) return;
    jujuAdvanceLockRef.current = true;
    setIsJujuAdvancing(true);
    if (figmaAnswerPhase === "recording" || figmaAnswerPhase === "processing") await stopStt();
    stopTts();

    const nextAnswers = getPatchedAnswers({
      answerText: "",
      durationSec: 0,
      inputMode: "text",
      sttStatus: "manual"
    });
    answersRef.current = nextAnswers;
    onAnswersChange(nextAnswers);
    setJujuVoiceFailureKind(null);
    setJujuRecordingAttemptQuestionId(null);
    setFigmaAnswerPhase("prompt");
    setFigmaElapsedSec(0);

    if (currentIndex < questions.length - 1) {
      setShowJujuSkipConfirm(false);
      setCurrentIndex((index) => Math.min(questions.length - 1, index + 1));
      return;
    }
    await onGenerateReport(nextAnswers);
    setShowJujuSkipConfirm(false);
    jujuAdvanceLockRef.current = false;
    setIsJujuAdvancing(false);
  }

  function simulateStt(status: SttStatus) {
    if (status === "failed") {
      updateCurrentAnswer({ sttStatus: "failed", inputMode: currentAnswer?.answerText.trim() ? "edited" : "text" });
      setVoiceMessage("语音识别失败，已保留当前文本，可重试或手动编辑。");
      return;
    }

    const sample = demoScenario.sampleAnswers.find((answer) => answer.questionId === currentQuestion?.id);
    updateCurrentAnswer({
      answerText: sample?.answerText ?? currentAnswer?.answerText ?? "",
      inputMode: "voice",
      durationSec: sample?.durationSec ?? 60,
      sttStatus: "success"
    });
  }

  function updateClassicSpeechTuning(styleId: InterviewerStyleId, patch: Partial<SpeechTuning>) {
    setClassicSpeechTunings((current) => {
      const nextSpeechTunings = normalizePersonaSpeechTunings({
        ...current,
        [styleId]: {
          ...current[styleId],
          ...patch
        }
      });
      cacheClassicSpeechTunings(nextSpeechTunings);
      return nextSpeechTunings;
    });
    setSpeechSettingsMessage("声线配置已更新，点击保存后写入服务端全局配置。");
  }

  function updateSpeechTuning(patch: Partial<SpeechTuning>) {
    updateClassicSpeechTuning(interviewerStyleId, patch);
  }

  async function saveClassicSpeechSettings() {
    const speechTunings = normalizePersonaSpeechTunings(classicSpeechTunings);
    setSpeechSettingsMessage("正在保存 classic 全局声线配置...");
    try {
      const snapshot = await saveActiveSpeechSettings(speechTunings, ttsEngine);
      setClassicSpeechTunings(snapshot.speechTunings);
      cacheClassicSpeechTunings(snapshot.speechTunings);
      pinnedTtsEngineRef.current = Boolean(snapshot.ttsEngine);
      setSpeechSettingsMessage("已保存为服务端全局声线配置，引擎与音色对全站生效。");
    } catch {
      cacheClassicSpeechTunings(speechTunings);
      setSpeechSettingsMessage("服务端保存失败，已保存在本机缓存；请确认线上实例的 outputs 目录可写。");
    }
  }

  if (!currentQuestion || !currentAnswer) {
    return (
      <section className="panel">
        <div className="status warning">还没有可答题目，请先生成 3 道面试题。</div>
      </section>
    );
  }

  if (visualTheme === "juju") {
    const isRecording = figmaAnswerPhase === "recording";
    const isProcessing = figmaAnswerPhase === "processing";
    const showVoiceFailure = !isRecording && !isProcessing && jujuVoiceFailureKind !== null;
    const jujuVoiceFailureMessage =
      jujuVoiceFailureKind === "network"
        ? <>抱歉 <span className="juju-interview-voice-notice-keyword">网络异常</span> 5S后退出面试 ...</>
        : jujuVoiceFailureKind === "too-short"
          ? <>抱歉 <span className="juju-interview-voice-notice-keyword">语音过短</span> 请重新作答 ...</>
          : <>抱歉 <span className="juju-interview-voice-notice-keyword">录制失败</span> 请重新作答 ...</>;
    const interviewerName =
      interviewerStyleId === "strictHr" ? "温婉HR小姐姐" : interviewerStyleId === "techBro" ? "技术老哥" : "资深业务大佬";
    const progressText = `${currentIndex + 1}/${questions.length}`;
    if (showJujuHistory) {
      return (
        <JujuAnswerHistory
          answers={answers}
          currentIndex={currentIndex}
          onClose={() => setShowJujuHistory(false)}
          questions={questions}
        />
      );
    }

    return (
      <section className="figma-phone-stage juju-interview-stage" aria-label="Interview response">
        <div className={isRecording ? "figma-phone-card figma-home-card figma-interview-card juju-interview-card is-answering" : "figma-phone-card figma-home-card figma-interview-card juju-interview-card is-question"}>
          <div className="figma-statusbar">
            <FigmaInterviewClock />
            <span>PassBuddy</span>
          </div>

          <JujuOrb className="juju-interview-orb" progressText={progressText} showEllipse11={isRecording} showOuterArc />

          {!isRecording && !isProcessing && !showVoiceFailure && (
            <>
              <section className={`juju-interview-question-frame is-${questionTextMotionPhase}`}>
                <div className="juju-interview-question-viewport" ref={jujuQuestionViewportRef}>
                  <p key={`${currentQuestion.id}-${questionTextMotionRun}`}>{currentQuestion.questionText}</p>
                </div>
              </section>
              <button
                className="juju-interview-replay-button"
                data-attention={ttsBlocked}
                onClick={() => {
                  void unlockAudioPlayback();
                  playQuestion();
                }}
                type="button"
              >
                {ttsStatus === "speaking"
                  ? "正在播放…"
                  : ttsStatus === "loading"
                    ? "正在生成语音…"
                    : ttsBlocked
                      ? "点击播放题目"
                      : "重播题目"}
              </button>
            </>
          )}

          {isProcessing && (
            <p className="juju-interview-listening-label" role="status">
              正在识别你的回答…
            </p>
          )}

          {isRecording && !showVoiceFailure && (
            <>
              <p className="juju-interview-listening-label">
                {interviewerName}正在聆听... {formatElapsed(figmaElapsedSec)} / {formatElapsed(MAX_ANSWER_SECONDS)}
              </p>
              <div className="figma-interview-listening-rings juju-interview-listening-rings" aria-hidden="true">
                <span className="ring ring-outer" />
                <span className="ring ring-large" />
                <span className="ring ring-medium" />
                <span className="ring ring-small" />
              </div>
            </>
          )}

          {showVoiceFailure && (
            <div className="juju-interview-voice-notice" role="alert">
              {jujuVoiceFailureMessage}
            </div>
          )}

          <div className={isRecording ? "figma-interview-orb-controls juju-interview-controls recording" : "figma-interview-orb-controls juju-interview-controls"} aria-label="回答控制">
            <button
              className="juju-interview-control juju-interview-control-frame7"
              onClick={requestJujuSkipConfirmation}
              aria-label="跳过当前题目"
              disabled={isJujuAdvancing || isProcessing}
            >
              <img src="/juju/interview-controls/frame-7.svg?v=202607102345" alt="" />
            </button>
            <button
              className="juju-interview-control juju-interview-control-frame8"
              onClick={isRecording ? finishFigmaAnswer : startFigmaAnswer}
              aria-label={isRecording ? "结束回答" : "开始回答"}
              disabled={isJujuAdvancing || isProcessing}
            >
              <img
                src={isRecording ? "/juju/interview-controls/frame-8-recording.svg?v=2026080101" : "/juju/interview-controls/frame-8.svg?v=202607102345"}
                alt=""
              />
            </button>
            <button
              className="juju-interview-control juju-interview-control-frame9"
              onClick={() => {
                if (isRecording) {
                  showJujuToast("请先结束当前回答");
                  return;
                }
                stopTts();
                setShowJujuHistory(true);
              }}
              aria-label="查看答题记录"
              disabled={isJujuAdvancing || isProcessing}
            >
              <img src={messageIcon.src} alt="" />
            </button>
          </div>
          {jujuToast && <div className="juju-interview-toast" role="status">{jujuToast}</div>}
          {showJujuSkipConfirm && (
            <div className="juju-interview-skip-layer">
              <section
                aria-labelledby="juju-interview-skip-title"
                aria-modal="true"
                className="juju-interview-skip-dialog"
                role="dialog"
              >
                <h2 id="juju-interview-skip-title">是否跳过当前题目？</h2>
                <p>{currentIndex === questions.length - 1 ? "跳过后将结束本轮面试。" : "跳过后将直接进入下一题。"}</p>
                <div className="juju-interview-skip-actions">
                  <button autoFocus disabled={isJujuAdvancing} onClick={() => setShowJujuSkipConfirm(false)} type="button">
                    取消
                  </button>
                  <button className="confirm" disabled={isJujuAdvancing} onClick={() => void confirmJujuSkip()} type="button">
                    {isJujuAdvancing ? "正在进入下一步…" : currentIndex === questions.length - 1 ? "跳过并完成" : "确认跳过"}
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </section>
    );
  }

  if (visualTheme === "figma") {
    const isRecording = figmaAnswerPhase === "recording";
    const showManualAnswer =
      currentAnswer.sttStatus === "failed" ||
      currentAnswer.sttStatus === "unsupported" ||
      (isRecording && currentAnswer.sttStatus === "manual");
    const answerSeconds = isRecording ? figmaElapsedSec : currentAnswer.durationSec;
    const interviewerName =
      interviewerStyleId === "strictHr" ? "温婉HR小姐姐" : interviewerStyleId === "techBro" ? "技术老哥" : "资深业务大佬";
    const interviewerRole =
      interviewerStyleId === "strictHr" ? "HR" : interviewerStyleId === "techBro" ? "Tech Lead" : "业务负责人";
    const compSrc = isRecording
      ? "/figma/home/comp-1024-1-response@2x.png?v=2026070501"
      : "/figma/home/comp-1024-1-interview@2x.png?v=2026070501";

    return (
      <section className="figma-phone-stage" aria-label="Interview response">
        <div className="figma-phone-card figma-home-card figma-interview-card">
          <div className="figma-statusbar">
            <FigmaInterviewClock />
            <span>PassBuddy</span>
          </div>

          <div className="figma-interview-persona">
            <div className={`figma-interview-persona-avatar hero-${interviewerStyleId}`} aria-hidden="true" />
            <div>
              <strong>{interviewerName}</strong>
              <span>{interviewerRole}</span>
            </div>
          </div>

          <div className={isRecording ? "figma-interview-comp recording" : "figma-interview-comp"} aria-hidden="true">
            <img className="figma-home-comp-asset" src={compSrc} alt="" />
          </div>

          <section className={isRecording ? "figma-interview-prompt answering" : "figma-interview-prompt"}>
            <h2>{isRecording ? "正在回答 ..." : `Hey ${candidateName} !`}</h2>
            <p>{currentQuestion.questionText}</p>
          </section>

          {showManualAnswer && (
            <>
              <label className="figma-interview-answer">
                <span>改用文字回答</span>
                <textarea
                  aria-label="文字回答"
                  value={currentAnswer.answerText}
                  onChange={(event) =>
                    updateCurrentAnswer({
                      answerText: event.target.value,
                      inputMode: "text",
                      sttStatus: "manual",
                      durationSec: Math.max(currentAnswer.durationSec, 30)
                    })
                  }
                  placeholder="当前设备无法录音，可直接输入回答。"
                />
              </label>
              <div className="figma-interview-error manual-answer-visible" role="alert">
                语音不可用，回答内容仍会保留；输入后点击中间按钮继续。
              </div>
            </>
          )}

          <p className="figma-interview-progress">
            第 {currentIndex + 1} / {questions.length} 题 · {formatDuration(answerSeconds)}
          </p>

          <div className="figma-interview-dots" aria-label="题目进度">
            {questions.map((question, index) => {
              const answer = answers.find((item) => item.questionId === question.id);
              return (
                <button
                  className={index === currentIndex ? "active" : answer?.answerText.trim() ? "done" : ""}
                  key={question.id}
                  onClick={() => {
                    if (!isRecording) setCurrentIndex(index);
                  }}
                  aria-label={`切换到第 ${index + 1} 题`}
                />
              );
            })}
          </div>

          {isRecording && !showManualAnswer && (
            <div className="figma-interview-listening-rings" aria-hidden="true">
              <span className="ring ring-outer" />
              <span className="ring ring-large" />
              <span className="ring ring-medium" />
              <span className="ring ring-small" />
            </div>
          )}

          <div className={isRecording ? "figma-interview-orb-controls recording" : "figma-interview-orb-controls"} aria-label="回答控制">
            <button
              className="figma-interview-round-button cancel"
              onClick={() => {
                updateCurrentAnswer({ answerText: "", inputMode: "text", sttStatus: "manual", durationSec: 0 });
                if (isRecording) {
                  finishFigmaAnswer();
                  return;
                }
                setCurrentIndex(Math.min(questions.length - 1, currentIndex + 1));
              }}
              aria-label={isRecording ? "取消本题回答并进入下一题" : "跳过本题"}
            />
            <button
              className="figma-interview-mic-button"
              onClick={isRecording ? finishFigmaAnswer : startFigmaAnswer}
              aria-label={isRecording ? "结束回答" : "开始回答"}
            />
            <button
              className="figma-interview-round-button next"
              onClick={() => {
                void unlockAudioPlayback();
                if (isRecording) {
                  finishFigmaAnswer();
                  return;
                }
                playQuestion();
              }}
              aria-label={isRecording ? "结束并进入下一题" : "播放面试题"}
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Interview</h2>
          <p>按 3 道题顺序作答；可跳过、编辑，报告前会提示缺失答案。</p>
        </div>
        <button onClick={fillSampleAnswers}>填入样例答案</button>
      </div>

      {missingCount > 0 && <div className="status warning">当前还有 {missingCount} 道题缺少答案，仍可生成报告但会标记缺失。</div>}

      <div className="interview-layout">
        <aside className="question-grid">
          {questions.map((question, index) => (
            <button
              className={index === currentIndex ? "question-card active" : "question-card"}
              key={question.id}
              onClick={() => setCurrentIndex(index)}
            >
              <strong>
                {question.id} · {question.title}
              </strong>
              <span>{answers.find((answer) => answer.questionId === question.id)?.answerText.trim() ? "已作答" : "未作答"}</span>
            </button>
          ))}
        </aside>

        <div>
          <article className="question-card active">
            <strong>
              第 {currentIndex + 1} 题 · {currentQuestion.title}
            </strong>
            <p>{currentQuestion.questionText}</p>
            <p className="helper">Intent: {currentQuestion.intent}</p>
            <p className="helper">Expected: {currentQuestion.expectedSignals.join(" / ")}</p>
          </article>

          <VoiceControls
            azureConfigured={azureConfigured}
            azureVoices={azureVoices}
            message={voiceMessage}
            speechTuning={speechTuning}
            sttStatus={currentAnswer.sttStatus}
            ttsEngine={ttsEngine}
            ttsStatus={ttsStatus}
            webVoices={webVoices}
            onPlay={playQuestion}
            currentInterviewerStyleId={interviewerStyleId}
            personaSpeechTunings={classicSpeechTunings}
            speechSettingsMessage={speechSettingsMessage}
            onPersonaSpeechTuningChange={updateClassicSpeechTuning}
            onSaveSpeechSettings={saveClassicSpeechSettings}
            onSpeechTuningChange={updateSpeechTuning}
            onSimulateSttFailure={() => simulateStt("failed")}
            onStartStt={startStt}
            onStopStt={stopStt}
            onStopTts={stopTts}
            onTtsEngineChange={setTtsEngine}
          />

          {(currentAnswer.sttStatus === "failed" || currentAnswer.sttStatus === "unsupported") && (
            <div className="status error">STT 识别失败。已保留当前文本，可重试识别或直接手动编辑。</div>
          )}

          <div className="field">
            <label htmlFor="answerText">答案文本</label>
            <textarea
              className="answer-editor"
              id="answerText"
              value={currentAnswer.answerText}
              onChange={(event) =>
                updateCurrentAnswer({
                  answerText: event.target.value,
                  inputMode: currentAnswer.sttStatus === "success" ? "edited" : "text",
                  sttStatus: currentAnswer.sttStatus === "idle" ? "manual" : currentAnswer.sttStatus,
                  durationSec: Math.max(currentAnswer.durationSec, 30)
                })
              }
              placeholder="可以手动输入，也可以先模拟语音识别后再编辑。"
            />
          </div>

          <div className="inline-actions">
            <button onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>
              上一题
            </button>
            <button
              onClick={() => {
                updateCurrentAnswer({ answerText: "", inputMode: "text", sttStatus: "manual", durationSec: 0 });
                setCurrentIndex(Math.min(questions.length - 1, currentIndex + 1));
              }}
            >
              跳过本题
            </button>
            <button onClick={() => setCurrentIndex(Math.min(questions.length - 1, currentIndex + 1))} disabled={currentIndex === questions.length - 1}>
              下一题
            </button>
            <button className="primary" onClick={() => onGenerateReport(answers)}>
              生成复盘报告
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
