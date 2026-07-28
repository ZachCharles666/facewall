# IB-06 Alpha Acceptance Record · 管理与可观测性

- 日期：2026-07-25
- 当前状态：阶段 1 provider-neutral instrumentation 完成；真实监控平台与告警渠道未配置，相关验收保持 Partial
- 隐私边界：未读取或输出 `.env.local` 配置值；日志、监控和指标不得包含用户正文、OTP、Cookie、Authorization、DSN、token 或真实密钥

## 阶段 1：请求链路与安全采集

### Implementation

- 新增请求级 `AsyncLocalStorage` context，合法上游 `x-request-id` 可沿用，否则生成不可预测的技术 ID。
- `observeRoute` 统一关联 `CommonResponse.requestId`、`x-request-id` 响应头、结构化 JSON 日志、错误监控 tag 和原始 API 耗时。
- `api_request_metrics` 只记录 route、method、status、duration、稳定 error code、requestId 和时间，不记录请求/响应正文。
- provider-neutral monitoring adapter 在 provider 缺失或 SDK 失败时 fail-open：业务响应继续，脱敏结构化日志保底。
- 统一 scrubber 递归删除认证凭据、OTP、query secret 和简历/JD/画像/题目/答案/报告正文。
- 新增前端 error boundary、window error、unhandled rejection 接线和严格限长的 client-error ingestion route。
- LLM wrapper 读取 provider 实际返回的 token usage；缺失时保留 `null`，同时记录 provider latency 和 retry attempts，不使用 `0` 冒充。
- 已接入 auth、consent/privacy、session persistence、feedback/events 和非流式生成关键 Route Handler；streaming latency 仍需按流结束口径单独补齐。

### Verification

| Check | Result | Evidence |
| --- | --- | --- |
| scrubber nested secret/body injection | Pass | `observability-contract.test.ts` |
| provider adapter captured payload review | Pass（local adapter） | 事件不含注入的 token、OTP、Cookie、JD |
| response/log requestId trace | Pass | response body 与 header 均为 `trace-test-123456`，日志保持同一 ID |
| monitor unavailable behavior | Pass（implementation） | provider 为 none 时返回 `captured=false`，业务不抛错 |
| internal-beta regression | Pass | `npm run test:internal-beta`：41/41 |
| typecheck | Pass | `npm run typecheck` |

### Matrix Status After Phase 1

| ID | Status | Reason |
| --- | --- | --- |
| OBS-001 | Partial | 前后端 adapter 与错误入口已实现；无真实 Sentry/等价项目，未验证远端采集 |
| OBS-002 | Partial | 本地 captured payload scrub 审查通过；真实平台事件人工复核待外部项目 |
| OBS-003 | Partial | response/header/log 本地 trace 通过；真实 monitor tag 关联待外部项目 |
| OBS-004 | Partial | provider-neutral alert event 能力已具备；真实渠道告警未配置 |
| OBS-006 | In progress | 原始 API 耗时落点已实现；需应用 migration、生成 fixture 并验证 P50/P95 聚合 |

## 外部依赖退出条件

- 配置真实 Sentry 或等价项目的 server/client endpoint 与发布凭据。
- staging 注入前端未捕获异常和服务端异常，人工检查 captured payload。
- 用同一 requestId 完成 response → structured log → monitor trace。
- 实际触发登录不可用、关键 API 高失败率、DB unavailable 和严重前端异常告警，并确认值班渠道收到。

在以上证据存在前，不把 OBS-001、OBS-002 的真实平台部分、OBS-003 的 monitor 部分或 OBS-004 标记为 Pass。

## 阶段 2：最小管理看板与审计

### Implementation

- migration `0010` 已在真实本地 PostgreSQL 应用，新增 `api_request_metrics` 与 `admin_audit_logs`；两表均 FORCE RLS 且只允许 admin context。
- 新增 `GET /api/admin/metrics?from=&to=&schoolId=`，最大 90 天窗口；聚合 Auth/Profiles、Sessions、Contract events、Feedback、Quota、Deletion queue 和 API latency。
- 完成率来自业务 Session 表；依赖失败和 provider usage 来自 Contract events；P50/P95 来自只含技术字段的 request metrics。学校筛选时 API latency 明确保持 global scope。
- 新增受保护 `/admin` 页面：日期/学校筛选、loading/empty/error/retry、聚合指标、学校创建、邀请码创建/启停和删除队列。
- 普通用户在页面入口经服务端 `requireAdmin` 转为 404；所有 admin API 仍独立执行 Session + DB role 校验。
- 学校创建、邀请码创建/启停与成功审计同事务；删除审批/执行与审计接线；bootstrap role promotion 与角色审计同事务。
- 管理页面不渲染简历、JD、画像、题目、答案、报告或反馈评论；邀请码明文只在创建响应后显示一次。

### Verification

| Check | Result | Evidence |
| --- | --- | --- |
| migration apply | Pass | `npm run db:migrate` applied `0010_admin_observability.sql` |
| static/contract regression | Pass | `npm run test:internal-beta`：46/46 |
| PostgreSQL metrics reconciliation | Pass | fixture registered/started/completed/fallback/failure/feedback/usage/quota 均为预期 |
| PostgreSQL latency aggregate | Pass | fixture P50=125ms、P95=125ms |
| admin audit | Pass | school.create + invite.create 共 2 条；不含邀请码 hash/明文 |
| ordinary user audit isolation | Pass | runtime user 查询 admin audit 为 0 行 |
| typecheck | Pass | `npm run typecheck` |

### Matrix Status After Phase 2

| ID | Status | Reason |
| --- | --- | --- |
| OBS-005 | In progress | 聚合 API/UI 与真实 DB 对账已通过；待 production HTTP/page smoke |
| OBS-006 | In progress | 真实 DB P50/P95 聚合通过；待 production 路由生成实际样本 |
| ADMIN-001 | In progress | 页面与事务 API 已实现；待 production admin HTTP smoke |
| ADMIN-002 | In progress | server/API/RLS 三层负向契约与 DB 通过；待 production user Cookie negative smoke |
| ADMIN-003 | Pass（implementation + API/schema review） | 页面与 metrics API 不读取/返回训练正文；真实 DB fixture 对账通过 |
| ADMIN-004 | In progress | 学校、邀请码、删除、角色审计已接线；待 production mutation/audit query |
| ADMIN-005 | In progress | admin 依赖失败稳定 503 且事务 helper 回滚；待 fault injection |

## 阶段 3：权限、故障、对账与告警演练

### Verification

| Check | Result | Evidence |
| --- | --- | --- |
| all project API observability coverage | Pass | 静态守卫覆盖全部项目 Route Handler；仅 Better Auth 原生 handler 由 framework instrumentation 处理 |
| internal-beta suite | Pass | `npm run test:internal-beta`：50/50 |
| PostgreSQL admin reconciliation | Pass | registered/started/completed=1/1/1；fallback/failure/feedback/usage/quota 对齐 |
| PostgreSQL latency | Pass | fixture 及 production 路由样本可计算 P50/P95 |
| alert evaluator | Pass（local rules） | auth unavailable、critical high failure、DB unavailable、severe frontend 共 4 类触发 |
| real alert delivery | Partial | provider 未配置，delivery 明确为 `captured=false` |
| admin transaction fault | Pass | mutation 后注入故障，业务行与 success audit 同时回滚 |
| ordinary user admin API/page | Pass | production HTTP：API 403，页面 404 |
| admin production page/API | Pass | 页面渲染；学校/邀请码创建与停用；metrics aggregate-only |
| production admin audit | Pass | school.create、invite.create、invite.disable 共 3 条；requestId/时间/结果齐全且无邀请码明文 |
| privacy scrub | Pass（local + production log） | 注入 query token、OTP、正文；captured-local/log 无敏感原值 |
| IB-03 production persistence smoke | Pass | 原子额度、状态链、恢复、冲突、隔离、feedback/events 回归 |
| IB-04 production privacy smoke | Pass | consent/deletion/admin/Session revoke 回归 |
| existing PostgreSQL suites | Pass | base DB、privacy DB、feedback/events DB 全通过 |
| typecheck/build/security/diff | Pass | production build 33 pages/routes；final security scan 176 files；diff check clean |

### Final Matrix Decision

| ID | Status | Evidence / limitation |
| --- | --- | --- |
| OBS-001 | Partial | browser/server adapter、error boundary、ingestion 与 capture 测试通过；无真实监控平台远端事件 |
| OBS-002 | Partial | scrubber 与本地/production log review 通过；缺真实平台 captured event 人工复核 |
| OBS-003 | Partial | response body/header/structured log 使用同一 requestId；缺真实 monitor tag trace |
| OBS-004 | Partial | 4 类规则与 provider-neutral dispatch 通过；真实值班渠道未收到测试告警 |
| OBS-005 | Pass | production admin 页面/API + PostgreSQL reconciliation |
| OBS-006 | Pass | 原始 request latency 持久化，P50/P95 查询和 production 样本通过 |
| ADMIN-001 | Pass（2026-07-26 收敛） | 实际 admin 浏览器创建学校、单个/批量邀请码、停用和指标查看；普通 user 页面 404/API 403；DB/audit 对账通过 |
| ADMIN-002 | Pass | production user Cookie negative + RLS |
| ADMIN-003 | Pass | UI/API/schema review 与 production aggregate snapshot |
| ADMIN-004 | Pass | 邀请码、删除、bootstrap role audit 接线；production mutation query 通过 |
| ADMIN-005 | Pass | 稳定 503 映射、事务故障回滚、无 success audit |

## Known Risks / Deferred

- 未发现 Sentry/等价真实项目配置。退出条件是 staging 前配置 provider，完成前后端真实事件、requestId trace 和 4 类告警渠道演练。
- LLM provider measurement 已传播到 Session milestone `product_events` 并通过 fixture DB/privacy 对账；当前无真实 LLM 配置，因此 SESSION-008 真实测量部分继续 Partial。
- 流式报告记录完整 stream generation duration 的结构化日志；`api_request_metrics` 对该路由代表 response/TTFB 口径，非流式报告仍提供完整请求耗时。
- 未发送任何新的真实 OTP。

## IB-07 兼容相邻回归 · 2026-07-26

- 真实 Azure TTS fixture 请求与 classic 浏览器播放通过；日志/响应未输出 Azure key。
- classic Azure/Web Speech、STT 失败编辑、流/非流报告和 Clipboard fallback，以及 figma/juju 无麦克风三题闭环均通过。
- 兼容修复未扩展监控 payload，也未改变 OBS-001–004：真实监控项目和远端告警证据仍缺失，继续 Partial。

## Post-IB-06 admin/provider 收敛 · 2026-07-26

### Admin browser + DB

- admin 页面实际展示聚合指标；创建 `Browser Manual School`、邀请码并停用，DB 为 `maxUses=20/sessionLimit=3/status=disabled`，audit 顺序为 school.create/invite.create/invite.disable。
- 普通 user 浏览器访问 `/admin` 为 404；隔离 HTTP Session 调 `/api/admin/metrics` 为 403。
- 根据产品补充，新增 `batchCount`（默认 1，1–100），单码 `maxUses` 默认改为 1、仍可调整；批量事务全成或全回滚。
- 实际浏览器批量 3 条和修复后 2 条均成功；最终 2 条无需刷新立即出现在列表，一次性区域按“第 1/2 条”分行显示。
- DB 最终批次 `rows=2/allMaxUsesOne=true/allSessionLimitsThree=true/auditRows=2`；audit 明文/hash 匹配 0。
- 修复 admin GET cache、异步 FormEvent `currentTarget` 失效造成的创建后列表不刷新，以及 Juju/admin 表单对比度。

### Provider measurement

- 成功 API 在原业务 `data` 不变的前提下增加可选 generation meta；profile/questions/stream/non-stream report 均传播 measurement。
- Session 事件保存 provider、model、latencyMs、attempts、inputTokens、outputTokens、requestId。
- fallback 明确为 `provider=local_demo`，不可获得或不适用字段保存 null；持久化层拒绝 fallback 伪造 token/latency/model。

## Pre-G0 local/public boundary review · 2026-07-28

- 本地已完成：browser/server capture 入口、scrubber、response/header/log requestId、四类应用告警规则、低流量抑制、provider 缺失/失败时 fail-open。
- 本轮 targeted dev/persistence/alerts/observability/security contracts 18/18 Pass；没有新增外部 provider，也没有发送通知。
- 继续本地重复运行不能关闭 OBS-001～004。剩余验收必须使用真实外部接收面取得 captured event、脱敏 payload review、requestId trace、登录/关键 API/DB/备份失败告警与恢复通知。
- 外部平台/接收面未由产品确认；在确认厂商、费用、数据地域和接收对象前不安装 SDK、不调用外部服务，OBS-001～004 保持 Partial。
- fixture PostgreSQL 对账和正文隐私扫描 Pass；没有真实 LLM key/model，因此不升级 SESSION-008。
