import type { InterviewerStyleId, SessionStep } from "@/lib/types";

export const SESSION_STEPS: SessionStep[] = ["setup", "profile", "questions", "interview", "report"];

export const INTERVIEWER_STYLES: Array<{
  id: InterviewerStyleId;
  label: string;
  description: string;
}> = [
  {
    id: "strictHr",
    label: "大厂严厉 HR",
    description: "追问动机、稳定性和表达边界，压力感更强。"
  },
  {
    id: "techBro",
    label: "技术老哥",
    description: "聚焦项目细节、方法论和可验证证据。"
  },
  {
    id: "gentleSister",
    label: "温柔大姐姐",
    description: "语气友好，但会引导你补足结构和重点。"
  }
];

export const DEFAULT_STYLE_ID: InterviewerStyleId = "strictHr";
