import { demoScenario } from "@/lib/demo/scenario";
import { INTERVIEWER_STYLES } from "@/lib/state/constants";
import type { SetupForm } from "@/lib/types";

export function SetupPanel({
  form,
  onChange,
  onFillDemo,
  onFillDemoAndStart,
  onStart
}: {
  form: SetupForm;
  onChange: (form: SetupForm) => void;
  onFillDemo: () => void;
  onFillDemoAndStart: () => void;
  onStart: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Setup</h2>
          <p>填写简历和 JD，或使用演示兜底样例直接进入主流程。</p>
        </div>
        <div className="inline-actions compact-actions">
          <button onClick={onFillDemo}>一键填充：{demoScenario.label}</button>
          <button className="primary" onClick={onFillDemoAndStart}>
            填充并生成画像
          </button>
        </div>
      </div>

      <div className="grid-two">
        <div className="field">
          <label htmlFor="resumeText">简历文本</label>
          <textarea
            id="resumeText"
            value={form.resumeText}
            onChange={(event) => onChange({ ...form, resumeText: event.target.value })}
            placeholder="粘贴候选人简历..."
          />
        </div>
        <div className="field">
          <label htmlFor="jdText">JD 文本</label>
          <textarea
            id="jdText"
            value={form.jdText}
            onChange={(event) => onChange({ ...form, jdText: event.target.value })}
            placeholder="粘贴目标岗位 JD..."
          />
        </div>
      </div>

      <div className="panel">
        <h3>面试官风格</h3>
        <div className="style-grid" role="radiogroup" aria-label="面试官风格">
          {INTERVIEWER_STYLES.map((style) => (
            <button
              className={form.interviewerStyleId === style.id ? "style-option selected" : "style-option"}
              key={style.id}
              onClick={() => onChange({ ...form, interviewerStyleId: style.id })}
              role="radio"
              aria-checked={form.interviewerStyleId === style.id}
            >
              <strong>{style.label}</strong>
              <span>{style.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="actions">
        <button className="primary" onClick={onStart}>
          生成候选人画像
        </button>
        <span className="helper">简历或 JD 为空时不会进入生成流程。</span>
      </div>
    </section>
  );
}
