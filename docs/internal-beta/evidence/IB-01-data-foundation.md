# IB-01 数据底座验收证据

> 日期：2026-07-24
> 范围：DATA-001–DATA-006、COMP-001

## 实现摘要

- Better Auth 1.6.25 + Email OTP plugin；邮箱密码登录显式关闭，OTP 为 6 位、1800 秒、最多 3 次尝试、重发旋转旧码、数据库只存 hash。
- Better Auth CLI 1.4.21 生成 4 张认证表的 SQL；生成文件进入版本控制。
- PostgreSQL 业务 schema 包含 9 张合同表、索引、约束、更新时间 trigger、邀请码原子消费函数和 FORCE RLS。
- 运行时、admin/migration 连接分离；用户身份只通过 transaction-local `app.user_id` 注入，连接池复用后不保留身份。
- 缺少或错误配置返回变量名级脱敏错误；新增 server secret 均不使用 `NEXT_PUBLIC_*`。

## 自动化证据

| Matrix | 命令/检查 | 结果 |
| --- | --- | --- |
| DATA-001 | 空 PostgreSQL 16 数据库执行 `npm run db:migrate`，随后重复执行 | 首次应用 2 个 migration；第二次 0 个，幂等通过 |
| DATA-001/002 | `npm run test:internal-beta:db` | 4 张 auth 表、9 张业务表；9/9 开启并强制 RLS |
| DATA-002 | 双用户读取/更新负向测试 + 空身份连接池复用 | A 只读到 A 的 1 行；更新 B 为 0 行；复用后为 0 行 |
| DATA-003 | `npm run test:internal-beta` mapper tests | snake_case → camelCase 和 schema_version 拒绝通过 |
| DATA-004 | 两个用户并发消费剩余 1 次的邀请码 | 仅 1 次成功；`used_count = 1` |
| DATA-005 | schema/config 静态测试 + `npm run security:check` | 无原始音频字段；OTP 配置为 hash；安全扫描通过 |
| DATA-006 | migration 逐文件事务、`07_operations_privacy_runbook.md` §9、既有 build | 失败回滚当前 migration；生产变更前备份，使用前向修复；旧 Demo 构建通过 |
| COMP-001 | config tests、`npm run typecheck`、`npm run build` | 缺配置错误不回显值；未配置内测 DB 时原 Demo 仍可构建 |

数据库测试输出摘要：

```json
{
  "ok": true,
  "authTables": 4,
  "businessTables": 9,
  "concurrentInviteSuccesses": 1,
  "rlsOwnerRows": 1,
  "leakedRowsAfterPoolReuse": 0
}
```

## 恢复与剩余风险

- migration 采用前向修复，不在本轮自动执行 destructive downgrade；生产执行前必须建立可恢复备份点。
- Better Auth CLI 与运行库版本号不同，生成 SQL 已通过真实空库验证；升级任一版本时必须重新生成、diff 并复跑空库。
- 腾讯云 staging 尚未配置，地域/VPC、连接上限和备份恢复演练须在 IB-02 真实邮件 E2E 前完成。
- `account.password` 是 Better Auth 核心 schema 的兼容字段，但应用配置已关闭 email/password，IB-02 不提供任何密码端点或 UI。
