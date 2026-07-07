import { INTERVIEWER_STYLES } from "@/lib/state/constants";
import { defaultPromptOverrides, normalizePromptOverrides } from "@/lib/prompts/productPromptSuite";
import type { CandidateProfile, InterviewAnswer, InterviewQuestion, InterviewerStyleId, PromptOverrides } from "@/lib/types";

function styleLabel(styleId: InterviewerStyleId) {
  return INTERVIEWER_STYLES.find((style) => style.id === styleId)?.label ?? styleId;
}

const systemRules = [
  "你是中文面试教练 API，只返回严格 JSON，不要 Markdown。",
  "不得编造用户未提供的硬事实，例如公司名、指标、获奖经历。",
  "信息不足时写入 suggestedSupplements 或在 diagnosis 中指出缺口。",
  "优化答案要像候选人可背诵的口语化高分答案，但必须保留事实边界。",
  "所有字段必须符合调用方给出的 JSON shape。"
].join("\n");

function buildSystemContent(promptOverrides?: Partial<PromptOverrides>) {
  const overrides = normalizePromptOverrides(promptOverrides);
  return [systemRules, "产品可调系统指令：", overrides.system].join("\n\n");
}

export function buildProfilePrompt(
  input: { resumeText: string; jdText: string; interviewerStyleId: InterviewerStyleId },
  promptOverrides: Partial<PromptOverrides> = defaultPromptOverrides
) {
  const overrides = normalizePromptOverrides(promptOverrides);
  return [
    { role: "system" as const, content: buildSystemContent(overrides) },
    {
      role: "user" as const,
      content: JSON.stringify(
        {
          task: "根据简历和 JD 生成 CandidateProfile。",
          productPrompt: overrides.profile,
          rules: [
            "sourceMatches 必须返回 2 到 5 条简历和 JD 的结构化匹配证据。",
            "sourceMatches.resumeText 必须尽量使用简历原文中的连续短语；sourceMatches.jdText 必须尽量使用 JD 原文中的连续短语。",
            "sourceMatches.reason 说明两段文本为什么匹配；confidence 是 0 到 1 的数字。",
            "如果只能弱匹配，confidence 降低，并在 suggestedSupplements 中提示需要补充材料。",
            "不得为了匹配而编造简历或 JD 中不存在的硬事实。"
          ],
          interviewerStyle: styleLabel(input.interviewerStyleId),
          outputShape: {
            summary: "string",
            matchedPoints: ["string"],
            riskPoints: ["string"],
            keywords: ["string"],
            evidenceMaterials: [{ title: "string", source: "resume|jd|inferred", content: "string" }],
            sourceMatches: [
              {
                resumeText: "简历原文中的连续短语",
                jdText: "JD 原文中的连续短语",
                reason: "匹配原因",
                confidence: 0.85
              }
            ],
            suggestedSupplements: ["string"]
          },
          resumeText: input.resumeText,
          jdText: input.jdText
        },
        null,
        2
      )
    }
  ];
}

export function buildQuestionsPrompt(input: {
  candidateProfile: CandidateProfile;
  interviewerStyleId: InterviewerStyleId;
  questionCount: 3;
}, promptOverrides: Partial<PromptOverrides> = defaultPromptOverrides) {
  const overrides = normalizePromptOverrides(promptOverrides);
  const interviewerPrompt = overrides.interviewers[input.interviewerStyleId];
  return [
    { role: "system" as const, content: buildSystemContent(overrides) },
    {
      role: "user" as const,
      content: JSON.stringify(
        {
          task: "生成 3 道可回答、可评分的中文面试题。",
          productPrompt: overrides.questions,
          interviewerPersona: interviewerPrompt.persona,
          interviewerQuestionGuide: interviewerPrompt.questions,
          rules: [
            "固定返回 questions 数组，长度必须为 3。",
            "id 必须稳定为 q1/q2/q3。",
            "每题必须体现候选人画像、JD 关键词或风险点。",
            "如果画像或 JD 是 AI 产品经理/AI 工具方向，题目要追问用户问题、产品判断、验证指标、模型能力边界或跨团队推进。",
            "技术老哥风格是专业深挖，不要在非技术岗位强行写代码题。",
            "必须严格按 interviewerPersona 和 interviewerQuestionGuide 生成：不同面试官在关注重点、切入角度、追问力度上必须明显不同，不能只是语气不同。"
          ],
          interviewerStyle: styleLabel(input.interviewerStyleId),
          outputShape: {
            questions: [
              {
                id: "q1",
                type: "behavior|project|pressure|technical|motivation",
                title: "string",
                questionText: "string",
                intent: "string",
                expectedSignals: ["string"],
                difficulty: "easy|medium|hard"
              }
            ]
          },
          candidateProfile: input.candidateProfile
        },
        null,
        2
      )
    }
  ];
}

export function buildReportPrompt(input: {
  candidateProfile: CandidateProfile;
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
  interviewerStyleId?: InterviewerStyleId;
}, promptOverrides: Partial<PromptOverrides> = defaultPromptOverrides) {
  const overrides = normalizePromptOverrides(promptOverrides);
  const interviewerPrompt = input.interviewerStyleId ? overrides.interviewers[input.interviewerStyleId] : undefined;
  return [
    { role: "system" as const, content: buildSystemContent(overrides) },
    {
      role: "user" as const,
      content: JSON.stringify(
        {
          task: "基于画像、问题和答案生成非流式复盘报告。",
          productPrompt: overrides.report,
          interviewerStyle: input.interviewerStyleId ? styleLabel(input.interviewerStyleId) : undefined,
          interviewerPersona: interviewerPrompt?.persona,
          interviewerReportGuide: interviewerPrompt?.report,
          scoringWeights: {
            jobRelevance: "25%",
            structure: "20%",
            evidence: "20%",
            professionalExpression: "15%",
            truthBoundary: "10%",
            completeness: "10%"
          },
          rules: [
            "questionReports 必须与输入 questions 的 questionId 一一对应。",
            "每题必须包含 6 个评分维度，维度分数 0 到 20，总分 0 到 100。",
            "如果提供了 interviewerPersona / interviewerReportGuide，评价侧重和诊断口吻要按该面试官人设，但 6 个维度、分数区间、权重和事实边界必须保持不变。",
            "答案为空时必须指出缺失，不得替用户编造回答。",
            "答案过短或跑题时，必须在 riskTags/fatalIssue/diagnosis 中指出，并给补充建议或保守嘴替。",
            "finalReport.copyText 必须同时包含“优化答案”和“复盘报告”。",
            "优化答案只能改善结构和表达，必须保留事实边界。",
            "每题 optimizedAnswer 控制在 300 个中文字符以内；如果信息不足，宁可保守，不要补不存在的指标、公司、人数、金额、奖项。"
          ],
          outputShape: {
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
                riskTags: ["string"],
                fatalIssue: "string",
                diagnosis: "string",
                optimizedAnswer: "string",
                oralVersion60s: "string"
              }
            ],
            finalReport: {
              overallScore: 78,
              summary: "string",
              topRisks: ["string"],
              actionItems: ["string"],
              copyText: "string"
            }
          },
          candidateProfile: input.candidateProfile,
          questions: input.questions,
          answers: input.answers
        },
        null,
        2
      )
    }
  ];
}
