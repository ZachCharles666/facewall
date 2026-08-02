# PassBuddy 受控内测架构与数据契约

## 1. Architecture Decision

### 1.1 Target Stack

- 应用：现有 Next.js App Router + React + TypeScript。
- 身份：Next.js 服务端自托管 Better Auth + Email OTP plugin。
- 邮件：腾讯云 SES `SendEmail` API，使用已审核发信域名和验证码模板；不使用浏览器 SDK，不把 SMTP 作为默认路径。
- 数据库：线上腾讯云 PostgreSQL，与应用部署在同地域/VPC；开发/测试使用兼容的本地 PostgreSQL。
- Session：Better Auth HttpOnly Cookie；公开 UI 只调用项目 Auth API，不直接访问数据库。
- 数据访问：全部经服务端 Route Handler/repository；业务表启用 PostgreSQL RLS 作为纵深防御。
- 错误监控：Sentry 或等价托管平台；实现不得依赖监控平台作为业务 source of truth。
- 指标看板：受保护的 Next.js admin 页面查询聚合视图；必要时辅以只读 SQL。

### 1.2 Environment Variables

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Server only | Better Auth 与业务数据 PostgreSQL 连接 |
| `DATABASE_ADMIN_URL` | Migration/admin only | migration、备份和受控管理操作 |
| `BETTER_AUTH_SECRET` | Server only | Session/认证签名 |
| `BETTER_AUTH_URL` | Server/build | 认证基准 URL |
| `INTERNAL_BETA_AUTH_ENABLED` | Server/build | Auth 门禁功能开关 |
| `AUTH_OTP_EXPIRES_IN_SEC` | Server only | OTP/挑战有效期；内测 1800，上线前 300–600 |
| `TENCENTCLOUD_SECRET_ID` | Server only | SES API 身份 |
| `TENCENTCLOUD_SECRET_KEY` | Server only | SES API 密钥 |
| `TENCENT_SES_REGION` | Server only | SES 区域 |
| `TENCENT_SES_FROM_EMAIL` | Server only | 已验证发件地址 |
| `TENCENT_SES_TEMPLATE_ID` | Server only | 已审核验证码模板 |
| `AUTH_OTP_EMAIL_DAILY_LIMIT` | Server only | 单邮箱每日 OTP 请求上限 |
| `AUTH_OTP_IP_DAILY_LIMIT` | Server only | 单 IP 每日 OTP 请求上限 |
| `AUTH_OTP_GLOBAL_WARN_LIMIT` | Server only | 全局每日发送预算预警阈值 |
| `AUTH_OTP_GLOBAL_STOP_LIMIT` | Server only | 全局每日发送预算停止阈值 |
| `SENTRY_DSN` / public DSN | Per SDK | 错误上报 |
| `SENTRY_AUTH_TOKEN` | Build/server only | Source map/发布 |

数据库 admin credential 可绕过 RLS，只能存在 migration/受控 server-only 模块；管理 API 仍必须先校验 admin。

## 2. Client Boundaries

| Client | Location | Allowed |
| --- | --- | --- |
| auth client | Client Components | OTP/Session/logout；不得持有邮件或数据库 secret |
| auth server | Better Auth Route Handler/server module | OTP 校验、Cookie Session、auth schema |
| user repository | Route Handlers/server-only | 在事务中设置当前 user context 后访问业务表 |
| admin repository | server-only module | migrations、邀请码管理、聚合、删除执行；调用前校验 admin |
| email adapter | server-only module | 将数字 OTP 映射为腾讯云 SES 模板参数 |

禁止在同一通用 helper 中静默从 user repository 升级为 admin repository。认证、邮件和业务数据库 provider API 必须封装，不能散落到 UI/业务组件。

### 2.1 Auth Schema

- Better Auth 核心 `user/session/account/verification` 表及 Email OTP 所需字段由锁定版本的 CLI 生成 SQL，生成结果进入版本控制并在空库验证。
- Better Auth 表放在独立 `auth` schema；业务表放在 `public` schema。业务记录通过 `user_id text` 关联 Better Auth user id。
- OTP 只以 Better Auth 支持的 hash 形式短期保存，过期时间 1800 秒、长度 6、最多 3 次错误尝试；重发使用 rotate 策略使旧码失效；日志和事件不得记录 OTP。
- 公开 Route Handler 不暴露 Better Auth 原生 Email OTP 写端点；项目 Auth API 在邀请码与预算校验后直接调用 server-only Auth handler，防止绕过准入和额度保护。

## 3. Data Model

数据库使用 `snake_case`；TypeScript/API 使用 `camelCase`。主键默认 UUID，时间统一 `timestamptz` UTC。

### 3.1 `schools`

| Field | Type | Constraint |
| --- | --- | --- |
| `id` | uuid | PK |
| `code` | text | unique, not null |
| `name` | text | not null |
| `email_domains` | text[] | default `{}` |
| `status` | text | `active/inactive` |
| `created_at`, `updated_at` | timestamptz | not null |

### 3.2 `invite_codes`

| Field | Type | Constraint |
| --- | --- | --- |
| `id` | uuid | PK |
| `school_id` | uuid | FK schools |
| `code_hash` | text | unique, not null；不保存明文 |
| `label` | text | admin 可读 |
| `max_uses`, `used_count` | integer | `>= 0` |
| `session_limit_per_user` | integer | default 3；该邀请码为每个激活账号授予的会话名额 |
| `expires_at` | timestamptz | nullable |
| `status` | text | `active/disabled` |
| `created_by` | text | admin auth user id |
| `created_at`, `updated_at` | timestamptz | not null |

邀请码在数据库函数中原子检查并消费；不得使用“先查 used_count 再单独 update”的竞态实现。

### 3.2.1 `auth.otp_send_counters`

| Field | Type | Constraint |
| --- | --- | --- |
| `scope_type` | text | PK part；`email/ip/global` |
| `scope_hash` | text | PK part；邮箱/IP 使用 HMAC，global 使用固定内部值 |
| `bucket_date` | date | PK part；UTC 日桶 |
| `attempt_count` | integer | `>= 0` |
| `updated_at` | timestamptz | not null |

验证码发送预算使用数据库函数在同一临界区检查并递增 email/IP/global 三个计数，避免多实例并发超发。计数代表已获准调用 SES 的发送尝试；即使 provider 失败也保留，以防故障或攻击持续消耗外部额度。表中不得保存原始邮箱、IP、OTP 或 provider credential。

### 3.2.2 `auth.write_rate_limit_counters`

| Field | Type | Constraint |
| --- | --- | --- |
| `scope_hash` | text | PK part；Cookie 或来源 IP 的 HMAC，不保存原值 |
| `route`, `method` | text | PK part；只保存技术路由与写方法 |
| `window_started_at` | timestamptz | PK part；固定窗口起点 |
| `attempt_count` | integer | `>= 0` |
| `updated_at` | timestamptz | not null |

Auth、feedback、event 和 admin 写接口通过 `security definer` 函数原子预留固定窗口额度；runtime role 无表读取权限。限流数据库不可用时写请求 fail-closed，并返回稳定、可重试的服务错误。反向代理必须覆盖而不是透传不可信客户端自报的来源 IP。

### 3.3 `user_profiles`

| Field | Type | Constraint |
| --- | --- | --- |
| `user_id` | text | PK, FK auth user |
| `school_id` | uuid | FK schools |
| `invite_code_id` | uuid | FK invite_codes |
| `email_normalized` | text | not null |
| `role` | text | `user/admin`, default `user` |
| `status` | text | `active/blocked/deletion_pending/deleted` |
| `session_limit` | integer | 激活时从邀请码复制，当前默认 3 |
| `sessions_started` | integer | 已原子占用的新会话名额，`0..session_limit` |
| `created_at`, `updated_at` | timestamptz | not null |

`role`、`school_id`、`invite_code_id`、会话额度字段只能由可信服务端写入。邀请码后续修改默认额度不追溯改变已激活账号；恢复同一个 interview session 不增加 `sessions_started`。

### 3.4 `consent_records`

| Field | Type | Constraint |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | text | FK auth user；执行完成后置空并由 `on delete set null` 保留最小审计 |
| `policy_version` | text | not null |
| `consent_scope` | text[] | not null |
| `accepted_at` | timestamptz | not null |
| `withdrawn_at` | timestamptz | nullable |
| `request_id` | text | not null |

唯一性建议为 `(user_id, policy_version)`；撤回不删除历史记录。

### 3.5 `interview_sessions`

| Field | Type | Constraint |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | text | FK auth user, not null |
| `school_id` | uuid | FK schools, not null |
| `status` | text | 合同状态枚举 |
| `version` | integer | default 1 |
| `schema_version` | integer | default 1 |
| `idempotency_key` | uuid | not null；同一 user 唯一 |
| `resume_text`, `jd_text` | text | not null |
| `interviewer_style_id` | text | stable enum |
| `candidate_profile` | jsonb | nullable until ready |
| `questions` | jsonb | nullable until ready |
| `report` | jsonb | nullable until ready |
| `generation_source` | text | `llm/demo_fallback/mixed` |
| `started_at`, `completed_at` | timestamptz | nullable |
| `created_at`, `updated_at` | timestamptz | not null |

复杂字段必须通过现有 runtime schema 校验后写入。`school_id` 从 profile 派生，不接受客户端任意传入。创建时以 profile 行锁串行化额度检查；`sessions_started + 1`、Session 与 `session_started` 事件同事务提交。相同 `(user_id, idempotency_key)` 在加锁后复查并返回原 Session。

### 3.6 `interview_answers`

| Field | Type | Constraint |
| --- | --- | --- |
| `id` | uuid | PK |
| `session_id` | uuid | FK, not null |
| `user_id` | text | FK auth user, not null |
| `question_id` | text | not null |
| `answer_text` | text | not null |
| `input_mode` | text | existing enum |
| `duration_sec` | integer | `0..7200` |
| `stt_status` | text | existing enum |
| `updated_at` | timestamptz | not null |

唯一性：`(session_id, question_id)`。更新必须验证 questionId 存在于 session questions。

### 3.7 `feedback`

| Field | Type | Constraint |
| --- | --- | --- |
| `id` | uuid | PK |
| `session_id`, `school_id` | uuid | FK |
| `user_id` | text | FK auth user |
| `rating` | smallint | `1..5` |
| `comment` | text | nullable, max 500 chars |
| `created_at` | timestamptz | not null |

内测第一版每个 session 最多一条反馈；重复请求返回已有记录。

### 3.8 `product_events`

| Field | Type | Constraint |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | text | nullable, FK auth user |
| `school_id`, `session_id` | uuid | nullable by event |
| `event_name` | text | allowlist |
| `source` | text | `server/client` |
| `idempotency_key` | text | nullable |
| `properties` | jsonb | 脱敏、小体积 |
| `occurred_at`, `created_at` | timestamptz | not null |

唯一性：有 idempotency key 时 `(user_id, event_name, idempotency_key)`。禁止 properties 写入用户正文。

### 3.9 `deletion_requests`

| Field | Type | Constraint |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | text | FK auth user |
| `status` | text | `requested/approved/executing/completed/failed/rejected` |
| `requested_at`, `resolved_at` | timestamptz | nullable |
| `handled_by` | text | admin auth user id |
| `reason`, `failure_code` | text | nullable，不含正文 |
| `audit_summary` | jsonb | 删除表/数量摘要 |

同一用户在 `requested/approved/executing` 状态只能有一个未结束请求。完成删除前 `user_id` 用于 owner 查询；完成时必须置空、清除 `reason`，只保留不含正文、邮箱或可回查用户映射的 `audit_summary`。

## 4. RLS And Access Matrix

| Table | user SELECT | user INSERT/UPDATE | admin |
| --- | --- | --- | --- |
| schools | 自己学校的最小字段 | No | Full |
| invite_codes | No | No | Full |
| user_profiles | own | No direct sensitive update | Full |
| consent_records | own | own insert/withdraw route | Full |
| interview_sessions | own | own via server/RLS | Full |
| interview_answers | own | own via server/RLS | Full |
| feedback | own | own insert | Full |
| product_events | No raw query | allowlisted client insert route only | Aggregate/full technical |
| deletion_requests | own status | own request | Full |

业务连接角色不拥有表、无 `BYPASSRLS`；owner/migration 角色与运行时角色分离。user repository 必须在短事务中以 `set_config('app.user_id', userId, true)` 设置身份，策略读取 transaction-local context；业务表使用 `FORCE ROW LEVEL SECURITY`。admin 使用独立 server-only pool，且必须先校验 Better Auth Session 中的数据库角色。

RLS 必须有真实 PostgreSQL 自动化负向测试：用户 A 无法读取/修改用户 B 的任何记录；连接池复用后身份上下文不得泄漏。

## 5. Persistence State Model

```text
draft
  -> profile_ready
  -> questions_ready
  -> in_progress
  -> report_ready
  -> completed

draft/profile_ready/questions_ready/in_progress -> abandoned
```

- 首次提交有效 setup 输入后创建 `draft` session。
- 每个里程碑更新 session、递增 `version` 并写服务端事件。
- 答案按 questionId upsert，不因 STT 失败清空已有文本。
- report 写入成功后进入 `report_ready`；用户看到完整报告后记录 `completed`。
- 任何写入失败保留当前客户端 Draft，提示重试，不伪造完成事件。

## 6. Migration And Rollback

1. 先增加数据层和契约测试，不改变现有 UI source。
2. 接入单一开发用户，进行 mirror 写入并核对 JSON/DB 一致性。
3. 切换已登录用户为 DB source；非生产 Demo 模式保留内存路径。
4. 灰度期发现持久化故障时，可关闭写入功能开关并回到现有 Demo 路径，但真实内测不得在无告知时丢弃用户数据。
5. 删除表/字段必须晚于灰度验收，且本轮原则上不做 destructive migration。

## 7. Indexes And Limits

- `interview_sessions(user_id, created_at desc)`
- `interview_sessions(school_id, status, created_at)`
- `product_events(event_name, occurred_at)`
- `feedback(school_id, created_at)`
- `deletion_requests(status, requested_at)`
- resume/JD/答案/报告请求和数据库字段设置合理字符上限；超限返回 `INPUT_INVALID`。

## 8. Audit Requirements

- migration 文件进入版本控制。
- 每次迁移提供 apply 验证；若平台不支持可靠 downgrade，提供前向修复方案和备份点。
- 管理操作记录 admin ID、requestId、目标 ID、结果和时间。
- 数据库、监控和日志样例不得包含真实用户正文。

## 9. Questionnaire Data Addendum

| Name | Scope | Rule |
| --- | --- | --- |
| `FACEWALL_QUESTIONNAIRE_STORE_PATH` | Server only | Classic 全局配置 JSON 路径，不得指向公开静态目录 |
| `QUESTIONNAIRE_CONFIG_WRITE_ENABLED` | Server only | 生产写入口显式开关，缺失时 fail-closed |

`questionnaire_responses` 保存 `user_id`、`school_id`、`interview_session_id`、配置版本和结构化 answers；`user_id` 与 session 分别唯一。表启用 FORCE RLS，用户只读写自己的行，删除事务必须覆盖该表。迁移 `0012` 只前向添加，不删除或覆盖 IB-02 以来的数据。配置保存生成新版本，历史回答按提交时版本保留。
