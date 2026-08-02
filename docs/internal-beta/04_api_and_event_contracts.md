# PassBuddy 受控内测 API 与事件契约

所有 JSON API 沿用现有 `CommonResponse<T>`。受保护接口从服务端 Session 获取 `userId`，忽略或拒绝客户端伪造的 owner 字段。

## 1. Auth API

### `POST /api/auth/request-otp`

Request:

```json
{
  "email": "student@example.edu"
}
```

Response data:

```json
{
  "challengeId": "opaque-id",
  "resendAfterSec": 60,
  "expiresInSec": 1800
}
```

Rules:

- email 规范化为 trim + lowercase。
- challenge 绑定规范化邮箱、随机 nonce 和时效，必须防篡改；不携带邀请码。
- 应用 API 在限流和发送预算校验后调用 Better Auth Email OTP；发送 hook 通过腾讯云 SES API 使用已审核模板投递 6 位数字验证码。
- 30 分钟有效期是受控内测临时值，用于减少正常用户因超时重复发信；正式上线前必须收紧为 5–10 分钟并重新验证模板、接口和过期场景。
- 除 60 秒重发窗口外，服务端必须执行单邮箱/IP 日限额和全局可配置 SES 发送预算；额度达到预警阈值时告警，达到停止阈值时不得继续调用 SES。阈值通过环境变量配置，不写死腾讯云当前免费额度。
- email/IP 仅以服务端 HMAC 参与日桶计数；生产反向代理必须覆盖而非追加客户端可伪造的来源 IP header。
- Better Auth 原生 Email OTP 写端点不公开，避免绕过发送预算和项目稳定错误码。
- 无论邮箱是否已有 Auth identity，成功提示保持一致。
- 错误：`INPUT_INVALID`、`OTP_RATE_LIMITED`、`EMAIL_BUDGET_EXHAUSTED`、`EMAIL_DELIVERY_FAILED`。

### `POST /api/auth/verify-otp`

Request:

```json
{
  "email": "student@example.edu",
  "token": "123456",
  "challengeId": "opaque-id"
}
```

Response data:

```json
{
  "user": {
    "id": "uuid",
    "email": "student@example.edu"
  },
  "needsInvite": true,
  "needsConsent": false,
  "policyVersion": "2026-07"
}
```

Rules:

- Better Auth 验证 OTP 并建立 Session；邮箱不存在时创建 Auth identity，已存在时登录。
- active profile 已存在时返回 `needsInvite=false`，后续不再要求邀请码；没有 profile 时返回 `needsInvite=true`，Session 只能访问邀请码激活和退出接口。
- 错误：`OTP_INVALID_OR_EXPIRED`、`AUTH_SERVICE_UNAVAILABLE`。

### `POST /api/auth/redeem-invite`

Request:

```json
{
  "inviteCode": "SCHOOL-2026"
}
```

Rules:

- 必须已有有效 Auth Session；服务端从 Session 读取 userId/email，不接受客户端传入 owner。
- active profile 已存在时幂等返回既有资格，不重复消费邀请码。
- 没有 profile 时原子校验并消费邀请码、绑定学校并创建 active profile。
- 成功响应同时返回 `sessionLimit` 与 `sessionsRemaining`；当前新邀请码默认每账号 3 次完整流程。
- 无效、过期、停用、用尽或并发失败时不得进入产品业务；保留受限 Session，允许更换邀请码重试。
- 错误：`AUTH_REQUIRED`、`INVITE_INVALID`、`INVITE_EXPIRED`、`INVITE_EXHAUSTED`、`PROFILE_INIT_FAILED`。

### `GET /api/auth/session`

返回当前最小用户信息、`needsInvite`、`needsConsent`、`privacyOnly`、当前协议版本与同意状态。没有 profile 的有效 Auth Session 返回 `needsInvite=true`，不是 401；删除审批后的 `deletion_pending` 用户返回 `privacyOnly=true`，只允许查看隐私/删除状态与退出；未登录返回 `AUTH_REQUIRED`。

### `POST /api/auth/logout`

撤销当前 Session/Cookie。重复调用视为成功。

## 2. Consent API

### `GET /api/consent/current`

Response data:

```json
{
  "policyVersion": "2026-07",
  "title": "PassBuddy 内测隐私说明",
  "content": "由产品/法务提供的正文",
  "scopes": ["interview_delivery", "internal_analysis"],
  "accepted": false,
  "acceptedAt": null
}
```

### `POST /api/consent/accept`

Request:

```json
{
  "policyVersion": "2026-07",
  "scopes": ["interview_delivery", "internal_analysis"],
  "idempotencyKey": "uuid"
}
```

只允许接受当前有效版本；重复接受返回既有记录。

### `POST /api/privacy/deletion-requests`

创建用户自己的删除请求，请求含 UUID `idempotencyKey` 和可选、不超过 500 字的 `reason`。若已有 `requested/approved/executing` 请求，返回该请求而不是新建。

### `GET /api/privacy/deletion-requests`

返回当前用户最近一次删除请求及状态。`active` 与 `deletion_pending` 用户均可访问。

### `GET /api/admin/deletion-requests`

仅 admin 可访问，返回最近 100 条删除请求的最小处理信息，不返回用户训练正文。

### `POST /api/admin/deletion-requests/{requestId}/approve`

仅 admin 可调用。将 `requested|failed` 请求推进为 `approved`，并把账号冻结为 `deletion_pending`；重复审批已 approved 请求幂等返回。

### `POST /api/admin/deletion-requests/{requestId}/execute`

仅 admin 可调用。执行 server-only 删除事务；成功为 `completed` 并清除身份映射，失败整体回滚、标记 `failed` 和稳定 `failureCode`，可重新审批后重试。

## 3. Interview Session API

### `POST /api/interview-sessions`

Request:

```json
{
  "resumeText": "string",
  "jdText": "string",
  "interviewerStyleId": "strictHr",
  "idempotencyKey": "uuid"
}
```

Response data:

```json
{
  "sessionId": "uuid",
  "status": "draft",
  "version": 1,
  "quota": {
    "limit": 3,
    "used": 1,
    "remaining": 2
  }
}
```

要求已登录且已同意当前协议。服务端从 profile 写入 schoolId。

Rules:

- `idempotencyKey` 在同一用户内唯一；相同 key 重试返回原 Session 和当前额度快照，不重复扣减。
- 新建 Session、`sessions_started + 1` 与 `session_started` 服务端事件必须在同一数据库事务提交或回滚。
- 当前默认 `session_limit=3`，以激活时写入 profile 的快照为准；额度耗尽返回 `SESSION_QUOTA_EXHAUSTED`（409、不可重试）。
- 额度只限制创建新 Session；已有 Session 的读取、里程碑写入、答案、报告和完成接口不受剩余额度影响。
- 当前额度不因 abandoned/失败自动返还；如后续需要人工返还，必须新增审计过的 admin 流程，不在本接口静默处理。

### `GET /api/interview-sessions/current`

返回 owner 最近一个未 `completed/abandoned` 的会话快照；没有可恢复会话返回 `data: null`。用于刷新、重登和 Node 重启后的无本地 ID 恢复，不创建 Session、不占用额度。

### `GET /api/interview-sessions/:id`

返回 owner 的完整会话快照。非 owner 统一按 `RESOURCE_NOT_FOUND` 或既定防枚举语义返回，不泄露资源存在性。

### `PATCH /api/interview-sessions/:id`

Request:

```json
{
  "expectedVersion": 3,
  "milestone": "questions_ready",
  "candidateProfile": {},
  "questions": [],
  "generationSource": "llm"
}
```

Rules:

- 只接受与 milestone 对应的字段。
- runtime schema 校验通过后写入。
- `expectedVersion` 不匹配返回 `SESSION_CONFLICT` 和当前版本摘要。
- 状态回退返回 `INVALID_STATE_TRANSITION`。
- `generationSource` 只允许 `llm/demo_fallback/mixed`。

### `PUT /api/interview-sessions/:id/answers/:questionId`

Request:

```json
{
  "answerText": "string",
  "inputMode": "voice",
  "durationSec": 72,
  "sttStatus": "success",
  "idempotencyKey": "uuid"
}
```

按 `(sessionId, questionId)` upsert；questionId 必须属于本会话。

### `POST /api/interview-sessions/:id/report`

在现有报告生成成功后保存完整报告并更新里程碑。也可由现有生成接口内部调用统一 persistence service；不得形成两套不同 schema。

### `POST /api/interview-sessions/:id/complete`

只在完整报告已持久化且用户可见后完成。重复调用幂等。

## 4. Feedback API

### `POST /api/interview-sessions/:id/feedback`

Request:

```json
{
  "rating": 5,
  "comment": "诊断很具体",
  "idempotencyKey": "uuid"
}
```

- rating 1–5；comment 可空，最多 500 字。
- 每个 session 最多一条；重复提交返回既有记录。
- 只能反馈自己的 `report_ready/completed` 会话。

### `GET /api/interview-sessions/:id/feedback`

返回 owner 已提交的反馈；未提交时 `data=null`。用于刷新/重登后恢复成功状态。

## 5. Client Event API

### `POST /api/events`

仅接收 allowlist 客户端漏斗事件：`page_viewed`、`consent_viewed`、`report_viewed`、`copy_succeeded`、`copy_failed`、`feedback_skipped`。

```json
{
  "eventName": "page_viewed",
  "sessionId": "uuid-or-null",
  "idempotencyKey": "uuid",
  "properties": {
    "step": "report",
    "theme": "figma"
  }
}
```

- 忽略客户端传入的 userId/schoolId。
- properties 只允许 schema 中字段，拒绝正文和任意深层对象。
- 服务端业务完成事件不通过该接口由客户端声明。

## 6. Admin API

所有接口要求 `role=admin`。

| Endpoint | Purpose |
| --- | --- |
| `GET/POST /api/admin/schools` | 查询/创建学校 |
| `GET/POST/PATCH /api/admin/invite-codes` | 创建、停用、查看邀请码使用情况 |
| `GET /api/admin/metrics?from=&to=&schoolId=` | 聚合注册、完成、失败、反馈和用量 |
| `GET /api/admin/deletion-requests` | 查询删除请求 |
| `POST /api/admin/deletion-requests/:id/approve` | 批准请求 |
| `POST /api/admin/deletion-requests/:id/execute` | 执行删除并写审计摘要 |
| `GET /api/admin/feedback-summary` | 只返回评分数量、均值和星级分布 |

管理接口默认不返回简历/JD/答案/报告全文。

`POST /api/admin/invite-codes` 接受 `batchCount`（默认 1，1–100）、
`maxUses`（默认 1，1–1000）和 `sessionLimitPerUser`（默认 3）。
批量创建必须全量成功或全量回滚；成功响应保留单条创建的
`inviteCode` 兼容字段，并通过 `inviteCodes` 返回本批全部明文及技术 ID。
所有明文只显示一次，日志、audit 和数据库均不得保存邀请码明文。

## 7. Server Event Contract

| Event | Producer | Trigger | Required properties |
| --- | --- | --- | --- |
| `auth_otp_requested` | auth server | 邮件服务接受请求 | `schoolId`, `deliveryAccepted` |
| `auth_login_succeeded` | auth server | profile 初始化完成 | `schoolId`, `isFirstLogin` |
| `consent_accepted` | consent server | 同意记录提交 | `policyVersion` |
| `session_started` | session server | draft 创建 | `sessionId`, `styleId` |
| `profile_generated` | persistence service | 结果持久化 | `source`, `provider`, `model`, `latencyMs`, `attempts`, `inputTokens`, `outputTokens`, `requestId` |
| `questions_generated` | persistence service | 结果持久化 | `source`, `provider`, `model`, `latencyMs`, `attempts`, `inputTokens`, `outputTokens`, `requestId` |
| `answer_saved` | answer route | upsert 成功 | `questionId`, `inputMode`, `durationSec` |
| `report_generated` | persistence service | 报告持久化 | `source`, `provider`, `model`, `latencyMs`, `attempts`, `inputTokens`, `outputTokens`, `requestId` |
| `session_completed` | session server | 完成状态提交 | `durationSec`, `answeredCount` |
| `feedback_submitted` | feedback server | feedback 写入 | `rating` |
| `dependency_failed` | server wrapper | LLM/TTS/STT/DB 最终失败 | `dependency`, `operation`, `retryable` |

禁止事件属性包含正文、OTP、Cookie、token、密钥或 provider 原始响应。
provider 未返回 usage 时 token 字段写 `null`，不得估算或用 `0` 冒充真实测量。`demo_fallback` 固定 `provider=local_demo`，`model/latency/attempts/usage=null`；不得把本地 adapter 或 fixture 数字冒充真实 provider 测量。

### 7.1 Speech Provider Failover

- `/api/tts`、`/api/stt` 的公开字段保持 `docs/04_api_contracts.md` 兼容，provider 选择不得成为客户端输入。
- TTS 服务端链为 Azure→备用 provider，之后由客户端执行 Web Speech→文本；STT 服务端链为 Azure→备用 provider，之后由客户端执行浏览器识别→手动编辑。
- 同一用户操作对每个服务端 provider 最多调用一次；仅超时、网络错误、429/5xx 等 retryable dependency failure 进入下一 provider。
- 语音技术事件允许字段：`provider`、`operation`、`durationSec` 或 `characterCount`、`latencyMs`、`attempts`、`result`、`errorCode`、`requestId`。
- 禁止记录 TTS 正文、STT 音频/转写正文、密钥或 provider 原始响应；备用 provider 未取得真实 payload review 前 VOICE-004 保持 Partial。

### 7.2 Tencent RUM Frontend Receiver

- staging 前端 RUM 仅在 `NEXT_PUBLIC_TENCENT_RUM_ENABLED=true` 且应用 ID 合法时初始化；缺失、无效、SDK 加载或上报失败均 fail-open。
- 接收域固定为中国大陆 `https://rumt-zh.com`；不允许通过环境变量切换到跨境 endpoint。
- 允许类型：手动脱敏的前端错误类型/栈帧/来源/归一化路径、API method/status/duration/去参数化 route/响应 `x-request-id`、页面性能和 Web Vitals。
- 禁止类型：真实 `uin`、持久 `aid`、设备详情、Cookie/Authorization、任意请求 header、请求/响应正文、query/hash、简历/JD/答案/报告/prompt、点击/console 全量日志、页面 DOM 或截图。
- SDK 自动 JS error listener 关闭，由既有 `reportClientError` 统一生成最小事件；API speed 不解析业务 retcode，不上报 request/response detail。
- RUM 只覆盖浏览器接收面。服务端异常、PostgreSQL、备份和告警恢复通知仍由 vendor-neutral server/readiness/外部通知链关闭，不得由 RUM 前端数据替代。

## 8. Metric Definitions

| Metric | Definition |
| --- | --- |
| 注册成功用户 | 去重 `auth_login_succeeded` userId |
| OTP 请求成功率 | delivery accepted / 合法且未限流请求 |
| OTP 验证成功率 | 登录成功邮箱 / 成功发送 OTP 的去重邮箱 |
| 会话开始数 | 去重 `session_started.sessionId` |
| 闭环完成率 | `session_completed` 去重 session / `session_started` 去重 session |
| 模型最终失败率 | LLM `dependency_failed` final / LLM operation attempts |
| fallback 使用率 | generation source 含 `demo_fallback` 的会话 / 生成会话 |
| 反馈采集率 | feedback session / completed session |
| 平均质量分 | feedback.rating avg 和 finalReport.overallScore avg 分开显示 |

## 9. Common Security Rules

- 所有写请求校验 Content-Type、body size、schema、Session、owner/role。
- Auth、feedback、event 和 admin 写接口在进入业务 handler 前统一执行 PostgreSQL-backed 限流；JSON body 同时检查声明长度和实际流式读取长度。
- 无 body 的 logout/删除审批执行仍执行限流；可选 JSON body 只在存在 Content-Type 时接受 JSON media type。
- 通用限流 key 只保存 HMAC scope，不保存 Cookie、邮箱、IP、OTP 或请求正文；数据库依赖异常时 fail-closed。
- 敏感接口使用 CSRF/同站 Cookie 防护策略。
- API 返回 `requestId`，日志用同一 ID。
- 限流 key 使用 IP + 邮箱哈希/用户 ID，不把邮箱明文写入普通日志。
- 管理和删除操作必须产生审计日志。

## 10. Questionnaire APIs And Events

- `GET /api/questionnaire/config`：匿名返回规范化配置和 `writable`，不返回路径或配置值。
- `POST /api/questionnaire/config`：校验四种题型、选项和长度；生产显式开关后才可写，保存生成新版本。
- `GET /api/interview-sessions/:id/questionnaire`：仅 Juju 已登录 owner，返回资格、配置和既有提交摘要。
- `POST /api/interview-sessions/:id/questionnaire`：服务端验证 owner、首次完成、配置版本与答案，每用户/会话唯一。
- `POST /api/interview-sessions`：首场已完成但问卷尚未提交时返回 `409 QUESTIONNAIRE_REQUIRED`；幂等重放既有创建不受影响。
- `GET /api/interview-sessions/current`：存在首场问卷门禁时返回对应已完成报告；提交问卷后恢复普通 active-session 语义。

服务端事件新增 `questionnaire_submitted`；客户端 allowlist 新增 `questionnaire_invite_viewed`、`questionnaire_started`。properties 不得包含答案正文或客户端提供的用户/学校 ID。Auth API 只用于 Juju。

### Local OTP Development Mode

当且仅当非 production 且 `INTERNAL_BETA_LOCAL_OTP_ENABLED=true`：

- `request-otp` 仍创建 Better Auth challenge，但生成 `INTERNAL_BETA_LOCAL_OTP_CODE`（默认 `999999`）。
- 不调用 SES，不执行 `reserveOtpSendBudget`。
- 响应可返回 `deliveryMode=local` 和固定码供本地 UI 提示。
- production 无条件忽略该开关，并继续使用随机 OTP、SES 和预算控制。
