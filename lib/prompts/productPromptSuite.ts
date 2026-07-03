import type { PromptOverrides } from "@/lib/types";

export const promptOverrideStorageKey = "facewall.promptOverrides.v1";

export const defaultPromptOverrides: PromptOverrides = {
  system: [
    "你是一名资深招聘顾问和面试教练，擅长从候选人简历与岗位 JD 中提取面试准备重点。",
    "你的输出服务于面试训练产品：直接、具体、可执行，但不要羞辱用户。",
    "只基于用户提供的信息分析，不要编造经历、公司、项目、数据、成果、金额、人数、增长率或奖项。"
  ].join("\n"),
  profile: [
    "请基于用户提供的简历/经历片段和目标岗位 JD，生成候选人画像。",
    "重点提取岗位匹配点、潜在风险点、可用于回答面试题的素材。",
    "如果信息不足，请在 suggestedSupplements 中说明需要补充什么。",
    "sourceMatches 要尽量使用简历和 JD 的原文连续短语，方便前端做来源对照。"
  ].join("\n"),
  questions: [
    "请根据候选人画像和面试官风格生成 3 道高命中面试题。",
    "题目编排参考：Q1 岗位匹配与动机，Q2 行为 STAR 或项目深挖，Q3 岗位专业题或压力短板题。",
    "参考权重：Q1 30%，Q2 40%，Q3 30%。当前线上契约暂不返回 weight 字段，可把权重意图体现在 intent 和 expectedSignals。",
    "每道题必须结合简历、画像或 JD 信息，不能生成泛泛而谈的问题。",
    "不要生成多轮追问，只生成 3 道主问题。"
  ].join("\n"),
  report: [
    "请根据候选人画像、面试题和用户原始回答，生成面试复盘报告与嘴替答案。",
    "目标不是只批评用户，而是帮助用户把普通回答改写成更结构化、更职业、更贴合岗位的高分回答。",
    "诊断要直接、具体，不要输出空泛鸡汤。",
    "如果原回答缺少数据，可以提示“这里建议补充具体指标”，但不能直接捏造数字。",
    "嘴替答案控制在 300 字以内，同时生成一个适合用户直接背诵的 60 秒口语版。"
  ].join("\n")
};

export const promptDataFormatPreview = {
  profile: {
    summary: "一句话总结候选人与岗位的匹配情况",
    matchedPoints: ["岗位匹配点"],
    riskPoints: ["潜在风险点"],
    keywords: ["岗位关键词"],
    evidenceMaterials: [{ title: "素材标题", source: "resume|jd|inferred", content: "证据内容" }],
    sourceMatches: [{ resumeText: "简历原文短语", jdText: "JD 原文短语", reason: "匹配原因", confidence: 0.85 }],
    suggestedSupplements: ["建议用户补充的信息"]
  },
  questions: {
    questions: [
      {
        id: "q1",
        type: "behavior|project|pressure|technical|motivation",
        title: "题目标题",
        questionText: "面试问题",
        intent: "为什么问这道题",
        expectedSignals: ["高分回答应包含的要点"],
        difficulty: "easy|medium|hard"
      }
    ]
  },
  report: {
    questionReports: [
      {
        questionId: "q1",
        score: 76,
        dimensionScores: {
          jobRelevance: 20,
          structure: 15,
          evidence: 14,
          professionalExpression: 12,
          truthBoundary: 8,
          completeness: 7
        },
        riskTags: ["雷区标签"],
        fatalIssue: "这个回答最致命的问题",
        diagnosis: "原回答的问题说明和面试官印象",
        optimizedAnswer: "300 字以内的高分嘴替答案",
        oralVersion60s: "适合 60 秒口述的版本"
      }
    ],
    finalReport: {
      overallScore: 78,
      summary: "整体表现总结",
      topRisks: ["Top 风险"],
      actionItems: ["下一步训练建议"],
      copyText: "必须同时包含“优化答案”和“复盘报告”"
    }
  }
};

const overrideKeys: Array<keyof PromptOverrides> = ["system", "profile", "questions", "report"];

export function normalizePromptOverrides(value: unknown): PromptOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultPromptOverrides;
  }

  const source = value as Partial<Record<keyof PromptOverrides, unknown>>;
  return overrideKeys.reduce<PromptOverrides>((result, key) => {
    const rawValue = source[key];
    const trimmedValue = typeof rawValue === "string" ? rawValue.trim() : "";
    return {
      ...result,
      [key]: trimmedValue || defaultPromptOverrides[key]
    };
  }, defaultPromptOverrides);
}
