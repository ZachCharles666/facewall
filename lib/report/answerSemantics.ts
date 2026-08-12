import type {
  DimensionScores,
  InterviewAnswer,
  InterviewQuestion,
  InterviewReport,
  QuestionReport
} from "@/lib/types";

const ZERO_DIMENSION_SCORES: DimensionScores = {
  jobRelevance: 0,
  structure: 0,
  evidence: 0,
  professionalExpression: 0,
  truthBoundary: 0,
  completeness: 0
};

export function hasRealAnswer(answer: InterviewAnswer | undefined) {
  return Boolean(answer?.answerText.trim());
}

export function buildUnansweredQuestionReport(questionId: string): QuestionReport {
  return {
    questionId,
    score: 0,
    dimensionScores: { ...ZERO_DIMENSION_SCORES },
    riskTags: ["未作答", "无法评估"],
    fatalIssue: "本题未作答，无法进行能力评分。",
    diagnosis: "没有收到你的回答。本题按未作答计 0 分，系统不会使用示例、Mock 或备选答案代替你作答。",
    optimizedAnswer: "未作答，暂无优化答案。请先补充你的真实回答。",
    oralVersion60s: "未作答，暂无 60 秒口述版。请先基于真实经历完成回答。"
  };
}

export function buildFullyUnansweredReport(questions: InterviewQuestion[]): InterviewReport {
  const questionReports = questions.map((question) => buildUnansweredQuestionReport(question.id));
  const summary = `本次 ${questions.length} 道题均未作答，按未作答计 0 分。系统未使用示例、Mock 或备选答案进行评分。`;
  return {
    questionReports,
    finalReport: {
      overallScore: 0,
      summary,
      topRisks: ["全部题目未作答，无法评估岗位能力与表达表现。"],
      actionItems: ["请先完成真实作答，再重新生成复盘报告。"],
      copyText: buildCopyText(questionReports, summary, 0)
    }
  };
}

export function enforceAnswerSemantics(
  report: InterviewReport,
  questions: InterviewQuestion[],
  answers: InterviewAnswer[]
): InterviewReport {
  const answerByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));
  const answeredCount = questions.filter((question) => hasRealAnswer(answerByQuestionId.get(question.id))).length;

  if (answeredCount === 0) {
    return buildFullyUnansweredReport(questions);
  }

  const reportByQuestionId = new Map(report.questionReports.map((item) => [item.questionId, item]));
  const missingQuestionIds: string[] = [];
  const questionReports = questions.map((question) => {
    if (!hasRealAnswer(answerByQuestionId.get(question.id))) {
      missingQuestionIds.push(question.id);
      return buildUnansweredQuestionReport(question.id);
    }
    return reportByQuestionId.get(question.id) ?? buildUnansweredQuestionReport(question.id);
  });
  const overallScore = questionReports.length
    ? Math.round(questionReports.reduce((total, item) => total + item.score, 0) / questionReports.length)
    : 0;
  const missingStatus = missingQuestionIds.length
    ? `未作答题目（${missingQuestionIds.join("、")}）按 0 分计入总分；未使用任何替代答案。`
    : "";
  const summary = `${report.finalReport.summary} ${missingStatus}`.trim();

  return {
    questionReports,
    finalReport: {
      ...report.finalReport,
      overallScore,
      summary,
      topRisks: missingQuestionIds.length
        ? ["存在未作答题目，相关能力无法评估。", ...report.finalReport.topRisks].slice(0, 3)
        : report.finalReport.topRisks,
      actionItems: missingQuestionIds.length
        ? ["补充未作答题目的真实回答后重新生成报告。", ...report.finalReport.actionItems].slice(0, 3)
        : report.finalReport.actionItems,
      copyText: buildCopyText(questionReports, summary, overallScore)
    }
  };
}

function buildCopyText(questionReports: QuestionReport[], summary: string, overallScore: number) {
  const optimizedAnswers = questionReports
    .map((report, index) => `第 ${index + 1} 题优化答案\n${report.optimizedAnswer}`)
    .join("\n\n");
  return `优化答案\n\n${optimizedAnswers}\n\n复盘报告\n总分：${overallScore}\n${summary}`;
}
