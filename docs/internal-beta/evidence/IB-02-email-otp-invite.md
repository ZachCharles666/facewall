# IB-02 邮箱 OTP、Session 与邀请码实施证据

> 日期：2026-07-25
> 状态：IB-02 实现完成；真实 OTP 四类邮箱送达矩阵仍作为放量门禁保留

## 1. 已实现

- 项目 Auth API：`request-otp`、`verify-otp`、`redeem-invite`、`session`、`logout`。
- 仅邮箱 6 位数字 OTP；内测有效期 1800 秒，可通过 `AUTH_OTP_EXPIRES_IN_SEC` 调整，范围限制为 300–1800 秒。
- 最多 3 次尝试、60 秒重发、rotate 后旧码失效、数据库仅保存 hash。
- 邮箱 OTP 独立注册/登录；没有 active profile 的受限 Session 单独提交 HMAC 邀请码，原子消费并创建 profile；既有 profile 登录不再要求或消费邀请码。
- challenge 使用 AES-256-GCM，只绑定规范化邮箱、随机 nonce 和到期时间；拒绝非规范编码、篡改、跨邮箱和过期挑战。
- 单邮箱/IP/全局 UTC 日桶由 PostgreSQL 原子预留；只保存 HMAC，不保存邮箱/IP 明文。达到停止阈值后不调用 SES。
- Better Auth 原生 OTP 写端点公开返回 404，避免绕过预算；项目服务端内部调用真实 Email OTP handler。
- Session 使用 Better Auth HttpOnly Cookie；生产启用 Secure Cookie；无 active profile 不得通过项目 Session 门禁。
- 三主题共用“邮箱 → 验证码 → 首次邀请码激活”UI；已有 active profile 跳过邀请码；功能开关生产默认关闭。
- 邀请码可激活人数与单账号会话额度分离；激活时默认快照 3 次完整面试名额到 profile。
- admin 学校/邀请码 API 每次校验 Cookie Session 和数据库 `role=admin`；邀请码明文仅创建响应展示一次。
- 首位 admin 提供两阶段受控 bootstrap：准备一次性邀请 → 真实 OTP 登录 → promote active profile。

## 2. 自动化证据

| Check | Result | Evidence |
| --- | --- | --- |
| Unit/static | Pass | 22/22；challenge、HMAC、配置边界、三段式 Auth、原生端点封闭、admin 门禁、SES adapter |
| PostgreSQL integration | Pass | 5 张 auth 表、9 张业务表；valid/invalid/expired/exhausted；并发只消费一次；额度快照 3/已用 0；RLS 与连接池隔离 |
| OTP budget | Pass | `allowed_warn`、`email_limited`、`budget_exhausted`；运行时角色只能调用受控函数 |
| Runtime anonymous paths | Pass | 首页 200 且显示邮箱注册/登录；Session 401；未验证 redeem 401；原生 OTP 写端点 404；无效 challenge 400；logout 200 |
| Theme SSR | Pass | figma/juju/classic 均返回 200，输出各自 auth shell 和 Session checking 状态 |
| Typecheck | Pass | `tsc --noEmit` |
| Production build | Pass | Next.js 生产构建包含 5 个项目 Auth API 和 2 个 admin API |
| Real SES adapter probe | Pass | 腾讯云接受，用户确认测试邮箱收到；见 `IB-02-ses-probe.md` |

## 3. 完成边界与尚未执行的发布门禁

- 已有真实腾讯云 SES 接受与至少一个测试邮箱收件确认；QQ、163、两所学校邮箱各 3 次矩阵仍未执行，不宣称通过该外部送达矩阵。
- AUTH-002–005、AUTH-007/008 已于 2026-07-26 通过 Route Handler、production HTTP 和真实 PostgreSQL fixture 对账关闭，见 `IB-07-local-security-contract.md`。
- AUTH-006：退出/401 本地路径已有覆盖；真实 HTTPS 下 Secure Cookie 属性仍需 staging，保持 Pending。
- 浏览器插件无法持续连接由命令启动的本机开发进程，因此本轮只完成三主题 SSR；390×844 的真实可视化复核待人工浏览器执行。

## 4. 2026-07-25 收尾复验

- `npm run test:internal-beta`：24/24 Pass。
- `npm run test:internal-beta:db`：Pass；额度快照为 3/0，RLS owner 行与连接池复用隔离通过。
- `npm run typecheck`：Pass。
- `npm run build`：Pass，Auth/Admin 路由均进入 production build。
- 开发预热复核：仅非 production、一次性对 4 个主流程路由发送 `OPTIONS`，不调用业务 POST、LLM 或 SES。
- 浏览器刷新/重登体感：本轮未重新发送 OTP。build 与旧 `next dev` 进程共用 `.next` 后本地进程出现 chunk 缓存失效，重启后的浏览器继续访问又被浏览器安全策略阻止，因此该项不记 Pass；已有代码与自动化证明 active profile 的 Session 响应为 `needsInvite=false`，但仍保留人工 Cookie E2E。

## 5. 下一次真实 E2E

1. 按 `IB-02-admin-bootstrap.md` 使用位置参数命令创建一次性 bootstrap 邀请；不要使用会被 npm 11 当作配置的 `--email` 形式。
2. 本地运行 `npm run dev`，先输入邮箱并完成 OTP。
3. 记录 SES 接受、实际收件时延、垃圾箱、发件人显示；验证码不要写入聊天或日志。
4. 首次账号在受限 Session 中输入邀请码，确认获得 3 次额度并进入主应用；刷新仍登录，退出后 Session API 返回 401。
5. 在 HTTPS staging 复核 Secure Cookie、退出后 401，并完成真实 OTP 退出重登。
6. 完成 QQ、163 和两所学校域名样本后仅根据真实送达证据关闭 AUTH-001。

## 6. 首次真实 OTP 故障修正

- 现象：旧版合并式邮箱/邀请请求返回 `EMAIL_DELIVERY_FAILED`，邮箱未收到验证码。
- 根因：本地 runtime PostgreSQL 连接仍使用默认 `"$user", public` search path，Better Auth 无法访问 `auth.verification`，因此在调用 SES 前失败。
- 修正：`getRuntimePool()` 固定连接选项 `-c search_path=auth,public`；业务 SQL 继续使用显式 schema。
- 数据影响：故障请求未写入 verification、未发送邮件；OTP 预算按 fail-closed 设计保留一次发送尝试计数。

## 7. OTP 浏览器格式校验修正

- 现象：输入正确 6 位数字时，浏览器原生提示“请与所请求的格式一致”，提交未进入 API。
- 根因：JSX `pattern` 使用了存在双重转义歧义的 `\d{6}` 表达。
- 修正：使用无转义歧义的 `[0-9]{6}`，并同时设置 `minLength=6`、`maxLength=6`。
- 数据影响：浏览器在请求发出前拦截，未消耗 OTP 错误尝试次数；未重发时原验证码在 30 分钟有效期内可继续使用。

## 8. IB-07 本地认证安全收敛 · 2026-07-26

- invalid/expired/disabled/exhausted 邀请码 Route Handler + DB 对账通过，无 profile/计数副作用。
- Better Auth verification 使用明确 fixture 验证 3 次错误上限；锁定后正确 fixture 码也不建立 Session。
- profile 初始化真实 PostgreSQL timeout 后仍为受限 Session；邀请码未消费，关闭故障后可重试成功。
- 普通 user admin 页面 404/API 403；跨用户/跨学校与自助提权均被阻断。
- 未调用 `request-otp` 邮件发送路径，未发送任何真实 OTP。
