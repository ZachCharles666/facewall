# PassBuddy 灰度发布与 Beta-Lite 验收

## 1. Release Units

| Gate | Audience | Purpose | Minimum Observation |
| --- | ---: | --- | --- |
| G0 Internal | 3–5 内部账号 | 全功能和故障演练 | 1 个完整工作日 |
| G1 Pilot | 10–20 人 | 验证登录、数据隔离、主闭环、邮件与告警 | 2–3 天 |
| G2 Limited | 约 50 人/1 所学校 | 验证真实完成率、内容和容量 | 至少 3 天 |
| G3 Full Internal Beta | 约 100 人/2 所学校 | 形成正式内测数据 | 计划周期 |

人数是上限，不是必须一次发满；每档通过后才增加邀请码额度。

## 2. Global No-Go Conditions

以下任一项存在即 No-Go：

- 数据串用户、IDOR、admin/secret 泄露；
- 核心训练记录不可恢复或无法确认完整性；
- 真实邮箱 OTP 无法稳定工作；
- 未冻结当前隐私协议版本；
- 无法暂停邀请码或回滚应用；
- 监控/告警不可用；
- 任一 P0 Security/Contract Matrix 行 Fail；
- 存在未处理 SEV-0/SEV-1。

## 3. G0 Internal Gate

### Required Evidence

- [ ] 两个 user + 一个 admin 完整 E2E。
- [ ] OTP request/verify/logout/rate/invalid invite。
- [ ] 单邮箱/IP 日限额、全局 SES 预算预警与停止阈值通过测试，停止后不再调用 SES。
- [ ] QQ、163、两所学校域名各至少 3 次真实收件，记录 P50/P95 和垃圾箱情况。
- [ ] consent current/accept/new version gate。
- [ ] setup→profile→questions→answers→report→feedback。
- [ ] 刷新、重登、Node 重启恢复。
- [ ] user A/B 隔离、admin 权限。
- [ ] DB/LLM/TTS/STT/monitor 故障注入。
- [ ] 删除请求与执行演练。
- [ ] feature flag/app rollback 和备份恢复说明。
- [ ] classic/figma/juju 和手机主流程。

通过条件：所有 P0 Matrix Must 为 Pass；允许只有明确不阻断 G1 的 P1 Deferred。

## 4. G1 10–20 User Gate

### Daily Metrics

| Metric | Go Threshold | No-Go/Investigate |
| --- | ---: | --- |
| OTP request success | ≥ 95% | < 90% |
| domestic mailbox sample delivery | 每类 3/3 | 任一目标域连续失败或明显延迟 |
| OTP verify success | ≥ 85% | < 75% |
| SES 发送预算 | 低于配置的预警阈值 | 达到预警阈值则暂停扩量；达到停止阈值则停止新 OTP |
| session data integrity | ≥ 98% | 任一跨用户/不可恢复 |
| main-loop completion | 观察，目标 ≥ 60% | < 40% 且非内容原因 |
| LLM final failure | < 2% | ≥ 5% |
| unhandled severe errors | 0 | 任一 SEV-0/1 |
| alert coverage | 100% test incidents | 关键故障无告警 |

### Exit

- 至少 10 个真实用户尝试登录。
- 至少 5 个完整 completed sessions。
- 每日运营检查和反馈记录齐全。
- 主要失败有分类：产品退出、邮件、浏览器、模型、数据、权限。
- 产品 owner + 技术给出 G2 Go/No-Go。

## 5. G2 50 User Gate

### Additional Checks

- 一所学校的邀请码、域名与运营链路稳定。
- P50/P95、模型 usage、TTS 字符、STT 秒数和重试可计算。
- 看板与 SQL 抽样差异在可解释范围内。
- 完成率目标 ≥ 60%；若不足，能定位具体漏斗步骤。
- 模型最终失败率 < 2%；fallback 使用率单独报告。
- 反馈采集率目标 ≥ 30%，低于目标不直接 No-Go，但需调整入口。
- 无积压的 SEV-1、删除请求或未处理权限问题。

### Exit

形成一页 G2 报告：人数、学校、漏斗、错误、延迟、成本、反馈、事故、变更、G3 决策。

## 6. G3 100 User Gate

### Go Requirements

- 第二所学校的邀请和邮箱路径经过小样本验证。
- 当前容量和成本预算支持剩余名额。
- 运营有人每日查看告警和指标。
- 隐私、删除、事故、回滚 Runbook 已由非开发人员走读。
- G1/G2 Known Risks 有 owner 和处置方式。

### Completion Criteria

- 获取完成率、时长、反馈、错误、成本和学校分布数据。
- 能区分真实模型、fallback、语音降级和手动输入。
- 所有事故关闭或显式接受。
- 内测结束的数据保留/删除决策有记录。

## 7. Rollback Decision

| Situation | Action |
| --- | --- |
| SEV-0 | 暂停全部邀请码；下线/回滚；轮换 secret；评估通知 |
| SEV-1 | 暂停新增；优先应用回滚或 feature flag |
| 外部 LLM/TTS/STT 问题 | 使用已契约化降级并记录 source；不伪装正常 |
| 邮件 OTP 故障 | 暂停新登录；不临时绕过身份 |
| DB 写入故障 | 暂停新会话；保留客户端 Draft；修复后核对 |
| 指标口径错误 | 暂停扩量，不篡改历史事件；修复查询并回算 |

## 8. Release Record Template

```md
# Internal Beta Release Record

- Gate:
- Date range:
- Commit:
- Migration version:
- Schools/invite codes:
- Participants:

## Acceptance
| Matrix ID | Status | Evidence | Notes |
| --- | --- | --- | --- |

## Metrics
| Metric | Result | Threshold | Decision |
| --- | ---: | ---: | --- |

## Incidents
| Severity | Impact | Resolution | Follow-up |
| --- | --- | --- | --- |

## Risks And Deferred
| Item | Owner | Due/Exit condition |
| --- | --- | --- |

## Decision
- Go / No-Go / Hold:
- Approved by:
```

## 9. Final Acceptance

最终收口使用 `05_acceptance_matrix.md`：

- Pass：证据可复查且环境与 Gate 匹配。
- Fail：行为或证据不满足，阻断对应 Gate。
- Deferred：明确不属于当前 Gate，写 owner 和退出条件。
- 不允许仅以“代码已实现”“本地能跑”标记 Pass。
