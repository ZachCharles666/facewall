# Module Instructions

> 执行开发时按模块推进。每个模块完成后，对照 `docs/02_acceptance_matrix.md` 填写证据。

## M01 App Shell & State Machine

### Tier
- L1

### Objective
- 建立主流程状态：`setup -> profile -> questions -> interview -> report`。
- 在 Next.js App Router 内保证后续真实 API、演示兜底、Figma UI 都接同一套状态。

### Acceptance
- A-001, A-002, D-001, D-004, G-001

### Contract Constraints
- 使用 `sessionStep` 枚举。
- 问题、答案、报告必须通过 `questionId` 关联。
- 不把中文展示文案作为逻辑 key。

### Edge And Failure Scenarios

| # | Scenario | Expected Behavior | Verification |
| --- | --- | --- | --- |
| 1 | 用户未填简历/JD直接开始 | 停留 setup，提示补充 | 手动测试 |
| 2 | 中途 API 失败 | 保留当前输入和已完成步骤 | 故障注入 |
| 3 | 用户切换面试官风格 | 清理依赖旧风格的画像/题目，或明确提示重新生成 | 手动测试 |

### Verification Steps
1. 使用演示样例跑通 5 个 step。
2. 检查每个 step 的 loading/error/empty 状态。
3. 检查 `questionId` 在答案和报告中一致。

### Dependency Handling

| Dependency | Status | Handling | Exit Condition |
| --- | --- | --- | --- |
| Figma | Not Ready | 低保真结构 | Figma 到位后只替换样式 |
| API | Not Ready | Next.js Route Handler 最小 fake service | 真实 API 接入且 schema 一致 |

### Integration Risks
- 状态机如果和 UI 组件混写，设计稿替换时会大面积返工。

## M02 Demo Scenario Package

### Tier
- L1

### Objective
- 提供稳定的演示兜底样例，覆盖输入、画像、题目、答案、报告。

### Acceptance
- A-002, B-002, C-003, F-004

### Contract Constraints
- 字段结构遵循 `docs/05_demo_scenario_contract.md`。
- 用户主动选择样例和系统失败兜底需要在 UI 上可区分。

### Edge And Failure Scenarios

| # | Scenario | Expected Behavior | Verification |
| --- | --- | --- | --- |
| 1 | LLM 不可用 | 提示后允许使用演示兜底继续 | 断网/模拟 500 |
| 2 | 演示数据缺字段 | 开发环境直接报错，不能静默生成空报告 | 单元测试 |

### Verification Steps
1. 一键填充后进入画像生成。
2. 禁用真实 API 后仍能走到报告页。

### Dependency Handling
- 产品内容未给定时，开发先维护第一版样例；产品后续只替换文本。

### Integration Risks
- 演示样例如果和真实 schema 不一致，会掩盖集成问题。

## M03 Profile Parse

### Tier
- L1

### Objective
- 将简历/JD解析为候选人画像，供题目和报告使用。

### Acceptance
- B-001, B-002, B-003, B-004

### Contract Constraints
- 输出必须包含 `summary/matchedPoints/riskPoints/keywords/evidenceMaterials/sourceMatches/suggestedSupplements`。
- `sourceMatches` 必须提供简历原文短语、JD 原文短语、匹配原因和 0 到 1 的置信度，用于 Profile 页高亮和解释。
- 信息不足时写 `suggestedSupplements`，不能编造。

### Edge And Failure Scenarios

| # | Scenario | Expected Behavior | Verification |
| --- | --- | --- | --- |
| 1 | 输入太短 | 返回 `INPUT_INVALID` | API 测试 |
| 2 | LLM JSON 格式错误 | 返回 `LLM_SCHEMA_INVALID`，允许重试/兜底 | schema 测试 |
| 3 | JD 缺失 | 提示补充 JD，不生成虚假岗位画像 | 手动测试 |

### Verification Steps
1. 用演示简历/JD调用接口。
2. 校验 JSON schema。
3. 检查题目生成是否引用画像关键词。

### Dependency Handling
- LLM 未接入时使用 fake service，但必须按真实 contract 返回。

### Integration Risks
- 画像字段太自由会导致题目 prompt 不稳定。

## M04 Question Generation

### Tier
- L1

### Objective
- 基于画像和面试官风格生成 3 道可回答、可评分的问题。

### Acceptance
- C-001, C-002, C-003, C-004

### Contract Constraints
- 固定返回 3 道题。
- 每题必须包含 intent 和 expectedSignals，供报告评分参考。

### Edge And Failure Scenarios

| # | Scenario | Expected Behavior | Verification |
| --- | --- | --- | --- |
| 1 | 画像风险点为空 | 仍生成基础经历/岗位匹配题 | API 测试 |
| 2 | 风格为技术老哥但岗位非技术 | 做专业深挖，不强行写代码题 | 人工验收 |
| 3 | LLM 超时 | 使用演示题目继续 | 故障注入 |

### Verification Steps
1. 三个风格各生成一次。
2. 检查题目是否含 JD 关键词或简历证据。
3. 检查 questionId 稳定。

### Dependency Handling
- 依赖 M03；M03 未完成时使用演示 profile。

### Integration Risks
- 问题如果没有 intent，报告容易泛泛而谈。

## M05 Interview Session

### Tier
- L1

### Objective
- 管理 3 道题的当前进度、播放、录音、文本编辑、答案保存。

### Acceptance
- D-001, D-002, D-004, E-004

### Contract Constraints
- 每条答案保存 `inputMode/durationSec/sttStatus`。
- 用户进入报告前必须知道哪些题缺答案。

### Edge And Failure Scenarios

| # | Scenario | Expected Behavior | Verification |
| --- | --- | --- | --- |
| 1 | 用户跳过某题 | 记录为空答案，报告前提示 | 手动测试 |
| 2 | STT 中断 | 保留已识别文字，可重试 | 手动测试 |
| 3 | 用户手动编辑识别结果 | `inputMode` 标记为 `edited` | 数据检查 |

### Verification Steps
1. 语音答一题，手动输入一题，跳过一题。
2. 检查 answers payload。

### Dependency Handling
- STT 不稳定时先提供文本输入主路径。

### Integration Risks
- 如果答案编辑不落状态，报告会拿到旧文本。

## M06 Voice Layer

### Tier
- L2

### Objective
- 接入 Azure TTS、Web Speech TTS fallback、STT 或手动编辑兜底。

### Acceptance
- E-001, E-002, E-003, E-004, E-005

### Contract Constraints
- 语音状态只驱动视觉动画，不声称展示真实音频波形。
- TTS 不可用不能阻断答题。
- 不在前端暴露 Azure key。

### Edge And Failure Scenarios

| # | Scenario | Expected Behavior | Verification |
| --- | --- | --- | --- |
| 1 | Azure key 缺失 | 显示 Azure 不可用，降级 Web Speech | 本地测试 |
| 2 | 浏览器没有中文男声 | 仍允许参数调整，并提示受本机发音人限制 | Chrome 测试 |
| 3 | 移动端 STT 不支持 | 切到手动编辑 | 手机 H5 测试 |

### Verification Steps
1. Azure 模式播放三种风格。
2. Web Speech 模式切换发音人、rate、pitch、volume。
3. 模拟 TTS 失败，确认流程继续。

### Dependency Handling
- Azure 为真实依赖；Web Speech 为浏览器能力；无语音时纯文本兜底。

### Integration Risks
- 不同设备发音人列表差异大，不能把某个本机 voice 当产品承诺。

## M07 Report Generation & Copy

### Tier
- L1

### Objective
- 基于画像、题目、答案生成每题复盘和最终报告，并支持复制。

### Acceptance
- F-001, F-002, F-003, F-004, F-005

### Contract Constraints
- 每题报告必须包含 6 个评分维度。
- `copyText` 必须包含优化答案和复盘报告。
- 不编造硬事实。

### Edge And Failure Scenarios

| # | Scenario | Expected Behavior | Verification |
| --- | --- | --- | --- |
| 1 | 某题无答案 | 报告指出缺失，不生成假回答 | API 测试 |
| 2 | AI 返回分数超出范围 | schema 校验失败并重试/报错 | 单元测试 |
| 3 | 剪贴板权限失败 | 展示可手动复制文本 | 手动测试 |

### Verification Steps
1. 用完整三题答案生成报告。
2. 用缺失答案生成报告。
3. 点击复制并校验剪贴板内容。

### Dependency Handling
- LLM 未接入时使用演示报告，但保留真实 request/response 结构。

### Integration Risks
- 报告字段如果和 UI 卡片结构不一致，会导致设计替换返工。

## M08 Design Integration Layer

### Tier
- L2

### Objective
- 等 Figma 到位后替换视觉，同时保持状态、API、数据结构不变。

### Acceptance
- G-001, G-002, G-003

### Contract Constraints
- 所有业务组件必须有明确 props，不直接在样式层发起 API。
- 使用 token/CSS variables 管理颜色、间距、字号、圆角。

### Edge And Failure Scenarios

| # | Scenario | Expected Behavior | Verification |
| --- | --- | --- | --- |
| 1 | 设计稿缺异常态 | 开发按契约补齐最小异常态 | 状态截图 |
| 2 | 移动端文本溢出 | 调整布局，不隐藏关键信息 | 手机截图 |
| 3 | 设计改了风格名称 | 只改展示 label，不改 styleId | 代码检查 |

### Verification Steps
1. 对 setup/interview/report 三屏做桌面和手机截图。
2. 切换全部 loading/error/empty 状态。

### Dependency Handling
- Figma 未到位前，先完成可替换低保真结构。

### Integration Risks
- 如果最终视觉要求大改信息架构，需要先更新 project plan 和 acceptance。
