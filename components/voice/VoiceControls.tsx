import { interviewerSpeechLabels, interviewerSpeechStyleIds } from "@/lib/speech/settings";
import type { InterviewerStyleId, PersonaSpeechTunings, SpeechTuning, SttStatus, TtsEngine, TtsStatus, VoiceOption } from "@/lib/types";

export function VoiceControls({
  ttsStatus,
  sttStatus,
  message,
  ttsEngine,
  azureConfigured,
  azureVoices,
  webVoices,
  speechTuning,
  currentInterviewerStyleId,
  personaSpeechTunings,
  speechSettingsMessage,
  onPlay,
  onStopTts,
  onTtsEngineChange,
  onSpeechTuningChange,
  onPersonaSpeechTuningChange,
  onSaveSpeechSettings,
  onStartStt,
  onStopStt,
  onSimulateSttFailure
}: {
  ttsStatus: TtsStatus;
  sttStatus: SttStatus;
  message: string;
  ttsEngine: TtsEngine;
  azureConfigured: boolean;
  azureVoices: VoiceOption[];
  webVoices: VoiceOption[];
  speechTuning: SpeechTuning;
  currentInterviewerStyleId: InterviewerStyleId;
  personaSpeechTunings: PersonaSpeechTunings;
  speechSettingsMessage: string;
  onPlay: () => void;
  onStopTts: () => void;
  onTtsEngineChange: (engine: TtsEngine) => void;
  onSpeechTuningChange: (patch: Partial<SpeechTuning>) => void;
  onPersonaSpeechTuningChange: (styleId: InterviewerStyleId, patch: Partial<SpeechTuning>) => void;
  onSaveSpeechSettings: () => void;
  onStartStt: () => void;
  onStopStt: () => void;
  onSimulateSttFailure: () => void;
}) {
  // Tencent voices are numeric ids the account enables, so there is no list to
  // offer; the per-persona fields below take them directly.
  const isTencentEngine = ttsEngine === "tencent";
  const voiceOptions = ttsEngine === "azure" ? azureVoices : webVoices;
  const lockedVoiceOptions = azureVoices;
  const selectedVoiceValue = voiceOptions.some((voice) => voice.value === speechTuning.voiceName) ? speechTuning.voiceName : "auto";
  const isRecording = sttStatus === "recording";
  const avatarState = isRecording ? "recording" : ttsStatus === "speaking" ? "speaking" : "";

  return (
    <div className="panel voice-console">
      <div className={`voice-avatar ${avatarState}`} aria-hidden="true" />
      <div className="panel-header">
        <div>
          <h3>语音控制</h3>
          <p className="helper">{message}</p>
        </div>
        <div className="helper">
          TTS: {ttsStatus} / STT: {sttStatus}
        </div>
      </div>

      <div className="voice-wave" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="voice-settings-grid">
        <label className="field compact-field">
          <span>TTS 引擎</span>
          <select value={ttsEngine} onChange={(event) => onTtsEngineChange(event.target.value as TtsEngine)}>
            <option value="tencent">腾讯云 TTS</option>
            <option value="azure">Azure Neural TTS</option>
            <option value="web">Web Speech API</option>
          </select>
        </label>

        <label className="field compact-field">
          <span>发音人</span>
          {isTencentEngine ? (
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="腾讯音色 ID，0 为默认"
              value={speechTuning.tencentVoiceType || ""}
              onChange={(event) =>
                onSpeechTuningChange({ tencentVoiceType: Number(event.target.value) || 0 })
              }
            />
          ) : (
            <select value={selectedVoiceValue} onChange={(event) => onSpeechTuningChange({ voiceName: event.target.value })}>
              {voiceOptions.map((voice) => (
                <option key={voice.value} value={voice.value}>
                  {voice.label}
                </option>
              ))}
            </select>
          )}
        </label>
      </div>

      <section className="persona-voice-locks" aria-label="面试官声线锁定">
        <div className="persona-voice-locks-header">
          <div>
            <h4>面试官声线锁定</h4>
            <p className="helper">{speechSettingsMessage}</p>
          </div>
          <button onClick={onSaveSpeechSettings}>保存全局声线</button>
        </div>
        <div className="persona-voice-locks-grid">
          {interviewerSpeechStyleIds.map((styleId) => (
            <label className={styleId === currentInterviewerStyleId ? "field compact-field active" : "field compact-field"} key={styleId}>
              <span>{interviewerSpeechLabels[styleId]}</span>
              {isTencentEngine ? (
                <>
                  {/* Free-form rather than a dropdown: which Tencent voices an
                      account can use varies, and a hardcoded list would go
                      stale the moment the account changes. */}
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="腾讯音色 ID，0 为默认"
                    value={personaSpeechTunings[styleId].tencentVoiceType || ""}
                    onChange={(event) =>
                      onPersonaSpeechTuningChange(styleId, {
                        tencentVoiceType: Number(event.target.value) || 0
                      })
                    }
                  />
                  <span className="helper">腾讯音色 ID（0 = 用服务端默认）</span>
                </>
              ) : (
                <select value={personaSpeechTunings[styleId].voiceName} onChange={(event) => onPersonaSpeechTuningChange(styleId, { voiceName: event.target.value })}>
                  {lockedVoiceOptions.map((voice) => (
                    <option key={`${styleId}-${voice.value}`} value={voice.value}>
                      {voice.label}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ))}
        </div>
      </section>

      <div className="slider-grid">
        <label>
          <span>语速 {speechTuning.rate.toFixed(2)}</span>
          <input
            type="range"
            min="0.6"
            max="1.5"
            step="0.01"
            value={speechTuning.rate}
            onChange={(event) => onSpeechTuningChange({ rate: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>音调 {speechTuning.pitch.toFixed(2)}</span>
          <input
            type="range"
            min="0.1"
            max="1.5"
            step="0.01"
            value={speechTuning.pitch}
            onChange={(event) => onSpeechTuningChange({ pitch: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>音量 {speechTuning.volume.toFixed(2)}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={speechTuning.volume}
            onChange={(event) => onSpeechTuningChange({ volume: Number(event.target.value) })}
          />
        </label>
      </div>

      {ttsEngine === "azure" && !azureConfigured && (
        <div className="status warning">Azure TTS 未配置或不可用。播放会自动尝试 Web Speech，文本流程不受影响。</div>
      )}

      <div className="inline-actions">
        <button onClick={onPlay}>播放提问</button>
        <button onClick={onStopTts}>停止播放</button>
        <button onClick={isRecording ? onStopStt : onStartStt}>{isRecording ? "停止识别" : "开始语音答题"}</button>
        <button onClick={onStartStt}>重试识别</button>
        <button className="danger" onClick={onSimulateSttFailure}>
          模拟 STT 失败
        </button>
      </div>
    </div>
  );
}
