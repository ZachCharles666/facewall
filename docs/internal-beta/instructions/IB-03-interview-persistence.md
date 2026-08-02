# Development Instruction: IB-03 · 面试主闭环持久化

## 0. 元信息

- 任务类型：Refactor / Migration
- 风险等级：L1
- 基线：IB-01、IB-02 已通过的 commit
- 权威契约：Contract §6、§8–§9；Data Contract §3.5–§6；API Contract §3
- 验收：SESSION-001–SESSION-009、COMP-002–COMP-004

## 1. 本次目标

把已登录用户的已提交训练记录从 React 内存唯一状态迁移为 PostgreSQL source of truth，同时保留 React Draft、现有业务 API、三主题和全部语音/报告兜底。

## 2. 非目标

- 不开发正式用户历史列表。
- 不重写 `InterviewCoachApp` 状态机或视觉层。
- 不保存音频，不删除未登录开发 Demo 路径。

## 3. 开工前只读侦察

绘制 `InterviewCoachApp` setup → profile → questions → answers → report 调用链；核对 `lib/api/client.ts`、现有 Route Handlers、types/schema、Demo fallback、三个主题消费者。先用现有 smoke 锁定旧行为。

## 4. 验收标准

完整引用 SESSION-001–SESSION-009、COMP-002–COMP-004。尤其要求跨刷新/重登恢复、版本冲突、创建幂等/额度原子占用和 DB 写失败不丢 Draft。

## 5. 硬约束

- DB 是已提交记录 source；React state 是未提交 Draft/UI mirror。
- 不改变现有 LLM/TTS/STT/报告请求字段。
- 复杂 JSON 写入前使用现有 validators；增加 schema_version。
- 状态只能按合同前进；expectedVersion 乐观锁。
- 创建 Session 时在同一数据库事务内锁定 profile、校验并占用一次额度、写入 Session 与 `session_started` 服务端事件。
- 同一用户的相同 `idempotencyKey` 重试返回原 Session，不重复占用；默认额度 3 次，第 4 个新 key 返回 `SESSION_QUOTA_EXHAUSTED`。
- 额度耗尽只阻止新建；已存在 Session 的画像、问题、回答、报告和完成写入不得再次检查剩余额度。
- 每个关键写操作同时产生 server event，不能由客户端伪造完成。
- generation_source 明确 `llm/demo_fallback/mixed`。
- feature flag 支持先 mirror、再 read-from-DB、再回滚；旧路径在灰度完成前不得删除。

## 6. 实施顺序

### 阶段 1：persistence service + tests

- 建立 session/answer repository、mapper、状态/版本校验。
- 不接 UI，直接 API/DB 测试。

### 阶段 2：单用户 mirror

- 在里程碑成功后 best-effort/受控写入 DB；记录漂移。
- 对比 React payload 与 DB 快照。
- 停止点：无字段/ID 漂移。

### 阶段 3：切换已登录用户 source

- 创建/恢复 session；刷新和重登拉取快照。
- 写失败保留 Draft并允许重试。
- 停止点：三主题 E2E 与回滚通过。

## 7. 边界与失败场景

| # | 场景 | 期望行为 | 验证 |
| --- | --- | --- | --- |
| 1 | 未同意协议创建 session | 403 CONSENT_REQUIRED | API |
| 2 | DB 写入超时 | Draft 保留，无假完成事件 | fault |
| 3 | 两标签同时更新 | 一个成功，一个 409 reload | concurrency |
| 4 | questionId 不属于会话 | 拒绝且不写 answer | API |
| 5 | LLM fallback | 可保存但 source 明确 | DB query |
| 6 | 重复 create/complete | 幂等，单 session/event | replay |
| 7 | 刷新/重登/Node 重启 | 恢复已提交状态 | E2E |
| 8 | 旧 smoke/Demo 模式 | 行为仍通过 | regression |
| 9 | 同一 create key 并发重放 | 只创建 1 个 Session、只扣 1 次、只写 1 个开始事件 | DB concurrency |
| 10 | 第 4 个新建请求 | 409 SESSION_QUOTA_EXHAUSTED；前三个 Session 仍可继续写入 | API + DB |

## 8. 依赖处理

| 依赖 | 状态 | 处理 | 退出条件 | 风险 |
| --- | --- | --- | --- | --- |
| Auth/profile | IB-02 | Real | owner E2E | Session 过期 |
| DB/RLS | IB-01 | Real | two-user tests | migration drift |
| Existing state | Ready | Adapter/mirror | DB read stable | 双轨漂移 |

## 9. 测试与验证

- 锁定现有 contract smoke。
- repository/state/version/idempotency tests。
- real DB integration、双用户 RLS。
- 完整 setup→report E2E，刷新/重登/重启恢复。
- LLM/DB fault injection。
- 三主题、语音、复制回归。

## 10. 集成风险

最大风险是双轨 source 漂移。mirror 阶段必须有 comparison 输出；切换后禁止 UI 绕过 persistence service 直接写两套状态。外部调用不放在 DB 长事务中。

## 11. 停止条件

必须改变既有报告/问题 schema、需要删除旧路径、无法定义状态 source、或 DB 无法保存完整契约结构时停止。

## 12. 完成输出

报告 source 切换、adapter、feature flag、DB 样例、漂移结果、回滚、Matrix 与既有回归证据。
