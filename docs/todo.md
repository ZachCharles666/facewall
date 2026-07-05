# 面试嘴替教练开发 TODO

## Phase 0 - 规划和契约

- [x] 创建项目规划 `docs/00_project_plan.md`
- [x] 创建 Alpha Contract `docs/01_alpha_contract.md`
- [x] 创建验收矩阵 `docs/02_acceptance_matrix.md`
- [x] 创建模块分层 `docs/03_module_map_and_tiers.md`
- [x] 创建 API 契约 `docs/04_api_contracts.md`
- [x] 创建演示兜底样例包契约 `docs/05_demo_scenario_contract.md`
- [x] 创建模块 instruction `docs/06_module_instructions.md`
- [x] 创建设计交付契约 `docs/07_design_handoff_contract.md`

## Phase 1 - Next.js 本地闭环骨架

- [x] 确定正式技术栈：Next.js App Router + React + TypeScript
- [x] 初始化 Next.js 正式应用结构
- [x] 建立正式 App Shell 和状态机
- [x] 实现演示兜底样例包
- [x] 实现 setup/interview/report 低保真页面
- [x] 使用演示数据跑通完整闭环

## Phase 1 验证记录 - 2026-06-29

| Module | Acceptance | Result | Evidence |
| --- | --- | --- | --- |
| M01 App Shell & State Machine | A-001, A-002, D-001, D-004, G-001 | Pass | Next.js App Router 页面按 `setup -> profile -> questions -> interview -> report` 切换；浏览器用演示样例完整走到报告；答案和报告用 `questionId` 对齐。 |
| M02 Demo Scenario Package | A-002, B-002, C-003, F-004 | Pass | `lib/demo/scenario.ts` 提供简历、JD、画像、3 道题、样例答案和报告；API/client 失败时保留输入并使用演示兜底继续。 |
| M03 Profile Parse fake API | B-001, B-003 | Pass | `POST /api/profile/parse` 本地调用返回 `ok=true`，包含关键词、匹配点、风险点、证据素材和补充建议。 |
| M04 Question Generation fake API | B-004, C-001, C-002, C-004 | Pass | `POST /api/questions/generate` 本地调用返回 3 道题；题目包含 `id/type/title/questionText/intent/expectedSignals/difficulty`，并按面试官风格加前置语气。 |
| M05 Interview Session | D-001, D-002, D-004, E-004 | Pass | 浏览器验证 3 题顺序作答、填入样例答案、跳过缺失提示；STT 失败提示出现，已识别文本保留，重试后状态回到 `success`。 |
| M06 Voice Layer minimum | E-001, E-002, E-003, E-005 | Pass | `POST /api/tts` 本地调用返回 `200 audio/mpeg`；前端播放优先 Azure TTS，失败时切 Web Speech，语音状态只展示 `ttsStatus/sttStatus`。 |
| M07 Report Generation & Copy minimum | F-001, F-002, F-003, F-004, F-005 | Pass | `POST /api/report/generate` 本地调用返回 3 份题目报告和最终报告；浏览器复制成功，剪贴板内容 631 字且包含“优化答案”和“复盘报告”；缺失答案时报告标记缺失不编造。 |

### Phase 1 实际验证

- `npm install`：Pass。首次沙箱内因用户级 npm cache 权限失败，提权后安装成功。
- `npm run typecheck`：Pass。
- `npm run dev`：Pass，服务地址 `http://localhost:3000`。
- 浏览器主流程：Pass，一键填充样例后完成画像、题目、答题、报告、复制。
- API 契约冒烟：Pass，profile/questions/report 均返回 `CommonResponse`；TTS 返回音频响应。
- 异常路径：Pass，空输入被拦截；STT 失败后保留文本并允许重试。

## Phase 2 - API 和 AI 生成

- [x] 实现 `/api/profile/parse`
- [x] 实现 `/api/questions/generate`
- [x] 实现 `/api/report/generate`
- [x] 增加 JSON schema 校验
- [x] 增加 LLM 失败兜底和重试

## Phase 2 验证记录 - 2026-06-29

| Module | Acceptance | Result | Evidence |
| --- | --- | --- | --- |
| M03 Profile Parse | B-001, B-002, B-003, B-004 | Pass | `/api/profile/parse` 接入 OpenAI-compatible provider、prompt 和运行时 schema 校验；无 LLM key 时返回演示兜底画像；非法输入返回 `INPUT_INVALID`。 |
| M04 Question Generation | C-001, C-002, C-003, C-004 | Pass | `/api/questions/generate` 接入 provider、prompt 和题目 schema 校验；无 LLM key 时返回 3 道演示兜底题；固定 `q1/q2/q3` 与 `intent/expectedSignals`。 |
| M07 Report Generation | F-001, F-002, F-004, F-005 | Pass | `/api/report/generate` 接入 provider、prompt 和报告 schema 校验；报告校验覆盖 3 份 questionReport、6 个维度分、`copyText` 必须包含“优化答案”和“复盘报告”；缺失答案仍不编造。 |
| LLM Failure Handling | B-002, C-003, F-004 | Pass | 注入不可达 LLM base URL 后，API 返回 `502`、`LLM_PROVIDER_FAILED`、`retryable=true`；前端现有 catch 路径会保留当前输入并使用演示兜底继续。 |
| Schema Failure Handling | B-003, C-004, F-001 | Pass | 运行时 schema 校验可拒绝报告总分/维度分越界，验证结果为 `SCHEMA_REJECTED`。 |

### Phase 2 实际验证

- `npm run typecheck`：Pass。
- API 冒烟：Pass，profile/questions/report 在未配置 LLM 时仍返回契约结构；复制文本包含“优化答案”和“复盘报告”。
- 输入错误：Pass，空简历/JD 返回 `400 INPUT_INVALID`。
- Provider 失败：Pass，临时 3001 服务注入不可达 provider，返回 `502 LLM_PROVIDER_FAILED` 且 `retryable=true`。
- Schema 越界：Pass，`score=101` 或维度分 `21` 被 `validateReportOutput` 拒绝。

## Phase 3 - 语音层

- [x] 将现有 Azure TTS demo 能力接入正式流程
- [x] 保留 Web Speech API fallback
- [x] 增加 STT 录音/识别状态
- [x] 增加 STT 失败重试和手动编辑
- [x] 完成手机 H5 验证

## Phase 3 验证记录 - 2026-06-30

| Module | Acceptance | Result | Evidence |
| --- | --- | --- | --- |
| M06 Voice Layer | E-001, E-002, E-003, E-005 | Pass | 新增 `/api/azure-status`，正式流程可读取 Azure 配置状态和 7 个云端音色；`/api/tts` 支持 `styleId/persona`、`voiceName/voice`、rate/pitch/volume 参数并返回 `audio/mpeg`；未配置或播放失败时前端自动切 Web Speech，文本流程不阻断。 |
| M05 Interview Session voice state | D-001, D-002, D-004, E-004 | Pass | Interview 页接入 Web Speech STT 状态：`recording/success/failed/unsupported/manual`；STT 失败后保留答案文本，可重试识别或继续手动编辑；答案仍按 `questionId` 保存。 |
| TTS Controls | E-001, E-002, E-005 | Pass | 语音控制区包含 TTS 引擎、发音人、语速、音调、音量、播放/停止控制；语音状态只展示 `ttsStatus/sttStatus`，不声称真实波形。 |
| Mobile H5 | G-003, E-003, E-004 | Pass | 浏览器 390x844 viewport 验证：无横向溢出，语音面板可见，STT 按钮和 3 个滑杆存在，文本答题仍可编辑。 |

### Phase 3 实际验证

- `npm run typecheck`：Pass。
- `/api/azure-status`：Pass，返回配置状态、region 和音色列表，不返回密钥。
- `/api/tts`：Pass，使用正式参数调用返回 `200 audio/mpeg`，响应未暴露密钥字段。
- 桌面浏览器主流程：Pass，一键填充样例后进入 Interview；语音控制区含 Azure/Web 引擎、发音人、3 个参数滑杆、播放/停止/STT 开始/重试/失败注入。
- STT 失败路径：Pass，模拟 STT 失败后状态为 `STT: failed`，答案框保留失败前文本。
- 手机 H5：Pass，390x844 viewport 下 `scrollWidth <= viewportWidth`，语音面板宽度正常，无元素横向溢出。
- 浏览器控制台：Pass，无应用 error 日志。

## Phase 4 - 报告和复制

- [x] 实现每题报告卡片
- [x] 实现最终报告
- [x] 实现复制优化答案和复盘报告
- [x] 验证缺失答案和生成失败场景

## Phase 4 验证记录 - 2026-06-30

| Module | Acceptance | Result | Evidence |
| --- | --- | --- | --- |
| M07 Report Generation & Copy | F-001, F-002, F-003, F-005 | Pass | Report 页展示最终报告、Top 风险、行动项和 3 张每题报告卡片；每题包含总分、6 个维度分、风险标签、致命问题、诊断、优化答案、60 秒口述版；复制文本包含“优化答案”和“复盘报告”。 |
| Missing Answer Handling | D-002, F-004, F-005 | Pass | `/api/report/generate` 缺失 q2 时返回 `缺失答案/无法评估证据`，优化答案为“暂无优化答案”；浏览器 0/3 作答生成报告时展示缺失提示和 3 个占位，不编造回答。 |
| Report Failure Handling | F-004 | Pass | 3002 失败注入服务设置不可达 LLM base URL，合法报告 payload 返回 `LLM_PROVIDER_FAILED`、`retryable=true`；前端保留问题和答案，展示重试与“使用演示兜底报告”，兜底后恢复报告页和复制入口。 |
| Copy Handling | F-003, G-002 | Pass | 浏览器一键复制后剪贴板内容 631 字，包含“优化答案”和“复盘报告”；手动触发剪贴板失败兜底时展示可选中文本框和手动复制提示。 |

### Phase 4 实际验证

- `npm run typecheck`：Pass。
- 完整报告 API：Pass，返回 3 份 questionReports、overallScore，`copyText` 同时包含“优化答案”和“复盘报告”。
- 缺失答案 API：Pass，缺失题分数 35，riskTags 包含“缺失答案/无法评估证据”，summary 明确不编造缺失内容。
- 报告生成失败：Pass，隔离端口 `http://localhost:3002` 注入不可达 LLM，接口返回 `502 LLM_PROVIDER_FAILED retryable=true`；浏览器失败态显示保留答案、重试和演示兜底。
- 复制成功：Pass，浏览器主流程生成报告后一键复制成功，剪贴板包含“优化答案”和“复盘报告”。
- 剪贴板失败兜底：Pass，触发失败兜底后显示手动复制文本框并选中复制内容。

## Phase 5 - Design Readiness（5A 已完成；视觉替换迁移到 Phase 9）

- [ ] 接收并审查 Figma 状态覆盖（迁移到 Phase 9）
- [x] 建立 design tokens
- [ ] 替换 setup/interview/report 视觉（迁移到 Phase 9）
- [ ] 桌面端完整验收（迁移到 Phase 9/10）
- [ ] 手机 H5 完整验收（迁移到 Phase 9/10）
- [x] 汇总 Hackathon Demo 操作脚本

## Phase 5A 验证记录 - 2026-06-30

| Module | Acceptance | Result | Evidence |
| --- | --- | --- | --- |
| M08 Design Integration Layer readiness | G-001, G-002 | Pass | `app/globals.css` 已建立颜色、字体、间距、圆角、阴影和布局 token；`docs/09_phase5_design_readiness.md` 明确 Figma 到位后的 token 映射、状态覆盖审查和不改业务契约规则。 |
| Phase/Step Alignment | G-001 | Pass | `docs/09_phase5_design_readiness.md` 回顾早期 Step 1-8 与当前 Phase 0-6 的对应关系，明确早期 Step 6 的真实 LLM 工程接入已在 Phase 2 覆盖，未来 Phase 6 是 Figma 后最终 Demo hardening。 |
| Demo Runbook | A-002, D-002, E-003, E-004, F-003, F-004 | Pass | `docs/10_hackathon_demo_runbook.md` 覆盖 5 分钟标准演示路径、空输入、TTS/STT/LLM/复制失败兜底和 Phase 6 最终验收建议。 |
| Delivery Status Overview | G-001, G-002 | Pass | `docs/11_delivery_status_overview.md` 汇总计划开发内容、已开发内容、待开发内容，并区分无需等待 Figma 与必须等待 Figma 的工作；同时映射 Early Step、Phase 和 M01-M08 模块关系。 |
| PRD Traceability Matrix | A-001 to G-003 | Pass | `docs/12_prd_traceability_matrix.md` 基于 `产品需求文档 - 面试嘴替教练 Hackathon MVP.docx` 抽出 PRD 全量需求表，并映射到当前模块、Phase、实现状态、Figma 依赖和契约差异。 |
| Prompt Handoff | PRD-075 to PRD-079A | Pass | `docs/13_prompt_handoff.md` 暴露 profile/questions/report prompt 的代码位置、产品可调整范围、不可破坏约束和发布前冻结 checklist。 |
| Remaining Phase Instructions | G-001, G-002 | Pass | `docs/14_remaining_phase_instructions.md` 将剩余工作拆为 Phase 6-10，并为每个 Phase 输出执行 instruction、验收步骤、依赖处理和风险。 |

### Phase 5A 实际验证

- `npm run typecheck`：Pass。
- 文档审查：Pass，新增设计准备文档、Hackathon Demo runbook、交付状态总账、PRD traceability matrix、Prompt handoff 和剩余 Phase instruction，未改变 API 契约、状态机和 `tts-demo`。
- PRD 对齐：Pass，已校准 PRD 差异：产品确认当前固定 3 种风格；报告后续流式优先、非流式保底；题目 `weight` 字段、样例自动进入画像、prompt 产品 review、单题复制/重新生成等仍是待决或待做项。
- Figma 状态：Pending，当前尚未收到 Figma；`接收并审查 Figma 状态覆盖`、`替换 setup/interview/report 视觉`、桌面/手机最终视觉验收需等设计稿。

## 后续 Phase 拆分说明

后续以 `docs/14_remaining_phase_instructions.md` 为主执行指令。旧的 “Phase 5B + Phase 6” 已拆成：

| Phase | Name | Figma Dependency | Status |
| --- | --- | --- | --- |
| Phase 6 | Demo Content & Productization | No | Done |
| Phase 7 | Report Streaming & PRD Gaps | No | Done |
| Phase 8 | Demo Operations & Fault Controls | No | Done |
| Phase 9 | Figma Visual Integration | Yes | Pending Figma |
| Phase 10 | Release Freeze & Acceptance | After Phase 6-9 | Pending |

## Phase 6 - Demo Content & Productization

- [x] 将 Demo 样例包产品化为 AI 产品经理实习场景
- [x] 优化样例进入画像的演示顺滑度，保留可编辑路径
- [x] 打磨报告雷区、致命问题、嘴替答案和 60 秒版高光
- [x] 校准 copyText 排版，确保包含“优化答案”和“复盘报告”
- [x] 明确并验证 300 字以内嘴替答案策略
- [x] 更新 PRD traceability 和验证记录

## Phase 6 验证记录 - 2026-06-30

| Module | Acceptance | Result | Evidence |
| --- | --- | --- | --- |
| M02 Demo Scenario Package | A-002, B-002, C-003, F-004 | Pass | `lib/demo/scenario.ts` 已替换为 `ai_pm_intern_hackathon` AI 产品经理实习生场景，覆盖简历/JD、画像、3 道题、口语化样例答案和报告。 |
| M01 Demo Flow Smoothness | A-002, G-001 | Pass | `SetupPanel` 保留“一键填充”可编辑路径，同时新增“填充并生成画像”；浏览器验证可直接进入画像页。 |
| M07 Report Content & Copy | F-001, F-002, F-003, F-005 | Pass | 报告雷区、致命问题、优化答案、60 秒版已围绕 AI 项目、岗位理解和压力追问打磨；copyText 标题包含“优化答案”和“复盘报告”。 |
| Missing / Short Answer Guard | D-002, F-004, F-005 | Pass | `buildFallbackReport` 动态生成 copyText；缺失答案显示“暂无优化答案”且不混入完整样例答案；过短答案标记“回答过短/证据不足/需要补充真实细节”。 |
| Prompt Productization | PRD-075 to PRD-077 | Pass | `lib/prompts/interview.ts` 补充 AI 产品经理题目方向、过短/跑题诊断、300 字以内优化答案和事实边界规则。 |

### Phase 6 实际验证

- `npm run typecheck`：Pass。
- API smoke：Pass，profile/questions/report 返回契约结构；3 份报告均包含 6 个维度、风险标签、致命问题、诊断、优化答案和 60 秒版；优化答案长度为 165/155/150 字。
- copyText：Pass，报告 copyText 和手动复制兜底文本均包含“优化答案”和“复盘报告”。
- 缺失答案：Pass，API 和浏览器均显示“缺失答案/暂无优化答案”，copyText 明确不编造缺失经历，且不包含完整 Demo 嘴替答案。
- 过短答案：Pass，API 返回“回答过短/证据不足/需要补充真实细节”，诊断提示补真实背景、个人动作、结果和边界。
- 浏览器主流程：Pass，使用“填充并生成画像”在 5 分钟内完成 setup -> profile -> questions -> interview -> report；报告页包含风险、优化答案和 60 秒版。
- 复制验证：Pass，in-app browser 阻止系统剪贴板写入时，应用进入剪贴板失败兜底并选中文本；兜底文本长度 657，包含必需标题。
- 控制台检查：Pass，应用 console error 为 0。浏览器工具自身曾出现外部 telemetry timeout，不属于应用日志。

## Phase 7 - Report Streaming & PRD Gaps

- [x] 实现 `/api/report/generate-stream` 或等价流式报告接口
- [x] 前端支持报告生成中增量展示
- [x] 流式失败时保留答案并切非流式 `/api/report/generate` 兜底
- [x] 增加单题复制嘴替答案
- [x] 增加单题重新生成嘴替答案，不清空其他题
- [x] 决定并处理题目 `weight` 字段是否进入 schema
- [x] 增加过短/跑题答案专项诊断验证

## Phase 7 验证记录 - 2026-07-01

| Module | Acceptance | Result | Evidence |
| --- | --- | --- | --- |
| M07 Report Streaming | PRD-027, PRD-072, F-001, F-004 | Pass | 新增 `POST /api/report/generate-stream`，按 SSE 输出 `progress/questionReport/final/error`；`final` 复用 `InterviewReport` schema；非流式 `/api/report/generate` 保留为稳定保底。 |
| Streaming Fallback | PRD-105, PRD-108, F-004 | Pass | 前端报告生成先走流式；流式失败时保留 `questions/answers`，自动尝试非流式报告；失败态仍提供重试、非流式保底和演示兜底。 |
| Single Question Copy | PRD-050, PRD-062, F-003 | Pass | Report 页每题新增“复制优化答案”和“复制 60 秒版”；剪贴板失败时选中对应单题文本，整份报告复制路径不变。 |
| Single Question Regenerate | PRD-028, PRD-063, PRD-089 | Pass | 新增 `POST /api/report/regenerate-question`；前端只替换目标 `questionId` 的 `QuestionReport`，保留其他题报告、answers 和整份报告入口。 |
| PRD Weight Decision | PRD-014, PRD-035 to PRD-037, PRD-073 | Pass | `weight` 暂不进入 schema；`evaluation_focus` 继续由 `expectedSignals` 承载。若产品要求展示/评分权重，后续需先更新 `docs/04_api_contracts.md`、types、schema、demo data 和 prompt。 |
| Short / Off-topic Diagnostics | PRD-053, PRD-054 | Pass | fallback 报告稳定标记“回答过短”和“疑似跑题”，并给保守补充建议，不编造事实。 |

### Phase 7 实际验证

- `npm run typecheck`：Pass。
- `npm run smoke:contract -- http://localhost:3001`：Pass，覆盖 profile/questions/report fallback、SSE progress/questionReport/final、SSE error event、单题重新生成、copyText 标题、缺失答案、过短答案、跑题答案、LLM fault retryable、fallback after fault、TTS fault。
- 流式接口：Pass，`/api/report/generate-stream` 返回 `text/event-stream`，成功路径包含 3 个 `questionReport` 和 1 个完整 `final`。
- 流式失败：Pass，`x-facewall-fault: llm` 下 SSE 返回 retryable `error` event；前端失败态仍保留问题和答案，并可走非流式或演示兜底。
- 单题操作：Pass，`/api/report/regenerate-question` 返回目标 `questionId` 的 `QuestionReport`；Report 页新增单题复制优化答案、复制 60 秒版、重新生成本题。
- 题目 `weight`：Pass，已按 Phase 7 instruction 决定暂不进入 schema，避免隐式破坏当前 API 契约。

## Phase 8 - Demo Operations & Fault Controls

- [x] 增加 dev-only 故障注入开关：LLM、TTS、STT、clipboard
- [x] 增加显式 Mock / Demo fallback 切换能力
- [x] 补 `.env.example`
- [x] 补 README / Quick Start / 部署说明
- [x] 增加本地 contract smoke 脚本或等价验证命令
- [x] 做日志和文档密钥安全检查
- [x] 真实 Azure TTS key 可用时做三风格音色验收

## Phase 8 验证记录 - 2026-07-01

| Module | Acceptance | Result | Evidence |
| --- | --- | --- | --- |
| Dev-only Fault Controls | PRD-105, PRD-108, E-003, E-004, F-004 | Pass | 新增 `Demo Ops` 面板，仅开发环境渲染；支持 LLM/TTS/STT/clipboard 故障注入。浏览器验证 LLM 失败后使用演示画像兜底，STT 失败保留文本，clipboard 失败展示手动复制。 |
| Explicit Demo Fallback | A-002, B-002, C-003, F-004 | Pass | 新增 `x-facewall-demo-mode: force-fallback` 和 `FACEWALL_DEMO_MODE=fallback`；profile/questions/report route 可显式返回演示兜底数据。 |
| Local Ops Docs | PRD-085, PRD-099 | Pass | 新增 `.env.example`、`README.md`，更新 `docs/10_hackathon_demo_runbook.md`，覆盖 Quick Start、部署说明、Demo Ops 和密钥安全规则。 |
| Contract Smoke | PRD-094, PRD-105 | Pass | 新增 `npm run smoke:contract`，覆盖 profile/questions/report、copyText 标题、缺失答案、LLM failure + fallback、TTS failure。 |
| Secret Safety | AGENTS hard boundary | Pass | 新增 `npm run security:check`，扫描源码/文档/脚本/示例 env，不读取 `.env.local`；检查结果通过。 |
| Azure TTS Acceptance | PRD-059, PRD-082 | Pass | `/api/azure-status` 返回 `configured=true`、7 个 voice；三种风格 `strictHr/techBro/gentleSister` 调用 `/api/tts` 均返回 `200 audio/mpeg`，未输出密钥。 |

### Phase 8 实际验证

- `npm run typecheck`：Pass。
- `npm run smoke:contract -- http://localhost:3000`：Pass，覆盖 profile fallback、questions fallback、report schema、copyText 标题、缺失答案、LLM fault retryable、fallback after fault、TTS fault。
- `npm run security:check`：Pass，扫描 50 个源码/文档/脚本/示例文件，明确排除 `.env.local`。
- 浏览器故障注入：Pass，`Demo Ops` 面板存在；LLM 失败后到达画像并显示“已使用演示兜底画像继续”；STT 失败后答案文本保留；clipboard 失败后手动复制文本包含“优化答案”和“复盘报告”；应用 console error 为 0。
- Azure TTS：Pass，真实 Azure 配置可用时，三种风格接口均返回音频响应。
- README 启动口径：Pass，按 README 使用 `npm run dev` 启动本地应用，并使用 smoke/security 命令完成验收。

## Phase 9 - Figma Visual Integration

- [x] 接收并审查 Figma 页面和状态覆盖
- [x] 建立最终 design token 映射
- [x] 替换 setup 视觉
- [x] 替换 profile/questions/interview 视觉
- [x] 替换 report 视觉和对比展示
- [x] 做桌面端最终截图/录屏
- [x] 做手机 H5 最终截图/录屏
- [x] 验证视觉替换未修改状态机、API 契约、schema 和 `questionId`

## Phase 9 验证记录 - 2026-07-01

| Check | Result | Evidence |
| --- | --- | --- |
| Figma Coverage Review | Partial Pass | 新 Figma 链接可访问；画布可见 `home/input/Select/interview/Report` happy path。未明确看到独立 profile/questions 页面和 loading/error/empty/unsupported/copy success/copy failed 全量异常态，已按现有契约保留最小可用状态承载。 |
| Design Token Mapping | Pass | `app/globals.css` 已将颜色、字体、间距、圆角、阴影和动效映射为深色紫粉视觉方向；未改 API/schema/type。 |
| Setup Visual Integration | Pass | Setup 保留简历/JD textarea、TXT/PDF/DOCX 上传解析、一键填充、填充并生成画像、三种面试官风格；视觉替换为深色卡片和高亮 CTA。 |
| Profile / Questions Visual Integration | Pass | Profile 保留候选人画像、简历/JD 原文、sourceMatches 高亮、匹配原因和置信度；Questions 保留 3 题、intent、expectedSignals 和进入答题入口。 |
| Interview Visual Integration | Pass | Interview 保留 TTS/STT 控制、失败重试、手动编辑、答案保留；`VoiceControls` 新增状态驱动头像和声波视觉，不改变语音逻辑。 |
| Report Visual Integration | Pass | Report 保留流式生成、非流式兜底、整份复制、单题复制、单题重新生成、剪贴板失败兜底；报告卡片和分数展示改为深色视觉。 |
| Desktop / Mobile Evidence | Pass | 已保存 `outputs/phase9/desktop-setup.png`、`outputs/phase9/mobile-report.png`；浏览器桌面完整跑通 setup -> profile -> questions -> interview -> report。 |
| Mobile H5 | Pass | 390x844 viewport 下 setup 和 report 均为 `scrollWidth=375`、`viewportWidth=375`，无横向溢出，长文本和按钮不重叠。 |

### Phase 9 实际验证

- `npm run typecheck`：Pass。
- `npm run smoke:contract -- http://localhost:3001`：Pass，覆盖 profile sourceMatches、questions、report schema、SSE、单题重新生成、copyText、缺失/过短/跑题、LLM/TTS fault。
- `npm run smoke:file-parse -- http://localhost:3001`：Pass，覆盖 TXT、DOCX、PDF 解析。
- `npm run security:check`：Pass，扫描 56 个源码/文档/脚本/示例文件，明确排除 `.env.local`。
- `npm run build`：Pass。
- 浏览器主流程：Pass，使用“填充并生成画像”走到报告页；Report 包含 3 道题报告、优化答案、60 秒版、整份复制和单题操作。
- Figma 缺口：异常态和 profile/questions 独立视觉未在画布中明确覆盖，当前按合同保留现有最小状态 UI；Phase 10 需记录为 Known Risk 或由设计补齐。

## Phase 10 - Release Freeze & Acceptance

- [ ] 暴露 profile/questions/report prompt 给产品 review，并冻结发布版本
- [ ] 使用真实 LLM key 跑三种面试官风格端到端验收
- [ ] 对真实输出做 prompt 质量抽查和必要微调
- [ ] 故障注入复验：LLM、TTS、STT、clipboard
- [ ] 检查日志和页面不暴露 `.env.local` 真实密钥
- [ ] 汇总最终 Hackathon Demo 交付记录
- [ ] 明确 Deferred / Known Risks

## Preview / Internal Review 本地验收记录 - 2026-07-01

| Check | Result | Evidence |
| --- | --- | --- |
| Static / Build | Pass | `npm run typecheck`、`npm run security:check`、`npm run build` 均通过；安全扫描 53 个源码/文档/脚本/示例文件，不读取 `.env.local`。 |
| Contract Smoke | Pass | `npm run smoke:contract -- http://localhost:3000` 通过，覆盖 profile/questions/report、SSE、单题重新生成、copyText、缺失/过短/跑题、LLM/TTS fault。 |
| Desktop Demo Flow | Pass | 浏览器从 setup -> profile -> questions -> interview -> report 完整闭环；报告包含 3 个致命问题、优化答案和 60 秒版。 |
| Copy Fallback | Pass | in-app browser 阻止剪贴板写入时进入手动复制兜底；兜底文本 657 字，包含“优化答案”和“复盘报告”；应用 console error 为 0。 |
| Fault Controls | Pass | `Demo Ops` 可清空控制；LLM 失败后进入演示兜底画像；STT 失败后保留答案文本，并显示可重试/手动编辑提示。 |
| Mobile H5 | Pass | 390x844 viewport 下完整报告页 `scrollWidth=375`、`viewportWidth=375`，无横向溢出，报告和复制入口可见。 |
| Azure TTS | Pass with transient retry | `/api/azure-status` 返回 `configured=true`、7 个 voice 且无敏感字段；三风格 TTS 复跑均返回 `200 audio/mpeg`。首次 `strictHr` 曾出现一次瞬时 502，重试恢复，Preview 需保留 Web Speech/文本兜底。 |

### Preview 结论

- 可以发布为 **Preview / Internal Review** 低保真版本，供产品调 prompt、验证 Demo 样例、报告文案和 copyText。
- 不建议标为最终正式 Demo；Phase 9 Figma 视觉替换和 Phase 10 prompt 冻结/真实 LLM 三风格人工质量抽查仍未完成。
- 发布云端前需在平台环境变量中配置真实 key，不上传 `.env.local`；云端部署后复跑 `npm run smoke:contract -- <preview-url>` 或等价接口验收。

## Profile 源文本匹配展示记录 - 2026-07-01

| Check | Result | Evidence |
| --- | --- | --- |
| Demo Text Source | Pass | 默认按钮文案、默认简历和默认 JD 均来自 `lib/demo/scenario.ts` 的 `demoScenario.label/resumeText/jdText`。 |
| Profile Source Review | Pass | Profile 页新增“简历 / JD 匹配来源”，展示本次生成画像所使用的简历和 JD 原文。 |
| Match Highlight | Pass | 基于 `CandidateProfile.keywords/matchedPoints/evidenceMaterials` 提取可在原文命中的词语或短语；简历命中和 JD 命中使用不同颜色，并过滤纯数字片段。 |
| Verification | Pass | `npm run typecheck` 和 `npm run smoke:contract -- http://localhost:3000` 均通过；浏览器验证 Profile 页出现两列原文和命中高亮。 |

## Phase 9 Home 视觉细调记录 - 2026-07-02

| Check | Result | Evidence |
| --- | --- | --- |
| Home layer mapping | Updated | `theme=figma` 的 home 页已按 Figma layer 语义拆为页面底图、`home / Comp` 圆球、`toolbar` 文本输入区、`toolbar / frame4 / frame1` 上传按钮、`toolbar / frame4 / group1` Continue 按钮。 |
| Asset slots | Ready | 新增 `public/figma/home/README.md`，约定 `home-bg@2x.png`、`comp@2x.png`、`toolbar@2x.png`、`frame4-frame1-upload@2x.png`、`frame4-group1-continue@2x.png`；素材缺失时保留 CSS fallback。 |
| Business flow | Preserved | Resume textarea、TXT/PDF/DOCX 上传解析、一键 demo resume、Continue 到 JD 的流程均保留；未改 API、schema、状态机、LLM/STT/TTS/report 逻辑。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200；浏览器点击 `Use demo resume` 后进入 `Input JD` 页。 |
| Next visual step | Pending | 继续按页面逐个核对 `input jd`、`profile`、`select interviewer`、`select interviewer_2`、`interview`、`report`，并替换真实 2x 导出素材。 |

## Phase 9 Home 首屏素材替换准备 - 2026-07-02

| Check | Result | Evidence |
| --- | --- | --- |
| Home first screen alignment | Pass | `theme=figma` 下隐藏开发视觉切换入口，手机容器调整为截图同等首屏比例；488x976 viewport 验证卡片 `428x928`、顶部 `24px`、球体 `207px`、输入卡底部 `924px`，无横向溢出。 |
| Figma asset override | Ready | Home 底图改为独立 `<img>` 覆盖层，`home / Comp 1024 1` 改为独立图片层；真实素材加载成功前保持透明，缺失时继续使用 CSS fallback，不显示破图。 |
| Asset naming | Updated | `public/figma/home/README.md` 已将圆球素材名更新为 `comp-1024-1@2x.png`，与 Figma layer `home / Comp 1024 1` 对齐；`home-bg@2x.png` 仍为首页底图槽位。 |
| Verification | Pass | `npm run typecheck` 通过；浏览器点击 `Use demo resume` 后进入 `Input JD` 页，`scrollWidth=viewportWidth=488`。 |
| Pending asset | Needs design export | 当前仓库仍没有真实 Figma 导出图片，`home-bg@2x.png` 和 `comp-1024-1@2x.png` 请求返回 404；需从 Figma 导出后放入 `public/figma/home/` 才能完成精确替换。 |

## Figma MCP Home 资源接入记录 - 2026-07-02

| Check | Result | Evidence |
| --- | --- | --- |
| Figma MCP access | Pass | 已安装并授权 Figma 插件；`_get_metadata` 成功读取文件 `KHsM48fpnCB2sDEQma4BRZ` 的 home 节点 `49:483`。 |
| Home node mapping | Pass | Figma metadata 确认 `Comp 1024 1` 节点为 `49:486`，`ToolBar` 节点为 `72:535`，home frame 尺寸为 `375x812`。 |
| Comp asset replacement | Pass | 使用 Figma MCP `_get_screenshot` 导出 `49:486`，保存为 `public/figma/home/comp-1024-1@2x.png`；首页球体容器改为按 Figma 节点比例显示，加载成功后不叠加 CSS fallback 球体。 |
| Home background replacement | Pass | 使用 Figma MCP 导出 `home / Ellipse 2` 背景层 `49:484`，保存为 `public/figma/home/ellipse-2@2x.png`；`figma-home-card` 底色改为 Figma `#161316`，并移除原 CSS 紫色径向渐变和中心辅助线。 |
| Remaining alignment | Pending | Home 首屏背景已对齐 Figma 图层来源；后续需继续按 Figma 坐标微调状态栏、文案、Toolbar 尺寸和交互控件位置。 |

## Figma Home Toolbar 交互细调 - 2026-07-02

| Check | Result | Evidence |
| --- | --- | --- |
| Toolbar sizing | Pass | Home resume 输入区改为 Figma `home_2 / ToolBar` 比例：343x119、16px padding、Frame4 311x33；去掉 `Your resume` 和内层黑色输入框，textarea 直接挂在 toolbar 上。 |
| Upload collapsed state | Pass | 初始上传入口改为 32x32 圆形加号按钮，对齐 `home_2 / ToolBar / Frame 4 / Frame 3` 的左侧位置；不再显示 `Upload resume` 文字按钮。 |
| Upload expanded state | Pass | 点击加号后原位置展开为关闭、微信上传、文件上传三段：关闭恢复加号；微信上传复用原 `Use demo resume` 行为；文件上传拉起原 TXT/PDF/DOCX 文件解析流程。 |
| Continue control | Pass | Continue 改为右侧 32x32 圆形箭头按钮，对齐 `home_2 / ToolBar / Frame 4 / Group 1`；继续保留“简历为空时不可继续”的业务约束。 |
| Verification | Pass | `npm run typecheck` 通过；未修改 API、schema、状态机和文件解析接口。当前浏览器工具被标记不可访问本地页面，未做浏览器截图复验。 |

## Figma Home Toolbar 坐标修正 - 2026-07-02

| Check | Result | Evidence |
| --- | --- | --- |
| 2x asset coordinate handling | Pass | 从 Figma 2x 导出的 `面壁者/home.png` 按 metadata 坐标裁出完整 `Frame4 / Frame1` 和 `Frame4 / Group1`：源图使用 2x 坐标裁 64x64，页面按 CSS 32x32 渲染。 |
| Toolbar placement | Pass | `figma-home-toolbar` 改为按 Figma 375x812 画板绝对定位：`left: 16px; top: 643px; width: 343px; height: 119px`，不再受父级 padding/content flow 影响。 |
| Button rendering | Pass | 收起态上传按钮和 Continue 按钮直接显示完整 Frame PNG：`frame4-frame1-upload@2x.png`、`frame4-group1-continue@2x.png`；移除额外手写字符图标和额外背景叠加。 |

## Figma Home 1x 画板策略修正 - 2026-07-02

| Check | Result | Evidence |
| --- | --- | --- |
| Canvas scale decision | Pass | Home 竖版按 Figma 逻辑画板 `375x812` CSS 像素渲染；`@2x` 只作为图片素材倍率，不把页面本身放大到 `750x1624`。 |
| Comp restoration | Pass | `Comp 1024 1` 恢复为半透明 Figma 节点导出资源 `public/figma/home/comp-1024-1@2x.png`，页面按 `left:-22px; top:136px; width:420px; height:236px` 渲染。 |
| Toolbar scale | Pass | Toolbar、Frame4、Frame1、Group1 和展开态按钮组均恢复 1x CSS 坐标；`npm run typecheck` 通过。 |

## Figma Home 效果图对齐修正 - 2026-07-02

| Check | Result | Evidence |
| --- | --- | --- |
| Copy alignment | Pass | Home 首屏文案改为效果图口径：`Hey Dark !`、Lili 介绍文案和上传说明；去掉旧的 `AI INTERVIEW COACH / Hey Dick?`。 |
| Comp rendering | Pass | `comp-1024-1@2x.png` 从 `面壁者/home_2.png` 按 2x 源图裁出，页面仍按 420x236 CSS 像素渲染；图片使用 `mix-blend-mode: screen` 避免黑底矩形遮住背景。 |
| Background rendering | Pass | 移除不存在的 `home-bg@2x.png` 图片层，保留 Figma `Ellipse 2` 背景层和 `#161316` 底色，避免 404 和隐藏背景层干扰。 |
| Verification | Pass | `npm run typecheck` 通过；未修改 API、schema、状态机和上传解析流程。 |

## Figma Home 球体和输入控件对齐 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Orb placement | Pass | `comp-1024-1@2x.png` 从 `面壁者/home.png` 收紧裁切为 `560x480` 2x 素材，页面按 `left:48px; top:126px; width:280px; height:240px` 渲染，让球心对齐 375 画板水平中线。 |
| Toolbar icon sizing | Pass | 上传加号和提交箭头均重新从 `home.png` 裁为 `64x64` 2x 素材，页面按 `32x32` CSS px 渲染；不再使用带额外空白导致视觉变小的旧裁图。 |
| Text cursor focus | Pass | Home toolbar textarea 聚焦时取消 `focus/focus-visible` 描边和阴影，隐藏原生 1px caret，改为自定义 `3px` 宽、`22px` 高、`#5f4fff` 的蓝紫色光标。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 仍返回 200。 |

## Figma Home 节点图和 Cursor 渐变修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Node asset restoration | Pass | `comp-1024-1@2x.png` 已替换为用户提供的节点透明图 `Image.png`，资源尺寸 `375x236`、左上角 alpha 为 `0`；移除 `mix-blend-mode`，不再使用整页截图裁图。 |
| Orb placement | Pass | 节点图按 `left:18px; top:152px; width:340px; height:214px` 渲染，透明内容实际约 `214x210` CSS px，水平居中。 |
| Cursor gradient | Pass | 自定义光标从 `3px` 改为 `2px` 宽，保留 `22px` 高，并改为 `#2fa7ff -> #5f4fff -> #de7cff` 纵向渐变。 |
| Cache busting | Pass | Home 球体、上传按钮、提交按钮资源 query 更新为 `v=2026070302`，避免浏览器继续使用旧图。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 和 `/figma/home/comp-1024-1@2x.png?v=2026070302` 均返回 200。 |

## Figma Home 按钮视觉放大和 Cursor 闪烁 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Toolbar icon visual size | Pass | 上传加号和提交箭头素材仍为 `64x64` 2x，但素材可见圆形约 `43x43`；页面渲染盒从 `32x32` 调整为 `48x48` CSS px，实际可见圆形约从 `21.5px` 放大到 `32px`。 |
| Expanded upload controls | Pass | 展开态关闭按钮同步改为 `48x48`，两枚上传 pill 改为 `96x48`，保持 Frame4 总宽 `248px`。 |
| Cursor blink | Pass | 自定义 cursor 保持 `2px x 22px` 和纵向渐变，新增 `figma-caret-blink`，按 `1s steps(1, end)` 闪烁，不再常驻显示。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Home Toolbar 按钮层级和边距修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Button dimming | Pass | 右侧提交按钮不再继承全局 `button:disabled { opacity: 0.48 }` 的灰态；Figma 图像按钮显式设置 `opacity: 1`、`filter: none`，禁用时只保留不可点击语义。 |
| Button edge spacing | Pass | 两张按钮素材 alpha 可见区域均为 `0..42 / 64px`，透明边集中在右下角；左侧上传按钮保持贴左，右侧提交按钮图像向右补偿 `16px`，让可见圆形边缘与 toolbar 左右边缘保持接近一致的 `16px` 间隙。 |
| Toolbar layout | Pass | `figma-toolbar-frame4` 改为 toolbar 内绝对定位 `left/right/bottom: 16px`，按钮层级提升到 `z-index: 3`，不再受输入文字层或 grid flow 影响。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://localhost:3000/?theme=figma`、上传按钮资源和提交按钮资源均返回 200。 |

## Figma Home Toolbar 展开态尺寸和垂直位置修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Collapsed button vertical position | Pass | 收起态上传和提交图片内部统一下移 `16px`；提交图标保留横向 `16px` 补偿，最终为 `translate(16px, 16px)`，使可见圆形贴近输入框底部。 |
| Expanded controls sizing | Pass | 展开态关闭按钮改为 `32x32`，微信上传和文件上传改为 `104x32`，高度与当前 `+` 按钮的可见圆形高度保持一致。 |
| Expanded controls baseline | Pass | 展开态菜单仍占 `248x48` 的 Frame4 槽位，但内部按钮 `align-items: end`，实测关闭/微信/文件按钮均为 `y=771, height=32, bottom=803`，与收起态可见按钮底线一致。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://localhost:3000/?theme=figma` 返回 200；浏览器 440x928 viewport 点击 `+` 后截图确认展开态按钮尺寸降低并下对齐。 |

## Figma Home Toolbar Hover、上传文案和系统时间修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Collapsed hover | Pass | 收起态 `+` 和提交箭头覆盖全局 `button:hover`，不再出现白色背景框、边框变化或上移；同时去掉这两个图像按钮的 `focus-visible` 外框。 |
| Expanded hover | Pass | 展开态关闭、`UseDemoCV` 和文件上传统一使用 `rgba(255, 255, 255, 0.16)` hover 背景；文件上传 label 单独补充 hover 选择器，避免只有 button 有悬停反馈。 |
| Upload labels | Pass | 原“微信上传”改为 `UseDemoCV` 且移除左侧图标；文件上传保留中文文案，并将不清晰的字符图标替换为 `16x16` CSS 文件图标。 |
| Navigation time | Pass | Home 和 JD 顶部左侧时间从硬编码 `9:41` 改为客户端系统时间，首次挂载后立即刷新，并每 `30s` 更新一次。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://localhost:3000/?theme=figma` 返回 200；浏览器截图确认顶部时间显示当前时间、展开态显示 `UseDemoCV` 和新文件图标。 |

## Figma Home UseDemoCV 行为和 File 图标资源修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Figma file icon | Pass | 因 Figma MCP 达到调用额度上限，改用同源 2x 导出 `面壁者/home_2.png` 裁出 `home_2 / toolbar / frame4 / frame3 / frame2 / file` 图标，并生成透明资源 `public/figma/home/frame4-frame3-frame2-file@2x.png`；图标 alpha 可见区域为 `24x24`。 |
| File icon rendering | Pass | 文件上传按钮从 CSS 临摹图标改为直接引用 `/figma/home/frame4-frame3-frame2-file@2x.png?v=2026070303`，按 `16x16` CSS px 显示。 |
| UseDemoCV behavior | Pass | 点击 `UseDemoCV` 只将 mock 简历填入当前输入框，不再自动进入 JD；填充后展开菜单关闭，恢复为原 `+` 按钮样式，右侧提交按钮变为可用。 |
| Hover consistency | Pass | `UseDemoCV` 和文件上传继续共用 `.figma-frame4-pill-button:hover` 的高亮背景，保持 hover 效果一致。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://localhost:3000/?theme=figma` 和新 file 图标资源均返回 200；浏览器点击验证填入 `214` 字 mock 简历后仍停留 Home，`menuOpen=false`、`plusVisible=true`、`continueDisabled=false`。 |

## Figma Home Textarea 换行和 Hover 抖动修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Resume textarea wrapping | Pass | Home resume textarea 从 `22px` 单行区域改为 `42px` 可换行区域，`white-space: pre-wrap`、`overflow-wrap: anywhere`，隐藏滚动条但允许内部纵向滚动。 |
| Custom caret wrapping | Pass | 自定义 cursor 覆盖层同步改为 `42px` 高，并使用 `pre-wrap` / `overflow-wrap: anywhere`，避免与 textarea 包装规则不一致。 |
| UseDemoCV hover specificity | Pass | 展开态 hover 规则增加 `.figma-home-toolbar` 作用域，specificity 高于全局 `button:hover:not(:disabled)`，覆盖全局 `transform: translateY(-1px)`，避免鼠标悬停抖动并保留高亮背景。 |
| Verification | Pass | `npm run typecheck` 通过；浏览器点击 `UseDemoCV` 后实测 `scrollWidth=clientWidth=309`、`scrollHeight=242`、`whiteSpace=pre-wrap`、`overflowWrap=anywhere`，截图确认文本已自动换行。 |

## Figma Home Textarea 动态 3 行扩容 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Dynamic row measurement | Pass | Home resume textarea 使用真实 `scrollHeight` 测量内容行数，默认最少 `2` 行，最多扩到 `3` 行，不按字符数猜测。 |
| Toolbar expansion | Pass | 当内容需要 3 行时，toolbar 增加 `data-resume-rows=3`，输入区从 `42px` 扩到 `66px`；toolbar 从 `119px` 扩到 `151px` 并向上移动，底部位置保持不变。 |
| Button stability | Pass | 3 行扩容后 `Frame4` 仍固定在 toolbar 底部，浏览器实测右侧按钮 `y=755, bottom=803` 与 2 行状态一致。 |
| Verification | Pass | `npm run typecheck` 通过；浏览器点击 `UseDemoCV` 后实测 `rows=3`、`textarea.clientHeight=66`、`toolbar.height=151`、`toolbar.bottom=820`，截图确认显示 3 行文本。 |

## Figma Home Cursor 默认位置修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Empty caret offset | Pass | 空输入聚焦时，自定义 cursor 不再使用透明的 `您好` 占位文本做偏移，改为空字符串；placeholder 仍由 textarea 自己显示。 |
| Caret alignment | Pass | 浏览器实测空态聚焦后 `caretLeft=textareaLeft=65.5`，offset 为 `0`，cursor 位于输入区域左上方文字左侧。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://localhost:3000/?theme=figma` 返回 200；浏览器截图确认 cursor 不再空出两个中文字宽度。 |

## Figma Home 主体内容安全区上移 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Main content shift | Pass | Home 主体内容组整体上移 `32px`：`Comp 1024 1` top 从 `152px` 调到 `120px`，文案 top 从 `372px` 调到 `340px`，toolbar top 从 `643px/611px` 调到 `611px/579px`。 |
| Bottom safe area | Pass | 2 行和 3 行状态下 toolbar 底部都同步上移，浏览器实测 3 行状态 toolbar bottom 为 `788px`，距卡片底部 `82px`，为 iOS 截图底部默认区域预留更多空间。 |
| Top notch spacing | Pass | 状态栏位置不动；浏览器实测状态栏底部到球容器顶部还有约 `87px`，顶部仍保留刘海/状态栏安全距离。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://localhost:3000/?theme=figma` 返回 200；浏览器 440x928 viewport 截图确认红框主体上移且底部留白增加。 |

## Figma Home 简历输入校验和 Cursor 间距修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Empty resume guard | Pass | Home 右侧提交按钮取消禁用态，空输入点击后不进入 JD，输入框下方显示红字 `请输入个人简历，至少需要100字`。 |
| Short resume guard | Pass | 简历按去空白字符计数，少于 `100` 字时留在 Home，并显示 `个人简历至少需要100字，当前X字`；用户继续编辑后错误文案实时更新，达标后清空。 |
| Cursor spacing | Pass | 自定义 cursor 仍为 `2px` 宽渐变闪烁；textarea 和 overlay 显式统一 `font-family/line-height/letter-spacing`，caret 左间距从 `2px` 调为 `4px`，避免视觉上压住前一个字。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Home Cursor 左贴边修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Cursor edge placement | Pass | 自定义 cursor 不再使用正向 `margin-left` 推到字符内部，改为 `margin-left: 0` 并 `translateX(-2px)`，让 2px cursor 的右边缘贴近当前文字外沿左侧。 |
| Verification | Pass | `npm run typecheck` 通过。 |

## Figma Input JD 首屏复用 Home 视觉 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| JD frame reuse | Pass | `theme=figma` 下 JD 步骤改为复用 Home 的 `375x812` 卡片、`Ellipse 2` 背景和 `Comp 1024 1` 球体资源，不再使用旧的独立 `figma-orb-small` 页面结构。 |
| JD copy alignment | Pass | JD 中间文案替换为 `已经知悉了您的过往 ...` 和 `请输入您的意向 JD，以便我给您匹配合适的面试官。`，并按截图位置单独覆盖 `figma-jd-card .figma-copy`。 |
| JD input toolbar | Pass | JD 底部输入改为 Home 同风格深色圆角输入条，保留自定义 cursor，右侧箭头在 JD 有内容时继续调用现有 `onStart` 进入画像生成。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Input JD Toolbar 复用和返回按钮修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Toolbar reuse | Pass | JD 输入页移除上一版单行 pill 覆盖，改为直接复用 Home 的 `figma-home-toolbar`、`figma-toolbar-frame4`、`+` 展开态、文件上传和右侧箭头结构。 |
| Demo JD fill | Pass | JD 展开菜单的演示按钮改为 `UseDemoJD`，点击只填入 `demoScenario.jdText` 并关闭展开菜单，不自动跳转。 |
| Back button | Pass | 返回按钮从文字字符箭头改为 CSS chevron 圆形按钮，避免不同字体渲染导致样式不对。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Input JD 中间文案位置和字体修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Copy position | Pass | JD 中间文案容器从继承 Home 的 `left: 24px` 调整为 `left: 34px`，整体向右收紧，减少视觉偏左。 |
| Typography parity | Pass | JD 标题改回和 Home 一致的 `font-family: var(--font-sans)`、`32px`、`font-weight: 500`、`line-height: 1.28`；正文使用同字体、`16px` 和 Home 的 `1.38` 行高。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Input JD 字数校验 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| JD length guard | Pass | JD 页右侧箭头点击时按去空白字符检查 `jdText`，少于 `100` 字时留在当前页并显示红字 `请输入职位介绍，至少需要100字`。 |
| Error priority | Pass | JD 校验错误复用 Home 输入框下方红字样式，并优先于 JD 文件上传状态展示；用户继续编辑后实时清除或保持提示。 |
| Demo JD | Pass | `UseDemoJD` 填入 `demoScenario.jdText` 后同步刷新校验状态，不自动跳转。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Candidate Profile 竖版框架接入 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Vertical frame reuse | Pass | `theme=figma` 下候选人画像页新增 `FigmaProfilePanel`，复用 Home 的 `375x812` 竖版卡片、`Ellipse 2` 背景、状态栏和 `Comp 1024 1` 球体资源；球体缩小并上移为页面氛围层。 |
| Profile data reuse | Pass | 页面内容直接使用现有 `CandidateProfile` 数据：摘要、匹配点、风险点、关键词数量、`sourceMatches` 和补充建议；不改变画像 API、题目生成或后续状态机。 |
| Frame15-style source review | Pass | `对比简历 / JD 匹配来源` 使用暗色圆角卡片、双列摘要和匹配证据堆叠，近似 Figma `Frame 15` 的深色信息块风格；若需像素级还原，后续需提供 Frame15 节点 id 或导出图。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Candidate Profile Frame15 Tab 切换 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Frame node reference | Noted | 用户提供 Figma frame 节点参数 `node-id=116-776&t=8Neiy6Ownbxg2WeG-0`，当前先按截图实现 tab 样式，未额外调用 Figma MCP。 |
| Source tabs | Pass | `对比简历 / JD 匹配来源` 改为两段式 tab：`简历` 和 `JD`，点击切换对应原文和匹配证据；当前只保留两个 tab 页。 |
| Tab styling | Pass | Tab bar 采用深色圆角容器、居中分隔线和 active 深色高亮，近似截图中的 `Q1/Q2/Q3` 顶部切换样式。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Candidate Profile 顶部标题和底部确认按钮修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Header title | Pass | 候选人画像页左上角标题字号从 `14px` 放大到 `18px`、字重 `700`，更接近截图强调效果。 |
| Bottom action | Pass | 右上 `Next` 文本按钮移除，改为页面右下角固定对勾按钮；按钮使用用户提供的 `node-id=81-662&t=8Neiy6Ownbxg2WeG-0` 作为样式参考，按钮内不写文字，只显示对勾。 |
| Frame palette | Pass | 候选人画像页信息卡片、风险、建议和匹配来源卡片统一为 `node-id=116-776&t=8Neiy6Ownbxg2WeG-0` 截图风格的暗紫黑配色，移除原绿色建议卡。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Candidate Profile Source Tab 节点样式校准 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Node references | Noted | 用户提供 Q1/Q2/Q3 tab 节点 `115-760`、`115-761`、`115-762`；尝试读取 Figma metadata 时触发当前 View seat MCP 调用额度上限，因此本轮按截图近似校准。 |
| Tab dimensions | Pass | `figma-source-tabs` 高度从 `42px` 调为 `34px`，背景改为 `#2b2734`，active 背景改为 `#17131d`，更接近节点截图里的紧凑暗色顶部 tab。 |
| Tab shape | Pass | active tab 使用底部反向圆角，右侧 tab 保留 `16px` 右上圆角和中间分隔线，适配当前只有 `简历/JD` 两个 tab 的业务结构。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Candidate Profile 刘海安全区和底部 CTA 修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Duplicate hero title | Pass | 候选人画像页内容区移除重复的 `Profile` 和大号 `候选人画像`，保留顶部导航标题与画像摘要，避免首屏文字重复。 |
| Notch spacing | Pass | 画像页状态栏、导航、球体和滚动内容整体下移，为刘海屏顶部预留更稳妥的安全距离。 |
| Bottom CTA | Pass | 底部按钮按 `node-id=81-662&t=8Neiy6Ownbxg2WeG-0` 截图参考调整为居中紫色胶囊按钮，文案为 `开始面试`。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Candidate Profile 数据来源和底部按钮流式位置修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Profile data source | Confirmed | 画像摘要、匹配点、风险点、关键词数量、补充建议和匹配来源均来自 `CandidateProfile`；LLM 可用时由 `/api/profile/parse` 生成，LLM 未配置、强制 demo 或接口失败时使用 `demoScenario.candidateProfile` 兜底。 |
| Static labels | Noted | `匹配概览`、`核心匹配`、`面试风险`、`建议补充` 等为 UI 区块标题，当前写死在组件中；具体内容列表不写死。 |
| Bottom check button | Pass | 候选人画像页 CTA 从绝对定位悬浮层移入滚动内容底部，按钮仅在滚到页面最下方时出现；按钮内容恢复为单独对勾。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Candidate Profile Source Tab 吸附修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Frame label cleanup | Pass | `对比简历 / JD 匹配来源` 上方的设计标注 `Frame 15` 已从页面 UI 移除。 |
| Sticky source tabs | Pass | `简历 / JD` tab 改为滚动容器内 sticky；当该 tab 滚动到球体下方的内容区顶部时锁定吸附，继续用于切换来源内容。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Candidate Profile 顶部导航居中和返回 JD - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Center title | Pass | 候选人画像页顶部标题改为水平居中展示，不再贴左。 |
| Back to JD | Pass | 画像页左侧新增返回按钮，复用 input JD 页 `.figma-jd-back-button` 的圆形 chevron 样式；点击后回到 Figma setup 的 JD 输入页并保留已输入 JD。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Candidate Profile Source Tab 节点色值校准 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Node references | Pass | 使用用户补充的 `Rectangle 1 node-id=114:762` 和 `Rectangle 2 node-id=114:764` 参数校准 source tab：主底色 `#322E38`，非激活块 `#28252D`，高度 `54px`。 |
| Text style | Pass | `简历 / JD` tab 文本按 Report Page_2 的 `Q1/Q2/Q3` 节点参考调整为 `18px`、`PingFang SC` 对应的 `var(--font-sans)`、`font-weight: 500`、白色。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Candidate Profile Source Tab 斜切形状修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Active tab shape | Pass | `简历 / JD` active tab 不再使用硬矩形等分，改为横向外扩并通过 `clip-path` 形成 Figma Q1/Q2/Q3 截图里的斜切过渡。 |
| Rounded corners | Pass | tab 容器和左右端点改为 `14px` 顶部圆角，保留 `#322E38 / #28252D` 节点色值。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Candidate Profile 横向卡片圆角和统计色彩修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Horizontal card radius | Pass | 核心匹配、面试风险、来源卡片和建议补充等横向信息框统一改为 `16px` 圆角；统计三卡保留更紧凑的 `8px` 圆角。 |
| Metric emphasis | Pass | `匹配点 / 风险点 / 关键词` 文案和数字改为低饱和分色：绿色、粉红、紫蓝，增强识别度并保持暗紫整体风格。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Candidate Profile Tab 状态和字体体系修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Tab state contrast | Pass | `简历 / JD` tab 选中态改为更亮的 `#4B4554`，未选中保持 `#28252D` 并降低文字透明度，选中和未选中区分更明显。 |
| Diagonal direction | Pass | JD 选中时的斜切边改为与简历选中时同向，不再反向变化。 |
| Source text height | Pass | `候选人简历 / 目标 JD` 原文卡去掉固定 `max-height` 和内部滚动，改为根据文字内容自然撑高。 |
| Typography scale | Pass | 候选人画像页统一字体体系：正文和卡片说明整体上调约 2px，section 标题、统计 label 和数字同步增强。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Candidate Profile Source Tab 全宽和层级校准 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Figma reference | Pass | 复查 `面壁者/figma_Report_Page_2_2026-07-03T08-08-14-401Z.json`：`Rectangle 1 node-id=114:762` 为全宽 `375px`、底色 `#322E38`；`Rectangle 2 node-id=114:764` 为 `x=112 width=263 height=54`、底色 `#28252D`；`Q1/Q2/Q3` 文本为 `18px PingFang SC Medium`。 |
| Tab width | Pass | `figma-source-tabs` 从内容区 `327px` 改为 `calc(100% + 48px)` 并 `margin: 0 -24px`，滚动内容仍保留左右 24px padding，但 tab 本体铺满 375px 手机卡片宽度。 |
| Shape layering | Pass | tab 形状改为父容器 `#322E38` base/active 层，`::before` 绘制 `#28252D` inactive 斜切层；按钮背景透明，仅承载文字和交互，避免 active 按钮外扩导致文字中心偏移。 |
| Typography consistency | Pass | source 原文和匹配证据正文从 `14px` 提升到 `15px`、`line-height: 1.5`，和候选人画像页正文体系保持一致。 |
| Verification | Pass | `npm run typecheck` 通过；重启 `npm run dev` 后 `GET http://127.0.0.1:3000/?theme=figma` 返回 200。浏览器扩展截图验证时受到扩展自身 Statsig 网络重试干扰，未作为最终证据。 |

## Figma Candidate Profile Source Tab 斜线居中微调 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Diagonal position | Pass | 根据截图反馈，将 source tab inactive 斜切层起点从 `30%` 调整为 `42%`，斜线视觉中心更接近 `简历 / JD` 两段 tab 的中线。 |
| Scope | Pass | 仅调整 `.figma-source-tabs:has(...)::before` 的左右偏移，不改业务状态、tab 文案、数据来源或 API 契约。 |
| Verification | Pass | `npm run typecheck` 通过。 |

## Figma Candidate Profile Source 内容卡 Frame12 样式校准 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Frame12 typography | Pass | 按用户提供 JSON 的 `Frame 12` 规格调整 source 原文卡：标题使用 `18px`、`font-weight: 500`、`line-height: 25px`；正文使用 `14px`、`font-weight: 500`、`line-height: 20px`；标题与正文间距为 `16px`；文字内容保持不变。 |
| Source width | Pass | source tab panel 从 `327px` 内容区外扩为 `343px` 参考宽度，匹配 JSON 中 `Frame 12 width=343` 的视觉宽度。 |
| Backplate color | Pass | 候选人画像页相关横向底板色统一调整为 `#322E38`，覆盖 source 原文卡、匹配证据卡、核心匹配/风险/建议补充卡片；统计三卡仍保留原有分色增强。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Candidate Profile Source 原文落底板修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Source text surface | Pass | `候选人简历 / 目标 JD` 原文块移除独立圆角卡片样式，改为 `background: transparent`、`border-radius: 0`、`padding: 0`，直接显示在 source 区域底板上。 |
| Width alignment | Pass | source 原文块继续使用 `343px` panel 宽度，和下方匹配证据框外宽保持一致。 |
| Backplate color | Pass | 底板色已调整为 `#322E38`：source tabs、下方匹配证据卡、核心匹配/风险/建议补充等横向底板均使用该色；source 原文本身不再额外染色，避免“框中框”。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Candidate Profile 底板色微调 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Backplate color | Pass | 根据截图反馈，将候选人画像页相关底板色从 `#322E38` 调整为 `#1E1B22`，覆盖 source tab 底板、下方匹配证据卡、核心匹配/风险/建议补充卡片。 |
| Scope | Pass | 保留 Home/JD 输入 toolbar 的 `#322E38` 不变；本轮只调整候选人画像页视觉层，不改数据、状态机或 API 契约。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma 画像返回间距和面试官头像裁切修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Profile navigation spacing | Pass | 候选人画像页返回按钮从 `top=45px` 调整为 `top=50px`，标题栏同步下移到 `top=57px`，使 statusbar 时间与返回按钮的上下间距和 InputJD / Select Interviewer 的导航区域一致。 |
| Select avatar clipping | Pass | `select interviewer` 网格页 144px 头像容器补回 `border-radius:50%` 与 `overflow:hidden`，与 Figma 的 `Ellipse 5` 圆形裁切一致。 |
| Confirm avatar sizing | Pass | `select interviewer_2` 详情页保留 360px 圆形裁切容器，内部人像按 Figma image 节点尺寸 `292.5px × 517.5px` 放置，并使用 `center -40px` 对齐圆形裁切。 |
| Statusbar clock | Pass | 候选人画像 / select interviewer / select interviewer_2 已使用 `StatusBarClock` 系统时间组件，本轮复查无需改动。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200；三张 `public/figma/interviewers/*@2x.png` 静态资源均返回 200。 |

## Figma Select Interviewer_2 详情头像恢复 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Avatar sizing | Pass | 撤回详情页专用 `background-size: 292.5px 517.5px` 和 `center -40px` 覆盖，避免真实 PNG 在 360px 圆形容器内被拉伸压缩。 |
| Clipping | Pass | 继续保留 `.figma-interviewer-portrait-detail` 的 `360px` 圆形裁切、`border-radius:50%` 和 `overflow:hidden`，仅恢复头像图片自身的 `cover` 构图。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200；确认 CSS 中已无 `background-size: 292.5px 517.5px` 或 `center -40px` 详情页压缩覆盖。 |

## Figma Select Interviewer_2 详情头像等比放大 - 2026-07-04

| Check | Result | Evidence |
| --- | --- | --- |
| Avatar scale | Pass | `select interviewer_2` 详情页头像从原始 PNG 宽 `234px` 改为 CSS 渲染宽 `292px`，另一边使用 `auto` 等比放大，避免再次拉伸变形。 |
| Computed size | Pass | 严厉HR/技术老哥 PNG `234×320` 渲染约 `292×399.3`；温柔大姐姐 PNG `234×312` 渲染约 `292×389.3`。外层仍为 `360×360` 圆形裁切。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200；CSS 已确认 `.figma-interviewer-portrait-detail { background-size: 292px auto; }`。 |

## Figma Select Interviewer_2 详情头像上移 - 2026-07-04

| Check | Result | Evidence |
| --- | --- | --- |
| Avatar position | Pass | `select interviewer_2` 详情头像整体向上抬升 20px：`.figma-interviewer-portrait-detail top` 从 `92px` 调整为 `72px`。 |
| Scope | Pass | 保留头像 `292px auto` 等比缩放、`360×360` 圆形裁切、文字和 CTA 位置不变；只调整详情页头像位置。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200；CSS 已确认 `top: 72px` 和 `background-size: 292px auto` 同时生效。 |

## Figma 面试官头像位置和风格文案更新 - 2026-07-04

| Check | Result | Evidence |
| --- | --- | --- |
| Detail avatar position | Pass | `select interviewer_2` 详情头像在上一版基础上再上移 20px，`.figma-interviewer-portrait-detail top` 从 `72px` 调整为 `52px`。 |
| Select avatar position | Pass | `select interviewer` 三个头像组整体上移 20px：上排 `top 203px→183px`，下方居中项 `top 383px→363px`，名字/职位随头像组一起上移。 |
| Classic labels/descriptions | Pass | `INTERVIEWER_STYLES` 更新为 `温柔HR小姐姐 / 技术老哥 / 资深业务大佬`，描述分别改为基础建议型、专业/项目深挖型、业务理解与岗位匹配型；classic 选择卡、后续 prompt 的 style label 同步读取新文案。 |
| Figma labels/descriptions | Pass | Figma 选择页和确认页名称同步为 `温柔HR小姐姐 / 技术老哥 / 资深业务大佬`；确认页描述来自同一份 `INTERVIEWER_STYLES`，因此 theme=figma 与 theme=classic 一致。 |
| Fallback tone | Pass | 本地兜底题目前缀同步调整：`strictHr` 改为基础引导语气，`gentleSister` 改为业务取舍语气，保留枚举 id 不变。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200；CSS 坐标和面试官新文案均已用 `rg` 复查。 |

## 面试官头像文件重命名与报告超时放宽 - 2026-07-04

| Check | Result | Evidence |
| --- | --- | --- |
| Avatar filenames | Pass | 头像文件按新角色命名：`strict-hr@2x.png` 重命名为 `gentle-hr-sister@2x.png`，`gentle-sister@2x.png` 重命名为 `senior-business-leader@2x.png`，`tech-bro@2x.png` 保持不变。 |
| Avatar references | Pass | Figma CSS 引用同步更新为 `/figma/interviewers/gentle-hr-sister@2x.png`、`/figma/interviewers/tech-bro@2x.png`、`/figma/interviewers/senior-business-leader@2x.png`；旧文件名仅保留在历史 todo 记录中。 |
| Report timeout | Pass | 报告生成链路新增 `REPORT_LLM_TIMEOUT_MS = 60000`，`generateInterviewReport` 调用 `createTimeoutSignal(60000)`；profile/questions 继续使用 provider 默认 25s。流式报告和非流式报告共用该链路。 |
| Verification | Pass | `npm run typecheck` 通过；`GET /?theme=figma` 与三张新头像资源均返回 200；`npm run smoke:contract -- http://localhost:3000` 通过，覆盖 report schema 与 report stream events。 |

## Figma 面试官头像和详情文字继续上移 - 2026-07-04

| Check | Result | Evidence |
| --- | --- | --- |
| Select avatar position | Pass | `select interviewer` 三个头像组继续整体上移 20px：上排 `top 183px→163px`，下方居中项 `top 363px→343px`，名字/职位随头像组一起上移。 |
| Detail copy position | Pass | `select interviewer_2` 详情页文字组从 `top 452px` 上移到 `428px`，与头像圆形框下沿（`52px + 360px = 412px`）保留约 16px 间距，更贴近头像。 |
| Scope | Pass | 保持详情头像 `top 52px`、`360×360` 圆形裁切和 `292px auto` 等比尺寸不变；仅调整选择页头像组和详情页文字组位置。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200；CSS 已确认 `top: 163px/343px/428px` 生效。 |

## Figma Select Interviewer 两页接入 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Figma references | Pass | 使用 `面壁者/figma_Select_Interviewer_2026-07-03T12-46-23-851Z.json` 和 `面壁者/figma_Select_Interviewer_2_2026-07-03T12-46-33-131Z.json` 提取 375×812 根画布、标题、人物组、详情头像、描述和 CTA 尺寸。 |
| Select page | Pass | 候选人画像页底部确认后进入 Figma 面试官选择页，复用 Home/InputJD 的 375×812 竖版框架、暗色背景、状态栏、返回按钮和右上 accessory；5 人设计适配为 3 选 1：左右两个备选 + 中间主位，点击任一面试官进入详情页。 |
| Detail page | Pass | 选中面试官后进入 `Select Interviewer_2` 风格详情页：大圆形人像、姓名、职位、风格描述和 `开始面试` 胶囊按钮；保留返回重新选择能力。 |
| Scope | Pass | 保留固定三种业务风格 `大厂严厉 HR / 技术老哥 / 温柔大姐姐` 和现有状态机/API 契约；只调整 `theme=figma` 的视觉层与页面结构。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma Select Interviewer Navigation Bar 修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Navigation reference | Pass | 复查 Select Interviewer 两个 JSON：`Navigation Bar` 为 `y=0 h=88`，`StatusBar` 为 `y=0 h=47`，`Frame 5 / Group 1` 为 `x=23.5 y=50 w=32 h=32`。 |
| Accessory removal | Pass | 面试官选择页和面试官详情页移除右侧 `NavigationBar-Accessory`，只保留 `Frame 5` 下的 `Group 1` 返回按钮。 |
| Relative spacing | Pass | `.figma-interviewer-card .figma-statusbar` 保持 `top=14px`，`.figma-interviewer-back-button` 调整为 `top=50px left=23.5px`，维持 Figma 当前分辨率下 StatusBar 与 Frame5 的上下相对间距。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma 手机端全屏容器修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Mobile frame | Pass | 在 `@media (max-width: 820px)` 下为 `theme=figma` 增加手机端覆盖：`.app-shell` 去掉 padding，`.figma-phone-stage` 改为 `100dvh` stretch，`.figma-phone-card/.figma-home-card` 改为 `100vw x 100dvh`。 |
| Rounded shell | Pass | 手机端 Figma 页面去掉外层卡片的 `border`、`border-radius` 和 `box-shadow`，避免真实手机上看到圆角预览框；桌面端仍保留居中预览效果。 |
| Scope | Pass | 仅影响 `theme=figma` 小屏断点，不影响 classic 主题和业务状态机/API 契约。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Figma 手机端 375 坐标系居中修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Root cause | Confirmed | 手机端上一版将 `.figma-phone-card/.figma-home-card` 直接设为 `100vw`，但内部 Figma 节点仍按 375px 设计稿绝对坐标定位；在 390/430 等宽屏手机上会造成 Home、InputJD、面试官页内容整体偏左，候选人画像球体也偏左。 |
| Mobile alignment | Pass | 小屏下改为 `.figma-phone-stage { place-items: start center }`，卡片宽度改为 `min(375px, 100vw)`，保持 375px Figma 坐标系水平居中；外侧区域使用 `#161316` 背景补齐。 |
| Rounded shell | Pass | 继续保留手机端无 `border`、无 `border-radius`、无 `box-shadow`，避免真实手机出现圆角预览框。 |
| Scope | Pass | 仅影响 `theme=figma` 小屏断点；桌面端仍保留居中预览卡，classic 主题和业务状态机/API 契约不变。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## 状态栏时间改用系统时间 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| 系统时间 | Pass | 候选人画像 / select interviewer / select interviewer_2 三页 statusbar 的时间从写死 `9:41` 改为系统时间。新增 `StatusBarClock` 组件（`components/InterviewCoachApp.tsx`），格式 `H:MM`（如 `23:01`），`setInterval` 每 15s 刷新。 |
| SSR 水合 | Pass | 组件为 `"use client"` 但仍会 SSR：初始渲染占位 `9:41`（服务端与首帧客户端一致），`useEffect` 挂载后再取 `new Date()` 并加 `suppressHydrationWarning` 兜底，避免水合不匹配。 |
| 范围 | Note | 仅这三页（用户指定）。Home / InputJD 的 statusbar 在 `components/setup/SetupPanel.tsx`，仍为 `9:41`，未改。 |
| Verification | Pass | `npm run typecheck` 通过；浏览器实测 statusbar 显示 `23:01` 与 `new Date()` 一致（截图确认）。 |

## 确认页头像圆弧裁切（Ellipse 5）- 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| 圆弧切割 | Pass | 用户指出 Figma `Group 2` 内含 `Ellipse 5`（360×360 圆，#D9D9D9 + blur），人像 `image`(292.5×517.5) 被该圆裁切，底部应是"圆弧切割"感而非直线平切。之前把 `border-radius:50%` 连同灰底一起去掉了——其实要去掉的是灰色填充，圆形**形状**要保留做裁剪。现给 `.figma-interviewer-portrait-detail` 加回 `border-radius:50%; overflow:hidden`（保持透明、无灰底/阴影），人像底部随圆弧切出弧形。 |
| 保持透明 | Pass | 不加 `#D9D9D9` 填充与 `box-shadow`，圆内人像抠像浮于透明卡片背景，圆弧边缘处自然收束。 |
| 截图验证 | Pass | strictHr / gentleSister 详情页均确认底部为圆弧切割、透明无白框；gentleSister 发髻在圆内不被裁（`-10%` 头顶补偿）。圆形裁切为统一 CSS，techBro 同理。 |
| 待确认 | Open | Figma 网格页每个头像同样用 144 圆的 Ellipse 5 裁切；本次按用户"先关注 select interviewer_2"仅改详情页，网格页是否也加圆弧待用户确认。 |

## 面试官选择/确认页对齐 Figma 坐标 - 2026-07-03

依据用户提供的两份 Figma 节点导出（`Select Interviewer` / `Select Interviewer_2`）校准位置。

| Check | Result | Evidence |
| --- | --- | --- |
| 网格头像位置（修"靠下"） | Pass | 按 Figma 坐标：上排 `top` 230→203、中间 `top` 448→383（水平居中），左右边距 24/24→16/15。头像整体上移，修复"所有头像都偏靠下"。 |
| 构图取舍 | Pass | Figma 用 117×207 人像矩形（偏移 14,−19），但那是按"头+肩"素材设计；我们的 PNG 是"头到躯干"，直接套 117×207 会导致人脸下移压到名字（已截图验证会重叠）。故保留上一版 144×144 `cover` + 逐图 `background-position` 的"头+上肩"构图，仅采用 Figma 的位置坐标。 |
| 名字/职位 | Pass | 字号采用 Figma 值：名字 18px、职位 12px；位置因我们头像更大（头+肩 vs 整身），name/role 保持 150/176px（比 Figma 的 138/163 略低）以在肩线下方留干净间距，避免压到下巴。 |
| 浏览器截图验证 | Pass | 用预览实例逐页截图核对：网格页三头对齐、名字在肩下方无重叠；确认页 strictHr/techBro/gentleSister 三人透明无白框、头+上肩、`20%`/`-10%` 补偿在 360px 详情图同样成立。 |

## 面试官头像透明化 + 顶部间距 + 字号位置微调 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Profile 顶部间距 | Pass | 候选人画像页 statusbar `top` 从 24px 改回 14px（与 Home/JD/面试官页基线一致），back button 55→45、navbar 62→52 整块上移 10px，修复顶部间距比其它页偏低的问题。 |
| 头像透明框 | Pass | PNG 本身是抠像（上方四角 alpha=0），此前用户看到的"白框"来自容器的 `background-color:#d9d9d9`+`border-radius:50%`+`box-shadow`；已移除，改 `background-color:transparent`，人物浮在透明背景上（选择页与确认页共用）。 |
| 头像构图（头+上肩） | Pass | 对照效果图，构图应为"头+上肩"紧凑裁切而非整身；`background-size` 用 `cover`（填满、裁掉下方躯干）。三张 PNG 头顶透明留白不一（严厉HR 7%/技术老哥 10%/温柔姐姐 2%），按每图设 `background-position` 纵向补偿（strictHr `center 8%`、techBro `center 20%`、gentleSister `center -10%`），使三头统一约 6% 头顶间距、裁到上胸；百分比与框尺寸无关，144px 网格与 360px 详情图同一组值都成立。 |
| 选择页字号/位置 | Pass | 名字 `font-size` 26→18px（26px 时 6 个中文字≈156px 会超出 144px 宽），name/role 下移到 150/176px 让位给完整人像；三个人像整体下移：option-1/2 top 214→230、option-3 432→448。 |
| 确认页字号/位置 | Pass | 详情名字 `font-size` 48→30px、line-height 67→42；文案组 `top` 414→452px 下移到人像下方，修复"文字过于靠上"。 |
| Verification | Pass | `npm run typecheck` 通过；dev server 已热更新，serve 出的 `layout.css` 已确认上述各值生效（Chrome 扩展本次未连上，未做像素级截图）。 |

## 面试官头像替换为真实 PNG - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Assets | Pass | 用户已放入 `public/figma/interviewers/strict-hr@2x.png`、`tech-bro@2x.png`、`gentle-sister@2x.png`（头肩证件照式、人脸居中偏上）。 |
| Wiring | Pass | `.figma-interviewer-portrait` 由 CSS 渐变/伪元素画脸改为引用 PNG：base 设 `background-size:cover; background-position:center top`，`::before/::after` 置 `content:none`，按 `hero-strictHr/hero-techBro/hero-gentleSister` 分别 `background-image`。选择页 144px 圆形与确认页 360px 详情图共用同一映射。 |
| Cleanup | Pass | 移除旧的 clip-path/多层 radial-gradient 画脸规则及 techBro/gentleSister/detail 的伪元素覆写，避免死代码。 |
| Verification | Pass | `npm run typecheck` 通过；dev server 已热更新，`GET /figma/interviewers/*@2x.png` 均返回 `200 image/png`，`GET /?theme=figma` 返回 200；serve 出的 `layout.css` 含三条 hero `background-image` 且旧 clip-path 已为 0。 |

## Figma 小屏背景、返回按钮和面试官文案修正 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Viewport background | Pass | 在小屏 `theme=figma` 下增加固定全视口背景层，保留 375px Figma 坐标系居中，同时让不同分辨率外侧背景铺满，不再露出浅色页面底。 |
| Profile back | Pass | 候选人画像页标题栏改为不接收 pointer events，并提高返回按钮层级，避免标题栏覆盖导致点击返回 JD 输入页无效。 |
| Statusbar typography | Pass | `select interviewer` 和 `select interviewer_2` 的 statusbar 字号/字重改回共用 `figma-statusbar` 体系，和 Home、InputJD、候选人画像页保持一致。 |
| Interviewer labels | Pass | 面试官选择页三项显示改为 `大厂严厉HR / 技术老哥 / 温柔大姐姐`；当前头像仍为 CSS 临时绘制，若需精确还原设计稿头像，建议导出 2x PNG 到 `public/figma/interviewers/` 后替换。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200。 |

## Profile LLM 匹配证据契约扩展 - 2026-07-01

| Check | Result | Evidence |
| --- | --- | --- |
| API Contract | Pass | `CandidateProfile` 新增必填 `sourceMatches`，包含 `resumeText/jdText/reason/confidence`；已更新 `docs/04_api_contracts.md`、types 和 runtime schema。 |
| Prompt Contract | Pass | `buildProfilePrompt` 要求 LLM 返回 2-5 条结构化匹配证据，优先使用简历/JD 原文连续短语，不编造硬事实。 |
| Demo Fallback | Pass | `demoScenario.candidateProfile.sourceMatches` 已补 4 条 AI 产品经理实习场景匹配证据，支持无 LLM 时完整展示。 |
| Profile UI | Pass | Profile 页高亮优先使用 `sourceMatches.resumeText/jdText`，并展示匹配原因与置信度；缺少精确命中时仍保留文本展示。 |
| Verification | Pass | `npm run typecheck`、`npm run smoke:contract -- http://localhost:3000` 通过；浏览器验证 4 个匹配卡片、简历 10 处高亮、JD 6 处高亮、应用 console error 为 0。 |

## Setup 文件上传解析记录 - 2026-07-01

| Check | Result | Evidence |
| --- | --- | --- |
| Upload API | Pass | 新增 `POST /api/files/parse`，支持上传 `.txt`、`.pdf`、`.docx` 提取纯文本，最大 8MB；解析失败返回 `FILE_PARSE_FAILED`。 |
| Setup UI | Pass | 简历文本和 JD 文本各新增上传入口，上传成功后回填对应 textarea，失败时保留已有输入。 |
| TXT / DOCX / PDF | Pass | `npm run smoke:file-parse -- http://localhost:3000` 通过，覆盖 TXT、现代 Word `.docx` 和可复制文本 PDF。 |
| Limitation | Noted | 旧版 `.doc` 和扫描件 PDF OCR 暂不支持；用户需另存为 `.docx`、`.pdf`、`.txt` 或先 OCR。 |
| Verification | Pass | `npm run typecheck` 通过；文件解析接口不调用 LLM，不输出上传文件全文日志。 |

## 产品 Prompt 套件 classic 调试面板 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Prompt source review | Pass | 已解析 `Prompt套件.docx`，将产品提供的画像、题目、报告 prompt 重点映射进 `lib/prompts/productPromptSuite.ts`；保留现有 API 字段契约，不直接改成产品文档中的临时字段名。 |
| Classic-only editor | Pass | `theme=classic` 下新增 `Prompt 调试` 面板，支持编辑公共系统指令、画像 prompt、题目 prompt、报告 prompt，并展示当前线上实际数据格式；编辑内容保存在本浏览器 localStorage。 |
| Figma isolation | Pass | `theme=figma` 不渲染 Prompt 调试面板，且前端不向 API 传 `promptOverrides`，保持正式视觉路径干净。 |
| API integration | Pass | profile/questions/report/stream/regenerate-question 均支持可选 `promptOverrides`；后端仍追加硬规则和 outputShape，并继续用 schema 校验返回结果。 |
| Deployment note | Pass | `README.md` 已补 `/?theme=figma` 与 `/?theme=classic` 访问说明，以及腾讯云自托管时保留 query string 的要求。 |
| Verification | Pass | `npm run typecheck` 通过；`npm run smoke:contract -- http://localhost:3000` 通过，覆盖 profile/questions/report stream/单题重生/故障兜底/TTS fault。 |

## 产品 Prompt 全局保存和 Figma 默认生效 - 2026-07-03

| Check | Result | Evidence |
| --- | --- | --- |
| Server persistence | Pass | 新增 `GET/POST /api/prompts/active` 和 `lib/prompts/promptStore.ts`，全局 Prompt 默认保存到 `outputs/active-prompt-overrides.json`；可用 `FACEWALL_PROMPT_STORE_PATH` 指向腾讯云持久盘路径。 |
| Classic save flow | Pass | `theme=classic` 的 Prompt 调试面板新增“保存为全局 Prompt”“重新加载全局 Prompt”“恢复产品默认 Prompt”；未保存内容仍可作为当前 classic 草稿直接测试。 |
| Figma default behavior | Pass | figma 主题不传草稿覆盖，profile/questions/report/stream/regenerate 默认读取服务端 active Prompt；服务重启后继续从持久文件读取。 |
| Runtime artifact handling | Pass | `outputs/active-prompt-overrides.json` 加入 `.gitignore`，避免把产品在线调试结果误提交到仓库。 |
| Deployment docs | Pass | `README.md` 和 `docs/15_release_selfhost.md` 已补腾讯云单机/多实例 Prompt 持久化说明，且修正 key 示例占位符避免安全检查误报。 |
| Verification | Pass | `npm run typecheck`、`npm run build`、`npm run security:check` 通过；`npm run smoke:contract -- http://localhost:3001` 通过；`GET /?theme=classic` 显示 Prompt 面板，`GET /?theme=figma` 隐藏 Prompt 面板。 |

## Classic 一键填充和 Figma 移动端/面试官位置修正 - 2026-07-04

| Check | Result | Evidence |
| --- | --- | --- |
| Classic demo fill | Pass | `theme=classic` 下“一键填充”和“填充并生成画像”只替换简历/JD，保留当前已选 `form.interviewerStyleId`，不再强制改回 demo 默认的 `strictHr` / 温柔HR小姐姐。 |
| Select interviewer position | Pass | `select interviewer` 三个人物组整体下移：上排从 `top: 163px` 调到 `195px`，下方居中项从 `343px` 调到 `395px`，避免当前视觉过于贴近页面上方。 |
| Mobile fill | Pass | `theme=figma` 小屏卡片恢复 375×812 Figma 原始画布，并通过 `transform: scale(calc(100vw / 375px))` 按屏宽等比放大；iPhone 12 Pro / XR / 14 Pro Max 等 390-430px 宽度不再保留 375px 窄画布两侧空隙。 |
| Avatar sizing note | Note | 选择页当前 Ellipse/头像显示框为 `.figma-interviewer-portrait` 的 `144px × 144px` 圆形裁切，PNG 使用 `background-size: cover` 填满圆；确认页为 `360px × 360px` 圆形裁切，PNG 使用 `background-size: 292px auto`。 |
| Verification | Pass | `npm run typecheck` 通过；未改 API 契约、状态枚举、`tts-demo` 或 `.env.local`。 |

## Figma Select Interviewer 头像尺寸和位置修正 - 2026-07-04

| Check | Result | Evidence |
| --- | --- | --- |
| Select avatar width | Pass | `select interviewer` 三个头像圆形裁切从 `144px × 144px` 调整为 `118px × 118px`，人物按钮容器同步从 `144px × 180px` 调整为 `118px × 154px`。 |
| Select avatar position | Pass | 人物组在上一版基础上整体上移 20px：上排 `top: 195px -> 175px`，下方居中项 `top: 395px -> 375px`；左右项为保持原中心点，改为 `left: 29px` / `right: 28px`。 |
| Portrait crop | Pass | 选择页 PNG 在圆形裁切内整体下移：`strictHr 18%`、`techBro 30%`、`gentleSister 0%`，减少头像下方视觉空感；`select interviewer_2` 详情页保留原 `8% / 20% / -10%` 构图。 |
| Verification | Pass | `npm run typecheck` 通过；仅调整 `theme=figma` 视觉 CSS，未改业务状态机、API 契约、`tts-demo` 或 `.env.local`。 |

## Figma Select Interviewer 头像模块二次位置修正 - 2026-07-04

| Check | Result | Evidence |
| --- | --- | --- |
| Module position | Pass | `select interviewer` 三个人物模块整体向下移动 60px：上排 `top: 175px -> 235px`，下方居中项 `top: 375px -> 435px`。 |
| Image crop | Pass | 头像模块内部 PNG 向上移动 20px：选择页 `background-position-y` 改为 `calc(18% - 20px)`、`calc(30% - 20px)`、`calc(0% - 20px)`；详情页 `.figma-interviewer-portrait-detail` 继续用单独覆盖值，未受影响。 |
| Verification | Pass | `npm run typecheck` 通过；仅调整 `theme=figma` 视觉 CSS，未改业务状态机、API 契约、`tts-demo` 或 `.env.local`。 |

## Figma Select Interviewer 头像 PNG 微调 - 2026-07-04

| Check | Result | Evidence |
| --- | --- | --- |
| Image crop | Pass | `select interviewer` 模块内头像 PNG 在上一版基础上向下微调 10px：选择页 `background-position-y` 从 `calc(... - 20px)` 调整为 `calc(... - 10px)`；外层头像模块 `top: 235px / 435px` 不变。 |
| Verification | Pass | `npm run typecheck` 通过；仅调整 `theme=figma` 视觉 CSS，未改业务状态机、API 契约、`tts-demo` 或 `.env.local`。 |

## Figma Select Interviewer 头像 PNG 5px 微调 - 2026-07-04

| Check | Result | Evidence |
| --- | --- | --- |
| Image crop | Pass | `select interviewer` 模块内头像 PNG 在上一版基础上向下微调 5px：选择页 `background-position-y` 从 `calc(... - 10px)` 调整为 `calc(... - 5px)`；外层头像模块 `top: 235px / 435px` 不变。 |
| Verification | Pass | `npm run typecheck` 通过；仅调整 `theme=figma` 视觉 CSS，未改业务状态机、API 契约、`tts-demo` 或 `.env.local`。 |

## Figma Interview Responses 初版接入 - 2026-07-05

| Check | Result | Evidence |
| --- | --- | --- |
| Figma interview branch | Pass | `InterviewPanel` 新增 `visualTheme` 参数；`theme=figma` 下从 `select interviewer_2` 点击“开始面试”进入新的 375×812 面试页分支，classic 仍保留原有低保真 `VoiceControls` 面板。 |
| State/API scope | Pass | 复用现有 `questions/currentIndex/answers`、TTS 播放、STT 录音/失败、手动编辑、跳过、上一题/下一题、生成报告逻辑；未改状态机、接口契约或报告链路。 |
| Visual structure | Pass | 新增 `.figma-interview-*` 样式：状态栏、题目进度、面试官头像、题目卡片、播放提问/语音作答按钮、TTS/STT 状态、回答文本框、题目圆点和底部操作区；头像复用现有三张 PNG。 |
| Figma source | Note | 本地未找到 `Interview Responses` 对应完整节点 JSON；当前按已有 Figma 375×812 框架做视觉承接。若提供 `Interview Responses` 节点 URL/JSON，可继续做像素级位置、字号、资源校准。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200；未改 `tts-demo` 或 `.env.local`。 |

## Figma Interview Responses 流程和 Report 过渡接入 - 2026-07-05

| Check | Result | Evidence |
| --- | --- | --- |
| Interview Responses JSON | Pass | 已读取 `面壁者/figma_Interview_Responses_2026-07-04T16-12-10-564Z.json`：根画布 `375×812`，背景 `#161316`，球体 `Comp 1024 1` 位于 `x=-22 y=144 w=419.6 h=236`，面试官信息组 `x=26 y=88 w=149 h=56`，主文案位于 `x=24 y=380/430`，底部控制组 `x=48 y=650 w=280 h=64`。 |
| Question flow | Pass | `theme=figma` 面试页改为逐题回答：每题先显示 `Interview Responses` 等待态；点击中间麦克风进入回答中态（`Interview Responses_2` 兜底结构）；回答中显示计时；结束回答后自动进入下一题；第三题结束后自动触发报告生成。 |
| Answer state | Pass | 每题结束时写入 `durationSec`，保留已有 STT/手动编辑路径；STT 不可用或失败时仍保留文本并允许手动编辑。未改 `InterviewAnswer` schema。 |
| Report transition | Pass | `ReportPanel` 新增 `visualTheme` 参数；`theme=figma` 下报告生成中显示 Figma 风格 loading 页（对应 Report Page 过渡），报告完成后显示 Figma 风格完整报告页（Report Page_2 结构化兜底）。classic 报告页保持不变。 |
| Figma gaps | Note | 当前仅有 `Interview Responses` JSON；本地有 `Interview Responses_2.png`、`Report Page.png`、`Report Page_2.png` 和 `figma_Report_Page_2...json`，但缺少 `Interview Responses_2` 与 `Report Page` 的节点 JSON。后续可用节点 JSON 继续做像素级校准。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200；`npm run smoke:contract -- http://localhost:3000` 通过；未改 API 契约、`tts-demo` 或 `.env.local`。 |

## Figma 球体资源替换 - 2026-07-05

| Check | Result | Evidence |
| --- | --- | --- |
| Interview ball size | Confirmed | `Interview Responses` 当前球体容器为 `.figma-interview-comp`：`left: -22px; top: 144px; width: 420px; height: 236px`；图片 `object-fit: contain`，新源图为 `750×472`，在该容器内按比例显示约 `375×236`。 |
| Input JD ball size | Confirmed | `Input JD` 继续使用 `.figma-home-comp` 基础尺寸 `340×214`，并通过 `.figma-jd-card .figma-home-comp { top: 152px; }` 定位；新源图为 `750×472`，比例与容器一致。 |
| Assets | Pass | 从 `面壁者/Comp 1024 1.png` 复制为 `public/figma/home/comp-1024-1-interview@2x.png`；从 `面壁者/Comp 1024 1-jd.png` 复制为 `public/figma/home/comp-1024-1-jd@2x.png`。 |
| Wiring | Pass | `InterviewPanel` 的 `figma-interview-comp` 改用 `/figma/home/comp-1024-1-interview@2x.png?v=2026070501`；`SetupPanel` 的 Input JD 页改用 `/figma/home/comp-1024-1-jd@2x.png?v=2026070501`；Home 页仍保留原 `/figma/home/comp-1024-1@2x.png`。 |
| Verification | Pass | `npm run typecheck` 通过；`GET /figma/home/comp-1024-1-interview@2x.png` 与 `GET /figma/home/comp-1024-1-jd@2x.png` 均返回 200；未改 API 契约、`tts-demo` 或 `.env.local`。 |

## Figma Interview Responses 题目进度和底部按钮修正 - 2026-07-05

| Check | Result | Evidence |
| --- | --- | --- |
| Frame 10 JSON | Pass | 已读取 `面壁者/figma_Frame_10_2026-07-04T16-59-35-410Z.json`：按钮组 `280×64`；左按钮 `36×36 x=0 y=14`，中间麦克风 `64×64 x=108 y=0`，右按钮 `36×36 x=244 y=14`。当前容器 `.figma-interview-orb-controls` 继续按 `left:48px; top:650px; width:280px; height:64px` 对齐。 |
| Progress position | Pass | 题目数量/计时从底部按钮附近上移到问题文案下方：`.figma-interview-progress top: 572px`，进度点 `.figma-interview-dots top: 592px`。 |
| Footer text cleanup | Pass | 移除 `theme=figma` 面试页底部 “已完成 0 题，缺少 3 题 · TTS 待播放” 汇总文案；classic 页仍保留原有缺失答案提示。 |
| Button icons | Pass | 底部三按钮不再使用文本符号/emoji，改为 CSS 伪元素绘制 X、麦克风、箭头；按钮尺寸和位置继续按 `Frame 10` JSON。若后续要求图标 100% 还原，可导出单个 icon 或整组透明 PNG/SVG。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200；未改 API 契约、`tts-demo` 或 `.env.local`。 |

## Figma Interview Responses 球体缩放和按钮 PNG 替换 - 2026-07-05

| Check | Result | Evidence |
| --- | --- | --- |
| Ball size | Pass | 面试回答页球体容器从 `420×236` 缩小到 `336×189`，约为上一版 0.8 倍；位置从 `left:-22px; top:144px` 调整为 `left:20px; top:168px`，保持原视觉中心点基本不变。 |
| Button assets | Pass | 从 `面壁者/Frame 7.png`、`Frame 8.png`、`Frame 9.png` 复制为 `public/figma/interview-controls/frame-7@2x.png`、`frame-8@2x.png`、`frame-9@2x.png`；原始尺寸分别为 `72×72`、`128×128`、`72×72`。 |
| Button wiring | Pass | 底部控制组继续按 `Frame 10` 尺寸显示：左/右按钮 `36×36`，中间麦克风 `64×64`；CSS 改为 PNG 背景图并移除旧伪元素绘制图标。 |
| Verification | Pass | `npm run typecheck` 通过；`GET /figma/interview-controls/frame-7@2x.png`、`frame-8@2x.png`、`frame-9@2x.png` 均返回 200；未改 API 契约、`tts-demo` 或 `.env.local`。 |

## Figma Interview Responses 录音态视觉修正 - 2026-07-05

| Check | Result | Evidence |
| --- | --- | --- |
| Recording ball | Pass | 点击中间麦克风进入录音态后，球体资源从 `/figma/home/comp-1024-1-interview@2x.png` 切换为 `/figma/home/comp-1024-1-response@2x.png`；新资源来自 `面壁者/Comp 1024 1-response.png`，原始尺寸 `750×472`。 |
| Recording input | Pass | `theme=figma` 录音态移除画面中间的文字输入框，不再渲染 `.figma-interview-answer textarea`；classic 面试页的原有文本编辑路径不变。 |
| Button hover | Pass | 底部左 X、中间麦克风、右箭头按钮增加 Figma 专用 hover 覆盖，鼠标移入时不再触发全局按钮的背景/位移变化。 |
| Verification | Pass | `npm run typecheck` 通过；`GET /figma/home/comp-1024-1-response@2x.png` 返回 200；未改 API 契约、`tts-demo` 或 `.env.local`。 |

## Figma Interview Responses 底部按钮 hover 清理 - 2026-07-05

| Check | Result | Evidence |
| --- | --- | --- |
| Prompt state buttons | Pass | `Interview Responses` 底部左 X、中间麦克风、右箭头按钮在 `.figma-interview-orb-controls` 范围内禁用 hover transition、背景变化、位移、阴影、滤镜和透明度变化。 |
| Recording state buttons | Pass | `Interview Responses_2` 复用同一底部控制组，录音态 `.figma-interview-orb-controls.recording` 下三个按钮同样不再有鼠标悬停视觉效果。 |
| Verification | Pass | `npm run typecheck` 通过；仅调整 `theme=figma` 视觉 CSS，未改业务状态机、API 契约、`tts-demo` 或 `.env.local`。 |

## Figma Interview Responses_2 监听同心圆 - 2026-07-05

| Check | Result | Evidence |
| --- | --- | --- |
| Figma source note | Note | 用户提供的 `figma_Indicator_Base_on_iOS_16_UI_Kit_by_Joey_Banks__2026-07-04T17-33-47-474Z.json` 仅包含 `Home Indicator` 矩形节点，未包含 `Ellipse 6/7/8/9`；本地其他 Figma JSON 也未命中这些节点名。 |
| Recording rings | Pass | 参考 `面壁者/Interview Responses_2.png`，在 `theme=figma` 录音态新增 4 个同心圆，圆心对齐底部麦克风按钮中心 `x=187.5 y=682`，尺寸为 `320/224/160/96px`，放在按钮后方并由 375×812 画布底部裁切。 |
| Scope | Pass | 同心圆仅在 `isRecording` 时渲染；`Interview Responses` 等待态、classic 面试页、状态机和 API 契约不变。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200；未改 `tts-demo` 或 `.env.local`。 |

## Figma Report Page_2 长页视觉接入 - 2026-07-05

| Check | Result | Evidence |
| --- | --- | --- |
| Figma source | Pass | 已读取 `面壁者/figma_Report_Page_2_2026-07-04T17-36-18-818Z.json`：根画布 `375×1565`，背景 `#161316`；顶部评分组 `Group 8 x=16 y=61 w=343 h=296`；内容底板 `Rectangle 1 y=372 h=1282.5 #322E38`；Q tab 在 `y=389`；Home Indicator 位于 `y=1552`。 |
| Report structure | Pass | `theme=figma` 报告完成页改为长页结构：顶部面试评分/总分/总结卡，下面 Q1/Q2/Q3 tab，当前题详情包含面试题目、考察维度、适用职级、出题意图、面试官避坑指南、您的回答和优化方向。 |
| Data binding | Pass | 评分和总结来自 `finalReport`；tab 和题目来自 `questions/questionReports/answers`；Q tab 只切换展示题目详情，不改报告数据、状态机或 API 契约。 |
| Mobile behavior | Pass | 新增 `.figma-report-page-card` 专用 `1565px` 高度和 `.figma-report-stage` 滚动覆盖，避免移动端全局 Figma 812px 卡片规则截断长报告页。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200；未改 `tts-demo` 或 `.env.local`。 |

## Figma Report Page_2 截图差异修正 - 2026-07-05

| Check | Result | Evidence |
| --- | --- | --- |
| Mobile corner radius | Pass | 修复移动端 `.theme-figma .figma-home-card { border-radius: 0 }` 对报告长页的覆盖；`.figma-report-page-card` 在移动端继续保持 Figma JSON 的 `24px` 圆角。 |
| Status bar | Pass | `Report Page_2` 顶部状态栏不再显示 `Facewall` 文案，改为 iOS 风格信号、Wi-Fi、电池图标，并保留系统时间。 |
| Hero visual | Pass | 调整顶部紫蓝渐变和人物图尺寸，降低当前截图中头像过大、背景层次偏暗的问题，更贴近 `Report Page_2.png` 的评分头图。 |
| Verification | Pass | `npm run typecheck` 通过；仅调整 `theme=figma` 报告页视觉，不改业务状态机、API 契约、`tts-demo` 或 `.env.local`。 |

## Figma Report Page_2 NavigationBar-Accessory 移除 - 2026-07-05

| Check | Result | Evidence |
| --- | --- | --- |
| Accessory removal | Pass | 移除 `theme=figma` 报告完成页右上 `NavigationBar-Accessory` DOM 和对应 `.figma-report-nav-accessory` CSS，不再显示胶囊菜单/圆点。 |
| Vertical alignment | Pass | Accessory 移除后，评分组从 `top:61px` 上移到 `47px`；提示条从 `341px` 上移到 `327px`；内容底板从 `y=372` 上移到 `y=358`，Q tab 和正文随底板同步上移。 |
| Background | Pass | 顶部背景改为更贴近 `Report Page_2` 的紫蓝亮面与深蓝弧形渐变层；未直接使用整张 `Report Page_2.png` 作为背景，避免把设计稿里的固定分数、人物和文案烙进真实报告数据。若需 100% 背景贴图，需要从 Figma 单独导出 JSON 中的 `Comp 1024 2` 图片节点。 |
| Verification | Pass | `npm run typecheck` 通过；仅调整 `theme=figma` 报告页视觉，不改业务状态机、API 契约、`tts-demo` 或 `.env.local`。 |

## Figma Report Page_2 手机端圆角修正 - 2026-07-05

| Check | Result | Evidence |
| --- | --- | --- |
| Mobile report corners | Pass | 手机端 `theme=figma` 下 `.figma-report-page-card` 覆盖为 `border-radius: 0`，避免结果页背景在全屏手机浏览时显示圆角。 |
| Desktop preview | Pass | 非移动端基础样式仍保留 `24px` 圆角，用于桌面居中预览 Figma 画布。 |
| Verification | Pass | `npm run typecheck` 通过；未改业务状态机、API 契约、`tts-demo` 或 `.env.local`。 |

## Figma Interview Responses_2 和 Report Page_2 动效优化 - 2026-07-05

| Check | Result | Evidence |
| --- | --- | --- |
| Recording motion | Pass | `Interview Responses_2` 录音态球体新增呼吸、轻微漂浮和辉光动效；底部麦克风新增录音态呼吸；4 个同心圆保留原中心点 `x=187.5 y=682` 和 `320/224/160/96px` 尺寸，并增加分层脉冲。 |
| Prompt transition | Pass | 面试页从等待态进入录音态时，题目文案和底部控制组增加短入场/位移动效；底部三按钮的 hover 覆盖仍保留，不恢复 hover 位移或滤镜。 |
| Report loading motion | Pass | `theme=figma` 报告生成页新增球体呼吸/浮动、文案入场和流式片段 staggered 入场；不改流式/非流式报告契约和兜底逻辑。 |
| Report ready motion | Pass | `Report Page_2` 完成页新增评分数字 pop、人物/总结卡/内容底板入场、指标卡 staggered 入场；Q1/Q2/Q3 tab 切换通过 React `key` 重新触发详情面板入场，仅影响视觉层。 |
| Reduced motion | Pass | 新增 `@media (prefers-reduced-motion: reduce)`，关闭本次新增的 Figma 面试页和报告页动画/transition。 |
| Verification | Pass | `npm run typecheck` 通过；`GET http://127.0.0.1:3000/?theme=figma` 返回 200；in-app browser 390×844 走通 Home -> Input JD -> 候选人画像 -> Select Interviewer -> Interview Responses -> 录音态 -> Report Page_2，录音态检测到 `figma-interview-orb-breathe` / `figma-interview-mic-breathe` / `figma-interview-ring-pulse`，报告页检测到 `figma-report-score-pop` / `figma-report-detail-in`，`scrollWidth=390`。未改业务状态机、API 契约、`tts-demo` 或 `.env.local`。 |

## Figma Report Page_2 StatusBar 和 Frame 11 内容修正 - 2026-07-05

| Check | Result | Evidence |
| --- | --- | --- |
| StatusBar cleanup | Pass | `Report Page_2` 顶部 statusbar 移除右侧 signal/Wi-Fi/battery DOM，只保留左侧时间模块；`.figma-report-page-card .figma-statusbar` 改为左对齐。 |
| Score size | Confirmed | 当前评分数字 `.figma-report-score-hero h2` 为 `font-size: 96px; line-height: 134px; font-weight: 500;`，与 Figma JSON 中 `Group 8 / 92` 的 96px 字号一致。 |
| Frame 11 sizing | Pass | `Group 8 / Frame 11` 保持设计稿起始尺寸规则：`width:343px`、`min-height:92px`、`border-radius:16px`、`padding:16px`；框体高度随真实内容自然撑开。 |
| Frame 11 content | Pass | Frame 11 内容从单段 summary 改为包含 classic 报告页同源的 `最终报告`、`Top 风险`、`行动项`，数据来自 `report.finalReport.summary/topRisks/actionItems`，不改报告 schema 或 API 契约。 |
| Layout spacing | Pass | 扩高后的 Frame 11 下方正文区从 `top:358px` 下移到 `top:568px`，toast 同步下移，避免新增内容覆盖 Q tab 和单题详情。 |
| Verification | Pass | `npm run typecheck` 通过；启动 `npm run dev` 后 `GET http://127.0.0.1:3000/?theme=figma` 返回 200；in-app browser 检查报告页 statusbar 子元素数为 1，Frame 11 computed width `343px`、min-height `92px`、实际内容高约 `287px`，评分 computed font-size `96px`。未改业务状态机、API 契约、`tts-demo` 或 `.env.local`。 |

## 风险和待确认

| Risk | Severity | Owner | Handling |
| --- | --- | --- | --- |
| LLM 供应商/模型未冻结 | High | Dev | 先封装 provider，保持 schema 稳定 |
| Prompt 尚未经过产品确认 | High | Product + Dev | 已建立 `docs/13_prompt_handoff.md`，并在 `theme=classic` 增加产品 Prompt 调试与全局保存；Phase 10 前需用产品保存版本跑真实 LLM 三风格验收并冻结 |
| Prompt 保存入口外网开放 | High | Dev/Ops | 当前 `/api/prompts/active` 可修改全局 Prompt；外网部署时需限制 classic 调试入口或加访问控制，避免无关用户修改 |
| Figma 异常态覆盖不完整 | Medium | Design + Dev | Phase 9 已按可访问画布完成 happy path 视觉替换；未明确覆盖的 loading/error/empty/unsupported/copy success/copy failed 按现有契约保留最小状态，Phase 10 需作为 Known Risk 或由设计补齐。 |
| PRD 与当前契约存在差异 | Medium | Product + Dev | 流式报告已按 `docs/04_api_contracts.md` 实现并保留非流式兜底；题目 `weight` Phase 7 决定暂不入 schema，若产品坚持展示权重需走契约变更 |
| 移动端 STT 兼容不稳定 | Medium | Dev | 支持重试和手动编辑 |
| Web Speech 本机发音人差异 | Medium | Dev | Azure TTS 优先，Web 仅兜底 |
| Demo 网络不稳定 | High | Dev | 演示兜底样例包 |
| Azure TTS 偶发 provider 失败 | Medium | Dev | 本地验收曾出现一次 `strictHr` 502，重试后恢复；Preview 保留 Web Speech/文本兜底并在云端复验三风格。 |
| 扫描件 PDF 无法直接解析 | Medium | Dev | 当前文件解析支持可复制文本 PDF，不做 OCR；提示用户先 OCR 或手动复制。 |

## 当前下一步建议

1. 进入 Phase 10 - Release Freeze & Acceptance：用真实 LLM key 对三种面试官风格各跑一次端到端人工验收，完成 prompt 产品 review、调整和冻结。
2. Phase 10 复验真实 Azure TTS / Web Speech fallback，并覆盖 LLM、TTS、STT、clipboard 故障注入。
3. 若产品要求题目权重展示，再单独做 `weight` 契约变更，不在当前 schema 中隐式增加字段。
4. 保留 `tts-demo` 作为 Azure/Web Speech 对照验证样板，不迁移或删除。
