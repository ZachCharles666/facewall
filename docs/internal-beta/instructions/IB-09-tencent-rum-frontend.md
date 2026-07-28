# Module Instruction: IB-09 · Tencent RUM Frontend Receiver

## Tier

- L1：位于所有页面的浏览器运行时，跨前端异常、API 性能、隐私、费用和发布边界。

## Objective

- 在不引入跨境 telemetry、CLS 或正文采集的前提下，把 staging 前端异常、API 性能和 Web Vitals 接入腾讯云 RUM 广州真实接收面，并保留现有 provider-neutral 服务端监控。

## Acceptance Criteria

- OBS-001：staging 受控前端异常进入腾讯云 RUM；服务端异常另有真实接收证据。
- OBS-002：远端 captured payload 人工复核不含用户正文、凭据、真实用户/设备标识、query 或截图。
- OBS-003：一次受控失败 API 的响应 `x-request-id` 可与 RUM、响应和本机结构化日志对账。
- OBS-004：严重前端异常告警触发与恢复通知真实到达；服务端/DB/备份告警继续独立验收。

## Contract Constraints

- 只有显式 enable + 合法应用 ID 才初始化；默认关闭，失败不阻断业务。
- SDK 固定中国大陆接收域；禁止跨境 endpoint。
- 禁用真实 `uin`、持久 `aid`、设备详情、Cookie、request/response body、query/hash、点击/console 全量日志和白屏截图。
- API header 只允许响应 `x-request-id`；不注入 trace header，不读取业务 retcode 形成额外正文事件。
- 保留 `/api/monitor/client-error` 和 server vendor-neutral JSON/requestId；RUM 不能替代 server/DB/backup monitoring。
- 控制台抽样是降量手段，不是账号级硬费用上限；额度告警、停用开关和恢复步骤必须单独验证。

## Edge And Failure Scenarios

| # | Scenario | Expected Behavior | Verification |
| --- | --- | --- | --- |
| 1 | enable 缺失/false 或 ID 无效 | 不加载 SDK、不发送 | unit/source contract |
| 2 | SDK 加载/上报失败 | 页面和业务请求继续 | injected import/network failure |
| 3 | URL 含邮箱/token/动态 ID | query/hash 删除，动态 segment 聚合为 `:id` | payload policy test |
| 4 | error message 含用户输入 | 只保留 Error 类型和技术栈帧 | payload policy test |
| 5 | API 请求含正文/Cookie | RUM payload 不含 request/response detail 或 request headers | source + remote review |
| 6 | RUM 达到额度风险阈值 | 外部通知后按 runbook 停止应用或关闭 enable 重发版 | real alert drill |

## Verification Steps

1. 本地 policy/source tests、internal-beta、typecheck、production build、source/bundle security。
2. staging 环境只报告 enable/ID 是否存在，不输出值；从确定 commit 构建并部署。
3. 打开非敏感页面，确认业务系统/应用维度出现第一条性能数据。
4. 执行一次非敏感受控前端 Error 和一次受控失败 API；人工复核 payload 与 requestId。
5. 配置严重 JS error/上报量告警。任何真实邮件/微信演练前先说明接收对象和预计通知次数。
6. 验证触发、恢复通知、停用 RUM 和重新启用后的行为；OBS-001～004 只按真实证据调整。

## Dependency Handling

| Dependency | Status | Handling | Exit Condition |
| --- | --- | --- | --- |
| Tencent RUM business/app | Created by product | 本地 SDK adapter 已实现 | staging 首条数据 |
| RUM alarm dimensions | Waiting for first telemetry | 首条数据后配置 | trigger + recovery evidence |
| Server/DB/backup receiver | Partial | 继续 vendor-neutral 方案 | 外部通知与恢复证据 |
| Daily quota hard stop | Not provided by SDK | 抽样 + 告警 + stop/runbook | 产品确认费用门槛与响应人 |

## Integration Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| 默认 aid/uin 形成用户追踪 | 隐私范围扩大 | `aid=false`、静态 anonymous uin、device=false |
| 自动 error 正文泄露 | 用户输入进入平台 | 自动 listener 关闭，项目 adapter 只发类型/栈 |
| API detail 泄露正文 | 简历/JD/报告泄露 | apiDetail/reportRequest false，header allowlist |
| Console 抽样被误当费用硬停 | 产生超额费用 | 上报量告警、停用开关和 runbook |
| RUM 被误当 server monitoring | DB/备份故障漏报 | OBS-004 独立保持 Partial |
