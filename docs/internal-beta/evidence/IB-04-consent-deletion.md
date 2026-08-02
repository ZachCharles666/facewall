# IB-04 Alpha Acceptance Record · 隐私同意与删除留痕

- 日期：2026-07-25
- policyVersion：`2026-07`
- 目标：版本化同意、新训练双重门禁、用户删除申请、admin 人工审批/执行与最小审计
- 数据边界：未保存或处理原始音频；全部删除演练账号均为运行时生成的 `example.test` fixture

## Acceptance Summary

| Item | Status | Evidence | Notes |
| --- | --- | --- | --- |
| CONSENT-001 | Pass | production HTTP smoke + PostgreSQL integration | 未同意创建 Session 返回 `403 CONSENT_REQUIRED`；UI 同时读取 `needsConsent`，数据库函数再次校验 |
| CONSENT-002 | Pass | DB query | 记录包含 user、`2026-07`、完整 scopes、acceptedAt、requestId |
| CONSENT-003 | Pass | API/DB replay | 不同 idempotencyKey 重复接受仍返回同一 id，当前版本记录数为 1 |
| CONSENT-004 | Pass | DB integration | 旧版本接受返回 `409 POLICY_VERSION_OUTDATED`；既有旧记录保留，新版本记录另增 |
| CONSENT-005 | Pass | production HTTP smoke | 用户 POST 创建、重复请求返回既有未结束请求、GET 查看状态；审批后 `privacyOnly=true` 仍可查看 |
| CONSENT-006 | Pass | staging-style fixture deletion drill | 成功删除正文/身份并保留去标识 audit；故障注入整体回滚为 failed，重新审批后完成 |
| SEC-005 | Pass | production malformed-request injection | production route 仅返回 `PRIVACY_OPERATION_FAILED`，未暴露 SyntaxError、SQL/provider 信息 |

## Implementation Contract

- 当前协议只从 server-only `lib/privacy/policy.ts` 提供；客户端提交的版本和 scopes 必须与当前配置完全一致。
- `(user_id, policy_version)` 唯一，用户 RLS 仅允许读取和新增同意记录，不能 update/delete 覆盖历史。
- AuthGate 处理 `needsConsent`；`create_interview_session` 在额度占用前再次校验同一 policyVersion。
- 删除状态为 `requested → approved → executing → completed|failed`；failed 可重新审批后重试。
- admin 审批把 profile 置为 `deletion_pending`；该用户只能查看隐私/删除状态与退出，不能创建新会话。
- 执行事务按显式 inventory 删除 answers、feedback、events、sessions、consent、profile、Auth verification、邮箱 OTP 日桶和 Auth identity；不读取或写入正文到日志。
- 完成后 `deletion_requests.user_id=null`、`reason=null`，`audit_summary` 仅保留 schemaVersion、表级数量和完成时间。

## Verification

| Command / check | Result |
| --- | --- |
| `npm run db:migrate` | Pass；应用 `0008_consent_and_deletion.sql` |
| `npm run test:internal-beta` | Pass；33/33 |
| `npm run test:internal-beta:db` | Pass；既有 9 表 RLS/邀请码/额度回归 |
| `npm run test:internal-beta:privacy-db` | Pass；版本、幂等、门禁、删除、故障回滚、重试 |
| `npm run smoke:privacy -- http://127.0.0.1:3000` | Pass；production HTTP consent/deletion/admin/auth |
| `npm run smoke:persistence -- http://127.0.0.1:3000` | Pass；IB-03 全状态链与额度回归 |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |

删除成功 fixture 的表级数量：`interview_answers=1`、`feedback=1`、`product_events=1`、`interview_sessions=1`、`consent_records=1`、`user_profiles=1`、`auth_verification=1`、`otp_email_counters=1`、`auth_user=1`。演练完成后 fixture 和 audit fixture 均清理。

## Open Risks

| Risk | Severity | Handling |
| --- | --- | --- |
| 当前正文是明确标注的开发占位文本 | High（放量） | 产品/法务确认正文后冻结新 policyVersion；重新跑版本升级验收 |
| 三主题视觉回归 | Closed locally | 2026-07-26 在 390×844 人工复核 figma/juju/classic；正文、版本、勾选、同意、删除与退出操作可见，无横向溢出；Juju 对比度修复后复核通过 |
| 外部监控平台中的历史技术 ID | Medium | IB-06 接入监控时落实 scrubber 和平台删除/到期策略；当前应用日志不写用户正文 |

## Deferred Items

| Item | Deferred To | Reason |
| --- | --- | --- |
| 最终法律文本与新 policyVersion | 灰度发布门禁 | 文本 owner 为产品/法务，开发不自行作合规承诺 |
| staging 浏览器/HTTPS 复核 | IB-07 staging drill | 本地 390×844 已通过；仍需在真实域名、HTTPS、Secure Cookie 环境复核 |

## IB-07 产品协议草案升级 · 2026-07-28

- 产品提供的《用户服务协议》《隐私政策》已替换本文件验收时使用的开发占位正文。
- 当前版本为 `2026-07-28-product-draft`，因此既有 `2026-07` 同意记录不会放行新 Session，版本升级行为继续符合 CONSENT-004。
- 本次只关闭原文接入和本地版本门禁，不关闭专业法律审核、运营主体/联系方式验真、承诺与实现一致性或 staging 浏览器复核。
- 详细证据和已知风险见 `IB-07-policy-product-draft-2026-07-28.md`；新增 CONSENT-007 为 Partial。

## Post-IB-06 390×844 浏览器矩阵 · 2026-07-26

| Theme | Result | Evidence |
| --- | --- | --- |
| figma | Pass | 隐私标题、正文、协议版本、勾选、同意、删除、退出均可见；无水平滚动或按钮溢出 |
| juju | Pass after fix | 补齐暖白/淡紫玻璃卡片与高对比文字/按钮；卡片可纵向滚动，复核风格和可读性通过 |
| classic | Pass | 同意/隐私操作完整可见，无水平溢出 |

最终产品/法务正文仍未冻结，当前 title 明确包含“待产品/法务冻结”；该外部门禁不因本地视觉通过而关闭。
