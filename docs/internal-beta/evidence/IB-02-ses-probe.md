# IB-02 阶段 1A · 腾讯云 SES 探针证据

> 状态：Provider Accepted + Mailbox Received；显示细节确认 Pending
> 日期：2026-07-24

## 1. 本阶段范围

- 使用腾讯云官方 Node.js SDK 实现 server-only SES adapter。
- 校验 SecretId、SecretKey、Region、发件地址和 Template ID，但不输出配置值。
- 构建 `SendEmail` 模板请求：主题为“PassBuddy 登录验证码”，变量仅含 `code`，`TriggerType=1`。
- 增加默认不发信的 CLI 探针；只有显式传入 `--send` 才消耗一封邮件。
- 统一失败语义为 `EMAIL_DELIVERY_FAILED`，不把 SDK 原始错误或验证码写入日志。

## 2. 本地证据

| Check | Result | Evidence |
| --- | --- | --- |
| 五项 SES 配置存在 | Pass | 只输出 configured/missing 状态，未输出值 |
| Config validation | Pass | Region、发件地址、正整数 Template ID、必填密钥 |
| Request contract | Pass | 6 位数字、邮箱规范化、模板变量 `code`、触发类邮件 |
| Failure mapping | Pass | SDK 错误映射为稳定错误，不携带 provider message |
| Dry probe | Pass | `SES_PROBE_CONFIG_OK`，未调用 SES |
| First real SendEmail | Recovered | 初次返回 `AuthFailure.UnauthorizedOperation`；修正 CAM 关联权限后恢复 |
| Retried SendEmail | Pass | 腾讯云返回 RequestId `aa346bbd-f993-4cbc-ba91-60d144b0230a` 和 MessageId `qcloudses-30-1300871727-date-20260724150624-6FS7F9DZ49yo1` |
| Mailbox receipt | Pass | 用户确认测试邮箱已收到邮件 |
| Internal beta tests | Pass | 11/11 |
| Typecheck | Pass | `tsc --noEmit` |
| Production build | Pass | Next.js 15.5.19，15 个页面/路由完成构建 |
| Security scan | Pass | 94 个 source/docs/scripts/example 文件；`.env.local` 按设计排除 |
| Diff check | Pass | 无格式错误；仅提示工作区既有 LF/CRLF 转换 |

## 3. 未完成门禁

- 本地测试收件邮箱已配置但不进入日志；腾讯云已接受真实 `SendEmail`。
- 尚待用户确认真实收件时延、垃圾箱位置、发件人显示及模板变量是否替换为 6 位数字。
- QQ、163、两所学校域名各 3 次真实收件仍属于 IB-02/G0 必做项。
- Better Auth sign-in `sendVerificationOTP` 已接入 adapter；非 sign-in OTP 类型继续 fail-closed。完整随机 OTP 登录证据见后续 `IB-02-email-otp-invite.md`。

## 4. 本机真实探针

仅在 `.env.local` 本地填写测试收件地址：

```dotenv
TENCENT_SES_TEST_EMAIL=your-test-mailbox@example.com
```

先执行无发信检查：

```text
npm run ses:probe
```

确认后显式消耗一封额度：

```text
npm run ses:probe:send
```

不得把测试邮箱、验证码、SecretId 或 SecretKey写入证据文档和普通日志。
