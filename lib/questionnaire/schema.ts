export type QuestionnaireQuestionType =
  | "rating"
  | "single"
  | "multiple"
  | "text";

export interface QuestionnaireOption {
  id: string;
  label: string;
}

export interface QuestionnaireQuestion {
  id: string;
  type: QuestionnaireQuestionType;
  prompt: string;
  required: boolean;
  options: QuestionnaireOption[];
  maxLength?: number;
}

export interface QuestionnaireConfig {
  version: string;
  title: string;
  subtitle: string;
  inviteTitle: string;
  inviteDescription: string;
  questions: QuestionnaireQuestion[];
}

export type QuestionnaireAnswerValue = number | string | string[];
export type QuestionnaireAnswers = Record<string, QuestionnaireAnswerValue>;

const questionTypes = new Set<QuestionnaireQuestionType>([
  "rating",
  "single",
  "multiple",
  "text"
]);

export const defaultQuestionnaireConfig: QuestionnaireConfig = {
  version: "questionnaire-v1",
  title: "参与内测反馈",
  subtitle: "解锁额外模拟面试机会",
  inviteTitle: "诚邀你参与产品体验调研",
  inviteDescription:
    "我们非常关心的你的使用体验。\n点击下方按钮填写问卷，参与内测反馈解锁额外模拟面试机会。",
  questions: [
    {
      id: "experience_rating",
      type: "rating",
      prompt: "这次模拟面试体验,你打几分?",
      required: true,
      options: []
    },
    {
      id: "unsatisfied_aspects",
      type: "multiple",
      prompt: "这次模拟面试,哪个环节让你感觉最不真实/不满意（多选）?",
      required: true,
      options: [
        { id: "questions", label: "AI提问的方式和逻辑" },
        { id: "voice", label: "AI的语音/语调" },
        { id: "feedback", label: "面试反馈/点评的质量" },
        { id: "interaction", label: "界面操作体验" },
        { id: "none", label: "都还不错,没有明显问题" }
      ]
    },
    {
      id: "willingness_to_pay",
      type: "single",
      prompt: "如果这个产品完善后收费,你会（单选）",
      required: true,
      options: [
        { id: "yes", label: "愿意付费使用" },
        { id: "depends", label: "需要看到更多功能再决定" },
        { id: "no", label: "可能不会付费" }
      ]
    },
    {
      id: "suggestion",
      type: "text",
      prompt: "有什么具体的建议或吐槽?(选填)",
      required: false,
      options: [],
      maxLength: 500
    }
  ]
};

function safeText(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function safeIdentifier(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return normalized || fallback;
}

function normalizeOptions(
  value: unknown,
  fallback: QuestionnaireOption[]
): QuestionnaireOption[] {
  if (!Array.isArray(value)) return fallback;
  const seen = new Set<string>();
  return value
    .slice(0, 8)
    .map((item, index) => {
      const record =
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : {};
      let id = safeIdentifier(record.id, `option_${index + 1}`);
      while (seen.has(id)) id = `${id}_${index + 1}`;
      seen.add(id);
      return {
        id,
        label: safeText(record.label, `选项 ${index + 1}`, 80)
      };
    })
    .filter((option) => option.label.length > 0);
}

export function normalizeQuestionnaireConfig(
  value: unknown,
  fallback: QuestionnaireConfig = defaultQuestionnaireConfig
): QuestionnaireConfig {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const rawQuestions = Array.isArray(record.questions)
    ? record.questions.slice(0, 12)
    : fallback.questions;
  const seen = new Set<string>();
  const questions = rawQuestions.map((item, index) => {
    const question =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {};
    const fallbackQuestion =
      fallback.questions[index] ?? defaultQuestionnaireConfig.questions[0];
    let id = safeIdentifier(question.id, fallbackQuestion.id || `question_${index + 1}`);
    while (seen.has(id)) id = `${id}_${index + 1}`;
    seen.add(id);
    const type = questionTypes.has(question.type as QuestionnaireQuestionType)
      ? (question.type as QuestionnaireQuestionType)
      : fallbackQuestion.type;
    const options =
      type === "single" || type === "multiple"
        ? normalizeOptions(question.options, fallbackQuestion.options)
        : [];
    return {
      id,
      type,
      prompt: safeText(question.prompt, fallbackQuestion.prompt, 160),
      required:
        typeof question.required === "boolean"
          ? question.required
          : fallbackQuestion.required,
      options,
      ...(type === "text"
        ? {
            maxLength:
              Number.isInteger(question.maxLength) &&
              Number(question.maxLength) >= 50 &&
              Number(question.maxLength) <= 1000
                ? Number(question.maxLength)
                : fallbackQuestion.maxLength ?? 500
          }
        : {})
    };
  });

  return {
    version: safeText(record.version, fallback.version, 80),
    title: safeText(record.title, fallback.title, 80),
    subtitle: safeText(record.subtitle, fallback.subtitle, 120),
    inviteTitle: safeText(record.inviteTitle, fallback.inviteTitle, 100),
    inviteDescription: safeText(
      record.inviteDescription,
      fallback.inviteDescription,
      240
    ),
    questions: questions.length > 0 ? questions : fallback.questions
  };
}

export function validateQuestionnaireAnswers(
  config: QuestionnaireConfig,
  value: unknown
): QuestionnaireAnswers | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const allowedIds = new Set(config.questions.map((question) => question.id));
  if (Object.keys(input).some((key) => !allowedIds.has(key))) return null;

  const answers: QuestionnaireAnswers = {};
  for (const question of config.questions) {
    const answer = input[question.id];
    if (question.type === "rating") {
      if (answer === undefined && !question.required) continue;
      if (!Number.isInteger(answer) || Number(answer) < 1 || Number(answer) > 5) {
        return null;
      }
      answers[question.id] = Number(answer);
      continue;
    }
    if (question.type === "text") {
      if ((answer === undefined || answer === "") && !question.required) continue;
      if (
        typeof answer !== "string" ||
        answer.trim().length === 0 ||
        answer.length > (question.maxLength ?? 500)
      ) {
        return null;
      }
      answers[question.id] = answer.trim();
      continue;
    }
    const optionIds = new Set(question.options.map((option) => option.id));
    if (question.type === "single") {
      if (answer === undefined && !question.required) continue;
      if (typeof answer !== "string" || !optionIds.has(answer)) return null;
      answers[question.id] = answer;
      continue;
    }
    if (answer === undefined && !question.required) continue;
    if (
      !Array.isArray(answer) ||
      (question.required && answer.length === 0) ||
      answer.length > question.options.length ||
      answer.some((item) => typeof item !== "string" || !optionIds.has(item)) ||
      new Set(answer).size !== answer.length
    ) {
      return null;
    }
    answers[question.id] = answer as string[];
  }
  return answers;
}
