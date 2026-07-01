# Alpha Contract: 面试嘴替教练 v0.1

## 1. Goals

- 用户能从简历/JD 到 3 题模拟面试再到复盘报告完成主闭环。
- 主闭环支持演示样例包兜底，保证 Hackathon 展示稳定。
- LLM/TTS/STT 失败时不阻断整体体验。
- 后续 Figma 设计稿可以替换视觉层，不破坏数据和业务状态。

## 2. Non-Goals

- 不做账号体系、历史记录、支付、多人协作。
- 不做实时口型、真实音频频谱、音频文件存储。
- 不做无限多轮自由追问。
- 不做正式生产级数据安全合规审计。

## 3. System Boundary

| 边界 | 内容 |
| --- | --- |
| 输入 | resumeText、jdText、interviewerStyle、answerText |
| 输出 | candidateProfile、questions、perQuestionReport、finalReport、copyText |
| 外部依赖 | LLM 服务、Azure TTS、浏览器 STT/Web Speech API |
| 本地依赖 | `.env.local`、演示样例包、前端状态机 |

## 4. Ownership

| 模块 | Owner | 说明 |
| --- | --- | --- |
| 产品规则 | 产品 | 风格、文案、报告口径 |
| UI 视觉 | 设计 | Figma 页面和组件视觉 |
| 技术方案 | 开发 | 状态机、接口、prompt、兜底、部署 |
| 演示样例包 | 开发先定义 | 产品可后续替换文本内容 |

## 5. Interface Contracts

所有正式业务接口必须返回结构化 JSON。前端不得依赖自由文本解析。

| 接口 | 用途 | 是否流式 | 失败策略 |
| --- | --- | --- | --- |
| `POST /api/profile/parse` | 解析候选人画像 | 否 | 返回结构化错误，允许演示兜底 |
| `POST /api/questions/generate` | 生成 3 道题 | 否 | 返回演示题目兜底 |
| `POST /api/report/generate` | 生成复盘报告 | 先否 | 返回可读错误，保留答案 |
| `POST /api/tts` | Azure TTS 音频 | 否 | 降级 Web Speech 或纯文本 |

## 6. Data Contracts

统一使用 camelCase 字段名。所有枚举值用稳定英文 key，中文只作为展示文案。

| 结构 | 必填字段 |
| --- | --- |
| `InterviewerStyle` | `id`, `label`, `description`, `voice`, `ttsParams`, `promptTone` |
| `CandidateProfile` | `summary`, `matchedPoints`, `riskPoints`, `keywords`, `evidenceMaterials` |
| `InterviewQuestion` | `id`, `type`, `title`, `questionText`, `intent`, `expectedSignals`, `difficulty` |
| `AnswerRecord` | `questionId`, `answerText`, `inputMode`, `durationSec`, `sttStatus` |
| `QuestionReport` | `questionId`, `score`, `dimensionScores`, `riskTags`, `fatalIssue`, `diagnosis`, `optimizedAnswer`, `oralVersion60s` |
| `FinalReport` | `overallScore`, `summary`, `topRisks`, `actionItems`, `copyText` |

## 7. Error Semantics

| Code | Meaning | Retry | 用户体验 |
| --- | --- | --- | --- |
| `INPUT_INVALID` | 简历/JD 不足或为空 | 否 | 提示补充内容 |
| `LLM_TIMEOUT` | AI 生成超时 | 是 | 保留输入，允许重试/用样例 |
| `LLM_SCHEMA_INVALID` | AI 返回结构不合规 | 是 | 使用兜底或提示重试 |
| `TTS_UNAVAILABLE` | TTS 不可用 | 是 | 展示文本，允许继续 |
| `STT_UNSUPPORTED` | 当前浏览器不支持 STT | 否 | 切换手动编辑 |
| `STT_FAILED` | 识别失败/中断 | 是 | 允许重试，保留已有文字 |
| `COPY_FAILED` | 剪贴板失败 | 是 | 展示可手动选择文本 |

## 8. Acceptance Reference

验收以 `docs/02_acceptance_matrix.md` 为准。任何功能完成声明必须能对应至少一条验收证据。

## 9. Risk Registration

所有风险写入 `docs/todo.md` 的“风险和待确认”区：
- L1 模块风险必须在继续相邻模块前处理或显式接受。
- 如果实现发现契约不够，先改本文件和 API 契约，再改代码。

## 10. Unresolved Issues

| Issue | Impact | 建议处理 |
| --- | --- | --- |
| 正式 LLM 供应商和模型未冻结 | 影响 prompt 和成本 | 先封装 provider 层 |
| STT 方案未最终确定 | 影响移动端兼容 | 先 Web Speech + 手动编辑兜底 |
| Figma 未到位 | 影响 UI 细节 | 先做结构稳定的低保真页面 |
| Demo 部署形态未定 | 影响环境变量和代理 | 先支持本地 Node 服务 |
