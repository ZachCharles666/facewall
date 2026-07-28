import "server-only";

export const CURRENT_PRIVACY_POLICY = {
  version: "2026-07",
  title: "PassBuddy 内测隐私说明（待产品/法务冻结）",
  content: [
    "PassBuddy 内测会保存你主动提交的简历、岗位描述、候选人画像、面试题、文字回答和复盘报告，用于提供面试训练、恢复未完成流程与内测质量分析。",
    "系统不保存原始音频。语音识别失败时，你可以重试或改用文字编辑。",
    "内测数据默认在内测结束后保留 90 天；你可以随时提交删除申请，由管理员按留痕流程处理。",
    "本说明是开发阶段占位文本，正式灰度前必须由产品/法务确认正文并冻结版本。"
  ].join("\n\n"),
  scopes: ["interview_delivery", "internal_analysis"] as const
};

export type PrivacyScope = (typeof CURRENT_PRIVACY_POLICY.scopes)[number];
