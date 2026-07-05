import { demoReport, demoScenario } from "@/lib/demo/scenario";
import type { InterviewAnswer, InterviewQuestion, InterviewReport, InterviewerStyleId, QuestionReport } from "@/lib/types";

const OPTIMIZED_ANSWER_CHAR_LIMIT = 300;
const SHORT_ANSWER_CHAR_LIMIT = 30;
const OFF_TOPIC_PATTERN = /天气|篮球|电影|旅游|美食|游戏|唱歌|明星|综艺/;

const styleLead: Record<InterviewerStyleId, string> = {
  strictHr: "我们先从基础问题开始。",
  techBro: "我们把细节拆开看。",
  gentleSister: "我会更关注业务取舍。"
};

export function buildFallbackQuestions(interviewerStyleId: InterviewerStyleId) {
  return demoScenario.questions.map((question) => ({
    ...question,
    questionText: `${styleLead[interviewerStyleId]}${question.questionText}`
  }));
}

export function buildFallbackReport(questions: InterviewQuestion[], answers: InterviewAnswer[]): InterviewReport {
  const questionReports = questions.map((question) => {
    const baseReport =
      demoReport.questionReports.find((report) => report.questionId === question.id) ?? demoReport.questionReports[0];
    const answer = answers.find((item) => item.questionId === question.id);
    return buildQuestionReport({ ...baseReport, questionId: question.id }, answer?.answerText ?? "");
  });

  const missingCount = questionReports.filter((report) => report.riskTags.includes("缺失答案")).length;
  const copyText = buildCopyText(questionReports, missingCount);

  return {
    questionReports,
    finalReport: {
      ...demoReport.finalReport,
      overallScore: questionReports.length
        ? Math.round(questionReports.reduce((sum, item) => sum + item.score, 0) / questionReports.length)
        : 0,
      summary:
        missingCount > 0
          ? `当前有 ${missingCount} 道题缺少答案。系统保留问题和已填答案，不会编造缺失内容。`
          : demoReport.finalReport.summary,
      copyText
    }
  };
}

function buildQuestionReport(base: QuestionReport, answerText: string): QuestionReport {
  const normalizedAnswer = answerText.trim();

  if (!normalizedAnswer) {
    return {
      ...base,
      score: 0,
      dimensionScores: {
        jobRelevance: 0,
        structure: 0,
        evidence: 0,
        professionalExpression: 0,
        truthBoundary: 0,
        completeness: 0
      },
      riskTags: ["缺失答案", "无法评估证据"],
      fatalIssue: "该题没有有效答案，报告不会替用户编造回答。",
      diagnosis: "请补充该题答案后重新生成报告；当前仅保留缺失提示。",
      optimizedAnswer: "暂无优化答案。请先补充你的真实经历和回答要点。",
      oralVersion60s: "这题还没有有效答案。建议先用真实经历补充背景、个人动作、结果和复盘，再生成 60 秒口述版。"
    };
  }

  if (normalizedAnswer.length < SHORT_ANSWER_CHAR_LIMIT) {
    return {
      ...base,
      score: Math.min(base.score, 52),
      dimensionScores: {
        jobRelevance: Math.min(base.dimensionScores.jobRelevance, 10),
        structure: Math.min(base.dimensionScores.structure, 8),
        evidence: Math.min(base.dimensionScores.evidence, 6),
        professionalExpression: Math.min(base.dimensionScores.professionalExpression, 11),
        truthBoundary: Math.min(base.dimensionScores.truthBoundary, 12),
        completeness: Math.min(base.dimensionScores.completeness, 5)
      },
      riskTags: ["回答过短", "证据不足", "需要补充真实细节"],
      fatalIssue: "当前答案只有少量结论，缺少背景、个人动作、结果和复盘，不能生成强包装答案。",
      diagnosis:
        "系统不会替你补不存在的数据。建议至少补充项目背景、你亲自做的 2 个动作、一个可验证结果或反馈，以及你对结果边界的说明。",
      optimizedAnswer:
        "基于你当前提供的信息，只能保守表达：我参与过相关项目，也意识到这个经历需要用更清楚的背景、个人动作和结果来呈现。为了避免夸大，我会补充真实的用户反馈、样本量、原型或数据证据，再把答案整理成目标、行动、结果、复盘四段。",
      oralVersion60s:
        "这题目前信息太少，我不会编造数据。建议先补充项目背景、你亲自做的动作、可验证结果和复盘。保守说法是：我参与过相关项目，但还需要用真实反馈、样本量和个人交付物来证明贡献。"
    };
  }

  if (isLikelyOffTopic(normalizedAnswer)) {
    return {
      ...base,
      score: Math.min(base.score, 48),
      dimensionScores: {
        jobRelevance: Math.min(base.dimensionScores.jobRelevance, 6),
        structure: Math.min(base.dimensionScores.structure, 8),
        evidence: Math.min(base.dimensionScores.evidence, 5),
        professionalExpression: Math.min(base.dimensionScores.professionalExpression, 10),
        truthBoundary: Math.min(base.dimensionScores.truthBoundary, 12),
        completeness: Math.min(base.dimensionScores.completeness, 7)
      },
      riskTags: ["疑似跑题", "岗位关联弱", "缺少可评估证据"],
      fatalIssue: "回答没有回到题目要求和岗位能力，面试官无法判断你的真实匹配度。",
      diagnosis:
        "这段回答更像闲聊或背景信息，没有说明和岗位、项目、能力相关的事实。建议回到题目核心，补充真实项目背景、个人动作、结果证据和复盘边界。",
      optimizedAnswer:
        "基于当前回答，不能直接包装成高分经历。我会先把话题拉回岗位：这题我需要结合真实项目来回答。更稳妥的表达是，我会补充一个和 AI 产品或用户研究相关的经历，说明我面对的问题、我亲自做的调研/原型/复盘动作、得到的反馈，以及这个经历仍有哪些边界。",
      oralVersion60s:
        "这题我先拉回正题。刚才的回答没有覆盖岗位能力，所以我会补一个真实项目来说明：背景是什么，我做了哪些调研、原型或复盘动作，结果有什么反馈，以及哪些数据还需要继续补充。"
    };
  }

  return {
    ...base,
    optimizedAnswer: fitOptimizedAnswer(base.optimizedAnswer),
    diagnosis: `${base.diagnosis} 当前答案长度 ${normalizedAnswer.length} 字，演示兜底服务仅做契约级复盘。`
  };
}

function isLikelyOffTopic(answerText: string) {
  return OFF_TOPIC_PATTERN.test(answerText);
}

function fitOptimizedAnswer(answer: string) {
  if (answer.length <= OPTIMIZED_ANSWER_CHAR_LIMIT) {
    return answer;
  }
  return `${answer.slice(0, OPTIMIZED_ANSWER_CHAR_LIMIT - 1)}…`;
}

function buildCopyText(questionReports: QuestionReport[], missingCount: number) {
  return [
    "复盘报告",
    missingCount > 0
      ? `当前有 ${missingCount} 道题缺少答案。系统只基于已提供内容复盘，不会编造缺失经历。`
      : demoReport.finalReport.summary,
    "",
    "优化答案",
    ...questionReports.map((report) => `${report.questionId}: ${fitOptimizedAnswer(report.optimizedAnswer)}`),
    "",
    "行动建议",
    ...demoReport.finalReport.actionItems.map((item, index) => `${index + 1}. ${item}`)
  ].join("\n");
}
