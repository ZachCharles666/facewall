# Prompt Handoff For Product Review

> 目标：正式发布前，把画像解析、题目生成、报告生成相关 prompt 暴露给产品 review 和调优。产品可调整表达策略、语气、样例重点，但不能破坏 API schema、事实边界和演示兜底。

## 1. 当前 Prompt 位置

| Prompt | Code Location | API Route | Current Status |
| --- | --- | --- | --- |
| 公共系统规则 | `lib/prompts/interview.ts` 的 `systemRules` | profile/questions/report 共用 | 已接入 |
| 候选人画像 prompt | `buildProfilePrompt` | `POST /api/profile/parse` | 已接入 |
| 题目生成 prompt | `buildQuestionsPrompt` | `POST /api/questions/generate` | 已接入 |
| 报告生成 prompt | `buildReportPrompt` | `POST /api/report/generate` | 已接入 |

## 2. 发布前必须暴露给产品的内容

| Review Item | Product Can Adjust | Product Must Not Change |
| --- | --- | --- |
| 面试官语气 | 风格文案、提问压迫感、反馈措辞强弱 | `interviewerStyleId` 枚举值：`strictHr`、`techBro`、`gentleSister` |
| 画像输出倾向 | 匹配点、风险点、补充建议的表达方式 | `CandidateProfile` 字段结构 |
| 题目生成策略 | 题目措辞、题型优先级、是否更贴 AI 产品经理场景 | 题目数量 3、`q1/q2/q3` 稳定 id、JSON 可解析 |
| 报告诊断语气 | 雷区标签风格、致命问题措辞、行动项颗粒度 | 6 个评分维度、分数范围、缺失答案不编造 |
| 嘴替答案风格 | 更强对比、更适合背诵、更像高分候选人 | 不新增公司名、金额、人数、奖项、增长率等硬事实 |
| 复制内容 | copyText 的排版、标题、段落顺序 | 必须同时包含“优化答案”和“复盘报告” |

## 3. 当前 Prompt 摘要

### 3.1 公共系统规则

当前规则：

```text
你是中文面试教练 API，只返回严格 JSON，不要 Markdown。
不得编造用户未提供的硬事实，例如公司名、指标、获奖经历。
信息不足时写入 suggestedSupplements 或在 diagnosis 中指出缺口。
优化答案要像候选人可背诵的口语化高分答案，但必须保留事实边界。
所有字段必须符合调用方给出的 JSON shape。
```

产品可调整：
- “中文面试教练”的定位描述。
- 诊断语气，例如更温和或更直接。

产品不可调整：
- “只返回严格 JSON”。
- “不得编造硬事实”。
- “字段必须符合 JSON shape”。

### 3.2 候选人画像 Prompt

当前任务：根据简历和 JD 生成 `CandidateProfile`。

输出必须包含：
- `summary`
- `matchedPoints`
- `riskPoints`
- `keywords`
- `evidenceMaterials`
- `suggestedSupplements`

产品重点 review：
- 匹配点是否像面试准备，而不是简历摘要。
- 风险点是否足够可行动。
- 补充建议是否能帮助用户补材料。

### 3.3 题目生成 Prompt

当前任务：生成 3 道可回答、可评分的中文面试题。

当前硬规则：
- 固定返回 3 道题。
- `id` 固定为 `q1/q2/q3`。
- 每题体现候选人画像、JD 关键词或风险点。
- 如果画像或 JD 是 AI 产品经理/AI 工具方向，题目要追问用户问题、产品判断、验证指标、模型能力边界或跨团队推进。
- `techBro` 是专业深挖，不在非技术岗位强行写代码题。

产品重点 review：
- 3 道题是否符合 Q1/Q2/Q3 编排。
- 是否需要增加 `weight` 字段。
- 是否需要把 Demo 样例调成 AI 产品经理实习场景。

### 3.4 报告生成 Prompt

当前任务：基于画像、问题和答案生成复盘报告。

当前硬规则：
- `questionReports` 必须与输入 questions 一一对应。
- 每题必须包含 6 个评分维度。
- 维度分数 0 到 20，总分 0 到 100。
- 答案为空时指出缺失，不替用户编造回答。
- 答案过短或跑题时指出问题，并给补充建议或保守嘴替。
- `finalReport.copyText` 必须同时包含“优化答案”和“复盘报告”。
- 优化答案只能改善结构和表达，必须保留事实边界。
- 每题 `optimizedAnswer` 控制在 300 个中文字符以内。

产品重点 review：
- 雷区标签是否足够有冲击力但不羞辱用户。
- 嘴替答案是否更像“可背诵”的高分表达。
- 60 秒口述版是否像真人能说出口。
- copyText 是否适合一键复制到备忘录/微信/文档。

## 4. 建议的产品调优流程

1. 产品先 review `docs/13_prompt_handoff.md`，确认想调的方向。
2. 开发把 `lib/prompts/interview.ts` 中对应 prompt 改成产品确认版本。
3. 使用演示样例包跑完整链路。
4. 使用真实 LLM key 跑三种面试官风格。
5. 对照以下检查项记录结果：

| Check | Pass Criteria |
| --- | --- |
| JSON 可解析 | API 不返回 `LLM_SCHEMA_INVALID` |
| 不编造事实 | 不出现用户未提供的公司、指标、奖项、人数、金额 |
| 风格有效 | 3 种面试官的题目和反馈语气可感知不同 |
| 题目贴合 | 3 道题体现简历/JD/风险点 |
| 报告可用 | 每题有评分、雷区、致命问题、优化答案、60 秒版 |
| 复制可用 | copyText 同时包含“优化答案”和“复盘报告” |

## 5. 发布前 Prompt Gate

正式发布或 Demo 冻结前，必须完成：

- [ ] 产品确认 3 种面试官风格语气。
- [ ] 产品确认 Demo 样例场景和高光表达。
- [ ] 产品确认画像 prompt。
- [ ] 产品确认题目生成 prompt。
- [ ] 产品确认报告生成 prompt。
- [ ] 开发用真实 LLM key 跑 3 种风格端到端。
- [ ] 开发验证 schema、缺失答案、不编造、复制文本。

## 6. 后续可选改造

当前 prompt 在 TypeScript 文件中。为了让产品更容易直接调整，后续可以改为：

```text
lib/prompts/templates/
├── system.md
├── profile.md
├── questions.md
└── report.md
```

改造要求：
- 读取 markdown prompt 后仍由 Route Handler 注入结构化 `outputShape`。
- prompt 文件不能包含真实密钥。
- 修改 prompt 后必须跑 typecheck 和 API smoke test。
