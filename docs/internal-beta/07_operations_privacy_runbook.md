# PassBuddy 受控内测运营与隐私 Runbook

> 适用：staging、10–20 人灰度、50 人放量、100 人受控内测
> 原则：最小权限、最少正文、先暂停新增再处理故障

## 1. Roles

| Role | Responsibility | Prohibited |
| --- | --- | --- |
| Product owner | 范围、协议版本、Go/No-Go | 直接改生产 DB |
| Admin/operator | 学校、邀请码、聚合指标、删除请求 | 默认查看用户正文 |
| On-call developer | 故障、回滚、migration、告警 | 无记录修改角色/数据 |
| Legal/content owner | 隐私文本、保留/删除口径 | 直接修改应用配置 |

至少两人知道暂停邀请和回滚方法；生产 secret 不能通过聊天/文档共享。

## 2. Pre-Opening Checklist

- [ ] 发布 commit、构建时间、migration 版本已记录。
- [ ] 数据库有可恢复备份点。
- [ ] HTTPS、Cookie、站点 URL、腾讯云 SES 发信域名/模板和 Better Auth base URL 正确。
- [ ] QQ、163、两所学校域名各至少 3 次真实 OTP 收件测试通过，并记录延时/垃圾箱。
- [ ] 一个真实 user、第二个真实 user、一个 admin 验证通过。
- [ ] user A 无法访问 user B；user 不能访问 admin。
- [ ] 当前隐私文本和 policyVersion 已由 owner 确认。
- [ ] 邀请码学校、上限、过期时间和负责人已核对。
- [ ] 监控可收到前后端测试异常，告警渠道有人值守。
- [ ] LLM/TTS/STT/DB 故障提示和 fallback 已复验。
- [ ] 数据删除 staging 演练已完成。
- [ ] 暂停邀请、应用回滚和用户通知文本已准备。

## 3. Invite Operations

### Create

1. admin 登录受保护页面。
2. 选择 school，设置 label、批量生成数量、单码 maxUses、单账号 Session 额度和 expiresAt；默认生成 1 条、每条可兑换 1 次、每位用户 3 次 Session。
3. 系统只显示一次本批全部邀请码明文；数据库只保存各邀请码 hash；批量请求必须全量成功或全量回滚。
4. 将明文通过高校约定渠道发放，不写入公开仓库/截图。
5. 记录创建 admin、requestId、用途和目标人数。

### Pause

出现以下任一情况立即停用相关邀请码：

- 数据串用户或疑似越权；
- 登录/报告主闭环大面积不可用；
- 5 分钟内关键 API 最终失败率显著超过阈值；
- 邮件 OTP 大面积无法送达；
- 未处理严重错误；
- 成本/调用量异常增长。

停用只阻止新准入，不应强制踢出正在完成会话的安全用户；是否撤销 Session 由事故级别决定。

### Resume

根因、修复 commit、回归证据、数据影响范围和监控观察窗口齐全后，由产品 owner + 开发共同确认恢复。

## 4. Daily Operating Check

每天至少两次记录：

| Check | Query/Source | Escalate When |
| --- | --- | --- |
| OTP 请求/验证成功率 | admin metrics/Auth audit | 连续窗口低于门槛 |
| 注册与学校分布 | user_profiles/events | 异常学校或超计划 |
| started/completed | server events + sessions | 完成率明显下降 |
| LLM/DB/TTS/STT 失败 | events + monitor | 最终失败高或突增 |
| P50/P95 | metrics/monitor | P95 持续恶化 |
| fallback 使用率 | generation_source | 异常升高 |
| 反馈数/评分 | feedback aggregate | 大量低分需抽样访谈 |
| 未处理严重错误 | monitor issues | 任意 P0/P1 |
| 邀请码剩余量 | invite_codes | 接近上限/异常消费 |
| 预计成本/用量 | usage events | 超预算阈值 |

不把个人正文复制到日报；使用聚合值和内部技术 ID。

## 5. Incident Severity

| Level | Examples | Action |
| --- | --- | --- |
| SEV-0 | 数据串用户、secret 泄露、无法确认数据完整性 | 立即暂停全部邀请码；必要时下线；保存证据；轮换密钥 |
| SEV-1 | 登录或报告大面积不可用、DB 写入失败、严重白屏 | 暂停新增；30 分钟内确定回滚/修复 |
| SEV-2 | 部分浏览器/学校邮件失败、单依赖降级频繁 | 限制范围，24 小时内修复 |
| SEV-3 | 非阻塞 UI/文案/个别反馈问题 | 记录到下一迭代 |

事故记录至少包括：开始/发现/恢复时间、影响用户数、学校、症状、根因、数据影响、处理、证据、后续预防。

## 6. Alert Response

1. 确认告警是测试、噪音还是真实事故。
2. 用 requestId/sessionId 查结构化日志和监控，不查正文。
3. 判断是否需要暂停邀请码。
4. 检查最近发布、migration、外部依赖状态和容量。
5. 选择：重试依赖、关闭 feature flag、应用回滚、前向修复。
6. 验证用户可见路径与 DB 落点。
7. 关闭告警前记录影响与验证证据。

禁止直接在生产表手工“补完成状态”来压低错误率。

## 7. Data Deletion Procedure

### Request

- 用户从产品入口提交；系统生成 deletion request。
- admin 不通过聊天消息直接执行未留痕删除。

### Approve

1. 核验 request 属于当前 Auth user。
2. 冻结用户状态为 `deletion_pending`，阻止开始新会话。
3. 记录审批 admin、requestId、范围和备份策略。

### Execute

1. 使用 server-only admin operation。
2. 删除/匿名化范围：answers、sessions JSON 正文、feedback 关联、consent/profile/Auth identity 等，按实现清单执行。
3. product_events 仅可保留不可重新识别的聚合；不能保留 userId 映射。
4. 监控/日志中如存在用户技术 ID，按平台能力删除或到期处理。
5. 写 `audit_summary`：表名、删除数量、完成时间，不写正文。

### Verify

- 普通/管理员查询均无法得到用户正文。
- 用户 Session 失效。
- 删除请求为 completed。
- 抽样聚合指标不会重新识别该用户。

失败时状态为 failed，记录 failure code 和重试计划；不得标记 completed。

## 8. Privacy Data Inventory

| Data | Location | Retention | Access |
| --- | --- | --- | --- |
| Email/Auth identity | Better Auth auth schema/profile | 内测 + 90 天 | user/admin controlled |
| Resume/JD | interview_sessions | 内测 + 90 天 | owner；admin 默认无正文 |
| Profile/questions/report | JSONB | 内测 + 90 天 | owner |
| Transcript answers | interview_answers | 内测 + 90 天 | owner |
| Feedback | feedback | 内测 + 90 天 | owner + aggregate admin |
| Events/usage | product_events | 内测分析期 | admin aggregate |
| Error telemetry | monitoring | 按平台最短可行周期 | on-call |
| OTP verification/counter | Better Auth verification、哈希日桶 | OTP 时效/运营限额周期 | auth service；删除时清理可关联邮箱项 |
| Deletion audit | deletion_requests | 按审计口径 | admin；完成后无 userId/正文/邮箱 |
| Raw audio | not stored | N/A | N/A |

新增任何用户数据落点必须先更新此表、删除流程和协议 scope。

## 9. Backup And Migration

- 每次 production migration 前确认备份和当前 schema version。
- migrations 只从批准 commit 执行，记录操作者、时间和结果。
- 应用回滚前确认旧应用可读取新 schema；不盲目回滚数据库。
- 破坏性迁移不在本轮默认范围。
- 备份恢复至少在 staging 演练一次。

## 10. Access Review

每周检查：

- admin 用户列表及必要性；
- DB admin、Better Auth、腾讯云 SES、Sentry secret 持有者；
- 邀请码和过期项目；
- 离开团队成员的访问撤销；
- 生产环境是否误开放 classic Prompt/全局配置写入口。

## 11. End-Of-Test Closeout

1. 停止或到期全部邀请码。
2. 导出聚合指标，不导出不必要正文。
3. 处理未完成删除请求和事故。
4. 产品/法务决定 90 天后删除、延长或重新授权。
5. 关闭不再需要的 secret、管理员和告警。
6. 输出内测 Acceptance Record、Known Risks 和下一阶段决策。

## 12. Questionnaire Operations

- `questionnaire_responses` 保留期沿用内测 + 90 天，运营默认只看聚合，不看答案正文。
- 删除请求必须清除该用户问卷回答；审计仅记表名和删除数量。
- Classic 配置写入口在生产默认关闭；临时开启须记录窗口和版本，保存后关闭。
- staging 前应用 migration `0012`，验证 RLS、唯一约束、删除覆盖和事件正文 allowlist。
