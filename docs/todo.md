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

- [ ] 接收并审查 Figma 页面和状态覆盖
- [ ] 建立最终 design token 映射
- [ ] 替换 setup 视觉
- [ ] 替换 profile/questions/interview 视觉
- [ ] 替换 report 视觉和对比展示
- [ ] 做桌面端最终截图/录屏
- [ ] 做手机 H5 最终截图/录屏
- [ ] 验证视觉替换未修改状态机、API 契约、schema 和 `questionId`

## Phase 10 - Release Freeze & Acceptance

- [ ] 暴露 profile/questions/report prompt 给产品 review，并冻结发布版本
- [ ] 使用真实 LLM key 跑三种面试官风格端到端验收
- [ ] 对真实输出做 prompt 质量抽查和必要微调
- [ ] 故障注入复验：LLM、TTS、STT、clipboard
- [ ] 检查日志和页面不暴露 `.env.local` 真实密钥
- [ ] 汇总最终 Hackathon Demo 交付记录
- [ ] 明确 Deferred / Known Risks

## 风险和待确认

| Risk | Severity | Owner | Handling |
| --- | --- | --- | --- |
| LLM 供应商/模型未冻结 | High | Dev | 先封装 provider，保持 schema 稳定 |
| Prompt 尚未经过产品确认 | High | Product + Dev | 已建立 `docs/13_prompt_handoff.md`；Phase 6 已补 AI PM、过短/跑题、300 字和事实边界规则，Phase 10 前完成产品 review、调整和冻结 |
| Figma 未到位 | Medium | Design | 先低保真骨架，等待替换 |
| PRD 与当前契约存在差异 | Medium | Product + Dev | 流式报告已按 `docs/04_api_contracts.md` 实现并保留非流式兜底；题目 `weight` Phase 7 决定暂不入 schema，若产品坚持展示权重需走契约变更 |
| 移动端 STT 兼容不稳定 | Medium | Dev | 支持重试和手动编辑 |
| Web Speech 本机发音人差异 | Medium | Dev | Azure TTS 优先，Web 仅兜底 |
| Demo 网络不稳定 | High | Dev | 演示兜底样例包 |

## 当前下一步建议

1. 等 Figma 到位后执行 Phase 9：先审查状态覆盖，再按 design tokens 替换 setup/interview/report 视觉，不改状态机和接口结构。
2. Phase 10 作为发布冻结：用真实 LLM key 对三种面试官风格各跑一次端到端人工验收，完成 prompt 产品 review 和最终证据。
3. 若产品要求题目权重展示，再单独做 `weight` 契约变更，不在当前 schema 中隐式增加字段。
4. 保留 `tts-demo` 作为 Azure/Web Speech 对照验证样板，不迁移或删除。
