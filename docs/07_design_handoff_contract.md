# Design Handoff Contract

> 该文档用于和设计师对齐 Figma 交付范围。开发先按稳定结构实现，设计稿到位后替换视觉。

## 1. 必须交付的页面

| 页面 | 用途 | 必要状态 |
| --- | --- | --- |
| Setup | 输入简历/JD、选择面试官、使用样例 | empty、invalid、ready |
| Profile/Question Loading | AI 生成画像和题目 | loading、error、fallback |
| Interview | TTS 提问、答题、切题 | idle、speaking、recording、stt failed、tts failed |
| Report | 单题复盘、总报告、复制 | loading、success、copy success、copy failed |

## 2. 必须交付的组件

| 组件 | 开发说明 |
| --- | --- |
| 面试官选择器 | 3 个固定风格，使用稳定 id |
| AI 面试官头像 | 支持 idle/speaking/thinking 状态 |
| 声波/频谱动画 | 状态驱动伪动画，不是真实波形 |
| 问题卡片 | 支持当前题、已完成、跳过 |
| 答题输入区 | 支持 STT 结果编辑和纯文本输入 |
| 报告卡片 | 支持分数、风险标签、致命问题、优化答案 |
| 复制按钮 | 支持 success/failed 状态 |

## 3. Design Tokens

建议设计稿至少给出：
- 颜色：primary、danger、success、warning、surface、border、text。
- 字体：标题、正文、辅助文本、按钮。
- 间距：4/8/12/16/24/32。
- 圆角：按钮、输入框、卡片。
- 阴影：浮层或重点卡片。
- 动效：speaking、thinking、loading。

## 4. 开发侧限制

- 不为了视觉效果改变 API 字段。
- 不把风格中文名写死为逻辑判断。
- 不隐藏异常态入口。
- 移动端 H5 必须能完成主流程。

## 5. Figma 到位后的替换步骤

1. 对照 Figma 确认页面和组件是否覆盖本文档状态。
2. 先建立 token，再替换组件样式。
3. 保持业务组件 props 不变。
4. 桌面和手机各跑一遍完整演示样例。
5. 截图补到验收记录。
