import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = process.cwd();
const read = (path: string) => readFile(`${root}/${path}`, "utf8");

test("NVIDIA DeepSeek and Tencent speech stay server-side and surface in classic", async () => {
  const [provider, speech, ttsRoute, sttRoute, statusRoute, panel, app, env] =
    await Promise.all([
      read("lib/ai/provider.ts"),
      read("lib/speech/tencentCloud.ts"),
      read("app/api/tts/route.ts"),
      read("app/api/stt/route.ts"),
      read("app/api/azure-status/route.ts"),
      read("components/ProviderStatusPanel.tsx"),
      read("components/InterviewCoachApp.tsx"),
      read(".env.example")
    ]);

  assert.match(provider, /process\.env\.NVIDIA_API_KEY/);
  assert.match(provider, /https:\/\/integrate\.api\.nvidia\.com\/v1/);
  assert.match(provider, /deepseek-ai\/deepseek-v4-flash/);
  assert.match(speech, /TENCENT_SPEECH_SECRET_ID/);
  assert.match(speech, /TENCENT_SPEECH_SECRET_KEY/);
  assert.match(speech, /TextToVoice/);
  assert.match(speech, /SentenceRecognition/);
  assert.match(ttsRoute, /synthesizeWithTencent/);
  assert.match(sttRoute, /recognizeWithTencent/);
  assert.match(statusRoute, /model: llm\.model/);
  assert.match(panel, /AI 与语音服务/);
  assert.match(panel, /腾讯云 TTS \/ ASR/);
  assert.match(app, /!isFigmaLikeTheme[\s\S]*<ProviderStatusPanel/);
  assert.match(env, /^NVIDIA_API_KEY=$/m);
  assert.match(env, /^TENCENT_SPEECH_SECRET_ID=$/m);
  assert.doesNotMatch(panel, /SECRET|API_KEY|secretKey/);
});
