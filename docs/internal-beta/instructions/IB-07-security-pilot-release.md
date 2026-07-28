# Development Instruction: IB-07 · 安全、灰度发布与最终验收

## 0. 元信息

- 任务类型：Integration Recovery / Release
- 风险等级：L1
- 基线：IB-01 至 IB-06 全部完成 commit
- 权威契约：全部 `internal-beta` 文档；`08_pilot_release_and_acceptance.md`
- 验收：SEC-001–SEC-006、PILOT-001–PILOT-005、全部未关闭 P0

## 1. 本次目标

完成系统级权限、隐私、兼容、回滚和容量验收，在可观测、可暂停、可恢复条件下从内部 fixture 进入 10–20 人真实灰度。

## 2. 非目标

- 不在验收阶段顺手增加 P1/P2。
- 不以“测试环境通过”替代真实邮箱、真实 DB、真实监控和真实部署验证。
- 不绕过失败门禁强行开放到 50/100 人。

## 3. 开工前只读侦察

冻结候选 commit 和环境清单；检查 `git status`、migrations、feature flags、密钥、域名/HTTPS、邮件模板、监控告警、管理员、Runbook 和所有 Matrix 证据。

## 4. 验收标准

完整引用 SEC-001–SEC-006、PILOT-001–PILOT-005，并复查所有 P0 Pending/Fail 项。任何 Must Fail 阻断发布。

## 5. 硬约束

- 只从确定 commit 构建；不得部署工作区漂移状态。
- secret 不进 bundle/log/docs；admin key 只在 server。
- 使用至少两个 user、一个 admin 做 IDOR/role 测试。
- 真实邮箱 OTP、真实 LLM/DB、监控告警和删除演练均需证据。
- 发布前备份数据库并记录 migration 版本。
- 回滚应用版本不得回滚数据库到不兼容 schema；优先 additive/forward fix。
- 灰度通过邀请码开关/上限控制，可立即暂停新用户。

## 6. 实施顺序

### 阶段 1：系统回归与安全

- 全量命令、IDOR、role、body/rate、secret、privacy。
- 停止点：无 P0 Fail。

### 阶段 2：staging release drill

- migrations、真实 OTP、完整会话、反馈、dashboard、alert、delete、rollback。
- 停止点：Runbook 可由非开发按步骤执行。

### 阶段 3：10–20 人灰度

- 分发受限邀请码，每日检查指标和告警。
- 输出试点报告和 Go/No-Go。

## 7. 边界与失败场景

| # | 场景 | 期望行为 | 验证 |
| --- | --- | --- | --- |
| 1 | secret 扫描命中 | 阻断发布、轮换 | scan/drill |
| 2 | user A 访问 B | 无数据/403/404 | IDOR |
| 3 | DB migration 后应用回滚 | 旧版受控运行或明确不可回滚并 forward fix | drill |
| 4 | OTP/DB/LLM 故障 | 告警、用户提示、数据不串不假完成 | fault |
| 5 | 严重错误出现 | 暂停邀请码、回滚/修复 | incident drill |
| 6 | 删除失败 | 标记 failed、可重试、用户可获状态 | drill |
| 7 | 10–20 人指标不达标 | No-Go，不扩到 50 | decision record |

## 8. 依赖处理

所有外部依赖必须 Real。若真实依赖不可用，只能判定 Deferred/Blocked，不能用 mock 代替发布验收。

## 9. 测试与验证

1. typecheck/build/security。
2. existing contract/file/voice smoke。
3. internal-beta/auth/persistence smoke。
4. 双用户/admin security suite。
5. staging full E2E 与真实邮箱。
6. fault/alert/delete/rollback drills。
7. 10–20 人真实 pilot metrics。

## 10. 集成风险

重点复查 Better Auth Cookie、RLS、DB/Auth/SES secret、状态/事件双计数、Demo fallback 标识、三主题路由、SSE 反代、HTTPS 麦克风、QQ/163/学校邮箱送达和数据库迁移。

## 11. 停止条件

任何数据串用户、严重 secret 泄露、无法暂停邀请、核心数据丢失、告警不可用、真实 OTP 不稳定、Matrix Must Fail 都立即停止放量。

## 12. 完成输出

生成 Alpha/Beta-Lite Acceptance Record：每条 Matrix 的 Pass/Fail/Deferred、证据链接、部署 commit、migration、指标、事故、风险、Go/No-Go 和下一档条件。
