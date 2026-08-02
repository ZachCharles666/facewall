# IB-07 开工前 Go/No-Go Readiness — 2026-07-26

## 决策

**2026-07-27 更新：CONDITIONAL GO（仅继续 staging drill）/ NO-GO（10–20 人真实灰度）。**

上海 Lighthouse 上的 PostgreSQL 16、migration `0011`、本机与 COS 异地备份/真实恢复、候选构建和 3001 本机 smoke 已形成证据，见 `IB-07-staging-foundation-2026-07-27.md`。可以继续配置监控、OTP 和回滚，但真实监控、完整真实邮箱送达、Secure Cookie、公网应用切换回滚、腾讯云接入/证书续期和法务正文仍未闭环。本文不代表真实灰度已经开始。

## 本轮关闭

| Acceptance | 结论 | 真实证据 |
| --- | --- | --- |
| SESSION-004 | Pass | classic 浏览器真实 PostgreSQL 故障注入；Draft 与画像仍在，DB 保持 `draft`/version 1，画像里程碑与完成事件均为 0。 |
| FEED-001 | Pass | figma、juju、classic 均完成 1–5 星/可选文字提交；DB 每主题反馈行与权威事件对账。 |
| FEED-004 | Pass | 三主题均验证复制、跳过和反馈保存失败不阻断报告；复制事件仅含 allowlist 技术字段。 |
| ADMIN-001 | Pass | admin 浏览器完成指标、学校、批量邀请码及停用；普通用户 API 403、页面 404；DB/audit 对账通过。 |
| COMP-003 | Pass | classic 实际完成 Azure/Web Speech、STT 失败保留与手动编辑、流式报告页和复制兜底；非流式由 contract smoke 覆盖。 |
| COMP-004 | Pass | classic/figma/juju 完成主闭环；figma/juju 在无麦克风设备上用新增文字兜底完成 3 题、报告和复制。 |

SESSION-003 仅关闭刷新与 Node 重启子矩阵。退出后真实 OTP 重登未执行，因此 Acceptance 仍为 Partial。签名 fixture Cookie 没有冒充真实 OTP 验收。

## P0 与放量门禁盘点

| 门禁 | 当前状态 | 依赖/下一证据 |
| --- | --- | --- |
| AUTH-001 | Pending | QQ、163、两所学校域名各至少 3 次真实送达/登录矩阵；本轮未发送 OTP。 |
| AUTH-002–005、007–008 | Pass | 本地 Route Handler、production HTTP 和真实 PostgreSQL 安全/恢复矩阵，见 `IB-07-local-security-contract.md`。 |
| AUTH-006 | Pending | 本地 logout/401 路径可测；仍需 HTTPS staging 的 Secure Cookie 浏览器证据。 |
| SESSION-003 | Partial | 刷新和 Node 重启已过；仍需已有合法账号或获准发送 OTP 后完成退出重登。 |
| SESSION-008 | Partial | provider/model/requestId/真实延迟/usage 接线和隐私校验已完成；服务器发现 LLM 配置名称，但尚未做受控真实调用，不能证明 provider usage。 |
| OBS-001–004 | Partial | 本地 adapter、scrubber、requestId 和本地告警演练已过；仍需真实监控项目、告警渠道和远端 captured payload。 |
| COMP-002 | Pass | CommonResponse、稳定 enum/questionId、SSE 与单题重生成 contract smoke 通过。 |
| COMP-003–004 | Pass | 本地浏览器 + contract smoke 已关闭；真实 Azure STT 录音仍在 HTTPS staging 有麦克风设备复验，但不改变本地手动兜底结论。 |
| SEC-001–004 | Pass | production bundle secret、双 user/admin IDOR、统一写保护、role 受控流程证据完整。 |
| SEC-006 | Pass | 2026-07-28 候选从 3000 实际切换至 3001，经 HTTPS health/root/auth/production fixture/security headers 验证后自动恢复 3000；回滚 root=200、旧版 health=404。 |
| PILOT-001–005 | Pending | 未启动真实灰度；P0 和恢复门禁未关闭前不得放量。 |

## 外部与 staging 依赖

| 项目 | 当前证据 | Readiness |
| --- | --- | --- |
| 真实 LLM | 服务器存在 provider 配置名称，但未做受控真实调用和 usage 对账 | Partial |
| 真实监控/告警 | 未发现已配置可用 provider | Partial |
| 邮箱 | 存在邮件 provider 配置，但完整四类收件矩阵缺失 | Pending |
| staging PostgreSQL | 上海 Lighthouse PostgreSQL 16.14、localhost-only、双 role、0011、五组 DB integration | Ready for drill |
| 备份与恢复 | migration 前/后/clean dump；本机和 COS 下载均恢复到独立临时库；每日本机+COS 自动备份、SHA/CRC 与 90 天生命周期通过 | Pass；上传失败外部告警仍随 OBS 门禁 |
| HTTPS 与域名 | HTTPS 200 和安全头通过；HTTP 被 webblock；接入关系/续期/Secure Cookie 未闭环 | Partial |
| 应用回滚 | 独立 release 构建和 3001 smoke 通过，旧 3000 保留；尚未实际切换/回滚 | Partial |
| 法务正文 | policy 最终正文与版本尚未冻结 | Pending |

## staging drill 的最小进入条件

1. ~~提供隔离的 staging 域名、HTTPS 和 PostgreSQL，并确认只使用 fixture。~~ PostgreSQL/候选 smoke 已完成；HTTPS 接入和 Secure Cookie 仍需继续。
2. 配置真实监控项目与告警接收渠道，完成 requestId 和隐私 payload 抽查。
3. 数据库本机/COS 备份与恢复已完成；应用版本实际回滚仍待完成。
4. 完成真实邮箱送达矩阵；发送 OTP 前必须重新获得明确许可。
5. 冻结隐私/服务协议正文与 policyVersion。
6. 如需关闭 SESSION-008 的真实测量部分，配置可返回 provider usage 的真实 LLM，并仅做最少量受控调用。

当前可继续 staging drill；在真实监控、OTP、Secure Cookie、应用回滚和法务门禁满足前，对 10–20 人真实灰度保持 **NO-GO**。
