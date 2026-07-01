# Remaining Phase Instructions

> 目标：把 Phase 0-5A 之后的剩余工作拆成可执行、可验收、不会互相污染的 Phase。  
> 适用范围：从 2026-06-30 当前状态到 Hackathon Demo 发布冻结。

## 1. 拆分原则

当前已完成：
- Phase 0：规划和契约。
- Phase 1：Next.js 本地闭环骨架。
- Phase 2：API 和 AI 生成工程接入。
- Phase 3：语音层。
- Phase 4：报告和复制。
- Phase 5A：Design readiness、PRD traceability、Prompt handoff。

后续不再把所有剩余事项塞进一个 Phase 6。剩余工作拆为：

| Phase | Name | Figma Dependency | Primary Goal | Can Start Now |
| --- | --- | --- | --- | --- |
| Phase 6 | Demo Content & Productization | No | 把演示样例、报告内容和产品文案打磨到可展示 | Yes |
| Phase 7 | Report Streaming & PRD Gaps | No | 补流式报告、单题复制/重新生成等非视觉产品缺口 | Yes |
| Phase 8 | Demo Operations & Fault Controls | No | 做现场兜底、故障注入、README、部署和 smoke 验证 | Yes |
| Phase 9 | Figma Visual Integration | Yes | 按 Figma 替换 setup/interview/report 视觉，不改业务契约 | No |
| Phase 10 | Release Freeze & Acceptance | After Phase 6-9 | 真实依赖验收、prompt 冻结、最终录屏截图和发布记录 | Partially |

执行顺序建议：
1. Figma 未到位前，优先做 Phase 6、Phase 7、Phase 8。
2. Figma 到位后，进入 Phase 9。Phase 9 不阻塞 Phase 6-8 的非视觉工作。
3. Phase 10 是发布冻结阶段，依赖 Phase 6-9 的结果；其中 prompt 产品 review 可以提前启动，但冻结必须在发布前完成。

## 2. Phase 6 - Demo Content & Productization

### Objective

把当前能跑通的 Demo 从“工程可用”提升到“产品可演示”：样例场景更贴 Hackathon、报告内容更有高光、复制内容更适合现场展示。

### Scope

| Work Item | PRD IDs | Modules | Figma Needed |
| --- | --- | --- | --- |
| Demo 样例包改成 AI 产品经理实习场景 | PRD-002, PRD-007, PRD-100 to PRD-104 | M02, M07 | No |
| 一键填充样例后的 Demo 顺滑度优化 | PRD-011, PRD-100 | M01, M02 | No |
| 报告内容产品化：雷区、致命问题、嘴替答案对比更强 | PRD-002, PRD-005, PRD-048, PRD-096, PRD-103 | M07 | No |
| copyText 排版和标题确认 | PRD-018, PRD-050, PRD-062, PRD-104 | M07 | No |
| 300 字以内嘴替答案约束策略 | PRD-050, PRD-077 | M07 | No |

### Execution Instruction

1. 开始前阅读 `AGENTS.md`、`docs/todo.md`、`docs/05_demo_scenario_contract.md`、`docs/12_prd_traceability_matrix.md`、`docs/13_prompt_handoff.md`。
2. 不改 `sessionStep`、`questionId`、API 字段名、错误码和 3 种风格枚举。
3. 优先修改演示数据、fallback 内容、报告文案和复制文本；除非必要，不改状态机。
4. 如增加“一键填充并开始”，必须保留现有“一键填充样例”可控路径，避免用户误触后无法修改输入。
5. 嘴替答案必须保留事实边界；不得新增用户未提供的公司、人数、金额、增长率、奖项。
6. 如对 prompt 做内容调整，先记录到 `docs/13_prompt_handoff.md` 的产品 review 范围，再改 `lib/prompts/interview.ts`。
7. 完成后更新 `docs/todo.md` 和 `docs/12_prd_traceability_matrix.md` 对应 PRD 状态。

### Verification

1. `npm run typecheck`。
2. 使用演示样例在 5 分钟内走完 setup -> profile -> questions -> interview -> report。
3. 复制内容必须同时包含“优化答案”和“复盘报告”。
4. 报告中每题仍包含分数、6 个维度、风险标签、致命问题、诊断、优化答案、60 秒版。
5. 缺失答案仍不编造，过短答案应给补充建议或保守嘴替。

### Edge And Failure Scenarios

| Scenario | Expected Behavior | Verification |
| --- | --- | --- |
| 用户点击样例后想修改输入 | 仍可编辑简历/JD，不被强制跳转锁死 | 浏览器手动测试 |
| 样例答案故意口语化、松散 | 报告指出问题并给高质量嘴替答案 | Demo 主流程 |
| copyText 被产品调整后 | 仍含“优化答案”和“复盘报告” | 剪贴板校验 |

### Integration Risks

| Risk | Mitigation |
| --- | --- |
| 文案产品化时破坏 JSON/schema | 只改字符串内容，跑 schema/API smoke |
| 样例过度美化导致对比不强 | 保留普通回答中的口语、缺数据、结构松散问题 |
| 复制文本过长影响现场展示 | 控制标题清晰、段落短、首屏能看到嘴替答案 |

## 3. Phase 7 - Report Streaming & PRD Gaps

### Objective

补齐 PRD 中不依赖 Figma 的报告体验缺口，优先实现流式报告体验，同时保留非流式 `/api/report/generate` 作为稳定兜底。

### Scope

| Work Item | PRD IDs | Modules | Figma Needed |
| --- | --- | --- | --- |
| `/api/report/generate-stream` SSE 或等价流式接口 | PRD-027, PRD-072 | M07 | No |
| 前端报告生成中增量展示 | PRD-027 | M07, M01 | No |
| 流式失败后自动/手动切非流式保底 | PRD-105, PRD-108 | M07, M02 | No |
| 单题复制嘴替答案 | PRD-050, PRD-062 | M07 | No |
| 单题重新生成嘴替答案，不清空其他题 | PRD-028, PRD-063, PRD-089 | M07 | No |
| 题目 `weight` 是否入 schema 的最终处理 | PRD-014, PRD-035 to PRD-037, PRD-073 | M04, M07 | No |
| 过短/跑题答案专项诊断测试 | PRD-053, PRD-054 | M07 | No |

### Execution Instruction

1. 开始前阅读 `AGENTS.md`、`docs/04_api_contracts.md`、`docs/06_module_instructions.md` 的 M04/M07、`docs/12_prd_traceability_matrix.md`。
2. 流式实现必须遵循 `docs/04_api_contracts.md` 4.1：同一 request payload，最终产出同构 `InterviewReport`。
3. 不允许删除或弱化非流式 `/api/report/generate`；它是浏览器不支持流式、LLM 流式失败、自动化验收和本地兜底的保底接口。
4. 流式前端状态必须保留原问题和答案；失败后提供重试和非流式兜底。
5. 单题复制只复制该题的优化答案或 60 秒版，不影响整份报告复制。
6. 单题重新生成只更新目标 `questionId` 的 report item；不得清空其他题报告、answers 或 final report 的可用内容。
7. `weight` 字段在产品确认前不要擅自进 schema；如果决定加入，先更新 `docs/04_api_contracts.md`、types、schema、demo data、prompt 和 PRD 矩阵。

### Verification

1. `npm run typecheck`。
2. 非流式完整报告 API 仍通过：3 份 `questionReports` + `finalReport.copyText`。
3. 流式接口成功路径：能收到 progress/questionReport/final，final 可还原完整 `InterviewReport`。
4. 流式失败路径：前端保留 answers，能切非流式保底生成报告。
5. 单题复制成功和剪贴板失败兜底均可用。
6. 单题重新生成后，其他题报告不变。
7. 缺失答案、过短答案、跑题答案至少各跑一次 smoke。

### Edge And Failure Scenarios

| Scenario | Expected Behavior | Verification |
| --- | --- | --- |
| SSE 中途断开 | 显示失败态，保留问题和答案，允许非流式兜底 | 故障注入 |
| final event schema 不合法 | 拒绝进入 report 完成态，提示可重试/兜底 | schema 测试 |
| 单题重新生成失败 | 保留旧的该题报告，不影响其他题 | 浏览器手动测试 |
| 剪贴板权限被拒绝 | 显示手动复制文本框 | 浏览器手动测试 |

### Integration Risks

| Risk | Mitigation |
| --- | --- |
| 流式和非流式字段语义分叉 | 共用 schema/type，final event 必须通过同一校验 |
| 单题重新生成导致 overallScore 不一致 | 明确是否重算 finalReport；如果暂不重算，UI 要标注仍可重新生成整份报告 |
| `weight` 字段引入后牵连大 | 先做契约变更，再改实现；不做隐式字段 |

## 4. Phase 8 - Demo Operations & Fault Controls

### Objective

把现场 Demo 的运行、兜底、故障注入和交付说明补齐，确保网络、LLM、TTS、STT、clipboard 异常时仍可控。

### Scope

| Work Item | PRD IDs | Modules | Figma Needed |
| --- | --- | --- | --- |
| dev-only 故障注入开关 | PRD-105, PRD-108 | M02, M06, M07, Ops | No |
| 显式 Mock / Demo fallback 切换 | PRD-099, PRD-108 | M02, Ops | No |
| `.env.example` | PRD-085, PRD-099 | Ops | No |
| README / Quick Start / 部署说明 | PRD-085, PRD-099 | Ops | No |
| 本地 contract smoke 脚本 | PRD-094, PRD-105 | M03, M04, M07, Ops | No |
| 密钥和日志安全检查 | AGENTS hard boundary | Ops | No |
| Azure TTS 真实 key 验收记录 | PRD-059, PRD-082 | M06 | No |

### Execution Instruction

1. 开始前阅读 `AGENTS.md`、`docs/10_hackathon_demo_runbook.md`、`docs/11_delivery_status_overview.md`、`docs/12_prd_traceability_matrix.md`。
2. 故障注入必须是 dev-only，不在正式用户流程中暴露危险控制。
3. 任何日志、README、截图、文档都不得输出 `.env.local` 真实密钥。
4. Mock/Demo fallback 切换必须清楚标记，避免评审误认为真实 LLM 输出。
5. `.env.example` 只能写变量名和占位说明，不能写真实值。
6. smoke 脚本要覆盖 profile/questions/report、缺失答案、报告失败兜底、复制文本关键约束。
7. 完成后更新 Demo runbook、todo、交付总账。

### Verification

1. `npm run typecheck`。
2. 按 README 从零启动本地应用。
3. 使用 smoke 脚本或等价命令验证 profile/questions/report 关键路径。
4. 触发 LLM/TTS/STT/clipboard 故障，确认主流程不崩。
5. 搜索输出文件和文档，确认不包含真实密钥。
6. Azure TTS 若有真实 key，验证 3 种风格至少各播放一次；无 key 时记录 Web Speech 兜底通过。

### Edge And Failure Scenarios

| Scenario | Expected Behavior | Verification |
| --- | --- | --- |
| 现场网络不可用 | 使用演示兜底样例走完整闭环 | Demo runbook |
| LLM provider 超时 | 提示可重试，可切 fallback，不丢输入 | 故障注入 |
| Azure TTS key 缺失 | Web Speech 兜底，文本流程继续 | 本地测试 |
| clipboard 权限失败 | 展示手动复制文本 | 浏览器测试 |

### Integration Risks

| Risk | Mitigation |
| --- | --- |
| 故障注入进入生产体验 | 用环境变量或开发模式保护，并在 README 说明 |
| README 和真实环境不一致 | 按 README 自测一次从零启动 |
| 安全检查遗漏密钥 | 使用搜索命令检查常见 key 片段和 env 变量名，禁止输出真实值 |

## 5. Phase 9 - Figma Visual Integration

### Objective

Figma 到位后，用设计稿替换当前低保真视觉。只改视觉层和组件样式，不重写状态机、API 契约、数据结构和 `tts-demo`。

### Scope

| Work Item | PRD IDs | Modules | Figma Needed |
| --- | --- | --- | --- |
| 审查 Figma 页面和状态覆盖 | PRD-087 to PRD-090, PRD-103, PRD-110 | M08 | Yes |
| 建立最终 design token 映射 | G-001, G-002 | M08 | Yes |
| 替换 setup 视觉 | PRD-065, PRD-087, PRD-091, PRD-093 | M01, M08 | Yes |
| 替换 profile/questions/interview 视觉 | PRD-066 to PRD-068, PRD-088 | M03, M04, M05, M06, M08 | Yes |
| 替换 report 视觉和对比展示 | PRD-049, PRD-069, PRD-089, PRD-090, PRD-103, PRD-110 | M07, M08 | Yes |
| 桌面和手机 H5 视觉验收 | G-003 | M08 | Yes |

### Execution Instruction

1. 开始前阅读 `AGENTS.md`、`docs/07_design_handoff_contract.md`、`docs/09_phase5_design_readiness.md`、`docs/04_api_contracts.md`、`docs/06_module_instructions.md` 的 M08。
2. 先审查 Figma 是否覆盖 setup/profile/questions/interview/report，以及 loading/error/empty/unsupported/copy success 状态。
3. 如果 Figma 缺异常态，开发按现有契约补齐最小状态，不等待设计补完。
4. 只替换视觉和组件布局；不改 `sessionStep`、`questionId`、API payload、schema、错误码。
5. 颜色、间距、字体、圆角、阴影通过 token/CSS variables 集中管理。
6. 不把 UI 文案作为逻辑 key；风格 label 可改，style id 不可改。
7. 移动端必须无横向溢出，按钮和长文本不能重叠。
8. 完成后补桌面和手机截图/录屏证据，并更新 `docs/todo.md`。

### Verification

1. `npm run typecheck`。
2. 桌面 viewport 完整走一遍 Demo。
3. 手机 H5 viewport 完整走一遍 Demo，检查无横向滚动。
4. 截图覆盖 setup/profile/interview/report。
5. 状态覆盖：loading/error/empty/unsupported/copy success 至少各有承载位。
6. 复制成功和剪贴板失败兜底仍可用。
7. TTS 不可用、STT 不支持时，视觉不遮挡文本答题路径。

### Edge And Failure Scenarios

| Scenario | Expected Behavior | Verification |
| --- | --- | --- |
| Figma 缺 report 失败态 | 仍按契约展示重试和演示兜底 | 状态截图 |
| Figma 修改风格名称 | 只改展示 label，不改 enum | 代码检查 |
| 长嘴替答案撑破卡片 | 文本换行和滚动策略稳定，无重叠 | 手机截图 |
| 语音不支持 | 文本问题和手动输入仍可见 | 浏览器测试 |

### Integration Risks

| Risk | Mitigation |
| --- | --- |
| 视觉替换顺手改业务状态 | 每次改动前确认文件边界；涉及 API/schema 先停下更新契约 |
| 设计稿只覆盖 happy path | 用 `docs/09_phase5_design_readiness.md` 的状态清单补齐 |
| 移动端文本溢出 | 对按钮、卡片、报告长文做 viewport 验证 |

## 6. Phase 10 - Release Freeze & Acceptance

### Objective

在发布或正式 Demo 前冻结产品内容、prompt、真实依赖和证据材料，形成最终可交付版本。

### Scope

| Work Item | PRD IDs | Modules | Figma Needed |
| --- | --- | --- | --- |
| 产品 prompt review、调整和冻结 | PRD-075 to PRD-079A | M03, M04, M07 | No |
| 真实 LLM 三风格端到端验收 | PRD-003, PRD-056, PRD-075 to PRD-077, PRD-095, PRD-097 | M03, M04, M07 | No |
| 真实 Azure TTS / Web Speech fallback 复验 | PRD-059, PRD-082, PRD-098 | M06 | No |
| 故障注入复验 | PRD-105, PRD-106, PRD-108 | M02, M06, M07, Ops | No |
| 最终桌面和手机录屏/截图 | PRD-006, PRD-094, PRD-103, PRD-104 | M01-M08 | After Figma |
| 发布记录和已知风险清单 | PRD-099 | Ops | No |

### Execution Instruction

1. 开始前阅读 `AGENTS.md`、`docs/todo.md`、`docs/10_hackathon_demo_runbook.md`、`docs/12_prd_traceability_matrix.md`、`docs/13_prompt_handoff.md`。
2. 产品必须按 `docs/13_prompt_handoff.md` 确认 3 种风格、画像 prompt、题目 prompt、报告 prompt、Demo 样例和 copyText。
3. 真实 LLM 验收至少覆盖 3 种面试官风格，每种完整跑一次 profile -> questions -> report。
4. 每次真实 LLM 输出都检查：JSON 可解析、不编造、题目贴合简历/JD、报告诊断可用、嘴替答案可背诵。
5. 故障注入复验必须覆盖 LLM、TTS、STT、clipboard。
6. 最终录屏/截图不得包含 `.env.local`、provider key、后台敏感日志。
7. 发布前更新 `docs/todo.md`、`docs/11_delivery_status_overview.md`、`docs/12_prd_traceability_matrix.md`，明确 Pass、Deferred 和 Known Risks。

### Verification

1. `npm run typecheck`。
2. contract smoke 全部通过。
3. Demo 样例 5 分钟内闭环通过。
4. 真实 LLM 三风格闭环通过或风险被明确记录。
5. TTS/STT/fallback/clipboard 故障路径通过。
6. 桌面和手机最终截图/录屏完成。
7. 文档中没有真实密钥。

### Edge And Failure Scenarios

| Scenario | Expected Behavior | Verification |
| --- | --- | --- |
| 真实 LLM 输出质量不稳定 | 回退到演示兜底，记录模型/prompt 风险 | 人工验收 |
| 产品要求改 prompt 但会破坏 schema | 先拆成可调文本和不可调契约，必要时更新 API contract | Prompt gate |
| 发布前 Figma 仍未到位 | 使用低保真视觉发布 Demo，并把 Phase 9 标为 Deferred/Pending Figma | Acceptance record |
| 现场网络故障 | 使用 Demo fallback 完成闭环 | Runbook 演练 |

### Integration Risks

| Risk | Mitigation |
| --- | --- |
| 最终阶段临时改需求导致回归 | 新需求先映射 PRD/Change ID，再决定是否进本轮 |
| prompt 调优破坏事实边界 | 每轮调优后跑缺失答案、不编造和 schema 检查 |
| 录屏才发现视觉/状态缺口 | Phase 9 完成后立刻录一次预验收视频 |

## 7. Current Recommendation

当前 Figma 尚未到位时，建议执行顺序：

1. Phase 6：先把 Demo 样例和报告内容产品化。
2. Phase 8：补现场兜底、README、`.env.example`、故障注入和 smoke。
3. Phase 7：做流式报告和单题操作；如果时间紧，先做流式 + 单题复制，把单题重新生成降级为后续。
4. Phase 9：Figma 到位后再做视觉替换。
5. Phase 10：发布冻结和最终验收。

最低发布线：
- Phase 6：必须完成。
- Phase 8：必须完成核心兜底和 README。
- Phase 9：如果 Figma 未到位，可明确 Pending Figma，不阻塞低保真 Demo。
- Phase 10：必须完成最终验收记录。
- Phase 7：流式优先，但非流式已可保底；如果时间不足，记录为 Known Risk。
