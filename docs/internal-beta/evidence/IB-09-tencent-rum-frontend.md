# IB-09 Tencent RUM Frontend Receiver Evidence

- 日期：2026-07-28
- 当前阶段：Public staging deployed / first remote frontend error captured
- 结论：腾讯云 RUM 广州业务系统与 web 应用已由产品创建，前端 SDK 的 fail-off/privacy adapter 已从确定 commit 构建并部署到公网 staging；首条受控前端错误已在远端控制台确认且样本脱敏复核通过。服务端异常接收、API requestId 对账、配置请求偏差和告警触发/恢复仍未关闭，OBS-001～004 均保持 Partial。

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
| Identity | `uin=anonymous`、`aid=false`、`device=false`；Aegis constructor 会按 `hostUrl` 重建 endpoint，初始化后以公开 `setConfig` 二次锁定大陆 endpoint；3004 真实运行时证明空 whitelist 会永久阻塞日志队列，现按产品确认恢复同一大陆域官方 whitelist 配置请求，待下一候选复验请求最小化 |
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

## Post-Capture Corrections — 2026-07-29 to 2026-07-30

- 腾讯云控制台「API 监控」在最近 3 小时无数据；这不是控制台搜索入口问题。
- SDK `reportApiSpeed` 的对象形式符合当前 `aegis-web-sdk` 类型和官方示例。根因在本地 `beforeRequest`：真实 speed envelope 可为数组，旧 scrubber 把根数组清洗为空对象，因此 JS 错误日志可达而 API speed 无有效记录。
- `sanitizeMetricLog` 已改为逐条清洗批量 speed records，分别保留合法 requestId、method/status/duration 和归一化 path；query、正文、凭据和非法/跨记录 requestId 仍丢弃，空 metric batch 直接返回 false。
- 批量 API speed 修正进入 commit `caa52eece298b19937558248cdb6f98c0a222702` 后部署到 3003。公网匿名 Session 返回 401 且 response `x-request-id` present，但该页面会话没有出现任何可见 `rumt-zh.com` 接收请求，API 监控仍没有可用于 requestId 对账的数据。
- 对锁定依赖的实际 runtime 复核确认：Aegis constructor 在应用传入参数后仍会按 `hostUrl`（未传时使用默认大陆域）重建全部 endpoint。因此“移除 hostUrl + constructor 内逐项 endpoint”的首轮修正无效；源码字符串契约无法覆盖该 SDK 行为。
- 二次修正以大陆 `hostUrl` 初始化 SDK，随后立即调用公开 `setConfig` 锁定最终 endpoint；custom event/custom time/offline 为空，log/PV/speed/performance/web-vitals 保留，rateConfig 使用 SDK 实际 `/rateConfig` 路径。
- 新增构造后 endpoint 覆写契约；Tencent RUM contract 9/9、full internal-beta 71/71、typecheck、production build 33/33、source security 196 files、bundle security 60 files 和 `git diff --check` Pass。
- 二次修正进入 commit `f57a26d7d740159d298e62bd5591e44be93e53c3` 并部署到 3004；真实运行时进一步证明空 `whiteListUrl` 会让 Aegis 1.41.14 的日志发送门控永远等待，详见下方 3004 复核。官方大陆 whitelist 修正仍待 commit/构建下一候选，因此不能关闭 OBS-002/003。

## Acceptance Decision

| ID | Status | Remaining evidence |
| --- | --- | --- |
| OBS-001 | Partial | 受控前端异常真实远端事件已取得；仍缺服务端异常真实外部接收 |
| OBS-002 | Partial | 首条前端错误 captured payload 脱敏复核通过；3005 证明 endpoint 恢复后控制面仍被本地 `beforeRequest` 误拦截，待严格 `whiteList/null` 放行的下一候选复核请求字段与 receiver payload |
| OBS-003 | Partial | 3005 无痕页 adapter/Aegis 实例与 endpoint 布尔核对均正确，但无任何 telemetry resource；仍需下一候选上同一 requestId 的 response/RUM/local log 对账 |
| OBS-004 | Partial | 严重前端告警及恢复；登录/API/DB/备份外部通知与恢复 |

## Release Provenance

- RUM adapter 已进入 source commit `9607f9e7d912b20baca58245e8e4e20e989fe737` 并推送 `origin/release/preview`。
- 从该 commit 导出的 post-freeze 归档通过独立 68/68、typecheck、33/33 build 和 source/bundle security；摘要和排除项见 `IB-07-release-freeze-2026-07-28.md`。
- 最终归档在 staging 的 SHA-256 与本地记录一致；server-only 配置从既有 release 继承，RUM public build config 通过隐藏输入写入，未在命令输出或证据中显示值。
- 批量 API speed 首轮修正进入 commit `caa52eece298b19937558248cdb6f98c0a222702` 并推送；对应 release `/home/ubuntu/releases/passbuddy-20260729-caa52ee` 运行于 3003。
- 构造后 endpoint 锁定进入 commit `f57a26d7d740159d298e62bd5591e44be93e53c3` 并推送；归档摘要 `a8e48b504f6398b80219f5654b7ca835be64010175b346194d0fe4ff12e33524` 在 staging 对账通过，release `/home/ubuntu/releases/passbuddy-20260730-f57a26d` 运行于 3004。
- 官方大陆 whitelist endpoint 修正进入 commit `c4f20d8b811823f4d5022e71e7648052cd6cc2fc` 并推送；归档摘要 `6743b4635451cdc214905e73a1247ddc1d9dbe4fc3acc20e35a24bc9d6996105` 在 staging 对账通过，release `/home/ubuntu/releases/passbuddy-20260730-c4f20d8` 运行于 3005。

## Public Staging Deployment — 2026-07-29

- Release path：`/home/ubuntu/releases/passbuddy-20260729-9607f9e`。
- 远端安装与验证：`npm ci`、68/68 internal-beta、typecheck、source security Pass；production build 通过 transient systemd unit 以 `ubuntu` 用户脱离 WebShell 完成，33/33 pages/routes generated。
- 首次交互 build 在 `Compiled successfully` 后成为 PPID 1 的 stopped/orphan 进程；仅在核对精确 PID 身份后停止该 build，保留部分 `.next`，随后由 systemd build unit 成功重建。该过程未停止 3000/3001 运行时。
- 远端 bundle security Pass，扫描 58 个 bundle files；RUM public config 仅做 presence/embedded 校验，不输出值。
- `facewall-rum-candidate` 在 3002 online；隔离 health/root/anonymous session/OTP GET/production fixture 分别为 200/200/401/405/404。
- Nginx upstream 与 `passbuddy-local-readiness` target 已切到 3002；公网 health/root/anonymous session/OTP GET/production fixture 分别为 200/200/401/405/404，security headers 与 readiness oneshot Pass。
- 切换前 Nginx/readiness 配置均有时间戳回滚副本；旧 3000、前一候选 3001 和新 3002 均继续监听，未执行真实 pilot。
- 浏览器 Network 已确认中国大陆接收域的预检与实际采集请求分别返回 200/204；腾讯云控制台随后出现 1 条与 release commit、`pre` 环境和测试时间匹配的 JS 错误。
- 远端样本只显示归一化错误类型、`window-error` 来源、`/` 路径、脱敏 trace 位置、匿名用户标签、环境、release 和一般 user-agent；未显示受控错误正文、query、Cookie、OTP、token、简历/JD/答案/报告、具体 requestId 或真实用户标识。
- 该样本证明前端 receiver 和当前错误脱敏路径有效，不证明服务端接收、API requestId 关联或告警恢复。
- Network 同时出现 whitelist/rateConfig 配置请求，说明 `hostUrl` 与空 `whiteListUrl` 的实际 SDK 行为未达到本地“无白名单请求”假设；本地已按上节修正，但在部署复验前 OBS-002 保持 Partial。rateConfig 是控制台动态采样配置入口，继续保留在中国大陆接收域。

## 3003 Runtime Recheck — 2026-07-30

- `facewall-rum-fix-candidate` 在 3003 online；Nginx upstream 与 readiness target 已切到 3003。公网 health/root/anonymous session/OTP GET/production fixture 分别为 200/200/401/405/404，security headers 和 readiness oneshot Pass。
- Nginx/readiness 切换前配置已保留时间戳回滚副本；3000/3001/3002/3003 均继续监听，未执行 `pm2 save`、旧进程清理、OTP 或真实 pilot。
- 浏览器在 Juju 公网页面主动请求匿名 Session，返回 401，response `x-request-id` present；等待后 Network 中没有可见 `rumt-zh.com` 请求。
- 该结果只证明业务 API 和 response requestId 正常，不证明 RUM API speed 接收。它否定了首轮 constructor endpoint 假设，OBS-002/003 继续 Partial。

## 3004 Runtime Recheck — 2026-07-30

- commit `f57a26d7d740159d298e62bd5591e44be93e53c3` 的归档在本地与 staging SHA-256 一致，425 entries、禁入路径 0、必需文件缺失 0。
- detached systemd build `Result=success`、`ExecMainStatus=0`；71/71 internal-beta、typecheck、source security（197 files）、production build 33/33、bundle security（58 files）Pass。
- `facewall-rum-runtime-candidate` 在 3004 online；隔离 health/root/anonymous session/OTP GET/production fixture 为 200/200/401/405/404，RUM ID 已嵌入 bundle。Nginx/readiness 从 3003 切至 3004 后公网同组 smoke、安全头、health application/database 和 readiness oneshot Pass。
- 浏览器登录页全局 `ClientErrorMonitor` 已确认运行，受控错误进入本地 `/api/monitor/client-error` 并返回 200；Aegis 1.41.14 与 adapter chunks 均加载。
- 通过当前页面已加载模块的只读诊断确认：Aegis instance、`report`、`setConfig` 均存在，最终 log/rateConfig endpoint 指向大陆域且 whitelist 为空；但受控错误后仍无任何 telemetry resource。
- 锁定 SDK 源码复核定位根因：whitelist 插件在 `whiteListUrl=""` 时不发配置请求，也不会把内部完成标志置位，错误日志永久停留在内存队列。官方类型/公开 API 没有“禁用 whitelist 并放行队列”选项。
- 产品确认采用官方支持路径：恢复同一中国大陆域 `https://rumt-zh.com/collect/whitelist`，继续保持 anonymous uin、无持久 aid/device、无正文/header/cookie 采集，并在下一候选人工复核 whitelist 请求字段。3004 当前业务健康但 RUM receiver 不工作，OBS-002/003 继续 Partial。
- 官方大陆 whitelist 修正当时已在本地通过 Tencent RUM contract 9/9、full internal-beta 71/71、typecheck、production build 33/33、source security 197 files、bundle security 60 files 和 `git diff --check`；随后进入上节所列 `c4f20d8` 归档与 3005。
- CSP 诊断曾以字符串缺少 `rumt-zh.com` 误判为连接阻断；实际公开策略只有 `base-uri/frame-ancestors/object-src`，没有 `default-src` 或 `connect-src`，不限制 RUM 连接。对应 `sed` 未匹配任何文本，Nginx 配置未发生 CSP 变化。

## 3005 Control-Plane Recheck — 2026-07-30

- 官方大陆 whitelist endpoint 修正 commit `c4f20d8b811823f4d5022e71e7648052cd6cc2fc` 的归档 SHA-256 在本地与 staging 一致；425 entries、禁入路径 0、必需文件缺失 0。
- detached systemd build `Result=success`、`ExecMainStatus=0`；71/71 internal-beta、typecheck、source security（197 files）、production build 33/33、bundle security（58 files）Pass。
- `facewall-rum-whitelist-candidate` 在 3005 online；隔离 health/root/anonymous session/OTP GET/production fixture 为 200/200/401/405/404，RUM ID、mainland host、whitelist path 和 config key 均嵌入 bundle。
- Nginx/readiness 从 3004 切至 3005；公网同组 smoke、安全头与 readiness oneshot Pass。回滚副本为 `/etc/nginx/conf.d/facewall.conf.pre-ib09whitelist-20260730-191650` 和 `/etc/passbuddy/readiness.env.pre-ib09whitelist-20260730-191650`；3000～3005 均保留。
- 普通 Chrome 的大量 Console 错误来自 Unstoppable Domains 扩展，不是 PassBuddy。重新以无痕页排除扩展后，adapter、Aegis instance、whitelist/rateConfig/log 最终 endpoint 均核对为 true，但 `rumt-zh.com` resource 仍为空。
- 锁定 SDK 实现复核确认：whitelist 与 rateConfig 都以 `logType="whiteList"`、`logs=null` 进入应用 `beforeRequest`；现有 sanitizer 对空 envelope 返回 false，因而在网络层前取消两个官方控制面请求。这比“只恢复 endpoint”更深一层，也解释 3005 的全部运行时证据。
- 当前未提交修正只允许严格的 `whiteList/null` 控制面形态；携带对象、payload 或用户数据的同类型 envelope 仍返回 false。定向契约 10/10、full internal-beta 72/72、typecheck、production build 33/33、source security 197 files、bundle security 60 files 和 `git diff --check` Pass。
- 本次干净诊断没有再触发受控错误、Session、OTP 或外部告警。OBS-002/003 继续 Partial。

## Cost/Stop Boundary

- 控制台抽样只能降低上报量，不等于账号级自动硬停或费用封顶。
- 本地 adapter 可通过关闭 enable 的新构建停止 RUM；控制台也可停止应用。
- 真正上线前仍需确认日上报量告警阈值、接收人、响应时间和停用步骤。任何真实邮件/微信测试前必须先说明接收对象和预计通知次数。
- 本轮没有告警通知、OTP 或真实 pilot；首条前端错误已取得真实外部接收证据，但未据此升级尚未完成的服务端、API trace 或告警门禁。
