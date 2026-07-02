import type { DemoScenario, InterviewReport } from "@/lib/types";

const copyText = [
  "复盘报告",
  "整体表现：你有 AI 工具调研、用户访谈和原型推进经历，和 AI 产品经理实习的入门要求匹配。当前最大扣分点是回答像项目流水账，个人判断、指标口径和事实边界还不够清楚。",
  "",
  "优化答案",
  "Q1：我会用目标、洞察、动作、结果来讲 AI 简历助手项目。我负责 12 位同学访谈、竞品拆解和低保真原型，把痛点从“不会写简历”收敛到“不会把经历转成岗位语言”。我推动补充 JD 关键词对照和改写前后示例，用 18 次可用性测试验证任务完成率提升，但只把它表述为校内小样本结果。",
  "",
  "Q2：我把 AI 产品经理理解为“把不确定的用户问题变成可验证方案”的角色。我的优势是能做用户访谈、需求拆解和原型沟通，也能用基础 SQL/表格看转化数据。短板是线上增长经验有限，所以我会先补指标口径、埋点和 A/B 测试案例。",
  "",
  "Q3：如果被质疑只是包装概念，我会先承认项目还在校内和实习场景，没有商业化规模。但我能拿出真实访谈记录、PRD、原型迭代和测试反馈，说明自己不是空谈 AI，而是在验证具体用户问题。"
].join("\n");

export const demoReport: InterviewReport = {
  questionReports: [
    {
      questionId: "q1",
      score: 82,
      dimensionScores: {
        jobRelevance: 18,
        structure: 16,
        evidence: 15,
        professionalExpression: 14,
        truthBoundary: 10,
        completeness: 9
      },
      riskTags: ["流水账表达", "个人判断不够突出", "指标口径偏弱"],
      fatalIssue: "回答提到了 AI 项目，但没有先说明你解决的用户问题和个人决策。",
      diagnosis:
        "这题最适合打出 Demo 高光：先讲用户痛点，再讲你如何把痛点收敛成 AI 简历助手的核心功能。避免只罗列访谈、原型、测试，要突出你做了什么判断，以及哪些结果只是小样本验证。",
      optimizedAnswer:
        "我会讲 AI 简历助手项目。目标不是做一个炫技工具，而是帮同学把经历转成 JD 能识别的表达。我负责 12 位同学访谈、竞品拆解和低保真原型，把痛点收敛为“经历和岗位语言断层”。随后我推动补充 JD 关键词对照、改写前后示例和风险提示，并用 18 次可用性测试验证任务完成率提升。这个结果只代表校内小样本，我不会夸大成商业化结论。",
      oralVersion60s:
        "我会用目标、洞察、动作、结果来讲。这个项目想解决的是同学不会把经历转成岗位语言。我负责访谈、竞品拆解和原型，把需求收敛到 JD 关键词对照、改写示例和风险提示。我们做了 18 次可用性测试，任务完成率有提升，但我会说明这是校内小样本，不夸大结论。"
    },
    {
      questionId: "q2",
      score: 79,
      dimensionScores: {
        jobRelevance: 18,
        structure: 15,
        evidence: 14,
        professionalExpression: 13,
        truthBoundary: 10,
        completeness: 9
      },
      riskTags: ["岗位理解容易泛化", "缺少入职后落地路径"],
      fatalIssue: "只说喜欢 AI 和产品，会让面试官觉得你停留在概念层。",
      diagnosis:
        "需要把 AI 产品经理拆成用户问题定义、模型能力边界、验证指标和跨团队推进，而不是泛泛说自己对 AI 感兴趣。短板可以承认，但要给出补足路径。",
      optimizedAnswer:
        "我理解 AI 产品经理的核心不是追热点，而是把不确定的用户问题变成可验证方案。我的匹配点有三块：做过用户访谈和需求拆解，能把模糊痛点收敛成原型；做过基础数据看板，能用转化和任务完成率评估效果；也参与过和设计、开发同学对齐范围。我的短板是线上增长和模型评估经验有限，所以会先补埋点、A/B 测试和提示词评测案例。",
      oralVersion60s:
        "我理解 AI 产品经理不是单纯追热点，而是把用户问题、模型能力和验证指标连起来。我做过访谈、需求拆解和原型，也能看基础数据。短板是线上增长和模型评估经验还少，所以我会补埋点、A/B 测试和提示词评测案例，让自己更快进入团队语境。"
    },
    {
      questionId: "q3",
      score: 76,
      dimensionScores: {
        jobRelevance: 16,
        structure: 14,
        evidence: 13,
        professionalExpression: 13,
        truthBoundary: 11,
        completeness: 9
      },
      riskTags: ["压力题容易辩解", "AI 概念边界需说明", "证据展示不足"],
      fatalIssue: "如果急着证明自己懂 AI，反而会暴露经历规模和事实边界。",
      diagnosis:
        "压力题要先接住质疑，再用可验证材料回应。重点不是把校内项目包装成成熟产品，而是展示你如何识别问题、验证方案、承认边界并继续补证据。",
      optimizedAnswer:
        "如果您觉得我的 AI 项目偏概念，我会先承认边界：它确实还在校内和实习场景，没有商业化规模。但我不是只做包装，我保留了访谈记录、竞品拆解、PRD、原型迭代和测试反馈。我的价值在于把“想做 AI 工具”拆成真实用户痛点、可交互方案和验证指标。后续我会补更多线上数据和模型评估方法，避免只停留在概念表达。",
      oralVersion60s:
        "我会先承认边界：项目还在校内和实习场景，没有商业化规模。但它不是纯概念，我有访谈记录、竞品拆解、PRD、原型迭代和测试反馈。我的重点是把 AI 想法拆成用户痛点、可交互方案和验证指标。后续会补线上数据和模型评估方法。"
    }
  ],
  finalReport: {
    overallScore: 79,
    summary:
      "候选人适合用 AI 产品经理实习场景做 Hackathon Demo：原回答保留真实经历，但表达松散；优化后能明显看到从普通叙述到岗位化、可背诵答案的跃迁。",
    topRisks: ["AI 项目容易讲成概念包装", "个人贡献和团队成果边界需更清楚", "数据结果必须标注小样本和短周期"],
    actionItems: ["把 AI 项目整理成 1 页 PRD + 1 页指标复盘", "为每道题准备 2 个可验证证据点", "所有指标统一补充样本量、时间范围和个人动作"],
    copyText
  }
};

export const demoScenario: DemoScenario = {
  scenarioId: "ai_pm_intern_hackathon",
  label: "AI 产品经理实习生",
  defaultInterviewerStyleId: "strictHr",
  resumeText:
    "应届本科生，目标岗位为 AI 产品经理实习生。曾做过一个 AI 简历助手课程项目，负责 12 位同学用户访谈、竞品拆解、需求列表、低保真原型和可用性测试记录；项目聚焦把经历改写成更贴合 JD 的表达。另有教育科技实习经历，参与用户反馈整理、社群内容排期和基础数据看板维护。熟悉 Figma、Excel、问卷分析和基础 SQL，会写简单 PRD。项目有任务完成率、测试反馈等数据，但样本量较小，个人贡献和长期效果还需要更清楚表达。",
  jdText:
    "AI 产品经理实习生：参与 AI 工具类产品的需求调研、用户访谈、竞品分析、PRD 撰写、原型沟通和数据复盘；需要理解用户场景，能把模糊需求拆成可验证方案，和设计、研发、运营协作推进。加分项包括熟悉大模型产品、提示词评测、A/B 测试意识、SQL 或数据分析能力。",
  candidateProfile: {
    summary:
      "候选人有 AI 简历助手项目、用户访谈、原型和基础数据分析经历，和 AI 产品经理实习的入门要求匹配。主要风险是 AI 项目规模较小、指标口径不稳定，回答时需要清楚说明个人贡献和事实边界。",
    matchedPoints: ["AI 工具项目经历匹配岗位方向", "做过用户访谈、竞品拆解、PRD 和原型沟通", "具备基础 SQL、表格分析和数据复盘意识"],
    riskPoints: ["AI 项目容易被质疑为课程包装", "任务完成率等数据样本量较小", "个人贡献和团队成果边界需要提前说清楚"],
    keywords: ["AI 产品经理", "用户访谈", "竞品分析", "PRD", "原型", "数据复盘", "提示词评测"],
    evidenceMaterials: [
      {
        title: "AI 简历助手项目",
        source: "resume",
        content: "候选人负责 12 位同学访谈、竞品拆解、需求列表、低保真原型和可用性测试记录。"
      },
      {
        title: "岗位核心要求",
        source: "jd",
        content: "JD 要求需求调研、PRD、原型沟通、数据复盘和跨团队协作。"
      },
      {
        title: "风险推断",
        source: "inferred",
        content: "简历提到任务完成率和测试反馈，但样本量较小，必须避免夸大商业化结果。"
      }
    ],
    sourceMatches: [
      {
        resumeText: "AI 简历助手课程项目",
        jdText: "AI 工具类产品",
        reason: "简历项目方向和 JD 要求的 AI 工具产品类型一致。",
        confidence: 0.92
      },
      {
        resumeText: "用户访谈、竞品拆解、需求列表、低保真原型",
        jdText: "需求调研、用户访谈、竞品分析、PRD 撰写、原型沟通",
        reason: "候选人的项目动作覆盖 JD 的核心产品实习职责。",
        confidence: 0.9
      },
      {
        resumeText: "基础数据看板维护",
        jdText: "数据复盘",
        reason: "简历中的数据看板经历可迁移到 JD 的复盘和指标意识要求。",
        confidence: 0.78
      },
      {
        resumeText: "基础 SQL",
        jdText: "SQL 或数据分析能力",
        reason: "简历技能和 JD 加分项直接对应。",
        confidence: 0.86
      }
    ],
    suggestedSupplements: ["AI 简历助手的任务完成率口径", "个人负责的 PRD 或原型链接", "一次需求取舍或跨团队沟通案例"]
  },
  questions: [
    {
      id: "q1",
      type: "project",
      title: "AI 项目贡献深挖",
      questionText:
        "你提到做过 AI 简历助手。请讲一个最能体现你产品判断的环节：你发现了什么真实问题，为什么这样设计，结果如何验证？",
      intent: "验证候选人是否能把 AI 项目从概念包装讲成用户问题、产品动作和验证结果。",
      expectedSignals: ["明确用户痛点", "说明个人产品判断", "有样本量和验证边界"],
      difficulty: "medium"
    },
    {
      id: "q2",
      type: "motivation",
      title: "岗位理解匹配",
      questionText:
        "为什么你认为自己适合 AI 产品经理实习？不要只讲对 AI 感兴趣，请结合 JD 里的用户调研、PRD、原型沟通和数据复盘回答。",
      intent: "检查岗位理解是否具体，以及经历能否迁移到 AI 产品经理实习职责。",
      expectedSignals: ["引用 JD 关键词", "说明经历迁移", "承认短板和补足计划"],
      difficulty: "medium"
    },
    {
      id: "q3",
      type: "pressure",
      title: "压力追问",
      questionText: "如果我说你的 AI 项目更像课程包装，离真实 AI 产品经理还很远，你会怎么回应？",
      intent: "观察候选人面对质疑时是否能守住事实边界，并用材料证明产品思考。",
      expectedSignals: ["不防御", "承认项目边界", "拿出可验证材料"],
      difficulty: "hard"
    }
  ],
  sampleAnswers: [
    {
      questionId: "q1",
      answerText:
        "我做的是一个 AI 简历助手，主要是帮助同学改简历。我当时做了访谈，也看了一些竞品，然后画了原型。我们发现大家不是不会写，而是不知道怎么贴 JD，所以做了关键词对照和改写示例。测试时大家觉得更清楚，但数据不是特别大，主要是十几次测试。",
      inputMode: "text",
      durationSec: 63,
      sttStatus: "manual"
    },
    {
      questionId: "q2",
      answerText:
        "我觉得自己适合 AI 产品经理，因为我对 AI 很感兴趣，也做过相关项目。我会访谈用户、写 PRD、画原型，也会看一些数据。JD 里的要求我基本都接触过，不过我线上产品经验不多，所以还需要继续补。",
      inputMode: "edited",
      durationSec: 55,
      sttStatus: "success"
    },
    {
      questionId: "q3",
      answerText:
        "我会承认项目确实还比较小，不是一个上线产品。但是我不是只包装概念，我有访谈记录、原型和测试反馈，也做过需求取舍。后面我会补更多真实数据和模型评估方法。",
      inputMode: "text",
      durationSec: 42,
      sttStatus: "manual"
    }
  ],
  report: demoReport
};
