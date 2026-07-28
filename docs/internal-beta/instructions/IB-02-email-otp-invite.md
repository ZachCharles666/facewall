# Development Instruction: IB-02 · 邮箱 OTP、Session 与邀请码

## 0. 元信息

- 任务类型：Feature
- 风险等级：L1
- 工作目录：`D:\hackthon\facewall`
- 基线：IB-01 已通过的 commit
- 权威契约：Contract §4–§5；API Contract §1、§6、§9
- 验收：AUTH-001–AUTH-008、ADMIN-001、SEC-003

## 1. 本次目标

用户可用邮箱 OTP 注册/登录并建立 Cookie Session；未取得内测资格的账号额外提交邀请码并绑定学校，已激活用户后续登录不再输入或消费邀请码；admin 可通过受保护 API 管理学校和邀请码。

## 2. 非目标

- 不做密码、短信、社交登录、学校 SSO、公开注册。
- 不做完整管理看板视觉。
- 不改变现有面试业务字段。

## 3. 开工前只读侦察

核对 IB-01 pools/migrations/RLS、当前首页入口、三主题布局、Next.js middleware/proxy、Better Auth Email OTP 配置、腾讯云 SES 发信域名/模板审核和 staging base URL。确认工作区已有改动。

## 4. 验收标准

完整引用 AUTH-001–AUTH-008；ADMIN-001 的 API 部分；SEC-003 的 Auth 写接口部分。真实邮箱 OTP 是 Must，不得只用 fake。

## 5. 硬约束

- API 按 `04_api_and_event_contracts.md`：request-otp、verify-otp、redeem-invite、session、logout。
- OTP challenge 只绑定邮箱；邀请码只存 hash，在取得 Auth Session 后单独提交。
- 邀请码在首次产品资格激活时消费；已存在 active profile 后续登录不再要求或消费。
- 激活时将邀请码授予的单账号会话额度快照到 profile，当前默认 3；额度原子占用由 IB-03 session create 接口执行。
- Session/role/owner 以服务端为准。
- 错误文案不泄露邮箱是否已注册。
- 生产 Cookie 使用 Secure/HttpOnly/SameSite 合适策略。
- auth 页面须适配现有正式主题；classic/juju 不要求新视觉但不得阻断。
- 登录功能受 `INTERNAL_BETA_AUTH_ENABLED` 类 feature flag 控制；生产内测开启，旧 Demo 可回滚。

## 6. 实施顺序

### 阶段 1：服务端 Auth

- 邮箱规范化、挑战、OTP 请求/验证、受限 Session、邀请码兑换、profile 初始化和 logout。
- `sendVerificationOTP` 只调用 server-only 腾讯云 SES adapter，使用 6 位数字 token；配置 1800 秒过期、60 秒重发、最多 3 次错误尝试和 rotate 重发策略。
- 将 1800 秒标记为受控内测临时配置；通过环境变量区分环境，正式上线前改为 300–600 秒并重新执行 OTP 过期/重发 E2E。
- 在 60 秒窗口之外实现单邮箱/IP 日限额与全局 SES 发送预算；预算阈值必须可配置，达到预警阈值时告警，达到停止阈值后返回 `EMAIL_BUDGET_EXHAUSTED` 且不调用 SES。当前免费额度不得硬编码。
- 记录脱敏事件与 requestId。
- 停止点：API integration tests 通过。

### 阶段 2：页面门禁

- 添加邮箱、验证码、首次邀请码激活三段 UI；已有 active profile 登录后跳过邀请码段。
- 恢复 Session；无 Session 进入登录，有 Session 进入 consent/业务门禁。
- 停止点：三主题最小可用与错误状态通过。

### 阶段 3：admin bootstrap/invite API

- 文档化首个 admin bootstrap。
- 实现学校/邀请码受保护 API；不默认开放正文。
- 停止点：user/admin 负向测试通过。

## 7. 边界与失败场景

| # | 场景 | 期望行为 | 验证 |
| --- | --- | --- | --- |
| 1 | 邀请码无效/过期/用尽 | 不发送或不完成登录，稳定错误 | API |
| 2 | OTP 错误/过期 | 无 Session，可重试/重发 | E2E |
| 3 | 请求过频 | 429 + retry hint | rate test |
| 4 | OTP 成功但 DB profile 失败 | 不进业务页，允许重试初始化 | fault injection |
| 5 | 首次登录并发验证两次 | 只消费一次，单 profile | concurrency |
| 6 | user 伪造 admin/owner | 403/404 | negative test |
| 7 | logout 重复调用 | 幂等成功 | API |
| 8 | 邮件延迟/拒收 | 明确提示，不暴露内部错误 | real provider test |
| 9 | 单邮箱/IP 达到日限额 | 429 + retry hint，不调用 SES | rate test |
| 10 | 全局发送预算达到停止阈值 | 稳定错误 + 告警，不调用 SES | budget/fault test |

## 8. 依赖处理

| 依赖 | 状态 | 处理 | 退出条件 | 风险 |
| --- | --- | --- | --- | --- |
| Better Auth Email OTP | IB-01 ready | Real | staging OTP E2E | 版本/schema 变化 |
| 腾讯云 SES API | 域名/模板需审核 | Real | QQ、163、两所学校域名各 3 次 | 审核、垃圾箱、域名信誉 |
| Invite function | IB-01 | Real | 并发测试 | auth/DB 非同事务 |

## 9. 测试与验证

- API schema/rate/error tests。
- 真实邮箱 request → receive → verify → Cookie → protected API。
- 双用户、user/admin、重复登录、logout E2E。
- 三主题手机最小 UI 验证。
- typecheck/build/security/existing smoke。

## 10. 集成风险

Auth identity 与 profile 不能跨系统原子提交；以“没有 active profile 就不能进业务页 + 可重试初始化”恢复。邮件模板必须输出数字 token，不得错误落成 magic link。

## 11. 停止条件

需要改成 magic link、手机号、SSO、公开注册，或 provider 邮件能力无法满足真实 E2E 时停止并提 Change Request。

## 12. 完成输出

报告 Auth/SES 配置、页面/API、四类邮箱真实邮件证据、RLS/角色证据、失败路径、feature flag 和剩余邮件风险。
