# Development Instruction: IB-04 · 隐私同意与删除留痕

## 0. 元信息

- 任务类型：Feature
- 风险等级：L1
- 基线：IB-01、IB-02 已通过的 commit
- 权威契约：Contract §7；Data Contract §3.4、§3.9；API Contract §2
- 验收：CONSENT-001–CONSENT-006、SEC-005

## 1. 本次目标

用户必须同意当前协议版本后才能开始新训练；系统保存不可覆盖的版本化同意证据，并支持用户发起、管理员人工执行且可审计的数据删除请求。

## 2. 非目标

- 不由开发撰写最终法律文本或承诺正式合规结论。
- 不实现自动审批、跨系统法务工单或批量到期删除。
- 不把撤回直接等同于立刻物理删除。

## 3. 开工前只读侦察

核对产品/法务文本来源、登录后路由门禁、session 创建入口、所有用户数据表及级联关系、现有日志。若最终文案未到，允许开发占位文案，但生产灰度前必须替换并冻结 policyVersion。

## 4. 验收标准

| ID | 验收标准 | 证据 |
| --- | --- | --- |
| CONSENT-001 | 未同意当前版本不能开始新会话 | API/browser E2E |
| CONSENT-002 | 同意记录包含 user、版本、scope、时间、requestId | DB query |
| CONSENT-003 | 重复接受同版本不生成冲突记录 | API/DB test |
| CONSENT-004 | 新协议版本要求重新同意，历史记录保留 | Migration/integration test |
| CONSENT-005 | 用户可提交删除请求并查看状态 | Browser/API evidence |
| CONSENT-006 | 管理员能执行一次删除演练，正文删除且保留最小审计摘要 | Staging deletion drill |
| SEC-005 | 生产错误响应不暴露数据库/provider 原始细节 | Fault injection |

删除演练必须使用 staging fixture，不得使用真实用户。

## 5. 硬约束

- 当前协议由服务端配置/版本化文件提供；客户端不能自报当前版本。
- `(user_id, policy_version)` 唯一；重复接受幂等。
- 新版本要求重新同意，历史记录不删除。
- 未同意只阻止“开始新训练”，不应阻止用户访问隐私说明、退出或提交删除请求。
- 删除状态按 Contract；执行操作只允许 admin server route。
- 删除正文后保留无正文 audit summary；不得保留可重新识别用户的冗余副本。

## 6. 实施顺序

### 阶段 1：policy + consent service

- 当前 policy 读取、接受、幂等与版本判断。
- API/DB tests。

### 阶段 2：UI 与业务门禁

- 登录后展示协议；接受后进入业务。
- session create 服务端再次校验，不只做前端门禁。

### 阶段 3：删除请求与演练

- 用户创建/查看请求；admin approve/execute。
- staging fixture 演练并输出表级删除数量。

## 7. 边界与失败场景

| # | 场景 | 期望行为 | 验证 |
| --- | --- | --- | --- |
| 1 | 接受旧版本 | 拒绝并返回当前版本 | API |
| 2 | 重复接受 | 返回同记录 | idempotency |
| 3 | 新版本发布 | 新训练前重新同意 | integration |
| 4 | 未同意直接调用 session API | 403 | negative |
| 5 | 重复删除请求 | 返回现有未结束请求 | API |
| 6 | 删除中部分表失败 | 状态 failed，记录 failure code，可重试 | fault |
| 7 | 普通 user 调执行接口 | 403 | security |

## 8. 依赖处理

| 依赖 | 状态 | 处理 | 退出条件 | 风险 |
| --- | --- | --- | --- | --- |
| 法务文案 | 可能未就绪 | versioned placeholder | 灰度前冻结 | 文案延误 |
| Data schema | IB-01 | Real | cascade map verified | 遗漏副本 |
| Auth/admin | IB-02 | Real | role tests | 越权 |

## 9. 测试与验证

- policy/accept/version/idempotency tests。
- 未同意业务 API 负向测试。
- staging 删除演练、表/日志/监控残留审查。
- typecheck/build/security/existing smoke。

## 10. 集成风险

最大风险是删除范围遗漏和把法务文案责任误归开发。维护一份 user data inventory；新增用户表必须更新删除实现与验收。

## 11. 停止条件

要求自动化法务流程、保存撤回后正文、公开隐私承诺、或数据保留规则改变时停止并更新 Contract。

## 12. 完成输出

报告 policyVersion、门禁、删除表清单、演练结果、遗留文案风险和 Matrix 证据。
