# IB-07 本地批次 1–2：认证、权限与接口保护证据

> 日期：2026-07-26
> 范围：只完成本地可审计的安全与契约验收；未发送 OTP，未调用真实邮箱、监控或 LLM。

## 1. 实现

- migration `0011_write_rate_limits.sql`：新增 PostgreSQL 固定窗口写限流。
- 限流表只保存 HMAC scope、技术 route/method、时间桶和计数；runtime role 不能直接读取。
- Auth、feedback、event、admin 写接口在业务 handler 前统一校验：
  - JSON Content-Type；
  - 声明和实际流式 body size；
  - PostgreSQL-backed 多实例限流；
  - 安全依赖故障 fail-closed。
- profile 激活增加仅 development + 显式 fixture 开关可用的真实 PostgreSQL timeout fault；production 不接受该故障头。
- 客户端 bundle secret 检查将已配置敏感值只在内存中与 `.next/static` 比对，不输出值。

## 2. 认证与恢复

| Acceptance | Result | Evidence |
| --- | --- | --- |
| AUTH-002 | Pass | Route Handler + DB：invalid/expired/disabled 返回 400，exhausted 返回 409；profile=0，计数无额外推进。 |
| AUTH-003 | Pass | 真实 Better Auth verification fixture：3 次错误后 verification 被锁定/消费；随后正确 fixture OTP 仍不能登录，Session=0。 |
| AUTH-004 | Pass | Better Auth 3 次错误限制、rotate/60 秒配置、PostgreSQL email/IP/global 预算和通用 10/60 秒验证限流；第 11 次返回 429 + Retry-After。 |
| AUTH-005 | Pass | 首次激活 profile/invite 原子提交；失败 used_count=0；成功重试 profile=1/used=1；已有 profile 使用第二邀请码时第二码 used=0。 |
| AUTH-007 | Pass | 既有浏览器普通 user `/admin` 404；production API `/api/admin/metrics` 403。 |
| AUTH-008 | Pass | 已有 Auth identity/Cookie 下真实 PostgreSQL timeout：`PROFILE_INIT_FAILED`、profile=0、invite used=0、Session 仍 `needsInvite=true`；关闭故障后重试成功。 |

所有 OTP 均为明确的本地 fixture；没有请求邮件发送接口，没有产生真实 OTP。

## 3. 权限与接口安全

| Acceptance | Result | Evidence |
| --- | --- | --- |
| SEC-001 | Pass | 源码/文档 security scan + production `.next/static` 58 文件实际配置值比对；敏感值命中 0。 |
| SEC-002 | Pass | PostgreSQL 双 user/双 school：admin 自助提权 rowCount=0、跨用户 Session=0、跨学校=0；production API 跨用户 404、伪造 owner 落库仍来自 Cookie Session。 |
| SEC-003 | Pass | 统一 guard static coverage；production HTTP 非 JSON/超大 body 为 400，10 次后 429；DB 原子并发计数及 route 隔离通过。 |
| SEC-004 | Pass | role 修改仅存在于使用 `DATABASE_ADMIN_URL` 的 server bootstrap；普通应用 route/repository 无 `role=admin` 写入口，bootstrap 事务写 admin audit。 |

`x-forwarded-for` 的可信覆盖仍需在 staging 反向代理配置中复核；这不改变本地 HMAC/数据库限流实现结论。

## 4. 契约

| Acceptance | Result | Evidence |
| --- | --- | --- |
| COMP-002 | Pass | CommonResponse/requestId、三种 style enum、questionId `q1/q2/q3`、单题重生成和 SSE 事件 contract smoke 通过。 |

故障 contract smoke 只在 development 执行，因为 production 正确忽略 `x-facewall-fault`。没有为测试方便扩大 production 故障注入边界。

## 5. 命令与结果

| Command | Result |
| --- | --- |
| `npm run db:migrate` | Pass；应用 `0011_write_rate_limits.sql` |
| `npm run test:internal-beta` | Pass；本批安全基线 56/56；相邻兼容批次后 57/57 |
| `npm run test:internal-beta:db` | Pass；6 auth tables、9 business tables |
| `npm run test:internal-beta:security-db` | Pass |
| `npm run test:internal-beta:auth-invite-negative` | Pass |
| `npm run test:internal-beta:auth-recovery` | Pass |
| privacy/feedback/admin PostgreSQL integration | Pass |
| production `smoke:security` | Pass |
| development `smoke:contract` | Pass |
| `npm run security:bundle` | Pass；58 client bundle files |
| typecheck/build/security/diff | Pass；production build 33 routes，source/docs scan 180 files |

## 6. 明确保留

- AUTH-001：真实 QQ、163、两所学校邮箱各 3 次矩阵，Pending。
- AUTH-006：本地 logout/受保护 API 可验证；真实 HTTPS Secure Cookie 仍需 staging，保持 Pending。
- COMP-003/004：已在后续本地浏览器兼容批次关闭，见 `IB-07-local-compatibility.md`；本安全批次本身没有提前升级。
- SEC-006：实际回滚 drill 尚未执行，保持 Pending。
- OBS、SESSION-008 和 PILOT 外部门禁保持原状态。

## 7. 长等待事故

- 失败做法：PowerShell `Get-NetTCPConnection` 用于循环端口探测。
- 实际影响：30 次轮询在当前受控环境耗时约 2557 秒。
- 根因：单次 WMI/网络表查询可能阻塞 80–90 秒，并曾错误报告已启动的 3000 端口为空闲。
- 修正：禁止本项目后续自动化使用 `Get-NetTCPConnection` 轮询；改用唯一日志文件中的 `Ready in`、直接跟踪 Node PID，并用快速 `netstat` 做最终只读复核。
- 遗留 Next PID 已按 `netstat` 精确识别并关闭；3107/3108 runner 均在 `finally` 清理。

## 8. 后续兼容批次补充

- classic 实际完成 Azure 有声、Web Speech fallback、STT 失败保留/手动编辑、报告和 Clipboard fallback。
- figma、juju 在无麦克风设备上实际完成文字兜底三题、报告和复制；juju 配色与遮挡人工复核通过。
- 自动化新增无 speech input 时三主题文字回答守卫，最终 57/57；typecheck 与 production build（33 routes）通过。
- COMP-003、COMP-004 据此升 Pass；真实 Azure STT 录音仍保留到 HTTPS staging 有麦克风设备复验，不伪造为本地证据。
