# 演示兜底样例包 Contract

> 对产品和设计沟通时使用“演示兜底样例包”，不要用 mock 作为主要表达。它的作用是保证 Demo 稳定，并给产品一个可替换的标准样例。

## 1. Why

Hackathon 展示不能完全依赖实时 AI、浏览器 STT、网络和第三方 TTS。演示兜底样例包用于：
- 一键填充简历/JD。
- AI 失败时继续主流程。
- 设计稿开发时提供稳定内容。
- 验收时提供可重复样本。

## 2. Exit Condition

演示兜底样例包可以保留为“示例填充”功能，但不能替代真实生成。退出条件：
- 真实 profile/question/report 接口都可用。
- 故障时仍有用户可理解的错误和重试入口。
- Demo 样例只在用户主动点击或服务失败降级时使用。

## 3. Required Fields

```json
{
  "scenarioId": "frontend_newgrad_product_ops",
  "label": "应届生求职产品运营",
  "resumeText": "string",
  "jdText": "string",
  "defaultInterviewerStyleId": "strictHr",
  "candidateProfile": {},
  "questions": [],
  "sampleAnswers": [],
  "report": {}
}
```

## 4. Suggested First Scenario

| Field | 建议 |
| --- | --- |
| 人设 | 应届生/转岗候选人 |
| 岗位 | 产品运营/用户增长/产品经理助理 |
| 简历特点 | 有校园项目、实习、数据分析、活动运营经历 |
| JD 特点 | 要求用户洞察、数据分析、跨团队沟通 |
| 风险点 | 项目成果量化不足、个人贡献不清、岗位理解泛泛 |
| 演示价值 | 三种面试官都能问出差异化问题 |

## 5. Product Replaceable Content

产品后续只需要替换这些内容：
- 简历文本
- JD 文本
- 3 道标准题
- 标准答案
- 报告文案
- 面试官展示名称和描述

开发不依赖产品提供字段结构。
