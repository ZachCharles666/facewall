# IB-10 Theme Gate、问卷调研与 Juju 问答回看

## Objective

认证范围收敛到 Juju；Classic 增加可配置问卷；Juju 第一次完成面试后的报告确认动作接入调研解锁，并提供当前会话问答回看。

## Preconditions

- 基线 `release/preview` / `ce883e332d7e41a9374d4a5df2bbffa494f3026a`。
- IB-09 已完成，不重复其浏览器探针。
- 保留 IB-02 以来全部修改。
- 未经授权不得 stage、commit、push、发送 OTP 或真实告警。

## Contract

1. Classic/Figma 不渲染 AuthGate、不启用用户持久化；Juju 保留 AuthGate。
2. Classic 问卷支持 `rating|single|multiple|text`，保存生成版本；生产写入 fail-closed。
3. Juju 报告确认后才查询并展示邀请，只有第一条完成会话且未提交的用户有资格；关闭邀请返回报告，不进入 CV 首页。
4. 服务端验证配置版本、答案、owner、首次完成和唯一提交。
5. Juju 右侧工具按钮只回看当前会话。
6. 回答纳入 RLS、删除事务和事件隐私 allowlist。
7. 本地固定 OTP 只允许非生产显式开启，保留验证码输入/校验但不得调用 SES 或预留发送预算。
8. 登录表单承载用户协议、隐私政策和同意勾选；常规路径不重复展示独立同意页。
9. Juju 语音失败不展示文本框，只展示三种指定提示之一；网络异常 5 秒后退出。
10. 报告问卷按钮固定在可视底部；登录页和邀请码页最终视觉等待产品提供 Figma node 文件。
11. 首场问卷提交前不得创建第 2/3 场面试；刷新或重新登录恢复首场评分报告。提交成功后才解锁剩余会话额度。

## Acceptance And Rollback

- 验收 THEME-001–003、SURVEY-001–007、HISTORY-001。
- 运行 internal-beta、typecheck、build、source/bundle security、diff check。
- DB integration 前 SURVEY-005/006 为 Partial；staging 合法 Session E2E 前 SURVEY-007 为 Pending。
- 关闭 `QUESTIONNAIRE_CONFIG_WRITE_ENABLED` 可冻结配置写入；UI 回滚不得删除 `0012` 表。
- 真实 OTP、邮件、微信或 staging 写入只在新的单独授权后执行。
