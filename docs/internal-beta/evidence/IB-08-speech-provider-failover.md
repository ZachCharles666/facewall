# IB-08 Speech Provider Failover Evidence

- 日期：2026-07-28
- 当前阶段：Contract/local fault isolation
- 结论：公开语音契约与主备降级顺序已冻结；第二个真实服务端 TTS/STT provider 尚未选择或实现，VOICE-002/003/005 继续 Pending，VOICE-004 继续 Partial。

## Local Result

| Item | Status | Evidence |
| --- | --- | --- |
| `/api/tts`、`/api/stt` 公开请求/响应保持兼容 | Pass | `docs/04_api_contracts.md` |
| TTS/STT 独立故障注入 | Pass | 修复 STT route 错用 `tts` fault 标识；targeted contract 18/18 |
| 主备 failover 顺序、重试边界和隐私字段 | Pass as contract | D-13、internal-beta Contract、API/Event Contract |
| Azure 主 provider | Existing | 既有真实 TTS 和本地 compatibility 证据；本轮未调用 |
| 备用服务端 TTS/STT provider | Pending | 厂商、地域、计费、配额、数据处理边界和真实账号未决定 |
| Web Speech/手动编辑最终兜底 | Existing Pass | `IB-07-local-compatibility.md` |
| 真实麦克风 STT | Pending public device | 当前工作站无可用麦克风证据；不得以 fixture 冒充 |

## Local/Public Boundary

| Verification | Local | Requires public/external |
| --- | --- | --- |
| API schema、故障标识、重试分类、调用次数 | Yes | No |
| adapter timeout、稳定错误、scrub | Yes after provider protocol selected | Real payload review also required |
| Web Speech/手动编辑保底 | Yes | 目标手机浏览器需复验 |
| Azure→备用 provider 真实切换 | No | Yes |
| HTTPS 麦克风权限和真实短音频 STT | No on current workstation | Yes |
| provider latency/requestId 外部对账 | No | Yes |

## Stop Condition

在产品确认备用 provider 的厂商、服务地域、中文能力、价格/配额、隐私条款和测试账号前：

- 不安装 SDK；
- 不新增或传输真实密钥；
- 不发起真实 TTS/STT 调用；
- 不创建生产 stub/fake；
- 不把 VOICE-002/003/005 升级为 Pass。

## Verification

| Command | Result |
| --- | --- |
| targeted dev/persistence/alerts/observability/security contracts | 18/18 Pass |
| full internal-beta | 62/62 Pass |
| typecheck / production build | Pass / 33 of 33 pages and routes generated |
| source / client bundle security | Pass / 192 source files and 59 bundle files scanned |
| `git diff --check` | Pass；仅报告既有 Windows LF/CRLF 提示 |
