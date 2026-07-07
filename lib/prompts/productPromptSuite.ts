import type { InterviewerPromptProfile, InterviewerStyleId, PromptOverrides } from "@/lib/types";

export const promptOverrideStorageKey = "facewall.promptOverrides.v1";

export const defaultInterviewerPrompts: Record<InterviewerStyleId, InterviewerPromptProfile> = {
  strictHr: {
    persona: [
      "你是温婉、亲和的 HR 面试官。",
      "语气自然、温和、有引导感，让候选人放松表达，不制造压迫感。"
    ].join("\n"),
    questions: [
      "多从动机、沟通、协作、成长性、稳定性切入。",
      "问法要自然、温和、有引导感，鼓励候选人展开讲。",
      "避免过度技术细节和强压迫式追问。"
    ].join("\n"),
    report: [
      "评价侧重沟通表达、动机匹配、协作意愿和成长潜力。",
      "诊断口吻温和鼓励：先肯定亮点，再给具体、可执行的改进建议，不羞辱候选人。"
    ].join("\n")
  },
  techBro: {
    persona: [
      "你是直接、就事论事的技术老哥面试官。",
      "说话干脆，关注真实细节，不绕弯子。"
    ].join("\n"),
    questions: [
      "多从项目细节、需求拆解、实现边界、技术协作切入。",
      "问法直接，允许追问定义、规则、异常情况和边界。",
      "避免空泛的职业规划类问题；非技术岗位不要强行写代码题。"
    ].join("\n"),
    report: [
      "评价侧重技术/方法论的具体度、需求拆解能力和边界思考。",
      "诊断直接点名空泛、缺少细节或逻辑漏洞的地方，并给出更严谨的表达方式。"
    ].join("\n")
  },
  gentleSister: {
    persona: [
      "你是有压迫感的资深业务大佬面试官。",
      "关注结果与价值，问题尖锐，逼候选人给出业务判断。"
    ].join("\n"),
    questions: [
      "多从业务目标、指标结果、用户价值、资源取舍切入。",
      "问法要有压迫感，追问‘为什么做、值不值得、如何证明有效’。",
      "逼候选人从执行过程上升到业务判断，避免只问执行细节。"
    ].join("\n"),
    report: [
      "评价侧重业务判断、指标结果、用户价值和取舍能力。",
      "诊断尖锐，直指候选人是否只停留在执行层、能否证明有效，并要求用业务视角重构答案。"
    ].join("\n")
  }
};

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
  ].join("\n"),
  interviewers: defaultInterviewerPrompts
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

const overrideStringKeys: Array<"system" | "profile" | "questions" | "report"> = [
  "system",
  "profile",
  "questions",
  "report"
];
const interviewerStyleIds: InterviewerStyleId[] = ["strictHr", "techBro", "gentleSister"];
const interviewerPromptKeys: Array<keyof InterviewerPromptProfile> = ["persona", "questions", "report"];

function normalizeInterviewerPrompt(value: unknown, styleId: InterviewerStyleId): InterviewerPromptProfile {
  const source = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Partial<
    Record<keyof InterviewerPromptProfile, unknown>
  >;
  const fallback = defaultInterviewerPrompts[styleId];
  return interviewerPromptKeys.reduce<InterviewerPromptProfile>((result, key) => {
    const rawValue = source[key];
    const trimmedValue = typeof rawValue === "string" ? rawValue.trim() : "";
    return {
      ...result,
      [key]: trimmedValue || fallback[key]
    };
  }, { ...fallback });
}

function normalizeInterviewers(value: unknown): Record<InterviewerStyleId, InterviewerPromptProfile> {
  const source = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Partial<
    Record<InterviewerStyleId, unknown>
  >;
  return interviewerStyleIds.reduce<Record<InterviewerStyleId, InterviewerPromptProfile>>((result, styleId) => {
    result[styleId] = normalizeInterviewerPrompt(source[styleId], styleId);
    return result;
  }, {} as Record<InterviewerStyleId, InterviewerPromptProfile>);
}

export function normalizePromptOverrides(value: unknown): PromptOverrides {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<Record<keyof PromptOverrides, unknown>>)
      : {};

  const normalized: PromptOverrides = {
    ...defaultPromptOverrides,
    interviewers: normalizeInterviewers(source.interviewers)
  };

  for (const key of overrideStringKeys) {
    const rawValue = source[key];
    const trimmedValue = typeof rawValue === "string" ? rawValue.trim() : "";
    normalized[key] = trimmedValue || defaultPromptOverrides[key];
  }

  return normalized;
}
