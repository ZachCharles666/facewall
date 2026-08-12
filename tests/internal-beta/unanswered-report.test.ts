import assert from "node:assert/strict";
import test from "node:test";
import { buildFallbackReport } from "../../lib/demo/fallback";
import {
  buildFullyUnansweredReport,
  enforceAnswerSemantics
} from "../../lib/report/answerSemantics";
import type {
  InterviewAnswer,
  InterviewQuestion,
  InterviewReport
} from "../../lib/types";

const questions: InterviewQuestion[] = [1, 2, 3].map((index) => ({
  id: `q${index}`,
  type: "behavior",
  title: `题目 ${index}`,
  questionText: `请回答题目 ${index}`,
  intent: "验证真实回答",
  expectedSignals: ["真实经历"],
  difficulty: "medium"
}));

const unanswered: InterviewAnswer[] = questions.map((question) => ({
  questionId: question.id,
  answerText: "",
  inputMode: "text",
  durationSec: 0,
  sttStatus: "manual"
}));

test("all unanswered questions deterministically score zero without demo answers", () => {
  const report = buildFullyUnansweredReport(questions);

  assert.equal(report.finalReport.overallScore, 0);
  assert.match(report.finalReport.summary, /均未作答/);
  assert.match(report.finalReport.summary, /未使用示例、Mock 或备选答案/);
  for (const questionReport of report.questionReports) {
    assert.equal(questionReport.score, 0);
    assert.deepEqual(Object.values(questionReport.dimensionScores), [0, 0, 0, 0, 0, 0]);
    assert.ok(questionReport.riskTags.includes("未作答"));
    assert.match(questionReport.optimizedAnswer, /未作答/);
  }
});

test("demo fallback cannot leak demo scores or answers into unanswered questions", () => {
  const report = buildFallbackReport(questions, unanswered);

  assert.equal(report.finalReport.overallScore, 0);
  assert.ok(report.questionReports.every((item) => item.score === 0));
  assert.ok(report.questionReports.every((item) => item.riskTags.includes("未作答")));
});

test("persisted or provider reports are overwritten for missing answers", () => {
  const providerReport: InterviewReport = {
    questionReports: questions.map((question) => ({
      questionId: question.id,
      score: 90,
      dimensionScores: {
        jobRelevance: 15,
        structure: 15,
        evidence: 15,
        professionalExpression: 15,
        truthBoundary: 15,
        completeness: 15
      },
      riskTags: [],
      fatalIssue: "无",
      diagnosis: "高分",
      optimizedAnswer: "替代答案",
      oralVersion60s: "替代口述"
    })),
    finalReport: {
      overallScore: 90,
      summary: "高分替代报告",
      topRisks: [],
      actionItems: [],
      copyText: "优化答案\n替代答案\n复盘报告\n90 分"
    }
  };
  const answers = unanswered.map((answer, index) =>
    index === 0 ? { ...answer, answerText: "这是我真实输入的回答。" } : answer
  );

  const report = enforceAnswerSemantics(providerReport, questions, answers);

  assert.equal(report.questionReports[0].score, 90);
  assert.equal(report.questionReports[1].score, 0);
  assert.equal(report.questionReports[2].score, 0);
  assert.equal(report.finalReport.overallScore, 30);
  assert.doesNotMatch(report.questionReports[1].optimizedAnswer, /替代答案/);
  assert.match(report.finalReport.summary, /未作答题目（q2、q3）按 0 分计入总分/);
});
