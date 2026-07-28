# IB-02 首位管理员 Bootstrap

> 该流程只在受控终端使用；不要把数据库连接、Auth secret 或一次性邀请码粘贴到聊天、文档、日志系统。

## 1. 准备首个身份与一次性邀请码

在项目本地终端执行（脚本自动加载 `.env.local`，但不会输出其中的配置）：

```powershell
npm run admin:bootstrap -- prepare admin@example.com pilot-school "Pilot School"
```

终端只显示一次 bootstrap 邀请码。先使用该邮箱完成 OTP 注册/登录，再在“开通内测体验”步骤输入邀请码。

## 2. 提升已初始化 Profile

```powershell
npm run admin:bootstrap -- promote admin@example.com
```

退出并重新登录后，该账号可调用 `/api/admin/schools` 和 `/api/admin/invite-codes`。后续邀请码通过管理 API 创建；创建响应中的 `inviteCode` 也只保存一次，数据库只保留 HMAC。

## 3. 安全检查

- bootstrap 邀请码 24 小时过期且最多使用一次。
- promote 只更新已经完成 OTP 和邀请码绑定的 active profile。
- 管理 API 每次从 HttpOnly Session 和数据库 profile 重新确认 `role=admin`。
- 完成后检查并停用未消费的 bootstrap 邀请码。
