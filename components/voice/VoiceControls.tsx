import type { SpeechTuning, SttStatus, TtsEngine, TtsStatus, VoiceOption } from "@/lib/types";

export function VoiceControls({
  ttsStatus,
  sttStatus,
  message,
  ttsEngine,
  azureConfigured,
  azureVoices,
  webVoices,
  speechTuning,
  onPlay,
  onStopTts,
  onTtsEngineChange,
  onSpeechTuningChange,
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
  onPlay: () => void;
  onStopTts: () => void;
  onTtsEngineChange: (engine: TtsEngine) => void;
  onSpeechTuningChange: (patch: Partial<SpeechTuning>) => void;
  onStartStt: () => void;
  onStopStt: () => void;
  onSimulateSttFailure: () => void;
}) {
  const voiceOptions = ttsEngine === "azure" ? azureVoices : webVoices;
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
            <option value="azure">Azure Neural TTS</option>
            <option value="web">Web Speech API</option>
          </select>
        </label>

        <label className="field compact-field">
          <span>发音人</span>
          <select value={speechTuning.voiceName} onChange={(event) => onSpeechTuningChange({ voiceName: event.target.value })}>
            {voiceOptions.map((voice) => (
              <option key={voice.value} value={voice.value}>
                {voice.label}
              </option>
            ))}
          </select>
        </label>
      </div>

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
