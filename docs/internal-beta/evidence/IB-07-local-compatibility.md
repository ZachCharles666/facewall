# IB-07 本地兼容与三主题闭环证据

> 日期：2026-07-26
> 范围：COMP-003、COMP-004 本地浏览器与相邻回归；未发送 OTP，未使用真实用户数据。

## 1. COMP-003 语音、报告与复制

| Check | Result | Evidence |
| --- | --- | --- |
| Azure TTS 配置 | Pass | `/api/azure-status` 返回 configured=true、7 个音色；未输出 key 或配置值。 |
| Azure TTS 真实调用 | Pass | 固定 fixture 文本调用 `/api/tts` 返回 `200 audio/mpeg`、10944 bytes；classic 浏览器人工确认有声。 |
| Web Speech fallback | Pass | development `TTS 失败`注入后，classic 浏览器人工确认自动切换 Web Speech 且有声。 |
| STT 失败保留与编辑 | Pass | classic 填入 fixture 答案后触发 STT 失败，文本仍在；人工追加“本地编辑验收”成功。 |
| 流式报告页面 | Pass | classic 默认生成路径进入报告页，问题和答案未丢失。 |
| 非流式报告 | Pass | `smoke:contract` 覆盖 `/api/report/generate`、stream error 和 fallback after fault。 |
| 复制成功 | Pass | classic 浏览器一键复制成功。 |
| Clipboard fallback | Pass | development Clipboard 故障后出现手动复制提示与文本框，报告仍可查看。 |

测试电脑没有麦克风，因此没有把“真实录音转写成功”冒充为本轮证据。本行验收的是既有 STT 失败保留/手动编辑兼容；真实 Azure STT 音频链路仍应在 HTTPS staging 的有麦克风设备上复验。

## 2. COMP-004 三主题主闭环

| Theme | Result | Browser evidence |
| --- | --- | --- |
| classic | Pass | 3 道题可见；fixture 答案、STT 失败后编辑、报告生成、复制成功和 Clipboard fallback 完成。 |
| figma | Pass | 无麦克风时进入文字回答兜底；3 题逐题输入并完成，自动进入报告，复制成功。 |
| juju | Pass | 无麦克风时进入文字回答兜底；3 题逐题输入并完成，自动进入报告，复制成功；输入框、提示与按钮配色清晰且无遮挡。 |

本轮发现 figma/juju 原录音态在 speech input 不可用时只有错误提示，没有可填写的答案入口。修复后：

- `failed`/`unsupported` 状态显示“改用文字回答”；
- 输入更新当前 questionId 的客户端 Draft，标记为 text/manual 路径；
- 点击中间按钮继续下一题，第三题后按原状态机生成报告；
- 文字兜底出现时隐藏录音圆环/计时，避免遮挡；
- 新增静态回归防止后续视觉改版删除这条兜底。

## 3. 自动化与工程验证

| Command / check | Result |
| --- | --- |
| `npm run test:internal-beta` | Pass；57/57 |
| `npm run smoke:contract -- http://127.0.0.1:3000` | Pass；profile/questions/report stream/non-stream/regenerate/copy/TTS fault |
| `npm run typecheck` | Pass |
| `npm run build` | Pass；33 routes |
| `npm run security:check` | Pass；181 个 source/docs/scripts/example 文件 |
| `npm run security:bundle` | Pass；58 个 production client bundle 文件，已配置敏感值命中 0 |
| `git diff --check` | Pass；仅既有 LF/CRLF 转换提示 |

## 4. 边界

- 浏览器 fixture 仅在 development 且显式 `INTERNAL_BETA_BROWSER_FIXTURES=true` 时可用。
- 自动签名 fixture Cookie 只用于本地兼容测试，不是 OTP 登录证据。
- SESSION-003 退出重登、AUTH-001 邮箱矩阵、AUTH-006 HTTPS Secure Cookie、SESSION-008 真实 LLM usage、OBS 真实平台和 SEC-006 staging 回滚均未因此升级。
