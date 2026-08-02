import { useState } from "react";
import { defaultInterviewerPrompts, defaultPromptOverrides, promptDataFormatPreview } from "@/lib/prompts/productPromptSuite";
import { INTERVIEWER_STYLES } from "@/lib/state/constants";
import type { InterviewerPromptProfile, InterviewerStyleId, PromptOverrides } from "@/lib/types";

type EditablePromptFieldKey = "system" | "profile" | "questions" | "report";

const interviewerPromptFields: Array<{ key: keyof InterviewerPromptProfile; label: string; helper: string }> = [
  {
    key: "persona",
    label: "人设 / 口吻",
    helper: "这个面试官是谁、说话口吻。会注入题目和报告，决定整体气质。"
  },
  {
    key: "questions",
    label: "出题倾向",
    helper: "关注重点、切入角度、追问力度、要避免的问题。三种面试官在这里必须明显不同。"
  },
  {
    key: "report",
    label: "评分 / 诊断倾向",
    helper: "评价侧重和诊断口吻。仅调侧重与语气，6 维分数结构、区间和权重仍固定不变。"
  }
];

const promptFields: Array<{ key: EditablePromptFieldKey; label: string; helper: string }> = [
  {
    key: "system",
    label: "公共系统指令",
    helper: "影响画像、题目和报告。JSON、事实边界和字段契约仍由后端硬规则锁定。"
  },
  {
    key: "profile",
    label: "候选人画像 Prompt",
    helper: "用于 /api/profile/parse，建议调整匹配点、风险点、补充建议和来源证据策略。"
  },
  {
    key: "questions",
    label: "面试题生成 Prompt",
    helper: "用于 /api/questions/generate，建议调整 Q1/Q2/Q3 编排、题型倾向和面试官语气。"
  },
  {
    key: "report",
    label: "复盘与嘴替 Prompt",
    helper: "用于流式/非流式报告和单题重新生成，建议调整诊断语气、嘴替答案和 60 秒版风格。"
  }
];

export function PromptDebugPanel({
  value,
  saveState,
  updatedAt,
  onChange,
  onReload,
  onSave,
  onReset
}: {
  value: PromptOverrides;
  saveState: { kind: "idle" | "loading" | "success" | "error"; message: string };
  updatedAt: string | null;
  onChange: (value: PromptOverrides) => void;
  onReload: () => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const [activeInterviewer, setActiveInterviewer] = useState<InterviewerStyleId>(INTERVIEWER_STYLES[0].id);

  function updatePrompt(key: EditablePromptFieldKey, nextValue: string) {
    onChange({
      ...value,
      [key]: nextValue
    });
  }

  function updateInterviewerPrompt(styleId: InterviewerStyleId, key: keyof InterviewerPromptProfile, nextValue: string) {
    onChange({
      ...value,
      interviewers: {
        ...value.interviewers,
        [styleId]: {
          ...value.interviewers[styleId],
          [key]: nextValue
        }
      }
    });
  }

  const activeInterviewerPrompt = value.interviewers[activeInterviewer];

  return (
    <section className="panel prompt-debug-panel" aria-label="产品 Prompt 调试">
      <div className="panel-header">
        <div>
          <h2>Prompt 调试</h2>
          <p>classic 可编辑草稿并直接测试；点击保存后会成为 figma 主题和后续 LLM 接口默认 Prompt。</p>
        </div>
        <div className="inline-actions compact-actions prompt-debug-actions">
          <button onClick={onReload} disabled={saveState.kind === "loading"}>
            重新加载全局 Prompt
          </button>
          <button onClick={onReset} disabled={saveState.kind === "loading"}>
            恢复产品默认 Prompt
          </button>
          <button className="primary" onClick={onSave} disabled={saveState.kind === "loading"}>
            保存为全局 Prompt
          </button>
        </div>
      </div>

      <div className={`prompt-save-status ${saveState.kind}`}>
        <span>{saveState.message}</span>
        <small>当前全局保存时间：{updatedAt ? new Date(updatedAt).toLocaleString("zh-CN", { hour12: false }) : "未保存"}</small>
      </div>

      <div className="prompt-locked-notice" role="note">
        <strong>可调的是「策略 / 侧重 / 语气 / 措辞」。下列由后端契约锁定，在 prompt 里改字段名或结构不会生效，还可能触发演示兜底：</strong>
        <ul>
          <li>
            输出字段名与 JSON 结构（如 <code>sourceMatches</code>、<code>suggestedSupplements</code>、<code>questionReports</code>、
            <code>dimensionScores</code>）
          </li>
          <li>题目固定 3 道、id 固定 <code>q1/q2/q3</code></li>
          <li>报告固定 6 个评分维度、分数区间（维度 0–20、总分 0–100）与权重</li>
          <li>copyText 必须同时包含「优化答案」和「复盘报告」</li>
          <li>不得编造用户未提供的公司、指标、人数、金额、奖项</li>
        </ul>
        <small>想改这些字段名或结构，需要走契约变更（types / schema / demo data / 前端展示 一起改），不能只在此处改 prompt。</small>
      </div>

      <div className="prompt-debug-grid">
        {promptFields.map((field) => (
          <label className="prompt-debug-field" key={field.key} htmlFor={`prompt-${field.key}`}>
            <span>{field.label}</span>
            <small>{field.helper}</small>
            <textarea
              id={`prompt-${field.key}`}
              value={value[field.key]}
              onChange={(event) => updatePrompt(field.key, event.target.value)}
              spellCheck={false}
            />
          </label>
        ))}
      </div>

      <div className="panel prompt-interviewer-panel">
        <div className="panel-header compact-header">
          <div>
            <h3>分面试官 Prompt</h3>
            <p>每个面试官单独配置人设、出题和评分倾向。与上方全局 Prompt 一起保存，figma 主题也会读取同一份。</p>
          </div>
        </div>

        <div className="style-grid prompt-interviewer-tabs" role="tablist" aria-label="选择要编辑的面试官">
          {INTERVIEWER_STYLES.map((style) => (
            <button
              className={activeInterviewer === style.id ? "style-option selected" : "style-option"}
              key={style.id}
              onClick={() => setActiveInterviewer(style.id)}
              role="tab"
              aria-selected={activeInterviewer === style.id}
            >
              <strong>{style.label}</strong>
              <span>{style.description}</span>
            </button>
          ))}
        </div>

        <div className="prompt-debug-grid">
          {interviewerPromptFields.map((field) => (
            <label
              className="prompt-debug-field"
              key={`${activeInterviewer}-${field.key}`}
              htmlFor={`interviewer-${activeInterviewer}-${field.key}`}
            >
              <span>{field.label}</span>
              <small>{field.helper}</small>
              <textarea
                id={`interviewer-${activeInterviewer}-${field.key}`}
                value={activeInterviewerPrompt[field.key]}
                onChange={(event) => updateInterviewerPrompt(activeInterviewer, field.key, event.target.value)}
                spellCheck={false}
              />
            </label>
          ))}
        </div>
      </div>

      <details className="prompt-format-details">
        <summary>查看当前线上实际数据格式</summary>
        <p className="helper">
          产品文档中的字段名已映射到当前 API 契约。发布前如需改字段名或增加 weight，需要先改
          docs/04_api_contracts.md、TypeScript 类型、schema、demo data 和前端展示。
        </p>
        <pre>{JSON.stringify(promptDataFormatPreview, null, 2)}</pre>
      </details>
    </section>
  );
}

export function cloneDefaultPromptOverrides(): PromptOverrides {
  return {
    ...defaultPromptOverrides,
    interviewers: Object.fromEntries(
      (Object.keys(defaultInterviewerPrompts) as InterviewerStyleId[]).map((styleId) => [
        styleId,
        { ...defaultInterviewerPrompts[styleId] }
      ])
    ) as Record<InterviewerStyleId, InterviewerPromptProfile>
  };
}
