# Post-IB-07 Staging Drill / Pre-G0 交接快照 — 2026-07-28

> 本文件是 2026-07-28 最新续接入口。状态仍以 `docs/todo.md`、`docs/internal-beta/05_acceptance_matrix.md` 和对应 evidence 为准；不得自动升级 Partial/Pending。

## 已完成

- staging PostgreSQL 16.14 仅监听 localhost，migration `0001`–`0011`，五组 DB integration、57/57 internal-beta、typecheck、production build、source/bundle security 均通过。
- 本机 systemd 每日 PostgreSQL dump + SHA-256、本机 14 天保留；私有 COS 90 天异地备份、CRC/SHA 校验、独立恢复 drill 通过。
- PM2 日志使用系统 logrotate：daily、rotate 14、maxsize 10 MiB、delaycompress、copytruncate、`ubuntu:ubuntu`/`640`；强制轮转后 PM2 未中断。
- 腾讯云 Lighthouse CPU/内存/磁盘正式告警启用；临时策略真实触发邮件/微信。恢复通知未收到，未标 Pass。
- 明确不购买 CLS、不安装 LogListener。应用保持经过 scrubber 的 vendor-neutral JSON/requestId 本地日志，未来可接 Loki、OpenTelemetry、Sentry 或其他平台。
- 候选新增 `GET /api/health`：runtime PostgreSQL 正常为 200，失败为 503；no-store，不返回配置、原始异常或业务正文，不持久化高频 health metric。
- 候选包 `passbuddy-staging-candidate-health-20260728-003535.tar.gz` SHA-256：
  `e5ccaacd8de1f6cab01ac76044842c2d384384b19450c33d758b3a2a12531c9f`。
- release `/home/ubuntu/releases/passbuddy-20260728-003535` 构建通过；隔离 3001 smoke 为 health 200、root 200、anonymous session 401、production fixture 404。
- SEC-006 Pass：Nginx 3 处 upstream 临时从 3000 切至 3001；候选 HTTPS health/root/auth/fixture/security headers 通过；EXIT trap 恢复 3000，回滚 root=200、旧版 health=404。
- Post-SEC-006 候选 `/home/ubuntu/releases/passbuddy-20260728-112135` 已完成远端 `npm ci`、migration 幂等、60/60 internal-beta、typecheck、production build、source/bundle security。
- vendor-neutral readiness 已安装为 systemd oneshot/timer，覆盖 HTTPS/local health、PM2、PostgreSQL、备份 timer/service/freshness/checksum；timer enabled/active，首次 9 条本机 JSON 记录全部 Pass。它不是外部监控证据。
- 公网 staging 已正式切到候选 3001；health/root、匿名 session 401、production fixture 404 和安全头 Pass。旧 3000 与 Nginx 回滚配置保留。
- 真实 LLM 仅执行一次非敏感 fixture 调用且禁用重试：provider/model、17171 ms latency、attempts=1、provider usage 772/1079 和匹配 requestId 均取得；无业务/prompt 正文，SESSION-008 升 Pass。
- 浙大域名单次 SES template probe 被 provider 接受并由用户确认同分钟进入收件箱；这只证明单域名单样本可达，不是完整 OTP 登录或 AUTH-001。

## 当前服务状态

- Nginx 三处 upstream 当前指向 `127.0.0.1:3001` 的 `facewall-candidate`，这是公网 staging 候选，不是 10–20/100 人灰度。
- `facewall-candidate` 3001 与上一稳定版 `facewall` 3000 均 online；回滚配置为 `/etc/nginx/conf.d/facewall.conf.pre-ib07-20260728-120806`。
- `passbuddy-local-readiness.timer` enabled/active；PostgreSQL 仍仅监听 localhost，migration `0011`；本机+COS backup timer 保持 enabled/active。
- 远端 release、归档、Nginx 备份和数据库备份保留，不删除。候选现在承担 staging 流量，不能按“临时进程”直接清理。
- 本地工作树包含 IB-02 至本轮全部修改；未 reset、checkout、stash、clean、stage、commit 或 push。

## Acceptance 现状

- Matrix 共 64 行：52 Pass、5 Partial、7 Pending。剔除只能由真实灰度产生证据的 PILOT-001–005，预上线项为 52/59 Pass。
- 本轮新关闭：SEC-006、SESSION-008。
- AUTH-006 仍 Pending：缺真实登录后的 Secure Cookie、退出及受保护 API 401 浏览器矩阵。
- SESSION-003 仍 Partial：刷新和 Node 重启恢复通过；真实 OTP 退出重登未完成。
- OBS-001–004 仍 Partial：主机指标与邮件/微信触发已有真实证据；仍缺应用异常远端聚合、requestId 远端关联、数据库/备份失败外部告警。CLS 本轮不采用。
- AUTH-001 Pending：浙大域名单次 template probe 已到达；仍缺 QQ、163、两所学校域名各 3 次应用 OTP 送达/登录矩阵。任何 OTP 每次发送前必须单独获得明确确认。
- 一次经授权的 AUTH-006 浏览器“发送验证码”点击在等待响应时控制通道超时，服务端结果未审计、页面未确认进入 OTP；没有重试，用户选择停止该路径。该不确定尝试不计任何 Acceptance 证据。
- 最终隐私/服务协议及 policyVersion 未冻结；腾讯云接入备案关系、HTTP webblock 和证书自动续期未闭环。
- 当前候选来自 SHA-256 验证归档，但本地全量改动尚未形成确定 commit；正式 release freeze 仍未完成。
- release freeze 审计已完成：排除 657 个本地浏览器/日志运行产物后，候选 manifest 为 198 个路径；60/60、typecheck、build、source/bundle security 和 diff check Pass。对应证据为 `evidence/IB-07-release-freeze-2026-07-28.md`。
- 真实灰度仍未启动。

## 达到既定上线目标的顺序

1. 先做 release freeze：复查当前大工作树、确认 release scope，获得用户授权后再 stage/commit；从确定 commit 重建候选并记录版本。未授权前不得 stage/commit/push。
2. 产品 owner 冻结隐私/服务协议正文与 policyVersion；确认邀请码学校、额度、过期时间、负责人和暂停方式。
3. 关闭真实 Auth 门禁：AUTH-006 Secure Cookie/logout/401、SESSION-003 真实退出重登，以及 AUTH-001 邮箱矩阵。每次 OTP 继续逐次请求明确确认，用户自行输入 OTP。
4. 接入轻量外部应用监控/告警，取得前端异常、服务端异常、requestId 关联、登录/关键 API/DB/备份失败通知证据；本机 JSON/readiness 只能作为信号源。
5. 关闭腾讯云接入关系、HTTP webblock、证书自动续期；复核 PM2 开机恢复和 candidate→正式进程命名/端口收敛。
6. 用两个真实 user + 一个 admin 做 staging G0 整体 E2E/故障/删除/回滚矩阵并观察一个完整工作日；此前已过的局部证据可复用，但不能替代整体验收。
7. 所有预上线 P0 关闭后才把 PILOT-001 升 Pass并启动 G1 10–20 人；运行 2–3 天并按阈值形成 Go/No-Go。G2 50 人和 G3 100 人必须顺序取得真实数据，不能提前标 Pass。
8. 在上述既定上线目标达成前只处理门禁缺陷，不插入新的 P1/P2 优化需求。

## 约束与停止条件

- 禁止输出 env、DSN、token、Cookie、Authorization、OTP、密钥或真实邀请码。
- 不修改或删除真实用户数据；测试只使用明确 fixture。
- 不用 mock、本地 adapter 或自动签名 Cookie 冒充真实外部平台、OTP 或浏览器登录验收。
- `next dev`、build、typecheck 和其他 `.next` 使用顺序执行。
- 所有 curl/安装/轮询设置短超时；禁止长时间无反馈等待。
- 没有应用级外部告警、真实邮箱矩阵及 AUTH-006 前，不宣布可以向 100 人放量。
