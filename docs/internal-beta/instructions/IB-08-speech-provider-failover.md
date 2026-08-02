# Module Instruction: IB-08 · Speech Provider Failover

## Tier

- L1：位于面试主闭环，并跨 Azure、备用 provider、浏览器语音能力、隐私和监控边界。

## Objective

- 保持现有 `/api/tts`、`/api/stt` 和 UI 状态契约不变，为 TTS 与 STT 各增加一个真实服务端备用 provider；任一 provider 故障时有界切换，最终仍保留 Web Speech/浏览器识别/文本编辑路径。

## Acceptance Criteria

- VOICE-001：公开 API、枚举和 TTS/STT 独立故障注入不漂移。
- VOICE-002：TTS 完成 Azure→备用 API→Web Speech→文本的有界降级。
- VOICE-003：STT 完成 Azure→备用 API→浏览器识别→手动编辑的有界降级，答案不丢失。
- VOICE-004：不持久化原始音频或正文；技术测量可按 requestId 追踪。
- VOICE-005：HTTPS 桌面和手机使用真实 provider 完成主故障、备用成功与双失败矩阵。

## Contract Constraints

- 公开请求/响应保持 `docs/04_api_contracts.md` 不变；provider 密钥和选择只在服务端。
- 单次操作对每个服务端 provider 最多一次调用；4xx 输入错误不触发备用 provider。
- 每个外部调用必须有短超时；不得在数据库事务内等待外部语音服务。
- STT 的原始音频仅在请求内存中短暂处理，不写磁盘、数据库、日志、监控或事件。
- 监控只接收 provider、operation、duration/character count、latency、attempts、result/errorCode 和 requestId。
- 不购买、不安装或调用备用 provider，直到产品确认厂商、地域、价格、配额和个人信息处理边界。

## Edge And Failure Scenarios

| # | Scenario | Expected Behavior | Verification |
| --- | --- | --- | --- |
| 1 | TTS/STT 输入非法 | 稳定 4xx，不调用任一备用 provider | unit/route test |
| 2 | Azure 超时、网络失败、429/5xx | 最多调用备用 provider 一次 | injected fetch test |
| 3 | Azure 返回不可重试 4xx | 不切备用，返回稳定错误 | injected fetch test |
| 4 | 主、备 TTS 均失败 | 客户端切 Web Speech；不可用时题目文本继续 | browser fault matrix |
| 5 | 主、备 STT 均失败 | 尝试浏览器识别；最终保留已有文本供编辑 | browser fault matrix |
| 6 | 用户停止/重复点击 | 取消当前录音/播放，不并发重复计费 | interaction test |
| 7 | provider 返回原始错误或敏感响应 | 对外映射稳定错误，日志/监控不出现正文或 credential | security test |

## Verification Steps

1. 本地 contract test：公开 API、故障标识、降级顺序和不可重试错误。
2. 本地 adapter test：注入 fetch，核对次数、超时、错误映射和 payload scrub。
3. 全量 internal-beta、typecheck、production build、source/bundle security。
4. staging 配置存在性检查，只报告 present/absent。
5. 经确认后各执行最小真实 TTS/STT fixture，记录 provider、latency、attempts、requestId，不记录正文/音频。
6. HTTPS 桌面和手机完成 VOICE-005 浏览器矩阵。

## Dependency Handling

| Dependency | Status | Handling | Exit Condition |
| --- | --- | --- | --- |
| Azure TTS/STT | Ready | Real primary | staging 复验 |
| 备用 TTS/STT provider | Not selected | 不创建假实现；只冻结接口 | 产品确认厂商、地域、价格、配额、协议和测试账号 |
| Web Speech/SpeechRecognition | Ready by browser | Final local fallback | 目标桌面/手机浏览器实测 |
| Microphone | Not available on current workstation | 不伪造录音成功 | HTTPS 有麦克风设备实测 |

## Integration Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| 主备都重试造成高延迟/重复计费 | 面试卡顿、成本失控 | 每 provider 最多一次、总超时预算、客户端防重复 |
| 两家音色/格式不一致 | 三人设体验漂移 | provider voice mapping 与三风格 fixture |
| STT 音频提供给第二方 | 隐私边界扩大 | 上线前更新第三方清单、最小真实 payload 复核 |
| provider 原始错误泄露 | 安全与隐私风险 | 稳定错误映射、scrubber、source/bundle scan |
| 未选 provider 的 stub 留在生产 | 虚假冗余 | 本任务禁止生产 stub；VOICE-002/003/005 保持 Pending |
