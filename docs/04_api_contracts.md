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
  "sourceMatches": [
    {
      "resumeText": "简历原文中的连续短语",
      "jdText": "JD 原文中的连续短语",
      "reason": "为什么这两段内容匹配",
      "confidence": 0.86
    }
  ],
  "suggestedSupplements": ["string"]
}
```

### Source Match Rules

- `sourceMatches` 用于 Profile 页原文高亮和匹配解释，必须返回 2 到 5 条。
- `resumeText` 应尽量是 `resumeText` 请求原文中的连续短语；`jdText` 应尽量是 `jdText` 请求原文中的连续短语。
- `reason` 解释匹配逻辑，不能编造简历或 JD 中不存在的硬事实。
- `confidence` 是 0 到 1 的数字；弱匹配应降低置信度，并在 `suggestedSupplements` 中提示需要补充材料。
- 前端可以基于 `sourceMatches` 精准高亮；如果某个短语无法在原文中找到，只展示匹配说明，不强行涂色。

## 3. POST /api/files/parse

用于 Setup 页上传简历或 JD 文件后提取纯文本并回填输入框。本接口不调用 LLM，不存储文件，不输出文件正文日志。

### Request

`multipart/form-data`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `file` | File | Yes | 支持 `.txt`、`.pdf`、`.docx`，统一最大 1MB（PDF 与 Word 相同） |

### Response data

```json
{
  "text": "string",
  "fileName": "resume.docx",
  "fileType": "txt|pdf|docx",
  "charCount": 1200,
  "warnings": ["string"]
}
```

### Rules

- `.txt` 支持 UTF-8、UTF-8 BOM 和 UTF-16LE BOM。
- `.docx` 解析 `word/document.xml` 中的正文文本；旧版 `.doc` 暂不支持，需另存为 `.docx`。
- `.pdf` 通过 PDF 字体编码与 `ToUnicode` 映射解析文件中已有的可提取文本（包括中文文本层），不执行 OCR。纯图片、扫描版或其他无法提取文字的 PDF 返回 HTTP `422`、`PDF_TEXT_UNRECOGNIZABLE`、`retryable=false`，提示用户改传含可复制文字的 PDF 或粘贴文字内容。
- 空文件、超限、损坏或其他解析失败返回 HTTP `400`、`FILE_PARSE_FAILED`、`retryable=false`；前端必须保留用户已有输入。
- 不允许在日志、错误信息或文档中输出上传文件全文。

## 4. POST /api/questions/generate

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

## 5. POST /api/report/generate

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
  ],
  "interviewerStyleId": "strictHr"
}
```

> `interviewerStyleId` 为**可选**字段。传入时，报告链路会按对应面试官的评分/诊断倾向调整评价侧重与口吻；不传或非法时优雅降级为中性报告 prompt。不进入 `validateReportRequest` 必填校验，因此老调用方不受影响。`generate-stream` 与 `regenerate-question` 复用同一 request，因此也支持该可选字段。

> 未作答语义：某题 `answerText.trim()` 为空时，服务端必须直接返回该题 0 分、六维 0 分和明确的“未作答/无法评估”信息，不调用 LLM，也不得读取示例、Mock 或备选答案。部分未作答时，仅真实作答题允许调用 LLM，未作答题按 0 分计入总分；三题全部未作答时整份报告由确定性规则生成，总分为 0。客户端恢复历史报告时也必须用当前真实答案重新校正该语义。

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

## 5.1 POST /api/report/generate-stream

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

## 5.2 POST /api/report/regenerate-question

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

## 6. POST /api/tts

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

### Provider Failover Rules

- 公开接口保持不变；客户端不直接持有任何语音 provider 密钥。
- 服务端顺序为 Azure 主 provider → 已配置的备用 TTS provider；每个 provider 在一次用户操作中最多调用一次，并使用有界短超时。
- 只有 provider 超时、网络错误、429 或 5xx 才允许切换；空文本、非法参数等 4xx 输入错误直接返回，不消耗备用 provider。
- 两个服务端 provider 均失败时，前端继续使用 Web Speech；浏览器能力也不可用时仍显示题目文本，不阻断面试流程。
- 日志/监控只记录 provider 标识、结果、latency、attempts 和 requestId，不记录朗读正文、密钥或 provider 原始响应。
- 备用 provider 的真实厂商、地域、计费和数据处理边界是 G1 前门禁；未选择时不得用本地 stub 宣称冗余完成。

## 7. POST /api/stt

Azure Speech-to-Text 短音频识别接口。前端录制单声道 16k PCM WAV 后提交给服务端；服务端使用 `AZURE_SPEECH_KEY` 和 `AZURE_SPEECH_REGION` 调 Azure STT，不向前端暴露密钥。

### Request

Body 为二进制音频，推荐请求头：

```http
Content-Type: audio/wav
```

### Response

```json
{
  "text": "识别出的中文文本"
}
```

### Rules

- 该接口仅用于短音频 Demo 识别；长音频、实时流式字幕、音频上传存储不在本轮范围内。
- 服务端顺序为 Azure 主 provider → 已配置的备用 STT provider；每个 provider 在一次用户操作中最多调用一次，并使用有界短超时。
- 只有 provider 超时、网络错误、429 或 5xx 才允许切换；空音频、格式错误等 4xx 输入错误不得触发备用 provider。
- 失败时前端必须保留已有答案文本，并允许重试或手动编辑。
- 两个服务端 provider 均失败后，可使用浏览器 SpeechRecognition；浏览器能力也不可用时进入手动编辑。
- 原始音频只在当前识别请求内存中短暂处理，不落数据库、文件、日志、监控或事件；技术记录只含 provider、时长、latency、attempts、结果和 requestId。
- 备用 provider 未完成真实中文录音、隐私 payload 和故障切换验证前，不能把本地 adapter/mock 计为通过。
- 非 HTTPS 公网页面通常无法稳定获取麦克风权限；线上演示应优先使用 HTTPS。

## 8. Stable Enums

| Enum | Values |
| --- | --- |
| `interviewerStyleId` | `strictHr`, `techBro`, `gentleSister` |
| `inputMode` | `voice`, `text`, `edited` |
| `sttStatus` | `idle`, `recording`, `success`, `failed`, `unsupported`, `manual` |
| `ttsStatus` | `idle`, `loading`, `speaking`, `ended`, `failed`, `unsupported` |
| `sessionStep` | `setup`, `profile`, `questions`, `interview`, `report` |

## 9. Prompt Output Rules

- LLM 返回必须能被 JSON 解析。
- 不得编造用户未提供的硬事实，例如公司名、数据指标、获奖经历。
- 信息不足时写入 `suggestedSupplements` 或在诊断中指出缺口。
- 优化答案可以改善结构和表达，但必须保留事实边界。
