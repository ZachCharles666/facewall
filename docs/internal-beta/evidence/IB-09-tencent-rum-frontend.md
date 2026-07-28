# IB-09 Tencent RUM Frontend Receiver Evidence

- 日期：2026-07-28
- 当前阶段：Local integration / pre-deployment
- 结论：腾讯云 RUM 广州业务系统与 web 应用已由产品创建，前端 SDK 的本地 fail-off/privacy adapter 已完成；尚未部署或产生首条真实 RUM 数据，OBS-001～004 均保持 Partial。

## Product/Console State

- 产品选择仅使用中国大陆监控，不接受跨境 telemetry。
- 腾讯云 RUM 广州业务系统与 staging web 应用已创建；应用上报域为 staging 公网域名。
- 控制台抽样已按低量策略设置：错误类优先、页面/PV/性能降采样、日志和自定义事件关闭。
- 当前告警维度为空，推断需 SDK 接入并产生首条数据后才能选择业务系统/应用；尚无真实告警策略或通知证据。
- 字段枚举映射模板只处理 ext4–ext10 展示映射，不是脱敏配置；本轮不使用这些扩展字段。

## Local Implementation

| Item | Result |
| --- | --- |
| Dependency | `aegis-web-sdk` exact `1.41.14` |
| Enable gate | 仅 exact `true` + 合法应用 ID；其他情况不初始化 |
| Receiver | 固定中国大陆 `https://rumt-zh.com` |
| Identity | `uin=anonymous`、`aid=false`、`device=false`、whiteList request disabled |
| Error capture | SDK 自动 listener 关闭；既有 `reportClientError` 手动发送最小事件 |
| API capture | method/status/duration/归一化 URL；request/response detail disabled |
| Correlation | response header 只 allowlist `x-request-id` |
| Privacy | query/hash、动态 path ID、正文、凭据、用户/设备标识、截图和 console/click logs omitted |
| Failure behavior | dynamic import/SDK failure returns null，不影响本地 client-error route 或业务 |

## Local Verification

| Check | Result |
| --- | --- |
| Tencent RUM contract | 6/6 Pass |
| Full internal-beta | 68/68 Pass |
| TypeScript / production build | Pass / 33 of 33 pages and routes generated |
| Source / client bundle security | Pass / 196 source files and 60 bundle files scanned |
| `git diff --check` | Pass；仅既有 Windows LF/CRLF 提示 |

## Acceptance Decision

| ID | Status | Remaining evidence |
| --- | --- | --- |
| OBS-001 | Partial | staging 首条前端异常、服务端异常真实远端事件 |
| OBS-002 | Partial | 真实 RUM captured payload 人工复核 |
| OBS-003 | Partial | 同一 requestId 的 response/RUM/local log 对账 |
| OBS-004 | Partial | 严重前端告警及恢复；登录/API/DB/备份外部通知与恢复 |

## Cost/Stop Boundary

- 控制台抽样只能降低上报量，不等于账号级自动硬停或费用封顶。
- 本地 adapter 可通过关闭 enable 的新构建停止 RUM；控制台也可停止应用。
- 真正上线前仍需确认日上报量告警阈值、接收人、响应时间和停用步骤。任何真实邮件/微信测试前必须先说明接收对象和预计通知次数。
- 本轮没有真实 RUM 上报、告警通知、部署、OTP 或其他外部调用；安装依赖使用的 workspace 临时 npm cache 已删除。
