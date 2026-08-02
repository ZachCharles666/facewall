# Development Instruction: IB-01 · 托管后端与数据模型

## 0. 元信息

- 任务类型：Feature / Migration
- 风险等级：L1
- 工作目录：`D:\hackthon\facewall`
- 文档基线：`release/preview @ d62daff`；执行前替换为实际批准 commit
- 权威契约：`02_internal_test_contract.md` §3–§7、`03_architecture_and_data_contract.md`
- 验收：DATA-001–DATA-006、COMP-001

## 1. 本次目标

建立 Better Auth/PostgreSQL 的最小生产边界、版本化 migrations、运行时/管理连接和 RLS 基线，使后续身份、持久化、反馈与管理模块使用同一数据 source of truth。

## 2. 非目标

- 不实现登录 UI、OTP 流程、面试持久化接线或管理看板。
- 不删除现有 React state、Demo fallback 或 JSON 文件设置存储。
- 不保存真实用户数据到开发 fixture。

## 3. 开工前只读侦察

读取 `AGENTS.md`、`package.json`、`.env.example`、`lib/types.ts`、`lib/schemas/contracts.ts`、现有 API routes、部署文档和 `git status --short`。输出事实表，确认当前无 DB/Auth 依赖、业务状态仍在 React state。

若仓库已出现其他人新增的数据库/认证实现，停止并对比本 Contract，禁止并行建立第二套数据层。

## 4. 验收标准

| ID | 验收 | 证据 |
| --- | --- | --- |
| DATA-001 | migrations 在空库可顺序应用 | CI/log + schema dump |
| DATA-002 | 用户数据表 RLS 开启且跨用户访问失败 | negative integration tests |
| DATA-003 | snake_case/camelCase 映射稳定 | mapper tests |
| DATA-004 | 邀请码消费函数并发不超发 | concurrency test |
| DATA-005 | schema/log 无 OTP/token/音频正文 | audit |
| DATA-006 | 迁移备份/前向修复和旧 Demo 保留 | runbook/diff |
| COMP-001 | 缺配置时错误明确且不泄密 | config tests |

## 5. 硬约束

- 只新增 `better-auth`、`pg`、`server-only` 和完成本任务所需的最小测试/CLI 依赖；腾讯云 SES SDK留到 IB-02。
- auth/user/admin 边界分文件；数据库和 admin module 标记 server-only。
- DB/Auth secret 不得进入 `NEXT_PUBLIC_*`、客户端 import graph 或日志。
- 表、字段、索引、状态和 RLS 按 `03_architecture_and_data_contract.md`。
- migrations 只做 additive change；不改现有业务 API。
- Better Auth CLI 生成的 auth SQL 必须进入版本控制；provider API 不得散落业务组件。

## 6. 实施顺序

### 阶段 1：配置与 clients

- 增加环境变量校验和 client factories。
- 更新 `.env.example`，只写占位符。
- 验证：typecheck + client/server bundle boundary test。

### 阶段 2：migrations 与 RLS

- 创建 9 张合同表、枚举/check、索引、updated_at 处理和 RLS。
- 实现邀请码原子消费数据库函数。
- 验证：空库 apply + schema/RLS tests。

### 阶段 3：映射与测试基线

- 创建 DB row ↔ domain mapper 边界。
- 增加 internal-beta 测试命令和 fixture factory；fixture 禁止真实正文。
- 验证：DATA-001–DATA-006。

## 7. 边界与失败场景

| # | 场景 | 期望行为 | 验证 |
| --- | --- | --- | --- |
| 1 | 缺公开 URL/key | 构建或运行给出脱敏配置错误 | config test |
| 2 | 客户端 import admin client | 构建/静态测试失败 | bundle test |
| 3 | 用户 A 查询 B | 0 rows/权限拒绝 | RLS test |
| 4 | 同邀请码并发最后一个名额 | 仅一个成功，计数不超限 | concurrency |
| 5 | migration 中途失败 | 可从备份/前向修复恢复 | migration drill |
| 6 | JSONB schema_version 缺失 | mapper/validator 拒绝 | unit test |

## 8. 依赖处理

| 依赖 | 状态 | 处理 | 退出条件 | 风险 |
| --- | --- | --- | --- | --- |
| PostgreSQL | 需配置 | 本地真实 DB + 腾讯云 staging | 空库 migration 通过 | region/VPC/连接数 |
| Better Auth | 新依赖 | Real | 版本锁定、auth schema 生成通过 | CLI/schema 变化 |
| Existing app | Ready | 保持兼容 | 原 smoke 通过 | 环境校验误阻断 Demo |

## 9. 测试与验证

1. 基线：现有 typecheck/build/smoke。
2. migrations apply。
3. schema、mapper、RLS、邀请码并发测试。
4. security check 和客户端 bundle 检查。
5. 全量 build 与既有 smoke。

不得以 mock database 宣称 RLS 或 migration E2E 通过。

## 10. 集成风险

| 风险 | 影响 | 缓解 | 验证 |
| --- | --- | --- | --- |
| secret 泄露 | 严重 | server-only + bundle scan | SEC-001 前置 |
| schema 与现有 types 漂移 | 下游返工 | mapper + schema version | DATA-003 |
| RLS 只测正向 | 越权 | 双用户负向 fixture | DATA-002 |

## 11. 停止条件

Better Auth 锁定版本不能生成所需 PostgreSQL/OTP schema、需要 destructive migration、必须改既有业务 schema、或工作区存在另一套数据实现时停止，先更新 Contract。

## 12. 完成输出

按通用模板报告文件、migration、依赖、配置、命令、Matrix 证据、source of truth、风险和下一步。更新 `docs/todo.md`。
