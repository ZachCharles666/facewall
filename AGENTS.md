# 面试嘴替教练开发助手指引

> 本文件适用于本项目后续所有 AI/开发助手。开始任何开发任务前，先阅读本文件，再阅读 `docs/todo.md` 和当前任务对应的 instruction 文档。

## 一、项目目标

本项目目标是交付 Hackathon MVP：用户输入简历和 JD，选择 3 种面试官风格之一，系统生成候选人画像和 3 道面试题，完成语音/文本答题后生成可复制的复盘报告与优化答案。

目标阶段不是纯 POC，而是 Alpha-Demo：
- Alpha：主闭环、接口契约、异常兜底必须稳定。
- Demo：视觉和语音效果允许用演示级增强，但不能破坏主流程。

## 二、当前硬边界

1. 面试官风格固定为 3 个：`大厂严厉 HR`、`技术老哥`、`温柔大姐姐`。
2. 语音提问优先 Azure TTS，本地体验允许 Web Speech API 兜底。
3. 用户答题优先语音转文字，失败时必须支持重试和手动编辑，不能只给“重新开始”。
4. 报告生成当前已有非流式保底；后续优先做流式体验，但必须保留非流式兜底，并遵循 `docs/04_api_contracts.md` 的流式契约。
5. 一键复制必须覆盖“优化答案”和“复盘报告”。
6. 本轮不做登录、历史记录、多人协作、音频上传存储、实时提词器。
7. `.env.local` 只用于本地密钥配置，禁止在回复、日志、文档中输出真实密钥。

## 三、推荐目录结构

```text
D:\hackthon\facewall
├── AGENTS.md
├── server.js                    # 现有 TTS demo 本地服务，可保留为验证样板
├── .env.local
├── tts-demo\
│   └── index.html
├── app\                         # Next.js App Router，后续创建
├── components\                  # Next.js 组件，后续创建
├── lib\                         # API client、schema、prompt、demo data，后续创建
├── docs\
│   ├── 00_project_plan.md
│   ├── 01_alpha_contract.md
│   ├── 02_acceptance_matrix.md
│   ├── 03_module_map_and_tiers.md
│   ├── 04_api_contracts.md
│   ├── 05_demo_scenario_contract.md
│   ├── 06_module_instructions.md
│   ├── 07_design_handoff_contract.md
│   └── todo.md
└── outputs\
```

正式技术栈采用 Next.js。优先新增正式应用目录，不要破坏现有 `tts-demo`；`tts-demo` 作为 Azure/Web Speech 语音效果验证样板保留，除非任务明确要求迁移。

## 四、开发顺序

1. 先补齐规划与契约，不直接写业务代码。
2. 先做端到端静态/兜底闭环，再替换真实 LLM/STT/TTS 依赖。
3. 每完成一个 L1 模块，必须用相邻模块做一次最小集成验证。
4. 设计稿到位后，只替换视觉层和组件样式，不重写业务状态机和接口结构。
5. 所有接口字段、状态名、错误语义以 `docs/04_api_contracts.md` 为准。

## 五、验收要求

开发完成不能只看“页面能打开”。至少验证：
- 使用演示样例包能在 5 分钟内走完整闭环。
- 3 道题能体现简历/JD/面试官风格。
- 每道题报告包含评分、风险标签、致命问题、优化答案、60 秒口述版。
- Azure TTS 不可用时仍能看文本并继续流程。
- STT 不可用或失败时能重试，并保留已识别文本供编辑。
- 一键复制内容符合产品确认范围。

## 六、设计协作规则

UI 由设计师通过 Figma 提供。开发阶段先保证信息架构、状态、组件边界和数据结构稳定：
- 页面状态不要和最终视觉强绑定。
- 颜色、间距、字体、动效通过 token/CSS 变量集中管理。
- 组件按业务职责拆分：输入区、画像区、问题区、答题区、报告区、语音控制区。
- 所有 loading、error、empty、unsupported、copy success 状态都要留出 UI 承载位。

## 七、任务结束记录

每次完成任务后更新 `docs/todo.md`：
- 已完成项
- 验证方式
- 遇到的风险或待确认问题
- 下一步建议
