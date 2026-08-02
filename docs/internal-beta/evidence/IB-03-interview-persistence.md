# IB-03 面试闭环持久化实施证据

> 日期：2026-07-25
> 状态：核心持久化与真实 API/DB 闭环完成；浏览器重登/Node 重启、DB fault UI 和事件 usage/耗时仍待补充

## 1. Source Of Truth 与兼容模式

- `source`：已登录内测用户的已提交 Session、画像、题目、回答、报告和流程状态以 PostgreSQL 为 source of truth；React state 只保留未提交 Draft/UI mirror。
- `mirror`：执行同一持久化写入，但写失败不阻断旧 React 流程，用于灰度对比。
- `off`：保留原开发 Demo 行为，不创建或恢复数据库 Session。
- `INTERNAL_BETA_REQUIRE_CONSENT` 为 IB-04 接线预留。真实 persistence smoke 已在 `true` 下用当前协议记录通过；`.env.example` 暂设 false，避免 IB-04 UI/API 尚未交付时阻断现有内测。

## 2. 数据与事务

- migration `0006` 增加 `(user_id, idempotency_key)` 唯一键、服务端事件策略和原子 create 函数。
- migration `0007` 修复并发重放竞态：先按 profile 行锁串行，再复查 idempotency key。
- 新建 Session、`sessions_started + 1` 和 `session_started` 事件同事务提交或回滚。
- 默认额度来自激活时的 profile 快照，当前为 3；额度用尽只阻止新 Session。
- 画像/题目/报告写入前使用既有 runtime validators；答案只保存转写文本、输入方式、时长和 STT 状态，不保存原始音频。
- owner 来自 Better Auth Cookie；API 不接受客户端 `userId/schoolId`。

## 3. API 与 UI 接线

- 新增 create、current、by-id、milestone PATCH、answer PUT、report POST、complete POST。
- `expectedVersion` 冲突返回 409 `SESSION_CONFLICT`；非法回退返回 `INVALID_STATE_TRANSITION`。
- `questionId` 必须属于 Session questions；跨用户读取统一返回 `RESOURCE_NOT_FOUND`。
- 页面登录后优先按本地活动 Session ID 恢复，否则读取 `/current`；恢复 form/profile/questions/answers/report 和对应步骤。
- 答案编辑先更新 React Draft，700ms 后保存；生成报告前强制 flush 三题答案。写失败保留页面 Draft并展示重试文案。
- 报告持久化后再异步标记 completed；完成页提供“开始新的面试”以清除活动指针并生成新的幂等 key。

## 4. 自动化与真实落点

| Check | Result | Evidence |
| --- | --- | --- |
| Unit/static | Pass | 28/28；配置、原子迁移顺序、owner、无原始音频、恢复接线 |
| PostgreSQL integration | Pass | 并发相同 key 单 Session/单扣减/单事件；3 次耗尽；旧 Session 继续；RLS 与 pool reuse 隔离 |
| Production persistence smoke | Pass | 真实签名 Better Auth Cookie + Route Handler + PostgreSQL；consent gate=true |
| Full milestones | Pass | `draft → profile_ready → questions_ready → in_progress → report_ready → completed` |
| Answers/report | Pass | 3 个 questionId 对齐回答与完整报告落库 |
| Recovery API | Pass | `/current` 恢复 questions_ready；completed Session 按 ID 可读 |
| Concurrency/contract | Pass | version conflict、非法回退、非法 questionId 均被拒绝 |
| User isolation | Pass | 第二用户读取 owner Session 返回 404 RESOURCE_NOT_FOUND |
| Quota | Pass | 同 key 重试 used=1；第 4 个新 key 409；旧 completed Session 仍可读 |
| Server events | Pass/Partial | 单 Session 8 个服务端事件且 properties 无简历/JD正文；usage/耗时尚未写入 |
| Existing contract smoke | Pass | dev 模式 profile/questions/report stream/fallback/regenerate/copy/TTS fault 全通过 |
| Security scan | Pass | 125 个 source/docs/scripts/example 文件；`.env.local` 排除且未输出密钥 |
| Typecheck / production build | Pass | 顺序执行；24 个 app routes，含 6 个 persistence routes |

Production smoke 输出摘要：

```json
{
  "ok": true,
  "createReplay": "single-session-single-charge",
  "milestones": ["profile_ready", "questions_ready", "in_progress", "report_ready", "completed"],
  "answersPersisted": 3,
  "recoverySnapshot": "questions_ready",
  "versionConflict": "rejected",
  "invalidTransition": "rejected",
  "invalidQuestionId": "rejected",
  "serverEvents": 8,
  "crossUserRead": "not-found",
  "quota": { "limit": 3, "exhaustedNewCreate": true, "existingReadable": true }
}
```

## 5. 未完成与风险

- SESSION-003 Partial：签名 fixture Session 已完成浏览器刷新和真实 Next Node 进程重启恢复，DB 始终为 `questions_ready/version=3/questions=3`；本轮禁止发送新 OTP，未完成真实退出重登，不能升 Pass。
- SESSION-004 Pass：仅开发+显式 fixture 开关可用的 PostgreSQL statement timeout 注入触发真实事务失败；UI 画像 Draft 保留并提示可重试，DB 保持 `draft/version=1`、画像/题目/报告均未写入，profile/report/completion 权威事件均为 0。
- SESSION-008 Partial：provider/model/latency/attempts/provider usage/requestId 已传播到 Session milestone 事件；fallback 固定 `local_demo` 且 usage/latency/model 为 null。当前无真实 LLM 配置，fixture 数字不作为真实测量。
- COMP-003/004：已在后续 IB-07 本地兼容批次关闭。classic 完成 Azure/Web Speech、STT 失败保留/编辑和报告；figma/juju 在无麦克风设备上通过文字兜底完成三题、报告和复制。见 `IB-07-local-compatibility.md`。
- 运行命令必须顺序执行。`next dev` 与 `next build`、以及 `typecheck` 与 `next build` 并行会竞争 `.next` / `.next/types`。

## 6. 下一步

1. 在已有合法真实账号/OTP 窗口中补退出重登；禁止用 fixture Cookie 冒充该子项。
2. 在 staging 配置真实 LLM 后做最少量受控调用，核对 provider 返回 usage 与 requestId。
3. 保持 DB fault header 仅在 development + `INTERNAL_BETA_BROWSER_FIXTURES=true` 时生效。

## 7. Post-IB-06 收敛验证 · 2026-07-26

| Check | Result |
| --- | --- |
| 浏览器刷新恢复 | Pass；classic 答题页刷新后仍显示 3 道题 |
| Next Node 重启恢复 | Pass；进程停止、typecheck、重新启动后根路径在默认 figma 主题恢复同一答题阶段 |
| PostgreSQL fault injection | Pass；UI Draft 保留，DB/事件均未推进 |
| provider measurement DB reconciliation | Pass（fixture-only）；LLM 样例字段完整，fallback 数字字段为 null |
| privacy scan | Pass；generation event 未包含 resume/JD/answer/report/prompt 正文 |
| `npm run test:internal-beta` | Pass；52/52 |
| PostgreSQL suites | Pass；base/privacy/feedback/admin |
| typecheck/build/security/diff | Pass |

## 8. IB-07 兼容相邻回归 · 2026-07-26

- 持久化 questions-ready fixture 在 classic、figma、juju 均可进入答题和报告。
- figma/juju speech input 不可用时新增文字输入，答案仍按当前 questionId 更新客户端 Draft；第三题后沿用原报告状态机。
- 本批没有把 fixture Cookie 当作 OTP 重登，SESSION-003 仍为 Partial；没有真实 LLM，SESSION-008 仍为 Partial。
- 57/57 internal-beta、typecheck、33-route production build Pass。
