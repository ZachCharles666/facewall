# Delivery Status Overview

> 本文档是当前项目交付总账，用来回答三件事：计划开发什么、已经完成什么、还剩什么。后续新增 Phase、功能或范围变更，先更新本文档，再进入开发。

## 1. 项目目标和硬边界

目标：交付 Hackathon Alpha-Demo。用户输入简历和 JD，选择 3 种面试官风格之一，系统生成候选人画像和 3 道面试题，用户语音或文本答题后生成可复制的复盘报告与优化答案。

当前固定边界：

| Item | Decision |
| --- | --- |
| 正式技术栈 | Next.js App Router + React + TypeScript |
| 面试官风格 | 固定 3 个：`strictHr`、`techBro`、`gentleSister` |
| 语音提问 | Azure TTS 优先，Web Speech API 兜底 |
| 答题输入 | STT 优先，但必须可重试、保留文本、手动编辑 |
| 报告生成 | 流式优先、非流式保底；流式按 `docs/04_api_contracts.md` 4.1 实现 |
| 复制范围 | 必须覆盖“优化答案”和“复盘报告” |
| 本轮不做 | 登录、历史记录、多人协作、音频上传存储、实时提词器 |
| 密钥安全 | `.env.local` 只做本地配置，不在回复、日志、文档中输出真实密钥 |
| 设计接入 | Figma 到位后只替换视觉层，不重写状态机和接口结构 |

## 2. 三套计划口径的关系

当前项目里有三套容易混淆的口径：

| 口径 | 来源 | 作用 | 当前使用方式 |
| --- | --- | --- | --- |
| Early Step 1-8 | 早期推荐开发顺序 | 说明 Mock-first 到 Demo 兜底的策略路线 | 已被当前 Phase 计划吸收，不再作为主执行清单 |
| Phase 0-10 | `docs/todo.md`、`docs/14_remaining_phase_instructions.md` | 实际交付批次、验收记录和下一步计划 | 当前主线 |
| Module M01-M08 | `docs/06_module_instructions.md` | 模块责任边界、契约、验收点和风险 | 每个 Phase 开发时引用的模块合同，不是线性阶段 |

结论：
- Step 是早期策略顺序。
- Phase 是当前执行和验收主线。
- Module 是功能边界和验收依据。
- 后续不要新开第四套编号体系；如果必须新增，先在本文档登记映射关系。
- PRD 需求逐条映射见 `docs/12_prd_traceability_matrix.md`，该文档是产品需求是否遗漏的主检查表。

## 3. Early Step 到当前 Phase 映射

| Early Step | 早期目标 | 当前落点 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| Step 1 | 定合同：TypeScript 类型、JSON Schema、接口入参出参 | Phase 0、Phase 1、Phase 2 | Done | `lib/types.ts`、`lib/schemas/contracts.ts`、`docs/04_api_contracts.md` 已建立 |
| Step 2 | 做演示样例包 | Phase 1 | Done | `lib/demo/scenario.ts` 覆盖输入、画像、题目、答案、报告 |
| Step 3 | 跑通 Mock 完整链路 | Phase 1 | Done | 无真实 LLM 也可从 setup 走到 report |
| Step 4 | 接 Azure TTS | Phase 3 | Done | `/api/tts` 和 `/api/azure-status` 已接入，Web Speech 兜底 |
| Step 5 | 接 STT | Phase 3 | Done | Web Speech STT 状态、失败重试、手动编辑已接入 |
| Step 6 | 替换真实 LLM | Phase 2、Phase 10 | Mostly Done | 工程接入已完成；真实 key 后质量验收和 prompt 微调放 Phase 10 |
| Step 7 | 套设计稿 | Phase 9 | Pending Figma | 等 Figma 到位后替换视觉 |
| Step 8 | 做 Demo 兜底 | Phase 1-4、Phase 8、Phase 10 | Mostly Done | 主兜底、显式故障注入、README、smoke 和密钥检查已完成；最终现场演练放 Phase 10 |

## 4. Module 完成状态

| Module | Tier | 目标 | 当前状态 | 已完成内容 | 剩余工作 |
| --- | --- | --- | --- | --- | --- |
| M01 App Shell & State Machine | L1 | `setup -> profile -> questions -> interview -> report` | Done | Next.js App Shell、流程状态、全局 status、questionId 关联 | Figma 后复验状态承载位 |
| M02 Demo Scenario Package | L1 | 稳定演示兜底样例 | Done | AI 产品经理实习样例包、兜底画像/题目/口语化答案/报告；保留可编辑填充路径和一键进入画像路径 | 后续只需产品确认样例文案或替换内容 |
| M03 Profile Parse | L1 | 简历/JD 解析为候选人画像 | Done | `/api/profile/parse`、provider、prompt、schema、兜底 | 可不等 Figma：真实 LLM 质量抽查和 prompt 微调 |
| M04 Question Generation | L1 | 基于画像和风格生成 3 题 | Done | `/api/questions/generate`、固定 3 题、intent、expectedSignals、风格前置 | 可不等 Figma：三风格真实输出抽查 |
| M05 Interview Session | L1 | 管理问题进度、答案、编辑、报告前缺失提示 | Done | 3 题切换、样例答案、跳过、答案保存、STT 状态接入 | Figma 后复验移动端布局 |
| M06 Voice Layer | L2 | Azure TTS、Web Speech、STT/手动兜底 | Done | Azure 状态、TTS 参数、Web Speech fallback、STT failed/manual；Phase 8 已验证真实 Azure 三风格 `/api/tts` 返回音频 | Phase 10 做最终复验 |
| M07 Report Generation & Copy | L1 | 每题报告、最终报告、一键复制 | Done | 报告 API、6 维分、缺失答案不编造、复制成功/失败兜底、AI PM 场景报告高光、动态 copyText、流式报告、单题复制、单题重新生成、缺失/过短/跑题专项诊断 | Phase 10 做真实 LLM 输出质量抽查和 prompt 冻结 |
| M08 Design Integration Layer | L2 | Figma 到位后视觉替换，不改业务结构 | Phase 5A Done, Phase 9 Pending Figma | token 基线、设计审查清单、Demo runbook | 等 Figma：审查状态覆盖、替换视觉、截图验收 |

## 5. Phase 完成状态

| Phase | 名称 | 状态 | 已完成内容 | 剩余工作 |
| --- | --- | --- | --- | --- |
| Phase 0 | 规划和契约 | Done | 项目规划、Alpha Contract、验收矩阵、模块分层、API 契约、Demo 样例契约、模块 instruction、设计交付契约 | 如范围变更，先更新相关契约 |
| Phase 1 | Next.js 本地闭环骨架 | Done | 正式应用结构、状态机、演示样例包、低保真页面、fake API、端到端闭环 | 无 |
| Phase 2 | API 和 AI 生成 | Done | profile/questions/report route、OpenAI-compatible provider、prompt、schema 校验、LLM 失败处理 | 真实 key 后做质量验收 |
| Phase 3 | 语音层 | Done | Azure TTS 接入、Web Speech fallback、STT 状态、失败重试、手动编辑、手机 H5 验证 | 真实 Azure key 后可做音色验收 |
| Phase 4 | 报告和复制 | Done | 每题报告、最终报告、缺失答案、报告失败、复制成功、剪贴板失败兜底 | 报告文案可随 Demo 样例继续打磨 |
| Phase 5A | Design readiness | Done | design token 基线、Figma 状态审查清单、Demo runbook、Phase/Step 关系梳理、剩余 Phase instruction | 无 |
| Phase 6 | Demo Content & Productization | Done | Demo 样例包产品化为 AI 产品经理实习场景；新增“填充并生成画像”；打磨报告内容、copyText、缺失/过短答案兜底和 300 字策略 | 产品可继续 review 文案；技术剩余转入 Phase 8/7/10 |
| Phase 7 | Report Streaming & PRD Gaps | Done | `/api/report/generate-stream` SSE、前端流式增量展示、流式失败后非流式保底、单题复制、单题重新生成、`weight` 不入 schema 决策、过短/跑题专项诊断 | 真实 LLM 输出质量和产品 prompt review 放 Phase 10 |
| Phase 8 | Demo Operations & Fault Controls | Done | dev-only 故障注入、显式演示兜底切换、README、`.env.example`、contract smoke、安全检查、Azure TTS 三风格验收 | Phase 10 做最终演练和发布冻结 |
| Phase 9 | Figma Visual Integration | Pending Figma | 尚未开始 | 接收 Figma、审查状态覆盖、替换 setup/interview/report 视觉、桌面/手机截图验收 |
| Phase 10 | Release Freeze & Acceptance | Pending | 尚未开始 | 真实 LLM 三风格验收、prompt 产品 review/冻结、故障注入复验、最终录屏/截图、密钥安全检查 |

## 6. 已开发功能点清单

### 6.1 主流程

| 功能点 | 状态 | 证据位置 |
| --- | --- | --- |
| 输入简历/JD | Done | `components/setup/SetupPanel.tsx` |
| 选择 3 种面试官风格 | Done | `lib/state/constants.ts`、`components/setup/SetupPanel.tsx` |
| 一键填充演示样例 | Done | `lib/demo/scenario.ts`、`SetupPanel` |
| 生成候选人画像 | Done | `app/api/profile/parse/route.ts` |
| 生成 3 道面试题 | Done | `app/api/questions/generate/route.ts` |
| 按题答题和切题 | Done | `components/interview/InterviewPanel.tsx` |
| 生成复盘报告 | Done | `app/api/report/generate/route.ts` |
| 一键复制报告和优化答案 | Done | `components/report/ReportPanel.tsx` |
| 流式生成报告 | Done | `app/api/report/generate-stream/route.ts`、`components/InterviewCoachApp.tsx` |
| 单题复制和重新生成 | Done | `components/report/ReportPanel.tsx`、`app/api/report/regenerate-question/route.ts` |

### 6.2 API 和契约

| 功能点 | 状态 | 证据位置 |
| --- | --- | --- |
| `CommonResponse` | Done | `docs/04_api_contracts.md`、`lib/types.ts` |
| 请求和输出 schema 校验 | Done | `lib/schemas/contracts.ts` |
| OpenAI-compatible LLM provider | Done | `lib/ai/provider.ts` |
| profile/questions/report prompt | Done | `lib/prompts/interview.ts` |
| Prompt 产品交接清单 | Done | `docs/13_prompt_handoff.md` |
| provider 失败错误语义 | Done | `LLM_PROVIDER_FAILED`、`LLM_TIMEOUT`、`LLM_SCHEMA_INVALID` |
| 无 LLM key 演示兜底 | Done | `lib/demo/fallback.ts` |

### 6.3 语音和答题

| 功能点 | 状态 | 证据位置 |
| --- | --- | --- |
| Azure TTS API route | Done | `app/api/tts/route.ts` |
| Azure 配置状态查询 | Done | `app/api/azure-status/route.ts` |
| Web Speech TTS fallback | Done | `lib/speech/webSpeech.ts` |
| STT 浏览器封装 | Done | `lib/speech/stt.ts` |
| 语音控制区 | Done | `components/voice/VoiceControls.tsx` |
| STT 失败后保留文本和可编辑 | Done | `components/interview/InterviewPanel.tsx` |

### 6.4 报告和兜底

| 功能点 | 状态 | 证据位置 |
| --- | --- | --- |
| 每题 6 维评分 | Done | `lib/types.ts`、`ReportPanel` |
| 风险标签、致命问题、诊断 | Done | `ReportPanel` |
| 优化答案和 60 秒口述版 | Done | `ReportPanel` |
| 缺失答案不编造 | Done | `lib/demo/fallback.ts`、`ReportPanel` |
| 报告生成失败后保留问题和答案 | Done | `components/InterviewCoachApp.tsx` |
| 剪贴板失败手动复制 | Done | `components/report/ReportPanel.tsx` |
| 流式报告失败后非流式保底 | Done | `components/InterviewCoachApp.tsx`、`app/api/report/generate-stream/route.ts` |
| 过短/跑题兜底诊断 | Done | `lib/demo/fallback.ts`、`scripts/contract-smoke.mjs` |

### 6.5 设计和演示准备

| 功能点 | 状态 | 证据位置 |
| --- | --- | --- |
| design token 基线 | Done | `app/globals.css` |
| Figma 状态覆盖清单 | Done | `docs/09_phase5_design_readiness.md` |
| Hackathon Demo runbook | Done | `docs/10_hackathon_demo_runbook.md` |
| 剩余 Phase 执行指令 | Done | `docs/14_remaining_phase_instructions.md` |
| 低保真移动端基础适配 | Done | `app/globals.css`、Phase 3 验证记录 |

### 6.6 Demo Ops

| 功能点 | 状态 | 证据位置 |
| --- | --- | --- |
| dev-only Demo Ops 面板 | Done | `components/dev/DevOpsPanel.tsx` |
| LLM/TTS 服务端故障注入 | Done | `lib/dev/ops.ts`、API routes |
| STT/clipboard 前端故障注入 | Done | `components/interview/InterviewPanel.tsx`、`components/report/ReportPanel.tsx` |
| 显式演示兜底切换 | Done | `x-facewall-demo-mode`、`FACEWALL_DEMO_MODE` |
| Contract smoke | Done | `scripts/contract-smoke.mjs`、`npm run smoke:contract` |
| 密钥安全检查 | Done | `scripts/security-check.mjs`、`npm run security:check` |
| Quick Start / 部署说明 | Done | `README.md`、`.env.example` |

## 7. 还需要开发的内容

### 7.1 不需要等待 Figma 的工作

这些工作可以现在继续做，且不会和 Figma 视觉替换冲突。

| Work Item | Priority | Why | Suggested Phase |
| --- | --- | --- | --- |
| Demo 样例包产品化 | High | 已完成 AI 产品经理实习场景；后续仅需产品 review 或替换文案 | Phase 6 Done |
| 报告内容和 copyText 产品化 | High | 已完成报告高光、动态 copyText、缺失/过短答案保护和 300 字策略 | Phase 6 Done |
| 报告流式输出，非流式保底 | High | 已新增 SSE 流式接口和前端流式体验；非流式 `/api/report/generate` 保留为兜底 | Phase 7 Done |
| 单题复制 / 单题重新生成 | Medium | 已支持单题复制优化答案/60 秒版，单题重生成只替换目标 `questionId` | Phase 7 Done |
| 题目 `weight` 字段或等价展示 | Low | Phase 7 决定暂不进入 schema；`expectedSignals` 继续承载 evaluation focus，权重展示需后续契约变更 | Phase 7 Decision |
| 过短/跑题答案专项诊断 | Medium | fallback 和 contract smoke 已覆盖“回答过短”“疑似跑题” | Phase 7 Done |
| 开发故障注入开关 | High | 已完成 LLM/TTS/STT/clipboard dev-only 故障注入 | Phase 8 Done |
| `.env.example` 和部署说明 | Medium | 已补 `.env.example`、README Quick Start 和部署说明 | Phase 8 Done |
| README / Quick Start | Medium | 已补本地启动、演示、故障注入、部署说明 | Phase 8 Done |
| 本地 contract smoke 脚本 | Medium | 已补 `npm run smoke:contract`，覆盖 profile/questions/report/缺失答案/LLM+TTS fault | Phase 8 Done |
| 日志和密钥安全检查 | Medium | 已补 `npm run security:check`，扫描源码/文档/脚本/示例 env，不读取 `.env.local` | Phase 8 Done / Phase 10 复验 |
| Azure TTS 真实 key 验收 | Medium | 当前环境 Azure 配置可用，三种风格 `/api/tts` 均返回 `200 audio/mpeg` | Phase 8 Done / Phase 10 复验 |
| 真实 LLM 三风格验收 | High | 工程接入已完成，但真实输出质量未验收 | Phase 10 |
| Prompt 调优和产品冻结 | High | 防泛化、防编造、强化 3 种风格差异，正式发布前需产品确认 | Phase 10 |
| 当前低保真手机 H5 复验 | Low | 可提前发现非视觉层布局问题 | Phase 8 |

### 7.2 必须等待 Figma 的工作

| Work Item | Dependency | Why |
| --- | --- | --- |
| 审查 Figma 页面覆盖 | Figma | 需要确认 setup/interview/report 和异常态是否齐全 |
| 建立最终视觉 token 映射 | Figma | 当前已有 baseline，最终值需要设计稿 |
| 替换 setup 视觉 | Figma | 输入、风格选择、样例入口需要按设计稿调整 |
| 替换 interview 视觉 | Figma | 面试官头像、语音状态、题卡、答题区需要设计稿 |
| 替换 report 视觉 | Figma | 报告卡片、分数、风险标签、复制状态需要设计稿 |
| 桌面最终截图/录屏 | Figma 后 | 必须基于最终视觉 |
| 手机 H5 最终截图/录屏 | Figma 后 | 必须基于最终视觉 |

### 7.3 当前明确不做的内容

| Item | Reason |
| --- | --- |
| 登录 | 不在 Hackathon MVP 范围 |
| 历史记录 | 不在本轮闭环必要路径 |
| 多人协作 | 不在本轮范围 |
| 音频上传和存储 | 复杂度高，当前只需要文本答案和浏览器语音能力 |
| 实时提词器 | 已明确不做 |

## 8. 缺口和风险

| Risk / Gap | Severity | Current Handling | Next Action |
| --- | --- | --- | --- |
| Figma 未到位 | Medium | 已完成 Design readiness，保留低保真 UI | 等 Figma 后进入 Phase 9 |
| 真实 LLM 输出质量未知 | High | provider 和 schema 已接入 | 配真实 key 后三风格验收 |
| 当前 Demo 样例主题不够贴 AI 产品经理 | Low | 已替换为 AI 产品经理实习场景并完成主流程验证 | Phase 10 前做产品文案确认 |
| 故障注入还不够产品化 | Low | 已完成 dev-only Demo Ops 面板、header/env 控制和 smoke 验证 | Phase 10 做最终复验 |
| Prompt 尚未经过产品确认 | High | 已建立 `docs/13_prompt_handoff.md` 和代码位置清单；Phase 6 已补 AI PM、过短/跑题、300 字和事实边界规则 | Phase 10 前完成产品 review、调整和冻结 |
| PRD 与当前契约存在差异 | Medium | 流式接口已契约化并实现；3 种风格已确认；题目 `weight` Phase 7 决定暂不进 schema | 若产品坚持权重展示，先更新 API contract、types、schema、demo data 和 prompt |
| 设计稿可能改信息架构 | Medium | 设计接入规则已写入 `docs/09` | 若发生，先更新契约再开发 |
| 移动端 STT 兼容不稳定 | Medium | 支持重试和手动编辑 | Phase 6 真机/手机 viewport 复验 |
| 密钥泄露风险 | High | 不输出 `.env.local`，API route 隐藏 key；Phase 8 已增加 `security:check` | Phase 10 最终复验 |

## 9. 推荐下一步

在 Figma 未到位前，建议只做不会被视觉返工影响的工作：

1. 如真实 LLM key 已可用，可提前启动 Phase 10 的三风格验收并记录 prompt 问题，但发布冻结仍放 Phase 10。

Figma 到位后：

1. 先按 `docs/09_phase5_design_readiness.md` 审查状态覆盖。
2. 再进入 Phase 9 视觉替换。
3. 最后进入 Phase 10 最终 Demo hardening。

## 10. 变更控制规则

为了避免继续出现“补全模式不可控”，后续按以下规则执行：

1. 新增功能前，先确认它属于本文档哪个 Work Item。
2. 如果不属于任何 Work Item，先补到本文档并标注是否等待 Figma。
3. 每完成一项，更新 `docs/todo.md` 的验证记录。
4. 不新增未映射的 Phase、Step、Module 编号。
5. 不为视觉效果修改 API 契约、状态枚举或 `questionId` 关联规则。
