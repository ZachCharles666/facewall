# IB-05 Alpha Acceptance Record · 报告反馈与产品事件

- 日期：2026-07-25
- 目标：自愿反馈、严格事件 allowlist、服务端权威事件、去重与指标对账
- fixture：全部运行时生成的 `example.test` 数据，验证后清理

## Acceptance Summary

| Item | Status | Evidence | Notes |
| --- | --- | --- | --- |
| FEED-001 | Pass | 三主题浏览器 + PostgreSQL reconciliation | figma/juju/classic 均完成 4 星+可选文字、失败后重试并成功保存；每 Session 仅 1 行/1 权威事件 |
| FEED-002 | Pass | DB integration + production HTTP | draft、非 owner、0/6 星、501 字均拒绝 |
| FEED-003 | Pass | DB/API replay | 同 Session 返回原反馈，rating/comment 不覆盖；feedback 行和事件均 1 条 |
| FEED-004 | Pass | 三主题浏览器 + event query | 三主题反馈失败和跳过时报告保持可见、整份报告可复制；skip/view 事件存在 |
| FEED-005 | Pass | admin production API snapshot | 只返回 count、averageRating、星级分布，不含 comment/userId/sessionId |
| EVENT-001 | Pass | schema/static/DB | server/client 名称和 properties 均由代码 allowlist 与 RLS 双重限制 |
| EVENT-002 | Pass | production negative API | 客户端 `session_completed` 返回 400；传入 userId/schoolId 被丢弃，落库 owner 来自 Session |
| EVENT-003 | Pass | DB/API replay | 相同 eventName/idempotencyKey 重放 `recorded=false`，数据库仍 1 条 |
| EVENT-004 | Pass | fixture reconciliation | completed session/event、feedback row/event、report view 均为 1 |

## Event Dictionary And Producers

| Event | Source | Producer | Body policy |
| --- | --- | --- | --- |
| `session_started` | server | 原子 Session create 函数 | schemaVersion、styleId |
| `profile_generated` | server | profile milestone transaction | source；未提供测量时 latency/tokens 为 null |
| `questions_generated` | server | questions milestone transaction | 同上 |
| `answer_saved` | server | answer upsert transaction | questionId、inputMode、durationSec |
| `report_generated` | server | report milestone transaction | source；未提供测量时 latency/tokens 为 null |
| `session_completed` | server | complete transaction | answeredCount、durationSec |
| `feedback_submitted` | server | feedback insert transaction | rating |
| `report_viewed` | client | FeedbackPanel mount | theme |
| `feedback_skipped` | client | 可选跳过按钮 | theme |

客户端 API 还允许 `page_viewed/consent_viewed/copy_succeeded/copy_failed`，但不能声明 server event。所有 client properties 是浅层、每值最多 64 字符，不接受任意正文属性。

## Reconciliation Query

```sql
select
  count(*) filter (where s.status = 'completed') as completed_sessions,
  count(distinct e.session_id) filter (where e.event_name = 'session_completed') as completed_events,
  count(distinct f.session_id) as feedback_sessions,
  count(distinct e.session_id) filter (where e.event_name = 'feedback_submitted') as feedback_events
from public.interview_sessions s
left join public.product_events e on e.session_id = s.id
left join public.feedback f on f.session_id = s.id
where s.school_id = :school_id;
```

自动化 fixture 使用避免 join 放大的分项子查询，结果为：`completed_sessions=1`、`completed_events=1`、`feedback_rows=1`、`feedback_events=1`、`report_views=1`。

## Verification

| Command / check | Result |
| --- | --- |
| `npm run db:migrate` | Pass；应用 `0009_feedback_events.sql` |
| `npm run test:internal-beta` | Pass；38/38 |
| `npm run test:internal-beta:feedback-db` | Pass |
| `npm run smoke:persistence -- http://127.0.0.1:3000` | Pass；完整状态链 + feedback/events production HTTP |
| `npm run typecheck` | Pass |
| `npm run build` | Pass；30 routes |

## Open Risks / Deferred

| Item | Status | Handling |
| --- | --- | --- |
| 三主题浏览器反馈提交/跳过/失败重试 | Closed 2026-07-26 | 实际浏览器交互与 DB 对账通过，FEED-001/004 升 Pass |
| provider usage/latency | Partial under SESSION-008 | 传播与 fixture 对账完成；无真实 provider 配置，不能宣称真实测量 |
| 全量 admin metrics/page | IB-06 | 本阶段只提供脱敏 `feedback-summary`，不提前扩成看板 |

## Post-IB-06 浏览器与事件收敛 · 2026-07-26

- figma、juju、classic 各完成：复制整份报告 → DB feedback 故障 → 报告不阻断 → 跳过 → 关闭故障 → 保存成功。
- DB 每主题 `feedbackRows=1`、`feedbackEvents=1`，失败尝试未生成额外反馈。
- 补齐 `ReportPanel` 的 `copy_succeeded/copy_failed` 发送；只传 `target/theme`。classic 实测落库 `{"target":"full_report","theme":"classic"}`，敏感正文匹配 0。
- figma/juju 补齐“复制整份报告”入口，避免只提供单题复制造成 FEED-004 主题差异。
- PostgreSQL feedback/events integration Pass；52/52 internal-beta Pass。

## IB-07 报告兼容相邻回归 · 2026-07-26

- classic 默认流式路径进入报告页；非流式接口与 stream failure fallback 由 contract smoke 通过。
- classic Clipboard 故障显示手动复制入口且报告不被隐藏。
- figma、juju 在无麦克风文字回答路径完成三题后均自动进入报告并复制成功。
- 本批未改变 feedback/event allowlist 或 FEED 状态；新增兼容守卫后 internal-beta 为 57/57。
