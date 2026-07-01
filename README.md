# 面试嘴替教练

Hackathon Alpha-Demo：用户输入简历和 JD，选择 3 种面试官风格之一，生成候选人画像和 3 道面试题，完成语音或文本答题后生成可复制的复盘报告与优化答案。

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Azure TTS 优先，Web Speech API 兜底
- OpenAI-compatible LLM provider，可缺省使用演示兜底样例

`tts-demo/` 是保留的 Azure/Web Speech 验证样板，不属于正式 App Router 主流程。

## Quick Start

```bash
npm install
copy .env.example .env.local
npm run dev
```

打开 `http://localhost:3000`。

如果没有 LLM 或 Azure key，也可以直接演示：点击 `填充并生成画像`，系统会使用内置演示兜底样例完成主流程。

## Local Checks

```bash
npm run typecheck
```

启动本地服务后运行 contract smoke：

```bash
npm run smoke:contract -- http://localhost:3000
```

检查源码和文档中是否误写真实密钥：

```bash
npm run security:check
```

安全检查不会读取 `.env.local`。

## Environment

本地配置写在 `.env.local`。不要把真实密钥写进 README、docs、日志或提交记录。

常用变量：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`

开发演示控制：

- `FACEWALL_DEMO_MODE=auto|fallback`
- `FACEWALL_DEV_FAULTS=llm,tts`

这些开发控制只在非生产运行时生效。生产构建不会展示前端 Demo Ops 面板。

## Demo Ops Panel

开发环境页面顶部会显示 `Demo Ops` 面板：

- `自动`：真实依赖优先；未配置或失败时使用现有兜底。
- `强制演示兜底`：profile/questions/report API 直接返回演示数据。
- `LLM 失败`：profile/questions/report 返回 retryable failure，前端保留输入并展示兜底入口。
- `TTS 失败`：Azure TTS 状态不可用或 `/api/tts` 返回失败，文本流程继续。
- `STT 失败`：点击语音识别时直接进入失败态，保留已输入文本。
- `Clipboard 失败`：一键复制进入手动复制兜底。

这些控制用于现场前验证故障路径，不要用于正式评审讲解真实能力。

## Standard Demo Flow

1. 打开 `http://localhost:3000`。
2. 点击 `填充并生成画像`。
3. 展示候选人画像：匹配点、风险点、关键词。
4. 点击 `生成 3 道题`。
5. 点击 `开始答题`。
6. 播放一道题；Azure 不可用时使用 Web Speech 或直接看文本。
7. 点击 `填入样例答案`。
8. 点击 `生成复盘报告`。
9. 展示总分、Top 风险、行动项、每题雷区、致命问题、优化答案和 60 秒版。
10. 点击 `一键复制`；若剪贴板被浏览器拒绝，使用手动复制文本框。

## Deployment Notes

推荐部署到支持 Next.js App Router 的平台，例如 Vercel。

部署前：

1. 设置真实环境变量，不上传 `.env.local`。
2. 运行 `npm run typecheck`。
3. 运行 `npm run security:check`。
4. 使用真实 LLM key 至少跑 3 种面试官风格端到端验收。
5. 如 Azure key 不可用，确认 Web Speech / 文本兜底路径可完成闭环。

## Known Deferred Items

- 报告流式输出和增量展示。
- 单题复制嘴替答案。
- 单题重新生成嘴替答案。
- Figma 到位后的最终视觉替换。
- 发布前真实 LLM 三风格质量抽查和 prompt 冻结。
