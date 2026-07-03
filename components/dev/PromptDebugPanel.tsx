import { defaultPromptOverrides, promptDataFormatPreview } from "@/lib/prompts/productPromptSuite";
import type { PromptOverrides } from "@/lib/types";

const promptFields: Array<{ key: keyof PromptOverrides; label: string; helper: string }> = [
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
  function updatePrompt(key: keyof PromptOverrides, nextValue: string) {
    onChange({
      ...value,
      [key]: nextValue
    });
  }

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
  return { ...defaultPromptOverrides };
}
