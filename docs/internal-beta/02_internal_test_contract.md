# PassBuddy 受控内测 Contract v0.1

> 权威范围：`01_scope_and_decisions.md`
> 验收依据：`05_acceptance_matrix.md`

## 1. Goals

- 受邀用户可通过邮箱 OTP 登录并完成现有面试主闭环。
- 已提交训练记录以 PostgreSQL 为 source of truth，刷新、重登或服务重启后仍可查询。
- 用户数据按身份隔离；管理功能只对 admin 开放。
- 隐私同意、反馈、业务事件和严重错误均可追踪。
- 保留现有画像、题目、报告、TTS/STT 语义和降级路径。

## 2. Non-Goals

- 不做密码、短信、社交登录、学校 SSO 或公开注册。
- 不做用户侧完整历史中心、数据仓库、实时 BI 和正式商用 SLA。
- 不保存原始音频。
- 不自动判断法律合规；法务文本由产品/法务提供。
- 不删除现有 Demo fallback、Web Speech、非流式报告或现有主题。

## 3. System Boundary

| 边界 | 内容 |
| --- | --- |
| 客户端 | 登录/同意 UI、现有面试状态机、反馈 UI、客户端漏斗事件 |
| Next.js 服务端 | Session 校验、业务 API、服务端事件、管理 API、敏感数据最小化 |
| 认证层 | Next.js 内自托管 Better Auth，管理 Session/OTP 验证记录 |
| 数据层 | 腾讯云 PostgreSQL（线上同地域/VPC）或本地 PostgreSQL（开发），承载身份和业务数据、RLS、备份 |
| 邮件层 | 腾讯云 SES SendEmail API；已审核模板和发信域名；不得由浏览器直连 |
| 监控平台 | 腾讯云 RUM 只接前端脱敏异常/API 性能/Web Vitals；服务端继续 provider-neutral；不得发送简历/JD/答案全文 |
| 既有/新增外部依赖 | OpenAI-compatible LLM、Azure TTS/STT、待选备用 TTS/STT、Web Speech |

## 4. Roles And Authorization

| Role | 权限 |
| --- | --- |
| anonymous | 请求 OTP、验证 OTP；不能调用受保护业务和管理 API |
| authenticated_uninvited | 已有 Auth Session，可提交邀请码；不能进入产品业务或管理 API |
| user | 已消费邀请码并有 active profile；读取/写入自己的 consent、sessions、answers、feedback；不能访问其他用户或管理数据 |
| admin | 管理学校/邀请码、查看聚合指标、登记和执行删除；正文读取默认关闭 |
| service | 仅在服务端执行受控管理/聚合操作；密钥不得下发客户端 |

所有受保护 Route Handler 必须在服务端验证当前用户，不能只相信客户端传入的 `userId` 或 role。

## 5. Identity And Invite Constraints

- 登录仅使用邮箱数字 OTP，不创建或存储应用密码。
- OTP 只负责邮箱账号注册/登录；请求和验证 OTP 不要求邀请码。
- OTP 成功但没有 active profile 时建立受限 Session，并返回 `needsInvite=true`；该状态只能提交邀请码或退出，不能进入产品业务。
- 邀请码在已登录账号首次开通产品体验时原子消费并创建/关联 user profile；重复登录不得要求或重复消费邀请码。
- 邀请码无效或落库失败时保留受限 Auth Session，允许重试其他有效邀请码，但不得进入业务页。
- 激活时将邀请码的 `session_limit_per_user` 快照到 profile，当前默认 3；新建第 4 个会话返回稳定额度错误，恢复/重试既有会话不重复占用。
- 第一场会话完成后、首次问卷提交前，新建第 2/3 场返回 `QUESTIONNAIRE_REQUIRED`；相同创建 key 的幂等重放和既有会话恢复不重复占用额度。
- Session 使用 Better Auth HttpOnly Cookie；生产启用 Secure 和合适的 SameSite 属性。
- admin 角色来自服务端可信数据库字段，不允许客户端自报。
- 请求 OTP、验证 OTP、邀请码尝试必须限流并使用不泄露账号存在性的错误文案。

## 6. Data And Source-Of-Truth Constraints

| 数据 | Source of truth | 客户端角色 |
| --- | --- | --- |
| 用户身份/Session | Better Auth 的 PostgreSQL 表 | 只消费当前 Session |
| 用户学校/角色 | `user_profiles` | 只读展示 |
| 隐私同意 | `consent_records` | 提交草稿与展示状态 |
| 已提交训练记录 | PostgreSQL `interview_sessions` + `interview_answers` | 本地 Draft / UI mirror |
| 当前页面输入 | React state | 未提交 Draft |
| 反馈 | PostgreSQL `feedback` | 提交后只显示结果 |
| 服务端完成率/错误率 | PostgreSQL 业务表与 `product_events` | 客户端事件仅补漏斗 |

- 不得把 React state 或 localStorage 继续作为已提交训练结果的唯一 source of truth。
- 复杂既有结构允许 JSONB 保存，但必须带 `schema_version`。
- 所有用户数据表必须包含 owner、创建/更新时间和可追踪 ID。
- 不保存原始音频；STT 只保存转写文本和时长/状态。
- Demo/fallback 生成必须记录 `generation_source`，不得与真实模型调用混淆。

## 7. Privacy And Data Minimization

- 未同意当前有效协议版本的 user 不得开始新的训练会话。
- 同意记录不可被普通更新覆盖；新版本产生新记录。
- 日志、监控、事件表不得写入简历、JD、答案、报告全文、OTP、Session token 或真实密钥。
- 腾讯云 RUM 不设置真实 `uin`，不生成持久 `aid`，不采集设备详情、Cookie、query、请求/响应正文、任意 header、点击日志或页面截图；API 仅允许响应 `x-request-id` 用于关联。
- RUM SDK 缺配置、加载失败或上报失败时不得阻断页面、Auth 或面试主闭环；本地 server-side capture 入口继续保留。
- 管理看板默认只展示聚合值和技术 ID。
- 删除采用 `requested → approved → executing → completed|failed` 状态；执行前记录范围，执行后保留不含用户正文的审计记录。
- 内测结束后默认保留 90 天；到期处置必须由产品/管理员确认并记录。

## 8. Interface Compatibility

- `docs/04_api_contracts.md` 中画像、出题、报告、TTS、STT 的请求/响应字段继续有效。
- 语音 provider 切换不得改变 `/api/tts`、`/api/stt` 的客户端请求/响应；provider 选择、密钥和原始错误只存在于服务端。
- 单次用户操作对每个服务端语音 provider 最多调用一次；只有超时、网络错误、429 或 5xx 等可重试依赖错误才进入下一个 provider，4xx 输入错误不得触发备用调用。
- TTS 顺序为 Azure → 备用服务端 provider → Web Speech → 文本；STT 顺序为 Azure → 备用服务端 provider → 浏览器识别 → 保留文本并手动编辑。
- 任一 STT provider 失败不得清空已有答案；任何路径均不得持久化原始音频。
- 新增持久化不能改变 `interviewerStyleId`、`questionId`、`sessionStep` 和现有报告字段语义。
- 现有非流式报告接口继续作为流式失败保底。
- 现有 Demo fallback 继续可用于开发与明确的失败兜底，但生产 UI 必须能区分。
- 未登录的开发演示行为如需保留，只能在非生产环境或显式受保护的 Demo 模式中存在。
- 临时外网预览门禁启用时，Classic/Figma 入口及 Classic Prompt 管理 API 必须 fail-closed：缺少用户名或密码不得放行；默认/Juju、`/admin` 和 `/api/health` 不经过该门禁，分别由 Juju Auth、admin role 与 readiness 契约保护。共享预览凭据不产生应用用户、学校、邀请码或 admin 权限。

## 9. State And Consistency

- 会话状态允许：`draft → profile_ready → questions_ready → in_progress → report_ready → completed`；`abandoned` 为终态。
- 状态只能前进；管理员修复不得伪造用户完成事件。
- 更新会话使用 `version` 乐观并发；版本冲突返回 `SESSION_CONFLICT`，前端重新拉取而非静默覆盖。
- 创建、反馈提交和关键客户端事件必须支持幂等键。
- 单次里程碑写入所涉及的 session 与 event 应在同一服务端事务或数据库函数中提交。
- 外部 LLM/TTS/STT 调用不能与数据库事务长时间绑定；先得到结果，再进行短事务持久化。

## 10. Error Semantics

| Code | Meaning | HTTP | Retry |
| --- | --- | ---: | --- |
| `AUTH_REQUIRED` | 未登录或 Session 失效 | 401 | 登录后 |
| `FORBIDDEN` | 无资源或管理权限 | 403 | No |
| `OTP_RATE_LIMITED` | 请求过频 | 429 | Yes, after delay |
| `OTP_INVALID_OR_EXPIRED` | 验证码错误或过期 | 400 | Yes |
| `INVITE_INVALID` | 邀请码无效 | 400 | No |
| `INVITE_EXPIRED` | 邀请码过期 | 400 | No |
| `INVITE_EXHAUSTED` | 邀请码用尽 | 409 | No |
| `CONSENT_REQUIRED` | 未同意当前版本协议 | 403 | Yes, after consent |
| `RESOURCE_NOT_FOUND` | 资源不存在或不可见 | 404 | No |
| `SESSION_CONFLICT` | 乐观锁冲突 | 409 | Yes, reload |
| `QUESTIONNAIRE_REQUIRED` | 首场调研尚未完成 | 409 | Yes, after questionnaire |
| `PERSISTENCE_FAILED` | 数据库写入失败 | 503 | Yes |
| `FEEDBACK_ALREADY_SUBMITTED` | 重复反馈 | 409 | Return existing |
| `RATE_LIMITED` | 通用限流 | 429 | Yes |
| `SECURITY_DEPENDENCY_FAILED` | 写请求安全校验依赖不可用 | 503 | Yes |

错误响应沿用 `CommonResponse`，必须带 `requestId`；生产环境不返回 provider 原始错误和数据库细节。

## 11. Observability

- 每个 API 请求拥有 `requestId`，重要业务操作还应带 `userId` 哈希/内部 ID、`sessionId` 和 event name。
- 监控平台只接收脱敏上下文，不接收正文。
- RUM 中的页面/API URL 必须移除 query/hash 并归一化数字、UUID 和长 opaque path segment；前端错误只发送错误类型、技术栈帧、来源和归一化路径。
- 至少告警：登录完全不可用、5 分钟内关键 API 高失败率、严重前端异常、数据库不可用、完成写入失败。
- usage 事件记录 LLM token、TTS 字符数、STT 音频秒数和重试次数；不得记录密钥或全文。

## 12. Acceptance Reference

- IB-01：DATA-001 至 DATA-006、COMP-001
- IB-02：AUTH-001 至 AUTH-008、ADMIN-001
- IB-03：SESSION-001 至 SESSION-008、COMP-002 至 COMP-004
- IB-04：CONSENT-001 至 CONSENT-006
- IB-05：FEED-001 至 FEED-005、EVENT-001 至 EVENT-004
- IB-06：OBS-001 至 OBS-006、ADMIN-002 至 ADMIN-005
- IB-07：SEC-001 至 SEC-006、PILOT-001 至 PILOT-005
- IB-08：VOICE-001 至 VOICE-005

## 13. Change And Risk Registration

- 契约缺口先登记到 `docs/todo.md` 和相关 `internal-beta` 文档，再改 instruction 和代码。
- 不可逆迁移、角色扩张、正文对管理端开放、保存原始音频、强制反馈等变更必须由用户/产品确认。
- 风险无法在当前模块关闭时，必须写明 owner、退出条件和灰度影响。

## 14. IB-10 Theme And Questionnaire Contract

- Juju 是内测认证与持久化产品面；Classic/Figma 无验证码即可进入原 Demo 闭环。
- Classic 配置问卷，题型限定为 `rating|single|multiple|text`；生产写入仅在 `QUESTIONNAIRE_CONFIG_WRITE_ENABLED=true` 时开放。
- 资格要求已登录 owner、第一条已生成报告的会话、用户尚未提交问卷。
- 邀请只在报告页确认动作后出现；关闭邀请返回报告，不清空报告或进入 CV 首页。
- 每用户、每会话最多一条 `questionnaire_responses`；失败保留客户端草稿。
- 首场问卷提交前持续恢复首场评分报告并拒绝创建剩余 2 场；提交后才解锁既有剩余额度。
- 回看页限定当前会话，不提供跨会话搜索或管理端正文读取。
- IB-10 验收 `THEME-001–003`、`SURVEY-001–007`、`HISTORY-001`。
- 用户协议与隐私政策及同意勾选位于验证码登录表单；常规登录/邀请码激活后直接保存同意记录，不再要求重复确认。
- 本地固定 OTP 必须保留真实 Better Auth 验证步骤，但跳过 SES hook 和 OTP budget；只允许非生产显式启用。
- Juju 语音失败提示三选一，不能同时显示文字输入框；网络异常 5 秒后返回首页。
