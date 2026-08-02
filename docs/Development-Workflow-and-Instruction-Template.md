# 新增功能 / 优化重构开发流程与 Instruction 模板

> 用途：复制到其他项目，作为 AI coding agent（Codex、Claude Code 等）的直接开发指令模板。
> 原则：先确认事实与验收，再改代码；以可复查证据定义完成，不以“代码已写完”定义完成。

---

## 1. 当前推荐流程

### 1.1 统一主流程

无论是新增功能、缺陷优化还是架构重构，都走下面的主流程：

1. **任务归类**
   - Feature：新增用户可感知能力或新业务闭环。
   - Fix / Optimization：保持外部契约，修复错误或改善性能、稳定性、体验。
   - Refactor / Migration：调整内部边界、数据模型或 source of truth，默认保持现有行为兼容。
2. **只读侦察（Recon）**
   - 读取项目规则、相关设计、相关代码和测试。
   - 记录真实入口、调用链、数据落点、外部契约、现有测试与已知风险。
   - 将概念分类为：已实现、部分实现、仅文档存在、需保留的旧行为、待迁移的旧行为。
3. **技术栈适配核对（Stack Fit Gate）**
   - 在冻结架构或安装依赖前，核对目标用户地域、网络可达性、主要邮箱/终端/浏览器、第三方服务地域与合规边界。
   - 对登录、支付、短信/邮件、存储、数据库等关键依赖，核对真实能力、送达率/成功率、配额、价格、审核周期、故障兜底和迁移退出成本。
   - 至少列出一个候选方案对比，并给出真实集成验证样本；不能用“框架支持”代替“目标用户可用”。
   - 关键事实未确认时只允许做可替换接口或本地验证，不进入不可逆的数据迁移和业务接线。
4. **定义本轮完成标准**
   - 明确目标、非目标、允许改动、禁止改动。
   - 将需求转成验收条目：正常路径、异常路径、集成、兼容性/契约。
   - 每个验收条目指定证据：测试、日志、API 响应、截图、数据库查询或构建产物。
5. **锁定约束**
   - 明确接口、数据结构、状态流转、错误语义、幂等、超时/重试和 source of truth。
   - 未决问题若会改变方案，先停止并请求决策；普通实现细节可按最小改动原则处理。
6. **拆成可验证阶段**
   - 每阶段只完成一个内聚目标。
   - 每阶段都有独立测试和停止点。
   - 高风险模块优先尽早做局部集成，不等全部模块完成后再联调。
7. **实施**
   - 先补或锁定现有行为测试，再做最小实现。
   - 优先使用真实依赖；不可用时才用 stub/fake；mock 只用于隔离测试。
   - 不静默扩大范围，不顺手重写无关模块。
8. **分层验证**
   - 相关单测/契约测试。
   - 受影响模块测试。
   - 全量或兼容性回归。
   - 必要时做真实集成/E2E，并验证数据库、文件、队列、日志等真实落点。
9. **集成恢复**
   - 检查命名、错误映射、超时、重试、幂等、状态转换、回滚、日志链路和测试数据一致性。
   - 替换临时 stub/mock；无法替换的必须登记退出条件和风险。
10. **交付收口**
   - 按验收条目逐项给出 Pass / Fail / Deferred 与证据。
   - 汇报变更文件、行为变化、测试结果、兼容性结果、source of truth、遗留风险和下一步。

### 1.2 新增功能的额外要求

- 先写清用户入口、主闭环和用户可见结果。
- 明确新 API、事件、数据字段、权限和失败反馈。
- 前后端、异步任务、持久化任一跨边界点都要有集成验收。
- 新枚举、状态、todo/event type 等跨层字段必须检查所有消费者。
- 不只测试 happy path；至少覆盖输入无效、依赖失败、重复请求和权限/资源不存在。

### 1.3 优化 / 缺陷修复的额外要求

- 先复现问题并保存失败证据。
- 写明根因，不只描述症状。
- 优先增加一个“修复前失败、修复后通过”的回归测试。
- 默认不改变公开接口和无关行为。
- 性能优化必须提供前后对比口径；稳定性优化必须提供故障注入或失败路径证据。

### 1.4 重构 / 迁移的额外要求

- 文档中的目标架构不等于代码中已经实现。
- 开工前明确旧 source of truth、新记录的角色（source / mirror / query / draft）。
- 推荐迁移顺序：
  1. 用测试锁定旧行为。
  2. 增加最小新边界、适配器或新记录。
  3. 让一个调用方通过新边界。
  4. 保留兼容路径并验证双轨一致性。
  5. 新路径稳定后再讨论切换 source of truth。
  6. 有迁移证据、回滚方案和完整回归后才能删除旧路径。
- 若新旧写入并存，必须明确事务、失败隔离、漂移检测与修复方式。

---

## 2. 直接用于开发的完整 Instruction 模板

复制下面代码块，替换 `<...>`。没有内容的可选项写“无”，不要删除必填章节。

```md
# Development Instruction: <任务 ID> · <任务名称>

## 0. 元信息

- 任务类型：Feature / Fix / Optimization / Refactor / Migration
- 风险等级：L1 / L2 / L3
  - L1：核心闭环且跨模块/系统边界
  - L2：核心闭环或跨边界，满足其一
  - L3：非核心闭环且不跨边界
- 执行人/Agent：<名称>
- 工作目录：<repo absolute path>
- 基线分支/commit：<branch / commit>
- 权威需求/契约：
  - <path or URL>
- 相关验收矩阵：
  - <path + row IDs>

## 1. 本次目标

<用一段话描述本轮交付后，系统新增或保持了什么可观察能力。>

## 2. 非目标

- <本轮明确不做的事项>
- <禁止顺手扩展的相邻范围>

## 3. 开工前只读侦察

先读取并核对：

1. 项目级规则：<AGENTS.md / CLAUDE.md / CONTRIBUTING.md 等>
2. 相关设计与契约：<paths>
3. 当前入口与调用链：<expected files or symbols>
4. 当前测试与测试命令：<paths / commands>
5. 当前工作区：运行 `git status --short`，不得覆盖用户已有改动。

输出简短事实清单后再修改代码：

| 概念/行为 | 当前分类 | 证据（file:line / test） | 本次处理 |
| --- | --- | --- | --- |
| <item> | 已实现 / 部分实现 / 仅文档 / 旧行为保留 / 旧行为待迁移 | <evidence> | <action> |

若侦察结果与本 Instruction 的关键假设冲突，停止实施并报告冲突，不自行重定义需求。

## 3.1 技术栈适配核对

| 维度 | 目标环境事实 | 候选方案与证据 | 结论/门禁 |
| --- | --- | --- | --- |
| 用户地域与网络 | <where/users/network> | <official docs + probe> | <pass/fail> |
| 关键外部服务 | <email/SMS/auth/DB/etc.> | <capability/quota/SLA> | <choice> |
| 真实终端/账号样本 | <mail domains/devices/browsers> | <test matrix> | <required pass> |
| 数据地域与合规 | <retention/region/access> | <provider controls> | <constraint> |
| 成本与容量 | <expected users/QPS/storage> | <estimate/limits> | <budget gate> |
| 故障与退出 | <outage/migration scenario> | <fallback/export/replace> | <stop condition> |

涉及关键用户入口时，至少完成一个真实依赖的最小探针；若受账号、域名审核或生产配置阻塞，必须登记 owner、预计完成时间和 mock/fake 的退出条件。

## 4. 验收标准

| ID | 维度 | 验收条件 | 证据形式 |
| --- | --- | --- | --- |
| A-001 | Functional | <正常路径的可观察结果> | <test/API/log/screenshot> |
| A-002 | Error Path | <异常输入或依赖失败时的行为> | <test/log> |
| A-003 | Integration | <跨模块或跨系统链路结果> | <integration/e2e> |
| A-004 | Contract | <接口、数据或状态契约不漂移> | <contract test/diff> |
| A-005 | Compatibility | <旧行为或公开接口保持兼容> | <regression suite> |

完成定义：所有 Must 验收项都有可复查证据；不得只报告“实现完成”。

## 5. 硬约束

### 5.1 接口契约

- <endpoint / function / event signature>
- 输入：<schema / validation>
- 输出：<schema>
- 错误：<codes / exceptions / retry semantics>

### 5.2 数据契约

- <table/model/field/type/nullability/default/uniqueness>
- 命名规则：<camelCase / snake_case / enum values>
- 迁移要求：<upgrade + downgrade / backfill / compatibility>

### 5.3 状态与一致性

- Source of truth：<current authoritative source>
- Mirror / Query / Draft：<if any>
- 状态流转：<allowed transitions>
- 事务/原子性：<what commits or rolls back together>
- 幂等：<idempotency key or repeat behavior>
- 并发策略：<lock/version/last-write-wins/etc.>

### 5.4 允许改动

- <files/modules/behaviors in scope>

### 5.5 禁止改动

- 不改变 <public API / frontend behavior / legacy path>。
- 不删除 <compatibility path>。
- 不引入 <new framework/service/table>，除非本 Instruction 明确要求。
- 不修改与本任务无关的模块。

## 6. 实施范围与顺序

### 阶段 1：<锁定事实或基线>

- <implementation item>
- 验证：<command / expected result>
- 完成后停止点：<what must be reviewed>

### 阶段 2：<最小实现>

- <implementation item>
- 验证：<command / expected result>
- 完成后停止点：<what must be reviewed>

### 阶段 3：<接线与集成>

- <implementation item>
- 验证：<command / expected result>
- 完成后停止点：<what must be reviewed>

不要提前实施下一阶段内容。

## 7. 边界与失败场景

L1 至少 5 项，L2 至少 3 项，L3 至少 1 项。

| # | 场景 | 期望行为 | 验证方式 |
| --- | --- | --- | --- |
| 1 | 空值/缺失资源 | <behavior> | <test> |
| 2 | 非法输入/非法状态 | <behavior> | <test> |
| 3 | 依赖超时或失败 | <behavior> | <test/fault injection> |
| 4 | 重复请求/重试 | <behavior> | <idempotency test> |
| 5 | 并发或部分写入失败 | <behavior> | <transaction/concurrency test> |

## 8. 依赖处理

优先级：真实依赖 > 最小 stub/fake > mock。

| 依赖 | 当前状态 | 处理方式 | 退出条件/替换计划 | 遗留风险 |
| --- | --- | --- | --- | --- |
| <dependency> | Ready/Not Ready | Real/Stub/Fake/Mock | <condition> | <risk> |

任何 mock 若跨过本轮仍存在，必须登记替换负责人/时机和风险。

## 9. 测试与验证

按顺序执行：

1. 基线/复现：`<command>`，预期 `<result>`。
2. 目标单测：`<command>`。
3. 相关模块测试：`<command>`。
4. 契约/迁移测试：`<command>`。
5. 集成或 E2E：`<command or manual steps>`。
6. 全量/兼容回归：`<command>`。
7. 静态检查/构建：`<command>`。

禁止：

- 不得因目标测试通过而忽略同次运行中的其他失败。
- 不得把 mock 测试等同于真实集成通过。
- 不得在未检查真实落点（DB/文件/消息/日志/API）时宣称 E2E 通过。

## 10. 集成风险

| 风险 | 影响 | 缓解措施 | 验证 |
| --- | --- | --- | --- |
| <risk> | <impact> | <mitigation> | <test/evidence> |

至少检查：字段命名、错误映射、超时/重试、幂等、状态转换、事务回滚、日志 trace id、fixture 一致性。

## 11. 变更控制与停止条件

遇到以下情况立即停止并报告：

- 前置条件或基线测试不满足。
- 当前代码事实与关键契约冲突。
- 必须改变公开接口或删除旧兼容路径才能继续。
- Source of truth 不明确。
- 任务范围外测试失败且根因不明。
- 需要新增依赖、基础设施或不可逆迁移，但未获授权。

若发现契约缺口：

1. 记录 `Gap / Risk / Change Request`。
2. 先更新或确认契约。
3. 再更新本 Instruction 和实现。
4. 禁止在代码里静默拍板。

## 12. 完成时必须输出

1. 变更文件清单。
2. 行为变化与明确未变化的行为。
3. 新增/修改的接口、模型、迁移或配置。
4. 新增测试及覆盖场景。
5. 实际运行的命令和逐项结果。
6. 全量/兼容回归结果。
7. 每条验收标准的 Pass / Fail / Deferred 与证据。
8. 当前 source of truth 及 mirror/query 状态。
9. 未解决风险、仍存的 stub/mock 及退出计划。
10. 建议的下一步。
```

---

## 3. 三种任务的专用补充块

将对应补充块粘贴到完整模板的“硬约束”之后。

### 3.1 Feature 补充块

```md
## Feature 专用约束

- 用户入口：<入口>
- 主闭环：<action → system → result>
- 权限边界：<who can do what>
- 前后端字段映射：<mapping>
- 新增状态/枚举/event/todo type 的全部生产者与消费者：<list>
- 发布/回滚开关：<feature flag or rollback>
- 可观测性：<log/metric/trace>
```

### 3.2 Fix / Optimization 补充块

```md
## Fix / Optimization 专用约束

- 问题复现：<steps + failing evidence>
- 根因假设：<root cause; implement only after evidence>
- 不变量：<behaviors that must not change>
- 回归测试：必须先证明修复前失败、修复后通过
- 若为性能优化：
  - 指标：<latency/memory/throughput/etc.>
  - 测量环境：<environment>
  - 基线：<before>
  - 目标：<after or threshold>
```

### 3.3 Refactor / Migration 补充块

```md
## Refactor / Migration 专用约束

- 目标 bounded context / 模块边界：<scope>
- 当前 source of truth：<legacy source>
- 目标 source of truth：<target or "本轮不切换">
- 新记录角色：Source / Mirror / Query / Draft
- 旧行为保留清单：<list>
- 迁移模式：test-lock → adapter/mirror → one caller → dual-run verify → cutover → deprecate
- 双写失败语义：<best-effort or atomic>
- 漂移检测：<comparison job/query/test>
- 回滚方案：<rollback>
- 删除旧路径的前置条件：<evidence + approvals>
```

---

## 4. 小任务快速版（可直接粘贴）

仅适合边界明确、改动很小的 Feature/Fix；跨模块重构不要使用快速版。

```md
任务：<一句话任务>

先只读检查项目规则、相关代码、调用方和现有测试；用 file:line 给出当前事实。保护工作区已有改动。

目标：
- <observable outcome>

非目标：
- <out of scope>

硬约束：
- 保持 <API/data/behavior> 兼容。
- 只修改 <scope>。
- 不增加无关依赖或重写相邻模块。

验收：
1. 正常路径：<criterion + evidence>
2. 异常路径：<criterion + evidence>
3. 回归：<criterion + command>

执行：
1. 先复现或运行基线测试。
2. 做最小根因修复/实现。
3. 添加回归测试。
4. 运行目标测试、相关测试和必要的全量回归。

若事实与要求冲突、需改公开契约、测试失败原因不明或范围必须扩大，停止并报告，不静默决策。

完成时报告：变更文件、行为变化、测试命令与结果、验收证据、遗留风险。
```

---

## 5. 迁移到另一个项目时只需替换的内容

1. 项目规则文件和工作目录。
2. 基线分支/commit 与测试命令。
3. 权威需求、Acceptance Matrix、Contract 的路径。
4. 项目真实的 source of truth 和兼容路径。
5. 技术栈相关命令（pytest/npm/gradle/cargo 等）。
6. 项目特有的完成报告格式。

不要直接复制本仓库里的固定通过数量、文件行号、人员名、端口或服务路径；它们属于历史执行上下文，不是模板契约。
