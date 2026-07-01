# Acceptance Matrix

## A. 输入与演示样例

| ID | Dimension | Acceptance Criterion | Evidence Form | Pass |
| --- | --- | --- | --- | --- |
| A-001 | Functional | 用户可输入 resumeText 和 jdText，并选择 3 种面试官之一 | 页面截图/手动测试 | |
| A-002 | Functional | 一键填充演示样例后可直接进入主流程 | E2E 录屏或截图 | |
| A-003 | Error Path | 简历或 JD 为空时不能进入生成流程，并给出明确提示 | 手动测试 | |
| A-004 | Contract | 面试官风格使用稳定 id，不依赖中文文案做逻辑判断 | 代码检查 | |

## B. 候选人画像

| ID | Dimension | Acceptance Criterion | Evidence Form | Pass |
| --- | --- | --- | --- | --- |
| B-001 | Functional | 能输出匹配点、风险点、关键词、证据素材 | API 响应样例 | |
| B-002 | Error Path | LLM 失败时允许重试或进入演示兜底 | 故障注入 | |
| B-003 | Contract | 返回结构符合 `CandidateProfile` | JSON schema 校验 | |
| B-004 | Integration | 题目生成使用画像中的关键词和风险点 | 端到端样例 | |

## C. 题目生成

| ID | Dimension | Acceptance Criterion | Evidence Form | Pass |
| --- | --- | --- | --- | --- |
| C-001 | Functional | 每次生成 3 道题 | API 响应样例 | |
| C-002 | Functional | 题目能体现简历/JD和面试官风格 | 人工验收 | |
| C-003 | Error Path | 生成失败时可使用演示题目继续流程 | 故障注入 | |
| C-004 | Contract | 每题包含 `id/type/questionText/intent/expectedSignals/difficulty` | JSON schema 校验 | |

## D. 面试流程与状态机

| ID | Dimension | Acceptance Criterion | Evidence Form | Pass |
| --- | --- | --- | --- | --- |
| D-001 | Functional | 用户能按 3 道题顺序作答并回看当前答案 | 手动测试 | |
| D-002 | Functional | 支持跳过/编辑答案，但报告生成前明确提示缺失答案 | 手动测试 | |
| D-003 | Error Path | 页面刷新或异常不导致密钥泄露 | 日志检查 | |
| D-004 | Integration | 问题、答案、报告的 questionId 一致 | 数据检查 | |

## E. 语音能力

| ID | Dimension | Acceptance Criterion | Evidence Form | Pass |
| --- | --- | --- | --- | --- |
| E-001 | Functional | Azure TTS 可根据面试官风格选择发音人和参数 | 本地接口测试 | |
| E-002 | Functional | Web Speech API 可作为本地兜底 | Chrome 手动测试 | |
| E-003 | Error Path | TTS 不可用时隐藏或禁用播放入口，文本仍可继续 | 故障注入 | |
| E-004 | Error Path | STT 失败时允许重试，并保留已识别文本 | 手动测试 | |
| E-005 | Contract | 语音状态只驱动视觉动画，不声称是真实波形 | UI 检查 | |

## F. 报告生成与复制

| ID | Dimension | Acceptance Criterion | Evidence Form | Pass |
| --- | --- | --- | --- | --- |
| F-001 | Functional | 每题报告包含分数、风险标签、致命问题、诊断、优化答案、60 秒口述版 | API 响应样例 | |
| F-002 | Functional | 最终报告包含总分、总结、Top 风险、行动项 | 页面截图 | |
| F-003 | Functional | 一键复制内容包含优化答案和复盘报告 | 剪贴板测试 | |
| F-004 | Error Path | 报告生成失败时保留问题和答案，允许重试 | 故障注入 | |
| F-005 | Contract | 优化答案不得编造用户未提供的硬事实 | 人工抽查 | |

## G. 设计替换

| ID | Dimension | Acceptance Criterion | Evidence Form | Pass |
| --- | --- | --- | --- | --- |
| G-001 | Functional | Figma 到位后可替换页面样式，不改业务数据结构 | PR diff 检查 | |
| G-002 | Contract | loading/error/empty/unsupported/copy success 状态均有 UI 承载位 | 状态截图 | |
| G-003 | Integration | 移动端 H5 主流程无元素遮挡和文本溢出 | 移动端截图 | |
