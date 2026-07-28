# Post-IB-06 / IB-07 Readiness 交接快照 — 2026-07-26

> 这是最新续接快照。状态以 `docs/todo.md`、各 evidence 与 Acceptance Matrix 为准；不得用本文件把 Partial/Pending 自动升级为 Pass。

## 当前可信状态

- 工作树包含 IB-02 至 IB-06 及本轮修改，全部保留；未 reset、checkout、stash、clean、stage、commit 或 push。
- migration 已应用到 `0011`，本地 PostgreSQL integration 通过。
- internal-beta 自动化基线：57/57 Pass。
- 本轮关闭：SESSION-004、FEED-001、FEED-004、ADMIN-001、COMP-003、COMP-004。
- SESSION-003：刷新恢复和 Node 重启恢复 Pass；真实 OTP 退出重登未做，整体仍为 Partial。
- SESSION-008：真实测量传播代码和 DB 隐私对账完成；staging 服务器存在 LLM 配置名称但尚未受控调用，整体仍为 Partial。
- OBS-001–004：没有真实监控 provider，保持 Partial。
- 390×844 figma/juju/classic 同意与隐私页面本地人工矩阵 Pass；法务正文未冻结。
- IB-07 决策（2026-07-27）：数据库/备份/候选基础允许继续 staging drill；10–20 人真实灰度仍 NO-GO。
- IB-07 本地批次 1–2 已关闭 AUTH-002–005、AUTH-007/008、COMP-002、SEC-001–004；证据见 `IB-07-local-security-contract.md`。
- 后续本地兼容批次关闭 COMP-003/004；证据见 `IB-07-local-compatibility.md`。

## 本轮功能与证据

- dev-only 浏览器 fixture 和真实 PostgreSQL fault injection 均要求非 production 且显式开关。
- DB 写失败时保留客户端 Draft，权威 Session/事件不推进。
- 三主题反馈提交、失败、跳过与复制均完成浏览器和 DB 对账。
- admin 支持批量生成邀请码；默认每码可用 1 次，仍可手动调整；一次性明文逐条展示，列表自动刷新。
- 普通用户 admin API 403、页面 404。
- LLM 记录 provider、model、真实 latency、attempts、provider usage 和 requestId；不可获得的 usage 保存 null，fallback 不伪造 token usage。
- classic 完成 Azure/Web Speech、STT 失败保留/编辑、报告和 Clipboard fallback；figma/juju 新增无麦克风文字回答兜底，并分别完成 3 题、报告和复制。
- 脱敏浏览器汇总：`docs/internal-beta/evidence/artifacts/post-ib06/browser-matrix-summary.json`。

## 外部门禁

- 真实邮箱四类送达/登录矩阵。
- 真实监控项目与告警渠道。
- staging PostgreSQL、本机与 COS 异地备份恢复、systemd 每日自动上传和 90 天生命周期已完成；上传失败外部告警仍待监控渠道。
- HTTPS、域名、Secure Cookie 和浏览器能力验证。
- 应用版本回滚演练。
- 隐私/服务协议最终正文及 policyVersion。
- 如需关闭 SESSION-008：可返回真实 usage 的 LLM provider。

## 下一 session 直接执行顺序

1. 先读 `AGENTS.md`、`docs/todo.md`、Acceptance Matrix、本快照和 IB-07 readiness。
2. `git status --short`；只读核对 diff、migration 和端口，保留所有现有修改。
3. 在用户明确许可发送 OTP 后，完成 SESSION-003 退出重登和 AUTH 邮箱矩阵；否则保持 Partial/Pending。
4. staging PostgreSQL、本机/COS 恢复和自动备份已就绪；继续“monitor → OTP → app rollback → compatibility/security”。
5. 只依据真实远端证据更新 Matrix；不得以本地 adapter 或 fixture Cookie 冒充外部验收。
6. 服务轮询禁止使用 `Get-NetTCPConnection`；使用日志就绪信号、直接 PID 和 `netstat`，避免已记录的长阻塞。
7. 不要用带重定向输出的 `Start-Process` 启动长驻 Next；当前工具层会持续追踪子进程。需要人工浏览器验收时，让用户在前台终端临时设置 fixture 开关并运行 `npm run dev`。
8. 当前浏览器自动控制通道访问 localhost fixture 会被拦截，且外部统计请求在受限网络可造成分钟级超时；本项目 localhost fixture 优先使用明确人工短矩阵，不要重复自动浏览器探测。

## 服务状态

远端旧 `facewall` 仍在 `127.0.0.1:3000` online；临时候选已删除且 3001 已释放。远端主机实际为上海 Lighthouse（`lhins-*`），PostgreSQL 16.14 原生服务仅监听 `127.0.0.1:5432`。本地 Next 已停止。任何新启动的候选进程必须记录并在阶段结束时关闭。

## 2026-07-27 Staging Foundation Addendum

- 证据：`docs/internal-beta/evidence/IB-07-staging-foundation-2026-07-27.md`。
- staging DB 已到 `0011`，主库 fixture 清理后 users/schools/sessions/events/OTP counters 均为 0。
- clean baseline dump SHA-256：`800f75f290a1f397dfe77f4f209452847d051047d1fb83ef538ba94f346d36e0`。
- 真实恢复到独立临时库通过，临时库已删除。
- `passbuddy-db-backup.timer` 已启用；首次 oneshot `status=0/SUCCESS`，dump SHA 校验 OK，本机保留 14 天。
- 私有上海 COS 已接通：SSE-COS、目标前缀最小权限、90 天生命周期；首次上传本地/远端 CRC64 一致，从 COS 下载后 SHA-256 `OK`，恢复库核对 11/6/12；临时库和下载目录最终确认 `ABSENT`/removed。
- 自动任务已升级为本机+COS：`.dump`/`.sha256` 上传和远端检查均成功，最终 `status=0/SUCCESS`、`cos=verified`；COSCLI 凭证配置为 `postgres:postgres`/`600`，未进入应用 env 或日志。
- 腾讯云主机监控已接邮件+微信；CPU/内存/磁盘正式策略启用，临时策略真实触发通知通过。恢复通知未收到，未伪造为 Pass。
- 约 100 人受控内测不购买 CLS、不安装 LogListener；保留经过 scrubber 的 vendor-neutral JSON/requestId 本地日志，后续可迁移到 Loki/OpenTelemetry/Sentry 等平台。
- 候选新增 `GET /api/health` PostgreSQL readiness（200/503、no-store、无敏感错误）；typecheck 与 security check（183 files）Pass。远端部署、轮转和失败通知仍待执行，OBS-001–004 保持 Partial。
- Lighthouse PM2 日志已完成系统 logrotate：daily/14 份/10 MiB/延迟压缩/copytruncate/640；强制轮转后 PM2 pong、旧 facewall 继续 online，日志内容保留在 `.log.1`。健康端点尚未部署到公网旧版本。
- SEC-006 已关闭：候选实际从 3000 切至 3001，经 HTTPS health/root/auth/fixture/security headers 验证后自动恢复 3000；回滚 root=200、旧版 health=404。AUTH-006 仍缺真实登录 Secure Cookie/退出矩阵，保持 Pending。
- staging 候选 57/57、五组 DB integration、typecheck、security、build、bundle secret scan 和 3001 smoke Pass。
- AUTH-001、AUTH-006、SESSION-003/008、OBS-001–004、SEC-006 状态未自动升级。
