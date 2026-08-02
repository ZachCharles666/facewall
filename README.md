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

## Theme URLs

- `http://localhost:3000/?theme=figma`：正式视觉主题，不展示 prompt 调试窗口。
- `http://localhost:3000/?theme=classic`：低保真调试主题，展示产品 Prompt 调试窗口，可调整画像、题目、报告 prompt 并直接跑链路验证。

Prompt 调试面板支持两种状态：

- 草稿测试：在 classic 里编辑后直接跑当前流程，会用本页草稿 prompt 生成内容。
- 保存为全局 Prompt：点击保存后写入服务端 `outputs/active-prompt-overrides.json`，之后 `theme=figma` 和所有未传草稿覆盖的 LLM 请求都会默认使用这份 prompt；Node 服务重启后仍会读取该文件。

## Local Checks

```bash
npm run typecheck
```

启动本地服务后运行 contract smoke：

```bash
npm run smoke:contract -- http://localhost:3000
```

验证 Setup 页文件上传解析：

```bash
npm run smoke:file-parse -- http://localhost:3000
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
- `FACEWALL_PROMPT_STORE_PATH`：可选，指定全局 Prompt 持久化 JSON 文件路径；默认 `outputs/active-prompt-overrides.json`

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
2. 可直接粘贴简历/JD，也可上传 TXT、PDF 或 Word(.docx) 文件自动解析文本。
3. 点击 `填充并生成画像`。
4. 展示候选人画像：匹配点、风险点、关键词。
5. 点击 `生成 3 道题`。
6. 点击 `开始答题`。
7. 播放一道题；Azure 不可用时使用 Web Speech 或直接看文本。
8. 点击 `填入样例答案`。
9. 点击 `生成复盘报告`。
10. 展示总分、Top 风险、行动项、每题雷区、致命问题、优化答案和 60 秒版。
11. 点击 `一键复制`；若剪贴板被浏览器拒绝，使用手动复制文本框。

## Deployment Notes

推荐部署到支持 Next.js App Router 的平台，例如 Vercel 或腾讯云服务器自托管 Node.js。

腾讯云服务器自托管时，建议用同一套 Next.js 构建对外提供两个主题 URL：

- `https://your-domain/?theme=figma`
- `https://your-domain/?theme=classic`

反向代理或网关必须保留 query string，不能把 `?theme=classic` / `?theme=figma` 重写丢失。只要环境变量和构建版本一致，公网访问不同主题与本地 `http://localhost:3000/?theme=...` 的效果应一致。

全局 Prompt 保存依赖服务器本地磁盘。腾讯云 CVM 单机部署时，确保项目目录或 `FACEWALL_PROMPT_STORE_PATH` 指向持久云硬盘路径，并随应用一起备份；多实例部署时需要共享存储或数据库，否则每台实例会各自保存一份 Prompt。

当前 `theme=classic` 和 `/api/prompts/active` 是产品调试入口。外网开放时建议只给产品使用的域名、路径或访问控制暴露，避免无关用户修改全局 Prompt。

部署前：

1. 设置真实环境变量，不上传 `.env.local`。
2. 运行 `npm run typecheck`。
3. 运行 `npm run security:check`。
4. 使用真实 LLM key 至少跑 3 种面试官风格端到端验收。
5. 如 Azure key 不可用，确认 Web Speech / 文本兜底路径可完成闭环。

## Known Deferred Items

- Figma 到位后的最终视觉替换。
- 产品 prompt review 后的发布版本冻结。
- 正式 Demo 前真实 LLM 三风格质量抽查。
- 最终桌面 / 手机截图录屏和发布验收记录。
- 扫描件 PDF 的 OCR 解析。
