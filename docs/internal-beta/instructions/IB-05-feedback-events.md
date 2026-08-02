# Development Instruction: IB-05 · 报告反馈与产品事件

## 0. 元信息

- 任务类型：Feature
- 风险等级：L2
- 基线：IB-03 完成 commit
- 权威契约：Data Contract §3.7–§3.8；API Contract §4–§8
- 验收：FEED-001–FEED-005、EVENT-001–EVENT-004

## 1. 本次目标

报告页可自愿提交 1–5 星和一句话反馈；系统以稳定、去重、脱敏的 server/client 事件记录内测漏斗、失败和 usage，为看板提供唯一口径。

## 2. 非目标

- 不强制反馈，不锁住报告和复制。
- 不做复杂问卷、NPS 全套、用户访谈或第三方 BI。
- 不允许客户端声明 `session_completed` 等权威业务事件。

## 3. 开工前只读侦察

核对 `ReportPanel` 三主题、报告完成/复制状态、所有 LLM/TTS/STT 服务入口、requestId 生成和当前日志。列出每个事件真实 producer。

## 4. 验收标准

| ID | 验收标准 | 证据 |
| --- | --- | --- |
| FEED-001 | 报告页可提交 1–5 星和可选 500 字内反馈 | Browser E2E |
| FEED-002 | 非 owner、无报告、非法评分或超长评论被拒绝 | API tests |
| FEED-003 | 重复提交返回既有反馈，不重复计数 | API/DB test |
| FEED-004 | 不提交反馈仍可查看和复制报告 | Browser E2E |
| FEED-005 | admin 聚合默认不返回反馈对应的用户正文 | Admin API snapshot |
| EVENT-001 | 服务端事件名称和 properties 符合 allowlist | Schema tests |
| EVENT-002 | 客户端不能伪造 userId/schoolId 或 server-only 完成事件 | Negative API tests |
| EVENT-003 | 重放相同事件不重复计数 | DB test |
| EVENT-004 | dashboard 完成率与业务表抽样结果一致 | Reconciliation query |

## 5. 硬约束

- feedback 每 session 最多一条；rating 1–5，comment ≤ 500。
- 反馈只允许 owner 的 report_ready/completed session。
- 用户跳过反馈仍可查看、复制、离开。
- 事件使用 allowlist schema；server-only 事件只在成功事务后产生。
- usage 记录数字，不记录 prompt/回答/报告全文。
- client event API 忽略 userId/schoolId，拒绝未知 properties。

## 6. 实施顺序

### 阶段 1：事件 schema/service

- 定义 event names、properties validators、idempotency。
- 在服务端里程碑和依赖 wrapper 接线。

### 阶段 2：feedback API/UI

- API、repository、报告页组件和成功/失败状态。
- 三主题可用，不要求额外设计重构。

### 阶段 3：reconciliation

- 提供完成率/反馈率抽样 SQL。
- 对比业务表、server event 与 client funnel。

## 7. 边界与失败场景

| # | 场景 | 期望行为 | 验证 |
| --- | --- | --- | --- |
| 1 | 非 owner/无报告反馈 | 拒绝 | API |
| 2 | 重复反馈 | 返回已有，不重复计数 | replay |
| 3 | event 重放 | 单条/单次计数 | DB |
| 4 | client 伪造 server event/owner | 拒绝/忽略 | security |
| 5 | 反馈 DB 失败 | 报告仍可用，可重试 | fault |

## 8. 依赖处理

| 依赖 | 状态 | 处理 | 退出条件 | 风险 |
| --- | --- | --- | --- | --- |
| persisted session | IB-03 | Real | report_ready E2E | 旧 Demo 无 sessionId |
| Report UI | Ready | minimal component | 3 themes pass | CSS 回归 |
| Usage source | Existing providers | adapter | numeric fields stable | provider 差异 |

## 9. 测试与验证

- validators、idempotency、owner、state tests。
- report UI E2E：submit/skip/fail/retry。
- event reconciliation query。
- privacy payload review、existing smoke。

## 10. 集成风险

client/server 双计数会污染完成率；权威完成事件只能来自 server。Demo fallback 和真实模型必须分别统计。

## 11. 停止条件

产品要求强制反馈、收集额外敏感问卷、或新增第二套 analytics source 时停止并更新范围。

## 12. 完成输出

报告事件字典、producer、反馈 UI/API、去重与 reconciliation 证据、隐私审查和 Matrix 状态。
