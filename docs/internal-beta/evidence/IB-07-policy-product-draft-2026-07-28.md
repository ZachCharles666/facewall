# IB-07 产品协议草案接入证据 · 2026-07-28

## 结论

- 产品提供的《用户服务协议》《隐私政策》原文已替换开发占位文本。
- 当前服务端协议版本升级为 `2026-07-28-product-draft`；旧版本同意记录继续保留，已有用户必须对新版本重新同意后才能开始新 Session。
- AuthGate 的加载、提示和勾选文案已同时指向《用户服务协议》和《隐私政策》。
- 标题明确标记“产品草案，待专业审核”。本次只证明正文接入和版本门禁，不代表专业法律审查、运营主体确认或数据处理承诺已验真。

## Scope

| Item | Status | Evidence |
| --- | --- | --- |
| 产品原文进入 server-only policy | Pass | `lib/privacy/policy.ts` |
| 新 policyVersion | Pass | `2026-07-28-product-draft` |
| 旧版本用户重新同意 | Pass by contract | consent 查询/写入均使用当前版本；旧记录不覆盖 |
| UI 同时展示两份协议并明确勾选 | Pass locally | `components/auth/AuthGate.tsx` + contract test |
| 专业法律审核 | Pending | 尚未取得专业人士审核结论 |
| 文本与真实能力逐项一致 | Partial | 已识别账号字段、LLM 前脱敏、语音分析、数据库密文、用户权利入口等待核对项；遵照产品决定，本轮不改原文 |
| 运营主体和联系邮箱验真 | Pending | 原文按产品输入保留，尚未取得主体材料或邮箱验证证据 |
| staging 发布与浏览器重新同意 | Pending | 本轮仅完成本地源码接入，未部署、未发送 OTP |

## Verification

| Check | Result |
| --- | --- |
| privacy contract targeted test | 5/5 Pass |
| full internal-beta | 60/60 Pass |
| typecheck | Pass |
| production build | Pass；Next.js 15.5.19，33/33 static generation |
| source security | Pass；190 files |
| client bundle security | Pass；59 bundle files |
| `git diff --check` | Pass |

## Release Impact

- 已推送的 release source commit `19d791f26640edcc583053c4b9f70d4186d1faa4` 及其归档仍是可复查的冻结基线，但不包含本协议草案。
- 最终 promotion 必须从包含本次协议增量的后续确定 commit 重新导出归档、记录 SHA-256，并在 staging 重复最小 smoke。
- 未经用户另行要求，本轮不 stage、commit、push 或修改远端运行时。

## Remaining Gate

1. 专业人士审核并修订正文。
2. 确认实际运营主体、有效联系邮箱和第三方处理清单。
3. 冻结最终版本号；若正文变化，再次升级 policyVersion。
4. 从最终确定 commit 构建并部署 staging。
5. 使用合法登录账号验证新版本重新同意门禁；任何 OTP 发送仍须逐次取得用户明确确认。
