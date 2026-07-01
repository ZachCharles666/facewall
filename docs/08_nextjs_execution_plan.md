# Next.js Execution Plan

## 1. 技术决定

正式应用采用 Next.js App Router + React + TypeScript。原因：
- API Route Handler 可以隐藏 Azure/LLM key。
- 前后端契约可以放在同一个仓库里演进。
- 后续接 Vercel 或类似平台成本低。
- Figma 到位后适合按页面和组件替换视觉层。

## 2. 推荐目录

```text
D:\hackthon\facewall
├── app\
│   ├── page.tsx
│   ├── layout.tsx
│   ├── globals.css
│   └── api\
│       ├── profile\parse\route.ts
│       ├── questions\generate\route.ts
│       ├── report\generate\route.ts
│       └── tts\route.ts
├── components\
│   ├── setup\
│   ├── interview\
│   ├── report\
│   └── voice\
├── lib\
│   ├── api\
│   ├── demo\
│   ├── prompts\
│   ├── schemas\
│   ├── speech\
│   └── state\
├── docs\
└── tts-demo\
```

## 3. 第一轮实现顺序

| Step | 目标 | 验收 |
| --- | --- | --- |
| 1 | 初始化 Next.js + TypeScript | `npm run dev` 可启动 |
| 2 | 定义共享 types/schema | 与 `docs/04_api_contracts.md` 一致 |
| 3 | 写演示兜底样例包 | 一键填充可走完整流程 |
| 4 | 建 App Shell 状态机 | 5 个 step 可切换 |
| 5 | 写 fake Route Handlers | profile/questions/report 返回 contract JSON |
| 6 | 接入现有 Azure TTS 语义 | `/api/tts` 返回音频 |
| 7 | 做低保真三屏 | setup/interview/report 可操作 |
| 8 | 跑完整验收 | 对照 `docs/02_acceptance_matrix.md` |

## 4. Implementation Rules

- 前端组件只调用 `lib/api`，不要直接拼 fetch。
- Route Handler 统一返回 `CommonResponse`，除 `/api/tts` 返回音频。
- 演示兜底数据放在 `lib/demo`，不要散落在组件里。
- prompt 放在 `lib/prompts`，不要写在 Route Handler 中。
- schema 校验放在 `lib/schemas`，请求和 LLM 输出都要校验。
- 语音浏览器能力封装在 `lib/speech`，组件只接收状态和事件。
- Figma 到位前不要为视觉做复杂抽象，先保证组件边界稳定。

## 5. First Coding Instruction

执行第一个开发任务时，目标不是做完整 UI，而是建立可运行骨架：

1. 创建 Next.js App Router 项目所需文件。
2. 增加 TypeScript 类型定义。
3. 增加演示兜底样例。
4. 增加 3 个 fake JSON API 和 1 个 TTS API。
5. 首页能用样例从 setup 走到 report。
6. 验证 `npm run dev` 和浏览器主流程。
