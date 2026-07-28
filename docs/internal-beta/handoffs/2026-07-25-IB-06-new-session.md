# PassBuddy 内测开发交接：从 IB-06 继续

日期：2026-07-25
工作区：`D:\hackthon\facewall`

## 为什么建议新开 Session

内容压缩本身不会丢失已落盘的代码和文档，也不构成必须换 Session 的技术原因。但 IB-01 至 IB-05 已形成一个完整交付基线，IB-06 又是新的管理与可观测性边界；同时当前工作区保留了大量未提交修改。此时新开 Session 有利于降低上下文漂移，并让新的执行范围从 IB-06 开始保持清晰。

新 Session 仍会使用同一个工作区，不会自动得到干净分支或干净 diff。必须保留当前全部修改，禁止为了“清理环境”执行 reset、checkout 覆盖、stash 后遗漏恢复或批量删除。

## 当前完成基线

- IB-01：数据底座完成。
- IB-02：邮箱 OTP、Better Auth Session、邀请码激活、默认 3 次体验额度和开发路由预热已实现；真实 SES 已有一次收件确认。浏览器刷新/重登矩阵和 QQ、163、两所学校邮箱送达矩阵仍未完成，不得虚报。
- IB-03：核心交付完成。创建 Session 原子占用额度、同一创建请求幂等、额度耗尽禁止新建但已开始 Session 可继续；画像、题目、三题答案、报告和流程状态均落库；current/by-id 恢复、隔离、冲突、非法状态与 production smoke 通过。
- IB-03 的浏览器重登/Node 重启矩阵、真实 DB 故障注入和事件 provider usage/耗时仍为 `Partial`，不阻止进入 IB-06。
- IB-04：版本化同意、双重门禁、删除请求/admin 执行、失败回滚重试和去标识审计完成；最终法务正文与移动端视觉复核仍是放量门禁。
- IB-05：反馈 API/UI、严格事件字典、隐私 allowlist、admin 脱敏聚合与 reconciliation 完成；浏览器交互和真实 provider usage/latency 仍为 `Partial`。
- 最新基线：38/38 internal-beta tests、真实 PostgreSQL feedback integration、production persistence + feedback/events smoke、typecheck、production build、security/diff check 通过；migration 已到 `0009`。

## 新 Session 开始前必须阅读

1. `AGENTS.md`
2. `docs/todo.md`
3. `docs/Development-Workflow-and-Instruction-Template.md`
4. `docs/internal-beta/01_scope_and_decisions.md`
5. `docs/internal-beta/02_internal_test_contract.md`
6. `docs/internal-beta/03_architecture_and_data_contract.md`
7. `docs/internal-beta/04_api_and_event_contracts.md`
8. `docs/internal-beta/05_acceptance_matrix.md`
9. `docs/internal-beta/07_operations_privacy_runbook.md`
10. `docs/internal-beta/evidence/IB-03-interview-persistence.md`
11. `docs/internal-beta/evidence/IB-04-consent-deletion.md`
12. `docs/internal-beta/evidence/IB-05-feedback-events.md`
13. `docs/internal-beta/instructions/IB-06-admin-observability.md`

## IB-06 验收范围

必须逐项对应 Acceptance Matrix，不得只以页面可打开作为完成标准：

| ID | 验收目标 |
| --- | --- |
| OBS-001 | 前端未捕获异常和服务端异常进入真实监控平台。 |
| OBS-002 | 监控事件不含简历、JD、答案、报告、OTP、token 或密钥全文。 |
| OBS-003 | API response、结构化日志和监控可用 requestId 关联。 |
| OBS-004 | 登录不可用、关键 API 高失败率和数据库错误能触发告警。 |
| OBS-005 | 管理页展示注册、开始、完成、失败、fallback、反馈和用量。 |
| OBS-006 | 关键 API 记录 P50/P95 或可计算的原始耗时。 |
| ADMIN-001 | admin 可创建/停用学校和邀请码并查看用量。 |
| ADMIN-002 | 普通 user 无法访问管理页面、API 和聚合原始数据。 |
| ADMIN-003 | 管理页默认不显示用户正文。 |
| ADMIN-004 | 邀请码、角色、删除操作有 admin、requestId、时间和结果审计。 |
| ADMIN-005 | 管理依赖失败显示可恢复错误，不执行部分危险操作。 |

## 建议执行切分

### 阶段 0：只读核对与契约收口

- 先检查 `git status --short` 和现有 diff，列出已有修改，保留全部用户工作。
- 核对实际 package、Next.js Route Handler、Better Auth、PostgreSQL/RLS、现有 admin API、事件表、审计表和部署形态。
- 检查是否已经配置可用的 Sentry 或等价真实监控项目。只检查配置存在性和代码接线，禁止输出 DSN、token、Cookie、Authorization 或 `.env.local` 的值。
- 核对 IB-06 instruction、Acceptance Matrix、API/Event Contract 和 Runbook 是否一致；发现缺口先更新契约/instruction，再编码。

### 阶段 1：请求链路与安全采集

- 实现统一 requestId、结构化 server log、稳定错误映射和关键 API 原始耗时记录。
- 建立 provider-neutral 的监控 adapter 和统一 scrubber；发送前移除 Cookie、Authorization、query secret、OTP、token、密钥及所有用户正文。
- 接入前端未捕获异常和服务端异常，但不得采集简历、JD、答案或报告正文。
- 如果没有真实监控账号/项目配置，可以完成 adapter、scrubber、测试和本地结构化日志，但 OBS-001、OBS-004 的真实平台/告警部分必须保持 `Partial`，不得用 console 或 mock 宣称通过。

### 阶段 2：最小管理看板

- 服务端强制校验 admin；普通 user 的管理页面、API 和聚合原始数据均返回 403。
- 在现有学校、邀请码、删除、反馈能力上补齐最小管理页和聚合 API。
- 展示注册、激活、面试开始/完成/失败、fallback、反馈、额度/用量和待处理删除；支持 Contract 规定的时间范围和学校筛选。
- 默认只返回计数、分布、耗时和状态聚合，不返回用户正文、邮箱明文或可识别的单用户事件流。
- 危险写操作必须保持事务性、幂等与审计，不允许依赖失败后留下半成功状态。

### 阶段 3：对账、故障与告警演练

- 验证 event、业务表和管理聚合口径一致，明确数据延迟和失败重试语义。
- 做普通 user 越权、查询超时、数据库错误、监控 SDK 不可用和 scrubber 敏感字段注入测试。
- 在真实监控依赖可用时完成 fault capture、requestId trace 和告警演练；不可用时记录所需账号/配置与影响，并保持对应验收项 `Partial`。
- 每阶段运行相邻模块回归，更新 `docs/todo.md` 和 `docs/internal-beta/evidence/IB-06-admin-observability.md`。

## 执行约束

- 禁止输出或记录 `.env.local` 真实密钥、DSN、token、Cookie、Authorization。
- 不发送无意义的真实 OTP，不消耗腾讯云 SES 免费额度。
- 不保存原始音频，不扩大正文采集范围。
- 不更改既有产品口径：首次激活需要邀请码，激活后重新登录不再需要；默认每账号 3 次完整面试额度。
- 不把既有 `Partial` 自动升级为 `Pass`；只有实际执行并保存证据后才能更新状态。
- `next dev`、`next build`、typecheck 及依赖 `.next` 的验证顺序执行，禁止并行污染构建产物。
- 如真实监控平台需要用户提供账号、项目或部署权限，先完成不依赖该权限的实现和测试，再清楚列出阻断项；不得虚构外部平台证据。

## 新 Session 首条指令（可直接复制）

```text
继续 D:\hackthon\facewall 的 PassBuddy 内测开发，从 IB-06“管理与可观测性”开始。

开始前请完整阅读并遵守：
1. AGENTS.md
2. docs/todo.md，特别是“内测开发交接快照 - 2026-07-25”
3. docs/Development-Workflow-and-Instruction-Template.md
4. docs/internal-beta 的范围、Contract、架构、API/Event Contract、Acceptance Matrix、Runbook
5. IB-03、IB-04、IB-05 evidence
6. docs/internal-beta/instructions/IB-06-admin-observability.md
7. docs/internal-beta/handoffs/2026-07-25-IB-06-new-session.md

先检查 git status 和现有 diff。当前工作区包含 IB-02 至 IB-05 的大量已有修改，必须全部保留；禁止 reset、覆盖、丢弃或清理用户改动。禁止输出 .env.local、DSN、token、Cookie、Authorization 或任何真实密钥。

当前基线：
- IB-03 核心交付已完成：原子额度、幂等创建、全流程落库、恢复 API、用户隔离与 production smoke 均通过。
- IB-03 浏览器重登/Node 重启矩阵、真实 DB 故障注入、事件 provider usage/耗时仍为 Partial，不阻止进入 IB-06，也不得虚报为 Pass。
- IB-04 implementation/contract acceptance complete；法务正文和移动端视觉为放量门禁。
- IB-05 implementation complete；浏览器交互和真实 provider usage/latency 为 Partial。
- 最新自动化基线为 38/38 internal-beta tests、真实 PostgreSQL integration、production persistence+feedback/events smoke、typecheck、production build、security/diff check 通过，migration 到 0009。

请先汇报：
1. 实际技术栈、数据库 schema/migration、现有 admin/event/audit/日志能力；
2. IB-06 Contract 与代码现状的差距；
3. 是否存在已配置可用的真实监控平台（只报告存在性，不输出配置值）；
4. 分阶段执行计划和哪些验收项可能因外部监控依赖只能保持 Partial。

随后按 IB-06 instruction 实施：
- requestId、结构化日志、耗时与隐私 scrubber；
- 前后端错误监控 adapter；
- admin-only 最小运营看板和聚合 API；
- 权限、隐私、审计、事务失败、对账与告警演练。

没有真实 Sentry/等价项目时，先完成 provider-neutral 接线、scrubber、看板和本地测试，但不得把真实采集与告警宣称为 Pass。每完成一个阶段都运行必要自测并更新 docs/todo.md 和 IB-06 evidence。不要发送新的真实 OTP。遇到产品决策先列出影响，可在不改变既有产品意图的范围内采用合理默认值继续。
```
