import type { InterviewerStyleId, SessionStep } from "@/lib/types";

export const SESSION_STEPS: SessionStep[] = ["setup", "profile", "questions", "interview", "report"];

export const INTERVIEWER_STYLES: Array<{
  id: InterviewerStyleId;
  label: string;
  summary: string;
  description: string;
}> = [
  {
    id: "strictHr",
    label: "温婉HR小姐姐",
    summary: "语气温柔的职场观察者，擅长从沟通、协作与动机中捕捉你的闪光点。",
    description: "说话极具亲和力和引导感，不聊生硬的技术，只关心你的成长路径、团队契合度以及面对挫折时的真实心态。"
  },
  {
    id: "techBro",
    label: "技术老哥",
    summary: "说话直接的代码实战派，死磕技术实现边界，拒绝任何空泛的概念。",
    description: "问法直白且注重细节，会死盯着你的项目架构、需求拆解和异常处理，随时准备用连环追问试探你的技术底线。"
  },
  {
    id: "gentleSister",
    label: "资深业务大佬",
    summary: "自带压迫感的商业操盘手，只看业务指标、资源取舍和最终的用户价值。",
    description: "提问直击痛点、充满审视感。不关心你的执行过程，只逼你回答“为什么做”以及“如何证明你的结果不是靠运气”。"
  }
];

export const DEFAULT_STYLE_ID: InterviewerStyleId = "strictHr";
