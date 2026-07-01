# Design Readiness

> 目标不是重写业务，而是在 Figma 到位后只替换视觉层。当前无 Figma 文件时，先完成可执行的设计接入准备和状态覆盖审查。后续视觉替换已迁移到 Phase 9，最终发布冻结为 Phase 10。

## 1. Phase 和 Step 的关系

早期 Step 是推荐开发顺序，当前 Phase 是本项目实际交付批次。两者关系如下：

| Early Step | 原目标 | 当前 Phase 落点 | 状态 |
| --- | --- | --- | --- |
| Step 1 | 定 TypeScript 类型、JSON Schema、接口合同 | Phase 0、Phase 1、Phase 2 | Done |
| Step 2 | 做演示样例包 | Phase 1 | Done |
| Step 3 | 跑通 Mock 完整链路 | Phase 1 | Done |
| Step 4 | 接 Azure TTS | Phase 3 | Done |
| Step 5 | 接 STT | Phase 3 | Done |
| Step 6 | 替换真实 LLM | Phase 2 已完成接口壳和 provider；真实 key 后还需人工验收 | Mostly Done |
| Step 7 | 套设计稿 | Phase 9 | Pending Figma |
| Step 8 | 做 Demo 兜底 | Phase 1-4 已完成主兜底；Phase 8 做显式故障注入，Phase 10 做最终现场 hardening | In Progress |

结论：
- Step 是策略顺序，Phase 是当前仓库执行计划。
- 早期 Step 6 不等于当前剩余 Phase 6；真实 LLM 的工程接入已在 Phase 2 完成，剩余是带真实 key 的质量验收和 prompt 微调，归入 Phase 10。
- 当前设计工作拆成已完成的 readiness 和后续 Phase 9：readiness 可在无设计稿前完成，Phase 9 必须等 Figma。

## 2. 最终发布验收放在设计稿前还是后

建议最终发布验收 Phase 10 放在 Figma 接入之后。

原因：
- Phase 9 会改视觉层、布局密度、移动端呈现和状态承载位，需要重新跑完整主流程。
- 最终 Demo hardening 应基于最终视觉，否则截图、讲解路径、手机适配和复制入口可能返工。
- 真实 LLM/prompt 质量抽查可以提前做，但正式 Alpha-Demo 验收应在视觉替换后执行。

建议定义：

| Phase | 名称 | 时机 | 内容 |
| --- | --- | --- | --- |
| Phase 5A | Design readiness | Figma 前，已完成 | token 基线、状态审查清单、Demo 脚本 |
| Phase 9 | Figma visual integration | Figma 到位后 | setup/interview/report 视觉替换，状态截图 |
| Phase 10 | Release freeze & acceptance | Phase 6-9 后 | 真实 LLM 三风格验收、现场兜底演练、最终录屏/截图、发布前检查 |

## 3. Design Token Baseline

当前 token 在 `app/globals.css` 的 `:root` 中维护。Figma 到位后优先映射这些变量，不改组件 props 和接口字段。

| Token Group | Current Variables | Figma 对齐要求 |
| --- | --- | --- |
| Color | `--color-bg`, `--color-surface`, `--color-text`, `--color-primary`, `--color-danger`, `--color-warning`, `--color-success` | 提供 normal/soft/border 状态色 |
| Typography | `--font-sans`, `--font-mono`, `--font-size-xs` 到 `--font-size-title`, `--line-*` | 给标题、正文、辅助文本、按钮规格 |
| Spacing | `--space-1` 到 `--space-11` | 使用 4/8/12/16/24/32 等可映射间距 |
| Radius | `--radius-control`, `--radius-card` | 控件和卡片圆角保持 8px 或设计系统值 |
| Shadow | `--shadow-card` | 只用于主面板或重点容器 |
| Layout | `--layout-max`, `--control-height` | 保持桌面和手机 H5 主流程可用 |

## 4. Figma 状态覆盖审查清单

收到设计稿后，先按此清单审查，缺状态时不直接重写业务，按现有契约补最小 UI。

| Area | Required States | Current Dev State | Figma Status |
| --- | --- | --- | --- |
| Setup | empty、invalid、ready、demo filled | 已有 | Pending |
| Profile/Questions | loading、success、error/fallback | 已有全局 status 和兜底路径 | Pending |
| Interview | idle、speaking、recording、stt failed、tts failed、manual edit、missing answer | 已有 | Pending |
| Report | loading、success、generation failed、fallback report、copy success、copy failed、missing answer | 已有 | Pending |
| Mobile H5 | setup/interview/report 主流程无横向溢出 | Phase 3 已验证，Figma 后需重验 | Pending |

## 5. Phase 9 接入规则

1. 先把 Figma 颜色、字号、间距、圆角映射到 `:root` token。
2. 再替换 `SetupPanel`、`InterviewPanel`、`VoiceControls`、`ReportPanel` 的 class 样式。
3. 不改 `lib/types.ts`、`docs/04_api_contracts.md`、Route Handler response shape。
4. 不把中文风格名当逻辑 key。
5. 保留所有异常入口：空输入、LLM 失败、TTS 失败、STT 失败、缺失答案、复制失败。

## 6. 当前结论

- 已完成：token 基线、状态覆盖审查、Demo runbook、剩余 Phase instruction。
- 不能在 Figma 前完成：按 Figma 替换视觉、Figma 状态覆盖验收、最终桌面/手机视觉截图。
- 风险：如果 Figma 改动信息架构或合并页面，需要先更新 `docs/07_design_handoff_contract.md` 和验收矩阵，再改代码。
