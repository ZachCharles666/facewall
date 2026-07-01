# PRD Requirements Traceability Matrix

> 需求源：`D:\hackthon\facewall\产品需求文档 - 面试嘴替教练 Hackathon MVP.docx`。  
> 目的：把 PRD 中可拆出的产品需求逐条映射到当前功能模块、Phase、实现状态和剩余缺口，避免遗漏。

## 1. 状态说明

| Status | Meaning |
| --- | --- |
| Done | 已实现并有验证记录或代码证据 |
| Partial | 已覆盖核心能力，但和 PRD 描述还有差距 |
| Pending | 尚未实现，且仍在当前产品范围内 |
| Pending Figma | 需要等 Figma 或视觉交付后才能完整实现/验收 |
| Deferred | PRD 或项目边界明确本期不做 |
| Contract Divergence | PRD 与当前 Alpha 契约不一致，需产品/开发确认后才能改 |

## 2. PRD 全量需求拆解表

| PRD ID | PRD Source | Requirement | Priority | Module | Current Phase / Status | Wait Figma? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PRD-001 | 1 产品概述 | 产品定位为 5 分钟闭环 AI 面试复盘工具，不做大而全平台 | P0 | M01, M02, M07 | Phase 1-4 Done | No | 主闭环已跑通 |
| PRD-002 | 1 产品概述 | 核心高光是把普通回答改写成可复制、可背诵、高分嘴替答案 | P0 | M07 | Phase 6 Done / Pending Figma for visual highlight | No | AI PM 样例和报告内容已打磨；视觉中心等 Figma |
| PRD-003 | 2.1 痛点 | 根据简历与 JD 自动生成高命中问题 | P0 | M03, M04 | Phase 2 Done | No | 真实 LLM 质量需 Phase 6 验收 |
| PRD-004 | 2.1 痛点 | 用 STAR/CAR 结构重写回答 | P0 | M07 | Phase 4 Partial | No | Prompt 有结构化要求；未强制 schema 标注 STAR/CAR |
| PRD-005 | 2.1 痛点 | 用雷区标签、扣分原因、改写版本形成强对比 | P0 | M07, M08 | Phase 4 Partial | Figma for contrast UI | 雷区/诊断/改写已实现；原回答对比视觉未完成 |
| PRD-006 | 2.2 成功目标 | 用户 5 分钟内完成输入、答题、诊断、改写、复制 | P0 | M01-M07 | Phase 1-4 Done | No | Demo runbook 已覆盖 |
| PRD-007 | 2.2 成功目标 | 评委能感知普通回答和嘴替答案质量跃迁 | P0 | M02, M07, M08 | Phase 6 Partial | Figma for final highlight | AI PM 样例和报告高光已完成；视觉冲击仍等 Figma |
| PRD-008 | 2.2 成功目标 | 不引入登录、数据库、多人协作、实时提词器等高成本模块 | P0 | Scope | Phase 0 Done | No | 已写入硬边界 |
| PRD-009 | 2.2 成功目标 | 输出贴合真实经历，不生成虚假经历或夸大事实 | P0 | M03, M07 | Phase 2-4 Done | No | schema/prompt/缺失答案兜底已覆盖 |
| PRD-010 | 3.1 范围 | 简历/经历片段输入与 JD 输入 | P0 | M01 | Phase 1 Done | No | `SetupPanel` |
| PRD-011 | 3.1 范围 | 一键填充 Demo 样例 | P0 | M02 | Phase 1 Done | No | `demoScenario` |
| PRD-012 | 3.1 范围 | 面试官风格选择 | P0 | M01, M04 | Phase 1 Done | No | 产品确认当前按 3 种风格执行 |
| PRD-013 | 3.1 范围 | AI 解析候选人画像与岗位匹配点 | P0 | M03 | Phase 2 Done | No | 输出匹配点、风险点、关键词、证据素材 |
| PRD-014 | 3.1 范围 | 按题型权重生成 3 道面试题 | P0 | M04 | Phase 2 Partial | No | 固定 3 题已实现；未显式输出 PRD 的题型权重字段 |
| PRD-015 | 3.1 范围 | TTS 读题与文字展示 | P0 | M06 | Phase 3 Done | No | Azure + Web Speech fallback |
| PRD-016 | 3.1 范围 | 语音答题转文字，保留手动编辑能力 | P0 | M05, M06 | Phase 3 Done | No | STT failed/unsupported/manual 已覆盖 |
| PRD-017 | 3.1 范围 | 单题评分、雷区诊断、嘴替答案改写 | P0 | M07 | Phase 4 Done | No | 每题报告卡片已覆盖 |
| PRD-018 | 3.1 范围 | 最终复盘报告与一键复制 | P0 | M07 | Phase 4 Done | No | 复制文本包含优化答案和复盘报告 |
| PRD-019 | 3.2 不做 | 实时面试提词器本期不做 | P0 | Scope | Deferred | No | 与当前硬边界一致 |
| PRD-020 | 3.2 不做 | 用户登录与历史记录本期不做 | P0 | Scope | Deferred | No | 与当前硬边界一致 |
| PRD-021 | 3.2 不做 | 多轮追问自由对话本期不做 | P0 | Scope | Deferred | No | 当前只固定 3 题 |
| PRD-022 | 3.2 不做 | 音频文件上传和存储本期不做 | P0 | Scope | Deferred | No | 当前只保存文本答案 |
| PRD-023 | 3.2 不做 | 真人社交陪练本期不做 | P0 | Scope | Deferred | No | 与 MVP 边界一致 |
| PRD-024 | 4 流程 | Setup 校验输入长度并提供样例 | P0 | M01, M02 | Phase 1 Done | No | 前端空输入拦截；API 校验长度 |
| PRD-025 | 4 流程 | Profile 展示匹配点、风险点 | P0 | M03, M08 | Phase 1-2 Done | No | 低保真已展示 |
| PRD-026 | 4 流程 | Interview 逐题听题、口述或输入答案，保存每题文本 | P0 | M05, M06 | Phase 3 Done | No | questionId 关联 |
| PRD-027 | 4 流程 | Generating 等待流式输出 | P1 | M07 | Phase 7 Done | No | `/api/report/generate-stream` SSE 和前端增量展示已实现；非流式仍保底 |
| PRD-028 | 4 流程 | Report 查看对比、复制答案、重新生成 | P0/P1 | M07, M08 | Phase 7 Partial | Figma for comparison | 单题复制和单题重新生成已完成；原回答对比视觉仍等 Figma |
| PRD-029 | 5 题型策略 | MVP 固定 3 道题，不随机生成 | P0 | M04 | Phase 2 Done | No | 固定返回 3 题 |
| PRD-030 | 5.1 题型池 | 支持岗位匹配与动机题 | P0 | M04 | Phase 2 Done | No | `motivation` |
| PRD-031 | 5.1 题型池 | 支持行为 STAR 题 | P0 | M04 | Phase 2 Done | No | `behavior` |
| PRD-032 | 5.1 题型池 | 支持项目深挖题 | P0 | M04 | Phase 2 Done | No | `project` |
| PRD-033 | 5.1 题型池 | 支持岗位专业题 | P0 | M04 | Phase 2 Done | No | `technical` |
| PRD-034 | 5.1 题型池 | 支持压力与短板题 | P0 | M04 | Phase 2 Done | No | `pressure` |
| PRD-035 | 5.2 编排 | Q1 默认岗位匹配/动机，权重 30% | P0 | M04 | Partial | No | 题目可生成；未输出 `weight` 字段 |
| PRD-036 | 5.2 编排 | Q2 默认行为 STAR 或项目深挖，权重 40% | P0 | M04 | Partial | No | 题目可生成；未输出 `weight` 字段 |
| PRD-037 | 5.2 编排 | Q3 默认岗位专业或压力短板，权重 30% | P0 | M04 | Partial | No | 题目可生成；未输出 `weight` 字段 |
| PRD-038 | 5.3 风格 | 温柔引导型 HR | P0 | M01, M04, M06 | Done / Label Divergence | No | 当前为 `gentleSister` 温柔大姐姐 |
| PRD-039 | 5.3 风格 | 大厂压力面试官 | P0 | M01, M04, M06 | Done / Label Divergence | No | 当前为 `strictHr` 大厂严厉 HR |
| PRD-040 | 5.3 风格 | 业务负责人 | P1 | M01, M04 | Deferred | No | 产品确认当前不纳入，本轮固定 3 种风格 |
| PRD-041 | 5.3 风格 | 技术/专业深挖官 | P0 | M01, M04, M06 | Done / Label Divergence | No | 当前为 `techBro` 技术老哥 |
| PRD-042 | 6.1 评分 | 岗位相关性评分 | P0 | M07 | Done | No | `jobRelevance` |
| PRD-043 | 6.1 评分 | 结构清晰度评分 | P0 | M07 | Done | No | `structure` |
| PRD-044 | 6.1 评分 | 证据与数据评分 | P0 | M07 | Done | No | `evidence` |
| PRD-045 | 6.1 评分 | 表达专业度评分 | P0 | M07 | Done | No | `professionalExpression` |
| PRD-046 | 6.1 评分 | 真实性与边界评分 | P0 | M07 | Done | No | `truthBoundary` |
| PRD-047 | 6.1 评分 | 临场完整度评分 | P0 | M07 | Done | No | `completeness` |
| PRD-048 | 6.2 报告 | 诊断卡包含单题分数、2-3 个雷区标签、一句话致命问题 | P0 | M07 | Done | No | ReportPanel 已展示 |
| PRD-049 | 6.2 报告 | 对比卡包含原回答摘录、问题标注、改写提升点 | P1 | M07, M08 | Pending | Figma likely | 当前未展示原回答摘录和逐句问题标注 |
| PRD-050 | 6.2 报告 | 嘴替卡包含 300 字以内高分答案、60 秒口语版、一键复制 | P0 | M07 | Phase 7 Done | No | 300 字策略、60 秒版、整份复制和单题复制均已验证 |
| PRD-051 | 6.3 改写 | 原回答缺数据时提示可补充，不捏造数值 | P0 | M07 | Partial | No | 缺失答案已保守；缺数据场景需真实 LLM 抽查 |
| PRD-052 | 6.3 改写 | 简历与 JD 匹配低时表达可迁移能力，不硬套岗位技能 | P0 | M03, M07 | Partial | No | Prompt 原则已写；需真实 LLM 验收 |
| PRD-053 | 6.3 改写 | 用户回答过短时给追问式补全建议和保守嘴替答案 | P1 | M07 | Phase 7 Done | No | fallback 和 smoke 已稳定覆盖“回答过短”；真实 LLM 抽查放 Phase 10 |
| PRD-054 | 6.3 改写 | 用户跑题时诊断指出跑题，嘴替答案回到核心 | P1 | M07 | Phase 7 Done | No | fallback 和 smoke 已稳定覆盖“疑似跑题”；真实 LLM 抽查放 Phase 10 |
| PRD-055 | 7.1 F-01 | 背景输入：简历/JD，空输入禁止开始，提供样例填充 | P0 | M01, M02 | Done | No | 已实现 |
| PRD-056 | 7.1 F-02 | 面试官风格卡片单选，影响题目和反馈语气 | P0 | M01, M04, M07 | Partial | No | 题目风格有影响；报告语气风格需真实 LLM 验收 |
| PRD-057 | 7.1 F-03 | 候选人画像展示 3 个匹配点和 2 个风险点 | P0 | M03 | Done | No | schema 支持多项，demo 有覆盖 |
| PRD-058 | 7.1 F-04 | 一次性生成 3 道题并标注题型，JSON 可解析 | P0 | M04 | Done | No | 已实现 |
| PRD-059 | 7.1 F-05 | TTS 读题，浏览器支持时读题，不支持静默降级 | P0 | M06 | Done | No | 已实现 |
| PRD-060 | 7.1 F-06 | Web Speech API 转写答案，用户可手动编辑 | P0 | M05, M06 | Done | No | 已实现 |
| PRD-061 | 7.1 F-07 | 3 道题均有结构化报告 | P0 | M07 | Done | No | 已实现 |
| PRD-062 | 7.1 F-08 | 复制单题嘴替答案或整份报告，复制后成功反馈 | P0 | M07 | Phase 7 Done | No | 整份报告、单题优化答案、单题 60 秒版均可复制；剪贴板失败可手动复制 |
| PRD-063 | 7.1 F-09 | 针对某题重新生成嘴替答案，不清空其他题 | P1 | M07 | Phase 7 Done | No | `/api/report/regenerate-question` 和前端按钮已实现，只替换目标 `questionId` |
| PRD-064 | 7.1 F-10 | 根据三题表现生成至少 3 条训练建议 | P1 | M07 | Done | No | `actionItems` |
| PRD-065 | 7.2 页面 | Setup 包含简历输入、JD 输入、风格单选、样例按钮 | P0 | M01, M08 | Done | No | 低保真已实现 |
| PRD-066 | 7.2 页面 | Profile 包含匹配点卡片、风险点卡片、开始面试按钮 | P0 | M03, M08 | Done | Figma for polish | 低保真已实现 |
| PRD-067 | 7.2 页面 | Interview 包含 AI 面试官头像/声波、题目、进度条、录音按钮、答案框 | P0/P1 | M05, M06, M08 | Partial | Figma | 题目/录音/答案框已做；头像/声波/正式进度条待设计 |
| PRD-068 | 7.2 页面 | 每题可跳过；第三题完成后生成嘴替报告 | P0 | M05 | Done | No | 已实现，按钮不强依赖第三题完成 |
| PRD-069 | 7.2 页面 | Report 包含总分、题目标签、雷区标签、原回答、嘴替答案、复制按钮 | P0 | M07, M08 | Partial | Figma for layout | 总分/标签/雷区/嘴替/复制已做；原回答展示不足 |
| PRD-070 | 8.1 LLM | 画像解析 1 次非流式 JSON 输出 | P0 | M03 | Done | No | 已实现 |
| PRD-071 | 8.1 LLM | 题目生成 1 次非流式 JSON 输出 | P0 | M04 | Done | No | 已实现 |
| PRD-072 | 8.1 LLM | 报告生成 1 次流式输出 | P1 | M07 | Phase 7 Done | No | SSE 流式接口已实现，`final` 事件产出完整 `InterviewReport`；非流式 API 保留 |
| PRD-073 | 8.2 输出协议 | 题目输出包含 id、type、weight、question、evaluation_focus | P0 | M04 | Phase 7 Decision | No | `evaluation_focus` 由 `expectedSignals` 承载；`weight` 暂不入 schema，后续如要展示需先变更契约 |
| PRD-074 | 8.2 输出协议 | 报告输出包含 overall_score、items、risk_tags、fatal_issue、rewrite、sixty_second_version、next_actions | P0 | M07 | Done / Naming Divergence | No | 当前字段为 camelCase 契约 |
| PRD-075 | 8.3 Prompt | 输出必须引用用户经历或 JD 关键词，避免空泛模板 | P0 | M03, M04, M07 | Partial | No | Prompt 已要求；需真实 LLM 验收 |
| PRD-076 | 8.3 Prompt | 诊断直接但不羞辱用户 | P0 | M07 | Partial | No | Prompt 已要求；需真实 LLM 验收 |
| PRD-077 | 8.3 Prompt | 嘴替答案 300 字以内并提供 60 秒口语版 | P0 | M07 | Phase 6 Done / 可抽查 | No | Prompt 已要求 300 字以内；fallback 优化答案验证为 165/155/150 字；真实 LLM 后续抽查 |
| PRD-078 | 8.3 Prompt | 信息不足时输出建议补充信息，不能编造 | P0 | M03, M07 | Done / 可抽查 | No | Profile supplements 和缺失答案已覆盖 |
| PRD-079 | 8.3 Prompt | 输出可被前端解析，优先 JSON Schema | P0 | M03, M04, M07 | Done | No | 已实现运行时校验 |
| PRD-079A | 8.3 Prompt / 发布前补充要求 | 正式发布前暴露 prompt 给产品 review 和调整 | P0 | M03, M04, M07 | Pending | No | `docs/13_prompt_handoff.md` 已建立 review 清单；代码 prompt 后续可迁移为产品可编辑模板 |
| PRD-080 | 9.1 技术 | React / Next.js 单页应用 | P0 | M01 | Done | No | Next.js App Router |
| PRD-081 | 9.1 技术 | 语音识别优先 Web Speech API，不支持手动输入 | P0 | M06 | Done | No | 已实现 |
| PRD-082 | 9.1 技术 | 语音合成优先浏览器 SpeechSynthesis，需要更好音色再接第三方 TTS | P0 | M06 | Done / Enhanced | No | 当前 Azure 优先，Web Speech 兜底，符合项目硬边界 |
| PRD-083 | 9.1 技术 | 服务端封装 parseProfile、generateQuestions、generateReport | P0 | M03, M04, M07 | Done | No | 已实现 |
| PRD-084 | 9.1 技术 | MVP 不落库，仅 Session 内存保存 | P0 | M01 | Done | No | 前端 state 保存 |
| PRD-085 | 9.1 技术 | Vercel/Netlify 部署和本地 Demo 兜底 | P1 | Ops | Phase 8 Partial | No | README 已补本地 Quick Start 和部署说明；实际线上部署待发布阶段 |
| PRD-086 | 9.2 状态 | SessionState 包含 resume、jd、style、profile、questions、answers、report、currentStep | P0 | M01 | Done / Naming Divergence | No | React state 已覆盖，命名不同 |
| PRD-087 | 10 UI | 整体气质像私密 AI 面试训练室，专业、有压迫感但不恐吓 | P1 | M08 | Pending Figma | Yes | 当前低保真 |
| PRD-088 | 10 UI | AI 面试官用头像、声波、状态动效表达听/说/分析 | P1 | M06, M08 | Pending Figma | Yes | 当前仅文本状态和控制区 |
| PRD-089 | 10 UI | 报告高光：嘴替答案独立高亮区域，保留复制和重新生成按钮 | P1 | M07, M08 | Partial | Figma | 复制已做；高亮和重新生成待做 |
| PRD-090 | 10 UI | 原回答与改写答案并排或上下对比 | P1 | M07, M08 | Pending Figma | Yes | 需 report 视觉设计 |
| PRD-091 | 10 UI | 必须有样例填充按钮 | P0 | M02 | Done | No | 已实现 |
| PRD-092 | 10 UI | 公开演示名使用“面试嘴替教练” | P0 | M01 | Done | No | 页面标题已用 |
| PRD-093 | 10 UI | 核心按钮可命名为“生成我的嘴替答案” | P2 | M08 | Pending Figma | Yes | 当前按钮文案为“生成复盘报告” |
| PRD-094 | 11 验收 | 样例数据完整链路不超过 5 分钟 | P0 | M01-M07 | Done | No | 已多轮浏览器验证 |
| PRD-095 | 11 验收 | 3 道题体现简历/JD 信息，题型分布符合规则 | P0 | M04 | Partial | No | demo 已体现；真实 LLM 需验收 |
| PRD-096 | 11 验收 | 每题包含分数、雷区标签、致命问题、嘴替答案、60 秒口语版 | P0 | M07 | Done | No | 已实现 |
| PRD-097 | 11 验收 | 嘴替答案不编造硬事实，缺数据用补充建议 | P0 | M07 | Partial | No | 缺失答案已覆盖；缺数据真实场景需抽查 |
| PRD-098 | 11 验收 | 语音不支持时仍可文字答题并生成报告 | P0 | M05, M06 | Done | No | 已实现 |
| PRD-099 | 11 验收 | 准备本地样例数据和本地运行方案，避免现场网络异常 | P0 | M02, Ops | Phase 8 Done | No | 样例数据、README、`.env.example`、Demo Ops 和 contract smoke 已完成 |
| PRD-100 | 12 Demo | 点击一键填充样例，展示简历/JD 自动进入画像 | P0 | M02, M01 | Phase 6 Done | No | 保留“一键填充”可编辑路径，并新增“填充并生成画像”直接进入画像 |
| PRD-101 | 12 Demo | 展示 3 个匹配点和 2 个风险点 | P0 | M03 | Done | No | 已实现 |
| PRD-102 | 12 Demo | 播放一道题，演示口语化松散回答 | P0 | M06, M05 | Done | No | TTS 和样例答案已支持 |
| PRD-103 | 12 Demo | 点击生成报告，突出雷区标签和扣分原因 | P0 | M07, M08 | Partial | Figma for visual emphasis | 内容已做，视觉突出待设计 |
| PRD-104 | 12 Demo | 展示嘴替答案，现场复制并朗读前两句 | P0 | M07 | Done | No | 复制已做 |
| PRD-105 | 13 风险 | LLM 输出不稳定时 JSON Schema 校验、重试、Demo 固定样例 | P0 | M02, M03, M04, M07 | Phase 8 Done | No | 已实现 provider retry/schema/fallback，并补 dev-only LLM fault 与 contract smoke |
| PRD-106 | 13 风险 | 语音 API 兼容差时保留文字输入和题目文本展示 | P0 | M05, M06 | Done | No | 已实现 |
| PRD-107 | 13 风险 | Prompt 禁止嘴替答案过度编造，缺失信息提示 | P0 | M07 | Done / 可抽查 | No | 已实现规则和缺失兜底 |
| PRD-108 | 13 风险 | 现场网络不稳时准备预生成报告 JSON，必要时切 Mock | P0 | M02, M07, Ops | Phase 8 Done | No | 演示兜底数据、强制 fallback、LLM/TTS/STT/clipboard 故障注入和 smoke 已完成 |
| PRD-109 | 13 风险 | 对外定位离线练习与复盘，避免实时提词和真实面试使用场景 | P0 | Product Copy, M08 | Partial | Figma/copy polish | 硬边界已写；前端文案可进一步强化 |
| PRD-110 | 13 终局画面 | 结构化报告包含总分、每题雷区、原回答问题、AI 嘴替答案、下一步训练建议 | P0 | M07, M08 | Partial | Figma for original answer problem view | 总分/雷区/嘴替/建议已做；原回答问题展示不足 |

## 3. 产品需求到模块映射

| Product Area | PRD IDs | Primary Module(s) | Current Coverage |
| --- | --- | --- | --- |
| 产品定位与范围 | PRD-001, PRD-008, PRD-019 to PRD-023, PRD-109 | Scope, M01 | 已在 AGENTS 和 docs 契约中固定 |
| 输入与样例 | PRD-010, PRD-011, PRD-024, PRD-055, PRD-065, PRD-091, PRD-100 | M01, M02 | 已实现；保留可编辑样例填充，并新增填充后自动生成画像路径 |
| 面试官风格 | PRD-012, PRD-038 to PRD-041, PRD-056 | M01, M04, M06, M07 | 产品已确认固定 3 个；“业务负责人”不纳入本轮 |
| 候选人画像 | PRD-013, PRD-025, PRD-057, PRD-070, PRD-101 | M03 | 已实现 |
| 题目生成 | PRD-003, PRD-014, PRD-029 to PRD-037, PRD-058, PRD-071, PRD-073, PRD-095 | M04 | 已实现核心 3 题；Phase 7 决定 `weight` 暂不入 schema |
| 面试答题 | PRD-015, PRD-016, PRD-026, PRD-060, PRD-067, PRD-068, PRD-081, PRD-098, PRD-102 | M05, M06 | 语音、文本、跳过、编辑已实现；头像/声波/正式进度条待 Figma |
| 报告评分和改写 | PRD-002, PRD-004, PRD-005, PRD-017, PRD-028, PRD-042 to PRD-054, PRD-061 to PRD-064, PRD-074 to PRD-079, PRD-096, PRD-097, PRD-103, PRD-104, PRD-110 | M07 | 核心报告、Phase 6 内容高光、Phase 7 流式体验、单题复制、单题重新生成、过短/跑题诊断已实现；原回答对比视觉仍等 Figma |
| LLM 与 Prompt | PRD-070 to PRD-079A, PRD-105, PRD-107 | M03, M04, M07 | 工程接入已完成；真实 key 后需验收、调优，并在发布前完成产品 prompt review |
| 视觉和交互高光 | PRD-049, PRD-067, PRD-069, PRD-087 to PRD-090, PRD-093, PRD-103, PRD-110 | M08 | 等 Figma；当前只有低保真承载 |
| 演示稳定和部署 | PRD-006, PRD-085, PRD-094, PRD-099, PRD-105, PRD-108 | M02, Ops | 本地演示、兜底、README、部署说明、显式 Mock/fallback、故障注入、smoke 和安全检查已实现；实际线上部署待发布阶段 |

## 4. 已校准的 PRD 差异和待确认项

| PRD ID | PRD Requirement | Current Contract | Decision Needed |
| --- | --- | --- | --- |
| PRD-012 / PRD-038 to PRD-041 | PRD 风格表曾出现 4 种描述 | 当前硬边界固定 3 种：`strictHr`、`techBro`、`gentleSister` | 已确认：按 3 种风格执行，不再视为契约差异 |
| PRD-027 / PRD-072 | 报告生成等待流式输出 | 已新增 `/api/report/generate-stream`，并保留 `/api/report/generate` 非流式稳定保底 | 已完成：流式优先、非流式保底 |
| PRD-073 | 题目输出包含 `weight` 和 `evaluation_focus` | 当前输出 `intent` 和 `expectedSignals`，无 `weight` | Phase 7 决定：`evaluation_focus` 由 `expectedSignals` 等价承载；`weight` 暂不入 schema，后续如产品坚持展示权重需契约变更 |
| PRD-100 | 一键填充样例后自动进入画像 | 当前保留可编辑“一键填充”，并新增“填充并生成画像” | Phase 6 已完成，不再作为契约差异 |
| PRD-082 | PRD 建议浏览器 SpeechSynthesis 优先，需要更好音色再接第三方 TTS | 当前项目硬边界是 Azure TTS 优先，Web Speech 兜底 | 已按项目硬边界执行，无需改 |

## 5. 不等待 Figma 的 PRD 缺口

| Gap | PRD IDs | Module | Priority |
| --- | --- | --- | --- |
| Demo 样例包改成更贴 AI 产品经理实习场景 | PRD-002, PRD-007, PRD-100 to PRD-104 | M02, M07 | Phase 6 Done |
| 报告流式输出，非流式保底 | PRD-027, PRD-072 | M07 | Phase 7 Done |
| 真实 LLM 三风格输出验收和 prompt 调优 | PRD-003, PRD-052, PRD-075 to PRD-077, PRD-095, PRD-097 | M03, M04, M07 | High |
| Prompt 产品 review 和发布前冻结 | PRD-075 to PRD-079A | M03, M04, M07 | High |
| 显式故障注入 / Mock 切换开关 | PRD-105, PRD-108 | M02, M07, Ops | Phase 8 Done |
| 单题复制按钮 | PRD-050, PRD-062 | M07 | Phase 7 Done |
| 单题重新生成嘴替答案 | PRD-028, PRD-063, PRD-089 | M07 | Phase 7 Done |
| 题目 `weight` 字段或等价展示 | PRD-014, PRD-035 to PRD-037, PRD-073 | M04 | Phase 7 Decision：暂不入 schema |
| 300 字上限 schema/prompt 强约束 | PRD-050, PRD-077 | M07 | Phase 6 Done for prompt/fallback；schema 强校验暂不做 |
| 过短/跑题答案专项诊断测试 | PRD-053, PRD-054 | M07 | Phase 7 Done |
| README、部署说明、`.env.example` | PRD-085, PRD-099 | Ops | Phase 8 Done |

## 6. 必须等待 Figma 或设计确认的 PRD 缺口

| Gap | PRD IDs | Module | Dependency |
| --- | --- | --- | --- |
| 私密 AI 面试训练室整体气质 | PRD-087 | M08 | Figma |
| AI 面试官头像、声波、听/说/分析状态动效 | PRD-067, PRD-088 | M06, M08 | Figma |
| 原回答与嘴替答案并排/上下对比 | PRD-049, PRD-090, PRD-110 | M07, M08 | Figma |
| 嘴替答案视觉中心和高亮区域 | PRD-002, PRD-089, PRD-103 | M07, M08 | Figma |
| Report 页面最终布局：总分、题目标签、雷区、原回答、嘴替、复制 | PRD-069 | M07, M08 | Figma |
| 核心按钮文案是否改为“生成我的嘴替答案” | PRD-093 | M08 | Product/Design |

## 7. 当前覆盖结论

| Category | Count | Meaning |
| --- | ---: | --- |
| Done | 68 | 核心闭环、接口、语音、报告、复制、兜底主体、Phase 6 Demo 内容、Phase 7 流式/单题操作和 Phase 8 本地运维兜底已完成 |
| Partial | 27 | 多数是真实 LLM 验收、视觉高光、实际部署或原回答对比展示 |
| Pending | 1 | 主要是 prompt 产品 review 和发布前冻结 |
| Pending Figma | 6 | 主要是视觉气质、头像声波、对比展示和报告高光 |
| Deferred | 6 | 登录、历史、多人协作、自由追问、音频存储、业务负责人等边界外/已确认不做项 |
| Contract Divergence | 0 | 流式接口已契约化；题目 `weight` Phase 7 决定暂不入 schema，如后续产品坚持展示需新增契约变更 |

> 数量用于查漏，不作为质量评分。后续每完成一项，应更新对应 PRD ID 的状态和证据。

## 8. 推荐更新到交付总账的规则

后续开发前，先确认目标 PRD ID：

1. 如果需求在本文档中，按对应模块和 Phase 开发。
2. 如果需求不在本文档中，先新增 PRD ID 或 Change ID，再开发。
3. 如果需求属于 Contract Divergence，先更新 `docs/04_api_contracts.md` 和相关 Alpha 契约。
4. 如果需求标记为 Pending Figma，不在设计稿到位前做视觉实现。
5. 每次完成功能后，同步更新 `docs/11_delivery_status_overview.md` 和 `docs/todo.md`。
