# Development Instruction: IB-06 · 运营看板、日志与告警

## 0. 元信息

- 任务类型：Feature / Optimization
- 风险等级：L2
- 基线：IB-03、IB-05 完成 commit
- 权威契约：Contract §11；API Contract §6–§9；Runbook
- 验收：OBS-001–OBS-006、ADMIN-001–ADMIN-005

## 1. 本次目标

admin 可在受保护页面查看内测核心聚合指标、学校/邀请码状态和删除请求；前后端异常、关键 API 失败与耗时进入脱敏监控并触发基础告警。

## 2. 非目标

- 不建数据仓库、实时大屏、复杂 cohort 或正式 APM。
- 不让管理员默认浏览简历/JD/答案/报告全文。
- 监控平台不作为完成率 source of truth。

## 3. 开工前只读侦察

核对 admin role、业务/事件表、现有 API try/catch、Next.js instrumentation/error boundaries、部署形态和可用告警渠道。确认监控工具账号/项目已创建。

## 4. 验收标准

完整引用 OBS-001–OBS-006、ADMIN-001–ADMIN-005。

## 5. 硬约束

- 使用 Sentry 或等价托管错误监控；DSN/发布凭据按 server/client 暴露规则配置。
- beforeSend/scrubber 删除敏感正文、Cookie、Authorization 和 query secret。
- 所有 admin 页面/API 服务端校验 role。
- 指标严格按 API Contract §8；聚合查询不可读取不必要正文。
- requestId 贯穿 response、structured log、monitor tag。
- 告警至少覆盖登录不可用、关键 API 高失败率、DB 错误和严重前端异常。

## 6. 实施顺序

### 阶段 1：instrumentation

- server/client/edge（如实际使用）配置。
- error boundaries、Route Handler capture、scrubber。

### 阶段 2：admin API/page

- metrics、schools/invites、deletion queue 最小页面。
- 日期/学校筛选；空/加载/失败态。

### 阶段 3：alerts/reconciliation

- 配置告警与测试事件。
- 看板和 SQL 抽样对账。

## 7. 边界与失败场景

| # | 场景 | 期望行为 | 验证 |
| --- | --- | --- | --- |
| 1 | user 打开 admin | 404/403，无数据 | E2E |
| 2 | 监控 SDK 不可用 | 业务继续，结构化日志保底 | fault |
| 3 | 聚合查询超时 | 可恢复错误，不泄露 SQL | fault |
| 4 | 异常含用户正文 | 上报前被 scrub | captured event |
| 5 | 告警规则触发 | 指定渠道收到测试告警 | drill |

## 8. 依赖处理

| 依赖 | 状态 | 处理 | 退出条件 | 风险 |
| --- | --- | --- | --- | --- |
| Sentry/equivalent | 需配置 | Real | staging event/alert | 配额/噪音 |
| Events/data | IB-03/05 | Real | reconciliation | 口径漂移 |
| Admin role | IB-02 | Real | negative E2E | bootstrap |

## 9. 测试与验证

- monitor capture/scrub tests。
- admin role/API/UI tests。
- SQL/view unit/integration tests。
- fault injection 与 alert drill。
- production-like build/source map/security scan。

## 10. 集成风险

监控最容易泄露正文；默认 deny sensitive keys，并在 staging 人工查看真实 captured payload。看板数字必须能回溯到固定 SQL 定义。

## 11. 停止条件

需要开放用户正文、跨学校个人级导出、引入第二指标定义或无法完成脱敏时停止。

## 12. 完成输出

报告监控配置、scrub 规则、alert 测试、admin 页面、指标对账、权限证据和运行手册更新。
