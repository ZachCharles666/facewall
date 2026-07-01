# API Contracts

> 本文件定义开发侧接口契约。即使第一版使用本地假数据，也必须按这些结构返回，避免后续替换真实 AI 服务时重写前端。

## 1. Common Response

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "requestId": "local-uuid"
}
```

失败：

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "LLM_TIMEOUT",
    "message": "生成超时，请重试",
    "retryable": true
  },
  "requestId": "local-uuid"
}
```

## 2. POST /api/profile/parse

### Request

```json
{
  "resumeText": "string",
  "jdText": "string",
  "interviewerStyleId": "strictHr"
}
```

### Response data

```json
{
  "summary": "string",
  "matchedPoints": ["string"],
  "riskPoints": ["string"],
  "keywords": ["string"],
  "evidenceMaterials": [
    {
      "title": "string",
      "source": "resume|jd|inferred",
      "content": "string"
    }
  ],
  "suggestedSupplements": ["string"]
}
```

## 3. POST /api/questions/generate

### Request

```json
{
  "candidateProfile": {},
  "interviewerStyleId": "techBro",
  "questionCount": 3
}
```

### Response data

```json
{
  "questions": [
    {
      "id": "q1",
      "type": "behavior|project|pressure|technical|motivation",
      "title": "string",
      "questionText": "string",
      "intent": "string",
      "expectedSignals": ["string"],
      "difficulty": "easy|medium|hard"
    }
  ]
}
```

## 4. POST /api/report/generate

当前稳定保底接口：非流式 JSON 响应。即使后续新增流式接口，本接口也必须保留，用于本地兜底、浏览器不支持流式、LLM 流式失败后的重试保底和自动化验收。

### Request

```json
{
  "candidateProfile": {},
  "questions": [],
  "answers": [
    {
      "questionId": "q1",
      "answerText": "string",
      "inputMode": "voice|text|edited",
      "durationSec": 72,
      "sttStatus": "success|failed|unsupported|manual"
    }
  ]
}
```

### Response data

```json
{
  "questionReports": [
    {
      "questionId": "q1",
      "score": 76,
      "dimensionScores": {
        "jobRelevance": 20,
        "structure": 15,
        "evidence": 14,
        "professionalExpression": 12,
        "truthBoundary": 8,
        "completeness": 7
      },
      "riskTags": ["缺少量化结果"],
      "fatalIssue": "没有说明个人贡献",
      "diagnosis": "string",
      "optimizedAnswer": "string",
      "oralVersion60s": "string"
    }
  ],
  "finalReport": {
    "overallScore": 78,
    "summary": "string",
    "topRisks": ["string"],
    "actionItems": ["string"],
    "copyText": "string"
  }
}
```

## 4.1 POST /api/report/generate-stream

优先体验接口：流式报告生成。该接口后续实现时必须和 `POST /api/report/generate` 使用同一套 request payload，并最终产出同构的 `InterviewReport`。

### Request

同 `POST /api/report/generate`。

### Response

建议使用 `text/event-stream`。事件必须可被前端增量渲染，也必须能在完成时还原为完整 `InterviewReport`。

```text
event: progress
data: {"stage":"scoring","message":"正在评估第 1 题"}

event: questionReport
data: {"questionId":"q1","partial":true,"diagnosis":"string"}

event: final
data: {"questionReports":[],"finalReport":{}}

event: error
data: {"code":"LLM_PROVIDER_FAILED","message":"报告生成失败，请重试","retryable":true}
```

### Streaming Rules

- `final` event 的 data 必须符合 `InterviewReport` schema。
- 流式失败时前端必须保留问题和答案，并允许调用非流式 `/api/report/generate` 兜底。
- 不允许流式接口返回和非流式接口不同的字段语义。
- 不允许在流式 chunk 中输出 `.env.local` 密钥或 provider 原始错误详情。
- 如果后续选择 NDJSON 而不是 SSE，必须先更新本节。

## 4.2 POST /api/report/regenerate-question

单题嘴替答案重新生成接口。该接口用于 Report 页只刷新目标 `questionId` 的题目报告，不清空其他题报告、答案或整份报告复制入口。

### Request

在 `POST /api/report/generate` request 基础上增加 `questionId`：

```json
{
  "candidateProfile": {},
  "questions": [],
  "answers": [],
  "questionId": "q2"
}
```

### Response data

返回目标题目的 `QuestionReport`：

```json
{
  "questionId": "q2",
  "score": 76,
  "dimensionScores": {
    "jobRelevance": 20,
    "structure": 15,
    "evidence": 14,
    "professionalExpression": 12,
    "truthBoundary": 8,
    "completeness": 7
  },
  "riskTags": ["缺少量化结果"],
  "fatalIssue": "没有说明个人贡献",
  "diagnosis": "string",
  "optimizedAnswer": "string",
  "oralVersion60s": "string"
}
```

### Rules

- 目标 `questionId` 必须存在于本次 `questions` 中。
- 失败时前端必须保留旧的目标题报告，不影响其他题。
- 该接口可复用完整报告生成能力，但响应只返回目标 `QuestionReport`。
- 非流式整份报告接口仍是稳定保底。

## 5. POST /api/tts

当前 `server.js` 已有本地 Azure TTS 代理。正式应用复用该语义即可。

### Request

```json
{
  "text": "string",
  "styleId": "strictHr",
  "voiceName": "zh-CN-XiaoxiaoNeural",
  "rate": "0%",
  "pitch": "0Hz",
  "volume": "medium"
}
```

### Response

返回 `audio/mpeg` 或 `audio/wav` 二进制音频。

## 6. Stable Enums

| Enum | Values |
| --- | --- |
| `interviewerStyleId` | `strictHr`, `techBro`, `gentleSister` |
| `inputMode` | `voice`, `text`, `edited` |
| `sttStatus` | `idle`, `recording`, `success`, `failed`, `unsupported`, `manual` |
| `ttsStatus` | `idle`, `loading`, `speaking`, `ended`, `failed`, `unsupported` |
| `sessionStep` | `setup`, `profile`, `questions`, `interview`, `report` |

## 7. Prompt Output Rules

- LLM 返回必须能被 JSON 解析。
- 不得编造用户未提供的硬事实，例如公司名、数据指标、获奖经历。
- 信息不足时写入 `suggestedSupplements` 或在诊断中指出缺口。
- 优化答案可以改善结构和表达，但必须保留事实边界。
