import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { getAzureSpeechStatus, requestSttTranscript, requestTtsAudio } from "@/lib/api/client";
import { shouldInjectClientFault } from "@/lib/dev/clientControls";
import { demoScenario } from "@/lib/demo/scenario";
import { azureVoiceOptions, personaSpeechDefaults } from "@/lib/speech/settings";
import { canUseMicrophoneRecording, canUseSpeechRecognition, startAzureSpeechRecognition, startSpeechRecognition, type SttSession } from "@/lib/speech/stt";
import { canUseWebSpeech, getWebSpeechVoices, speakWithWebSpeech } from "@/lib/speech/webSpeech";
import { JujuOrb } from "@/components/JujuOrb";
import type {
  InterviewAnswer,
  InterviewQuestion,
  InterviewerStyleId,
  SpeechTuning,
  SttStatus,
  TtsEngine,
  TtsStatus,
  VisualTheme,
  VoiceOption
} from "@/lib/types";
import { VoiceControls } from "@/components/voice/VoiceControls";

type FigmaAnswerPhase = "prompt" | "recording";
type QuestionTextMotionPhase = "idle" | "playing" | "finished";

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

export function InterviewPanel({
  questions,
  answers,
  interviewerStyleId,
  candidateName = "朋友",
  visualTheme = "classic",
  onAnswersChange,
  onGenerateReport
}: {
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
  interviewerStyleId: InterviewerStyleId;
  candidateName?: string;
  visualTheme?: VisualTheme;
  onAnswersChange: (answers: InterviewAnswer[]) => void;
  onGenerateReport: (answers: InterviewAnswer[]) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ttsEngine, setTtsEngine] = useState<TtsEngine>("azure");
  const [ttsStatus, setTtsStatus] = useState<TtsStatus>("idle");
  const [azureConfigured, setAzureConfigured] = useState(false);
  const [azureVoices, setAzureVoices] = useState<VoiceOption[]>(azureVoiceOptions);
  const [webVoices, setWebVoices] = useState<VoiceOption[]>([{ value: "auto", label: "自动匹配中文发音人" }]);
  const [speechTuning, setSpeechTuning] = useState<SpeechTuning>(personaSpeechDefaults[interviewerStyleId]);
  const [voiceMessage, setVoiceMessage] = useState("语音提问优先 Azure TTS，失败后使用浏览器 Web Speech。");
  const [figmaAnswerPhase, setFigmaAnswerPhase] = useState<FigmaAnswerPhase>("prompt");
  const [figmaElapsedSec, setFigmaElapsedSec] = useState(0);
  const [questionTextMotionPhase, setQuestionTextMotionPhase] = useState<QuestionTextMotionPhase>("idle");
  const [questionTextMotionRun, setQuestionTextMotionRun] = useState(0);
  const [questionTextMotionDurationSec, setQuestionTextMotionDurationSec] = useState(6);
  const [jujuToast, setJujuToast] = useState("");
  const jujuToastTimerRef = useRef<number | null>(null);
  const [azureStatusReady, setAzureStatusReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const sttSessionRef = useRef<SttSession | null>(null);
  const answersRef = useRef(answers);
  const autoPlayedIndexRef = useRef<number | null>(null);
  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers.find((answer) => answer.questionId === currentQuestion?.id);

  const missingCount = useMemo(
    () => answers.filter((answer) => !answer.answerText.trim()).length,
    [answers]
  );

  useEffect(() => {
    setSpeechTuning(personaSpeechDefaults[interviewerStyleId]);
  }, [interviewerStyleId]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    setFigmaAnswerPhase("prompt");
    setFigmaElapsedSec(0);
    setQuestionTextMotionPhase("idle");
  }, [currentIndex]);

  useEffect(() => {
    if (figmaAnswerPhase !== "recording") return;

    const startedAt = Date.now() - figmaElapsedSec * 1000;
    const timer = window.setInterval(() => {
      setFigmaElapsedSec(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [figmaAnswerPhase, figmaElapsedSec]);

  useEffect(() => {
    let cancelled = false;
    getAzureSpeechStatus()
      .then((status) => {
        if (cancelled) return;
        setAzureConfigured(status.configured);
        setAzureVoices(status.voices.length > 0 ? status.voices : azureVoiceOptions);
        setVoiceMessage(
          status.configured
            ? "Azure Speech 已配置；提问使用 Azure TTS，答题优先 Azure STT。"
            : "Azure TTS 未配置；播放会自动使用 Web Speech API 兜底。"
        );
      })
      .catch(() => {
        if (cancelled) return;
        setAzureConfigured(false);
        setVoiceMessage("Azure TTS 状态不可用；播放会尝试 Web Speech API 兜底。");
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

  function startQuestionTextMotion(text: string, durationSec?: number) {
    setQuestionTextMotionDurationSec(durationSec && Number.isFinite(durationSec) ? Math.max(2.5, durationSec) : estimateQuestionSpeechDuration(text));
    setQuestionTextMotionRun((run) => run + 1);
    setQuestionTextMotionPhase("playing");
  }

  function finishQuestionTextMotion() {
    setQuestionTextMotionPhase("finished");
  }

  function resetQuestionTextMotion() {
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

  async function playQuestion() {
    if (!currentQuestion) return;
    const text = currentQuestion.questionText;
    stopTts();

    if (ttsEngine === "azure" && azureConfigured) {
      try {
        setTtsStatus("loading");
        setVoiceMessage("正在生成 Azure TTS 音频。");
        const blob = await requestTtsAudio({
          text,
          styleId: interviewerStyleId,
          voiceName: speechTuning.voiceName,
          rate: speechTuning.rate,
          pitch: speechTuning.pitch,
          volume: speechTuning.volume
        });
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.volume = speechTuning.volume;
        audioRef.current = audio;
        audioUrlRef.current = audioUrl;
        audio.onplay = () => {
          setTtsStatus("speaking");
          setVoiceMessage("Azure TTS 播放中。");
          startQuestionTextMotion(text, Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : undefined);
        };
        audio.onended = () => {
          setTtsStatus("ended");
          setVoiceMessage("Azure TTS 播放完成。");
          finishQuestionTextMotion();
          releaseAudio();
        };
        audio.onerror = () => {
          setTtsStatus("failed");
          setVoiceMessage("Azure TTS 播放失败，文本仍可继续。");
          resetQuestionTextMotion();
          releaseAudio();
        };
        await audio.play();
        return;
      } catch {
        releaseAudio();
        setVoiceMessage("Azure TTS 不可用，正在切换 Web Speech API 兜底。");
      }
    }

    try {
      setTtsStatus("loading");
      speakWithWebSpeech(text, interviewerStyleId, speechTuning, {
        onStart: () => {
          setTtsStatus("speaking");
          setVoiceMessage("Web Speech API 播放中；本机发音人效果取决于浏览器和系统。");
          startQuestionTextMotion(text);
        },
        onEnd: () => {
          setTtsStatus("ended");
          setVoiceMessage("Web Speech API 播放完成。");
          finishQuestionTextMotion();
        },
        onError: () => {
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
    if (audioRef.current) {
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
      setVoiceMessage("Azure STT 已配置，但当前页面无法安全录音。请使用 HTTPS 域名访问后重试，或先手动输入。");
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
        const message = error instanceof Error ? error.message : "Azure STT 录音启动失败，已切换为手动编辑。";
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
    setFigmaAnswerPhase("recording");
    setFigmaElapsedSec(0);
    startStt();
  }

  async function finishFigmaAnswer() {
    if (!currentAnswer) return;
    await stopStt();
    const latestAnswer = answersRef.current.find((answer) => answer.questionId === currentAnswer.questionId) ?? currentAnswer;
    const durationSec = Math.max(latestAnswer.durationSec, figmaElapsedSec, latestAnswer.answerText.trim() ? 30 : 0);
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
      window.setTimeout(() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1)), 360);
      return;
    }

    window.setTimeout(() => onGenerateReport(nextAnswers), 360);
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

  function updateSpeechTuning(patch: Partial<SpeechTuning>) {
    setSpeechTuning((current) => ({
      ...current,
      ...patch
    }));
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
    const answerSeconds = isRecording ? figmaElapsedSec : currentAnswer.durationSec;
    const interviewerName =
      interviewerStyleId === "strictHr" ? "温婉HR小姐姐" : interviewerStyleId === "techBro" ? "技术老哥" : "资深业务大佬";
    const progressText = `${currentIndex + 1}/${questions.length}`;
    const questionMotionStyle = {
      "--juju-question-scroll-duration": `${questionTextMotionDurationSec}s`
    } as CSSProperties;

    return (
      <section className="figma-phone-stage juju-interview-stage" aria-label="Interview response">
        <div className={isRecording ? "figma-phone-card figma-home-card figma-interview-card juju-interview-card is-answering" : "figma-phone-card figma-home-card figma-interview-card juju-interview-card is-question"}>
          <div className="figma-statusbar">
            <FigmaInterviewClock />
            <span>Facewall</span>
          </div>

          <JujuOrb className="juju-interview-orb" progressText={progressText} showEllipse11={isRecording} showOuterArc />

          {!isRecording && (
            <section className={`juju-interview-question-frame is-${questionTextMotionPhase}`} style={questionMotionStyle}>
              <div className="juju-interview-question-viewport">
                <p key={`${currentQuestion.id}-${questionTextMotionRun}`}>{currentQuestion.questionText}</p>
              </div>
            </section>
          )}

          {isRecording && (
            <>
              <p className="juju-interview-listening-label">{interviewerName}正在聆听...</p>
              <div className="figma-interview-listening-rings juju-interview-listening-rings" aria-hidden="true">
                <span className="ring ring-outer" />
                <span className="ring ring-large" />
                <span className="ring ring-medium" />
                <span className="ring ring-small" />
              </div>
            </>
          )}

          {(currentAnswer.sttStatus === "failed" || currentAnswer.sttStatus === "unsupported") && (
            <div className="figma-interview-error juju-interview-error" role="alert">
              识别失败，已保留当前状态，可重试或继续下一题。
            </div>
          )}

          <div className={isRecording ? "figma-interview-orb-controls juju-interview-controls recording" : "figma-interview-orb-controls juju-interview-controls"} aria-label="回答控制">
            <button
              className="juju-interview-control juju-interview-control-frame7"
              onClick={() => {
                updateCurrentAnswer({ answerText: "", inputMode: "text", sttStatus: "manual", durationSec: 0 });
                if (isRecording) {
                  finishFigmaAnswer();
                  return;
                }
                setCurrentIndex(Math.min(questions.length - 1, currentIndex + 1));
              }}
              aria-label={isRecording ? "取消本题回答并进入下一题" : "跳过本题"}
            >
              <img src="/juju/interview-controls/frame-7.svg?v=202607102345" alt="" />
            </button>
            <button
              className="juju-interview-control juju-interview-control-frame8"
              onClick={isRecording ? finishFigmaAnswer : startFigmaAnswer}
              aria-label={isRecording ? "结束回答" : "开始回答"}
            >
              <img src="/juju/interview-controls/frame-8.svg?v=202607102345" alt="" />
            </button>
            <button
              className="juju-interview-control juju-interview-control-frame9"
              onClick={() => showJujuToast("下个版本开放")}
              aria-label="下个版本开放"
            >
              <img src="/juju/interview-controls/frame-9.svg?v=202607102345" alt="" />
            </button>
          </div>
          {jujuToast && <div className="juju-interview-toast" role="status">{jujuToast}</div>}
        </div>
      </section>
    );
  }

  if (visualTheme === "figma") {
    const isRecording = figmaAnswerPhase === "recording";
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
            <span>Facewall</span>
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

          {(currentAnswer.sttStatus === "failed" || currentAnswer.sttStatus === "unsupported") && (
            <div className="figma-interview-error" role="alert">
              识别失败，已保留当前状态，可重试或继续下一题。
            </div>
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

          {isRecording && (
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
