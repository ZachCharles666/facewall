const positionalBaseUrl = process.argv.find((item, index) => index > 1 && /^https?:\/\//.test(item));
const baseUrl = getArgValue("--base-url") ?? positionalBaseUrl ?? process.env.FACEWALL_BASE_URL ?? "http://localhost:3000";

const jsonHeaders = {
  "Content-Type": "application/json"
};

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function postJson(path, payload, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      ...jsonHeaders,
      ...headers
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  return { response, body };
}

async function postSse(path, payload, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      ...jsonHeaders,
      ...headers
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  const events = text
    .split(/\n\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const event = lines.find((line) => line.startsWith("event:"))?.replace(/^event:\s*/, "").trim();
      const data = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:\s*/, ""))
        .join("\n");
      return {
        event,
        data: data ? JSON.parse(data) : null
      };
    });
  return { response, events };
}

async function run() {
  const fallbackHeaders = { "x-facewall-demo-mode": "force-fallback" };
  const profilePayload = {
    resumeText:
      "应届本科生，目标 AI 产品经理实习生。做过 AI 简历助手项目，负责用户访谈、竞品分析、PRD、原型和可用性测试，也做过基础数据看板维护。",
    jdText:
      "AI 产品经理实习生：参与 AI 工具产品需求调研、用户访谈、竞品分析、PRD 撰写、原型沟通和数据复盘，要求理解用户场景并能跨团队推进。",
    interviewerStyleId: "strictHr"
  };

  const profileResult = await postJson("/api/profile/parse", profilePayload, fallbackHeaders);
  assert(profileResult.response.ok && profileResult.body.ok, "profile fallback request failed");
  const profile = profileResult.body.data;
  assert(Array.isArray(profile.matchedPoints) && profile.matchedPoints.length >= 1, "profile missing matchedPoints");
  assert(Array.isArray(profile.sourceMatches) && profile.sourceMatches.length >= 2, "profile missing sourceMatches");
  for (const match of profile.sourceMatches) {
    assert(typeof match.resumeText === "string" && match.resumeText.trim(), "sourceMatch missing resumeText");
    assert(typeof match.jdText === "string" && match.jdText.trim(), "sourceMatch missing jdText");
    assert(typeof match.reason === "string" && match.reason.trim(), "sourceMatch missing reason");
    assert(typeof match.confidence === "number" && match.confidence >= 0 && match.confidence <= 1, "sourceMatch confidence out of range");
  }

  const questionsResult = await postJson(
    "/api/questions/generate",
    {
      candidateProfile: profile,
      interviewerStyleId: "strictHr",
      questionCount: 3
    },
    fallbackHeaders
  );
  assert(questionsResult.response.ok && questionsResult.body.ok, "questions fallback request failed");
  const questions = questionsResult.body.data.questions;
  assert(questions.length === 3, "questions length must be 3");
  assert(questions.map((question) => question.id).join(",") === "q1,q2,q3", "question ids must stay q1/q2/q3");

  const answers = questions.map((question, index) => ({
    questionId: question.id,
    answerText:
      index === 0
        ? "我做过 AI 简历助手，负责用户访谈、竞品拆解、原型和测试，但样本量比较小，我会说明边界。"
        : index === 1
          ? "我适合 AI 产品经理，因为我做过访谈、PRD、原型和基础数据复盘，但线上增长经验还需要补。"
          : "我会承认项目还小，但我有访谈记录、PRD、原型和测试反馈，不只是包装概念。",
    inputMode: index === 1 ? "edited" : "text",
    durationSec: 50,
    sttStatus: index === 1 ? "success" : "manual"
  }));

  const reportResult = await postJson(
    "/api/report/generate",
    {
      candidateProfile: profile,
      questions,
      answers
    },
    fallbackHeaders
  );
  assert(reportResult.response.ok && reportResult.body.ok, "report fallback request failed");
  const report = reportResult.body.data;
  assert(report.questionReports.length === 3, "report must include 3 questionReports");
  assert(report.finalReport.copyText.includes("优化答案"), "copyText missing 优化答案");
  assert(report.finalReport.copyText.includes("复盘报告"), "copyText missing 复盘报告");
  for (const questionReport of report.questionReports) {
    const dimensions = questionReport.dimensionScores;
    for (const key of ["jobRelevance", "structure", "evidence", "professionalExpression", "truthBoundary", "completeness"]) {
      assert(typeof dimensions[key] === "number", `missing dimension ${key}`);
    }
  }

  const streamResult = await postSse(
    "/api/report/generate-stream",
    {
      candidateProfile: profile,
      questions,
      answers
    },
    fallbackHeaders
  );
  assert(streamResult.response.ok, "report stream request failed");
  assert(streamResult.response.headers.get("content-type")?.includes("text/event-stream"), "report stream must be SSE");
  assert(streamResult.events.some((item) => item.event === "progress"), "report stream missing progress event");
  assert(streamResult.events.filter((item) => item.event === "questionReport").length === 3, "report stream missing questionReport events");
  const finalEvent = streamResult.events.find((item) => item.event === "final");
  assert(finalEvent?.data?.questionReports?.length === 3, "report stream final missing full InterviewReport");

  const streamFaultResult = await postSse(
    "/api/report/generate-stream",
    {
      candidateProfile: profile,
      questions,
      answers
    },
    { "x-facewall-fault": "llm" }
  );
  assert(streamFaultResult.response.ok, "stream fault still returns SSE response");
  const streamErrorEvent = streamFaultResult.events.find((item) => item.event === "error");
  assert(streamErrorEvent?.data?.retryable === true, "stream fault must emit retryable error event");

  const regeneratedResult = await postJson(
    "/api/report/regenerate-question",
    {
      candidateProfile: profile,
      questions,
      answers,
      questionId: questions[1].id
    },
    fallbackHeaders
  );
  assert(regeneratedResult.response.ok && regeneratedResult.body.ok, "single question regenerate request failed");
  assert(regeneratedResult.body.data.questionId === questions[1].id, "single question regenerate returned wrong questionId");

  const missingAnswers = answers.map((answer, index) => (index === 1 ? { ...answer, answerText: "" } : answer));
  const missingReportResult = await postJson(
    "/api/report/generate",
    {
      candidateProfile: profile,
      questions,
      answers: missingAnswers
    },
    fallbackHeaders
  );
  assert(missingReportResult.response.ok && missingReportResult.body.ok, "missing answer report request failed");
  const missingReport = missingReportResult.body.data.questionReports.find((item) => item.questionId === questions[1].id);
  assert(missingReport.riskTags.includes("缺失答案"), "missing answer not tagged");
  assert(missingReport.optimizedAnswer.includes("暂无优化答案"), "missing answer generated fabricated optimized answer");

  const shortAnswers = answers.map((answer, index) => (index === 0 ? { ...answer, answerText: "做过一些。" } : answer));
  const shortReportResult = await postJson(
    "/api/report/generate",
    {
      candidateProfile: profile,
      questions,
      answers: shortAnswers
    },
    fallbackHeaders
  );
  const shortReport = shortReportResult.body.data.questionReports.find((item) => item.questionId === questions[0].id);
  assert(shortReport.riskTags.includes("回答过短"), "short answer not tagged");

  const offTopicAnswers = answers.map((answer, index) =>
    index === 2 ? { ...answer, answerText: "今天天气很好，我平时喜欢打篮球和看电影，所以我觉得沟通很重要。" } : answer
  );
  const offTopicReportResult = await postJson(
    "/api/report/generate",
    {
      candidateProfile: profile,
      questions,
      answers: offTopicAnswers
    },
    fallbackHeaders
  );
  const offTopicReport = offTopicReportResult.body.data.questionReports.find((item) => item.questionId === questions[2].id);
  assert(offTopicReport.riskTags.includes("疑似跑题"), "off-topic answer not tagged");

  const faultReportResult = await postJson(
    "/api/report/generate",
    {
      candidateProfile: profile,
      questions,
      answers
    },
    { "x-facewall-fault": "llm" }
  );
  assert(faultReportResult.response.status === 502, "LLM fault should return 502");
  assert(faultReportResult.body.error?.retryable === true, "LLM fault must be retryable");

  const fallbackAfterFault = await postJson(
    "/api/report/generate",
    {
      candidateProfile: profile,
      questions,
      answers
    },
    fallbackHeaders
  );
  assert(fallbackAfterFault.response.ok && fallbackAfterFault.body.ok, "fallback after report fault failed");

  const ttsFaultResponse = await fetch(`${baseUrl}/api/tts`, {
    method: "POST",
    headers: {
      ...jsonHeaders,
      "x-facewall-fault": "tts"
    },
    body: JSON.stringify({
      text: questions[0].questionText,
      styleId: "strictHr",
      voiceName: "zh-CN-XiaoxiaoNeural",
      rate: 1,
      pitch: 1,
      volume: 1
    })
  });
  assert(ttsFaultResponse.status === 503, "TTS fault should return 503");

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        checks: [
          "profile fallback",
          "profile sourceMatches",
          "questions fallback",
          "report schema",
          "report stream events",
          "report stream fault event",
          "single question regenerate",
          "copyText titles",
          "missing answer guard",
          "short answer guard",
          "off-topic answer guard",
          "LLM fault retryable",
          "fallback after fault",
          "TTS fault"
        ]
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
