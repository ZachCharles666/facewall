import type { InterviewerStyleId, SessionStep } from "@/lib/types";

export const SESSION_STEPS: SessionStep[] = ["setup", "profile", "questions", "interview", "report"];

export const INTERVIEWER_STYLES: Array<{
  id: InterviewerStyleId;
  label: string;
  description: string;
}> = [
  {
    id: "strictHr",
    label: "温柔HR小姐姐",
    description: "题目更基础，诊断更偏建议，适合应届生首次练习。"
  },
  {
    id: "techBro",
    label: "技术老哥",
    description: "更容易生成专业题和项目深挖题，诊断会指出技术/方法论空泛问题。"
  },
  {
    id: "gentleSister",
    label: "资深业务大佬",
    description: "更关注业务理解、取舍能力和岗位匹配度。"
  }
];

export const DEFAULT_STYLE_ID: InterviewerStyleId = "strictHr";
