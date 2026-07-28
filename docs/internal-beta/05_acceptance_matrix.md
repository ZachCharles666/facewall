# PassBuddy 受控内测 Acceptance Matrix

> 状态初始均为 Pending。只有列出的证据真实存在并经过复查后才能改为 Pass。

## A. Identity And Invite

| ID | Dimension | Acceptance Criterion | Evidence Form | Status |
| --- | --- | --- | --- | --- |
| AUTH-001 | Functional | 有效邀请码可向 QQ、163 和两所学校邮箱发送 6 位数字 OTP 并成功登录 | 每类邮箱至少 3 次真实 E2E + Auth/SES audit；浙大域名单次 SES probe 同分钟进入收件箱，完整登录/重复样本/另一学校仍未完成 | Pending |
| AUTH-002 | Error | 无效、过期、停用或用尽邀请码不能发送/完成登录 | `evidence/IB-02-email-otp-invite.md` + route/DB negative integration | Pass |
| AUTH-003 | Error | 错误/过期 OTP 返回稳定错误且不建立 Session | `evidence/IB-07-local-security-contract.md` | Pass |
| AUTH-004 | Security | OTP 请求和验证有重发/错误次数限制，提示不泄露账号存在性 | `evidence/IB-07-local-security-contract.md` | Pass |
| AUTH-005 | Integration | 首次登录原子关联 school/profile/invite；重复登录不重复消费 | `evidence/IB-07-local-security-contract.md` | Pass |
| AUTH-006 | Security | Cookie Session 在生产启用安全属性，退出后受保护 API 返回 401 | `evidence/IB-07-staging-foundation-2026-07-27.md`；公网候选匿名 401 已验证，仍缺合法 Session 的 Secure Cookie、退出和退出后 401 | Pending |
| AUTH-007 | Authorization | user 不能访问 admin 页面/API | `evidence/IB-06-admin-observability.md` + production/browser negative E2E | Pass |
| AUTH-008 | Recovery | Auth identity 已建但 profile 初始化失败时可重试，不进入业务页 | `evidence/IB-07-local-security-contract.md` | Pass |

## B. Data Foundation

| ID | Dimension | Acceptance Criterion | Evidence Form | Status |
| --- | --- | --- | --- | --- |
| DATA-001 | Contract | migrations 可在空数据库顺序应用，表/约束/索引符合数据契约 | `evidence/IB-01-data-foundation.md` | Pass |
| DATA-002 | Security | 所有用户数据表启用 RLS，A 无法读写 B 数据 | `evidence/IB-01-data-foundation.md` | Pass |
| DATA-003 | Contract | DB snake_case 与 API camelCase 映射有测试 | `evidence/IB-01-data-foundation.md` | Pass |
| DATA-004 | Reliability | 邀请码消费和使用计数并发安全，不超发 | `evidence/IB-01-data-foundation.md` | Pass |
| DATA-005 | Privacy | 数据库、日志和监控不保存原始音频、OTP、token 或密钥 | `evidence/IB-01-data-foundation.md` | Pass |
| DATA-006 | Recovery | migration 或配置失败有备份点/前向修复说明，不破坏旧 Demo | `evidence/IB-01-data-foundation.md`、`evidence/IB-07-staging-foundation-2026-07-27.md`；含本机/COS 自动备份与 COS 下载恢复 drill | Pass |

## C. Interview Persistence

| ID | Dimension | Acceptance Criterion | Evidence Form | Status |
| --- | --- | --- | --- | --- |
| SESSION-001 | Functional | 登录且已同意用户可创建 draft session；创建、额度占用与开始事件原子提交 | API + DB query | Pass |
| SESSION-002 | Integration | profile/questions/answers/report 按既有 schema 持久化并用 questionId 对齐 | E2E + DB query | Pass |
| SESSION-003 | Reliability | 刷新、重登或 Node 重启后可恢复已提交会话 | Browser E2E | Partial |
| SESSION-004 | Error | DB 写入失败时保留客户端 Draft，不伪造里程碑或完成事件 | `evidence/IB-03-interview-persistence.md` + browser/DB fault evidence | Pass |
| SESSION-005 | Concurrency | expectedVersion 冲突返回 409，不能覆盖较新数据 | Concurrent update test | Pass |
| SESSION-006 | Contract | 非法状态回退、非法 questionId、schema 无效被拒绝 | API tests | Pass |
| SESSION-007 | Compatibility | 现有 profile/questions/report/TTS/STT/复制契约和 fallback 继续通过 | Existing smoke + contract diff | Pass |
| SESSION-008 | Traceability | LLM/fallback 来源、耗时和 usage 可追踪且不含正文 | `evidence/IB-03-interview-persistence.md` + `evidence/IB-06-admin-observability.md` + `evidence/IB-07-staging-foundation-2026-07-27.md`；唯一一次 staging fixture 调用取得真实 latency、attempts=1、provider usage 和匹配 requestId，输出无业务正文 | Pass |
| SESSION-009 | Quota/Idempotency | 默认每账号 3 次；相同创建 key 重试不重复扣减，第 4 个新请求被拒绝，既有 Session 仍可继续 | Concurrent DB/API replay | Pass |

## D. Consent And Deletion

| ID | Dimension | Acceptance Criterion | Evidence Form | Status |
| --- | --- | --- | --- | --- |
| CONSENT-001 | Functional | 未同意当前版本不能开始新会话 | `evidence/IB-04-consent-deletion.md` | Pass |
| CONSENT-002 | Functional | 同意记录包含 user、版本、scope、时间、requestId | `evidence/IB-04-consent-deletion.md` | Pass |
| CONSENT-003 | Idempotency | 重复接受同版本不生成冲突记录 | `evidence/IB-04-consent-deletion.md` | Pass |
| CONSENT-004 | Versioning | 新协议版本要求重新同意，历史记录保留 | `evidence/IB-04-consent-deletion.md` | Pass |
| CONSENT-005 | Functional | 用户可提交删除请求并查看状态 | `evidence/IB-04-consent-deletion.md` | Pass |
| CONSENT-006 | Privacy | 管理员能执行一次删除演练，正文删除且保留最小审计摘要 | `evidence/IB-04-consent-deletion.md` | Pass |

## E. Feedback And Events

| ID | Dimension | Acceptance Criterion | Evidence Form | Status |
| --- | --- | --- | --- | --- |
| FEED-001 | Functional | 报告页可提交 1–5 星和可选 500 字内反馈 | `evidence/IB-05-feedback-events.md` | Pass |
| FEED-002 | Error | 非 owner、无报告、非法评分或超长评论被拒绝 | `evidence/IB-05-feedback-events.md` | Pass |
| FEED-003 | Idempotency | 重复提交返回既有反馈，不重复计数 | `evidence/IB-05-feedback-events.md` | Pass |
| FEED-004 | Product | 不提交反馈仍可查看和复制报告 | `evidence/IB-05-feedback-events.md` | Pass |
| FEED-005 | Privacy | admin 聚合默认不返回反馈对应的用户正文 | `evidence/IB-05-feedback-events.md` | Pass |
| EVENT-001 | Contract | 服务端事件名称和 properties 符合 allowlist | `evidence/IB-05-feedback-events.md` | Pass |
| EVENT-002 | Security | 客户端不能伪造 userId/schoolId 或 server-only 完成事件 | `evidence/IB-05-feedback-events.md` | Pass |
| EVENT-003 | Idempotency | 重放相同事件不重复计数 | `evidence/IB-05-feedback-events.md` | Pass |
| EVENT-004 | Consistency | dashboard 完成率与业务表抽样结果一致 | `evidence/IB-05-feedback-events.md` | Pass |

## F. Observability And Admin

| ID | Dimension | Acceptance Criterion | Evidence Form | Status |
| --- | --- | --- | --- | --- |
| OBS-001 | Functional | 前端未捕获异常和服务端异常进入监控平台 | `evidence/IB-06-admin-observability.md` | Partial |
| OBS-002 | Privacy | 监控事件不含简历/JD/答案/报告/OTP/token/密钥全文 | `evidence/IB-06-admin-observability.md` | Partial |
| OBS-003 | Traceability | API response、结构化日志和监控可用 requestId 关联 | `evidence/IB-06-admin-observability.md` | Partial |
| OBS-004 | Alerting | 登录不可用、关键 API 高失败率和数据库错误能触发告警 | `evidence/IB-06-admin-observability.md` + `evidence/IB-07-staging-foundation-2026-07-27.md`；本机 readiness/backup 检查已实现，仍缺应用/DB/备份失败外部告警 | Partial |
| OBS-005 | Metrics | 管理页展示注册、开始、完成、失败、fallback、反馈和用量 | `evidence/IB-06-admin-observability.md` | Pass |
| OBS-006 | Performance | 关键 API 记录 P50/P95 或可计算原始耗时 | `evidence/IB-06-admin-observability.md` | Pass |
| ADMIN-001 | Functional | admin 可创建/停用学校和邀请码并查看用量 | `evidence/IB-06-admin-observability.md` + browser/DB audit | Pass |
| ADMIN-002 | Authorization | 普通 user 无法访问管理页面、API 和聚合原始数据 | `evidence/IB-06-admin-observability.md` | Pass |
| ADMIN-003 | Privacy | 管理页默认不显示用户正文 | `evidence/IB-06-admin-observability.md` | Pass |
| ADMIN-004 | Audit | 邀请码、角色、删除操作有 admin/requestId/时间/结果 | `evidence/IB-06-admin-observability.md` | Pass |
| ADMIN-005 | Error | 管理依赖失败显示可恢复错误，不执行部分危险操作 | `evidence/IB-06-admin-observability.md` | Pass |

## G. Compatibility And Security

| ID | Dimension | Acceptance Criterion | Evidence Form | Status |
| --- | --- | --- | --- | --- |
| COMP-001 | Compatibility | 新依赖和环境变量缺失时构建给出明确错误或受控禁用，不泄密 | `evidence/IB-01-data-foundation.md` | Pass |
| COMP-002 | Contract | 原 `CommonResponse`、稳定枚举和 questionId 语义未漂移 | `evidence/IB-07-local-security-contract.md` | Pass |
| COMP-003 | Compatibility | Azure/Web Speech、STT 手动编辑、流/非流报告和复制兜底继续通过 | `evidence/IB-07-local-compatibility.md` | Pass |
| COMP-004 | Compatibility | classic/figma/juju 三主题的主闭环不因认证/持久化接线破坏 | `evidence/IB-07-local-compatibility.md` | Pass |
| SEC-001 | Security | secret/service key 不进入客户端 bundle、日志或文档 | `evidence/IB-07-local-security-contract.md` | Pass |
| SEC-002 | Security | IDOR、角色伪造、非法 owner 字段和跨学校查询被阻断 | `evidence/IB-07-local-security-contract.md` | Pass |
| SEC-003 | Security | Auth/feedback/event/admin 写接口具备 schema、body size 和限流保护 | `evidence/IB-07-local-security-contract.md` | Pass |
| SEC-004 | Security | 管理员密钥或 role 变更只能通过受控服务端流程 | `evidence/IB-07-local-security-contract.md` | Pass |
| SEC-005 | Privacy | 生产错误响应不暴露数据库/provider 原始细节 | `evidence/IB-04-consent-deletion.md` | Pass |
| SEC-006 | Recovery | 可关闭新持久化/管理功能且保留旧 Demo 回归路径 | `evidence/IB-07-staging-foundation-2026-07-27.md`；候选经 HTTPS 切换验证后恢复上一稳定版本，回滚根路径 200、旧版 health 404 | Pass |

## H. Pilot Release

| ID | Dimension | Acceptance Criterion | Evidence Form | Status |
| --- | --- | --- | --- | --- |
| PILOT-001 | Gate | 所有 P0 Contract/Functional/Security Must 行通过后才能进入 10–20 人灰度 | Matrix review | Pending |
| PILOT-002 | 10–20 users | 无数据串用户、无未处理严重错误、登录与主闭环可用 | Pilot report | Pending |
| PILOT-003 | 50 users | 完成率、失败率、OTP 和告警达到当前阈值 | Metrics snapshot | Pending |
| PILOT-004 | 100 users | 容量、成本、隐私和运营流程可持续 | Release decision record | Pending |
| PILOT-005 | Recovery | 每档均有暂停邀请、回滚版本和用户通知方式 | Runbook drill | Pending |
