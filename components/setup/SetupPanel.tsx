import { useState } from "react";
import { demoScenario } from "@/lib/demo/scenario";
import { INTERVIEWER_STYLES } from "@/lib/state/constants";
import type { CommonResponse, SetupForm } from "@/lib/types";

interface ParsedUploadResponse {
  text: string;
  fileName: string;
  fileType: string;
  charCount: number;
  warnings: string[];
}

type UploadTarget = "resumeText" | "jdText";

export function SetupPanel({
  form,
  visualTheme = "classic",
  onChange,
  onFillDemo,
  onFillDemoAndStart,
  onStart
}: {
  form: SetupForm;
  visualTheme?: "figma" | "classic";
  onChange: (form: SetupForm) => void;
  onFillDemo: () => void;
  onFillDemoAndStart: () => void;
  onStart: () => void;
}) {
  const [figmaStep, setFigmaStep] = useState<"home" | "jd">("home");
  const [uploadState, setUploadState] = useState<{
    target: UploadTarget | null;
    kind: "idle" | "loading" | "success" | "error";
    message: string;
  }>({
    target: null,
    kind: "idle",
    message: ""
  });

  async function handleFileUpload(target: UploadTarget, file: File | undefined) {
    if (!file) return;

    setUploadState({ target, kind: "loading", message: `正在解析 ${file.name}...` });
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/files/parse", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as CommonResponse<ParsedUploadResponse>;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "文件解析失败。" : payload.error.message);
      }

      onChange({ ...form, [target]: payload.data.text });
      const warningText = payload.data.warnings.length > 0 ? `；${payload.data.warnings.join("；")}` : "";
      setUploadState({
        target,
        kind: "success",
        message: `${payload.data.fileName} 已解析为 ${payload.data.charCount} 字文本${warningText}`
      });
    } catch (error) {
      setUploadState({
        target,
        kind: "error",
        message: error instanceof Error ? error.message : "文件解析失败，请尝试复制文本后粘贴。"
      });
    }
  }

  function continueToJd() {
    if (!form.resumeText.trim()) {
      return;
    }
    setFigmaStep("jd");
  }

  function fillDemoResume() {
    onChange({ ...form, resumeText: demoScenario.resumeText });
    setFigmaStep("jd");
  }

  function fillDemoJd() {
    onChange({ ...form, jdText: demoScenario.jdText });
  }

  if (visualTheme === "figma") {
    return (
      <section className="figma-phone-stage" aria-label="Figma setup flow">
        {figmaStep === "home" ? (
          <div className="figma-phone-card figma-home-card">
            <div className="figma-statusbar">
              <span>9:41</span>
              <span>Facewall</span>
            </div>
            <div className="figma-home-comp" aria-hidden="true" />
            <div className="figma-copy">
              <p className="figma-kicker">AI Interview Coach</p>
              <h2>Hey Dick?</h2>
              <p>先把简历交给我，我会帮你拆出画像和后续追问重点。</p>
            </div>
            <div className="figma-home-toolbar" aria-label="Resume input toolbar">
              <label className="figma-toolbar-label" htmlFor="figmaResumeText">
                Your resume
              </label>
              <div className="figma-toolbar-input">
                <textarea
                  id="figmaResumeText"
                  value={form.resumeText}
                  onChange={(event) => onChange({ ...form, resumeText: event.target.value })}
                  placeholder="Paste your resume here..."
                />
              </div>
              <div className="figma-toolbar-frame4">
                <FileUploadControl
                  target="resumeText"
                  label="Upload resume"
                  variant="figmaHomeUpload"
                  state={uploadState}
                  onUpload={handleFileUpload}
                />
                <button
                  className="figma-frame4-group1-button"
                  aria-label="Continue"
                  onClick={continueToJd}
                  disabled={!form.resumeText.trim()}
                >
                  <span>Continue</span>
                </button>
              </div>
              <button className="figma-demo-link" onClick={fillDemoResume}>
                Use demo resume
              </button>
            </div>
          </div>
        ) : (
          <div className="figma-phone-card figma-jd-card">
            <div className="figma-statusbar">
              <span>9:41</span>
              <span>Input JD</span>
            </div>
            <div className="figma-orb figma-orb-small" aria-hidden="true" />
            <div className="figma-copy">
              <p className="figma-kicker">Target Role</p>
              <h2>Input JD</h2>
              <p>贴入目标岗位 JD，系统会用它生成候选人画像和匹配证据。</p>
            </div>
            <div className="figma-input-stack">
              <label htmlFor="figmaJdText">Job description</label>
              <textarea
                id="figmaJdText"
                value={form.jdText}
                onChange={(event) => onChange({ ...form, jdText: event.target.value })}
                placeholder="Paste JD here..."
              />
              <FileUploadControl target="jdText" label="Upload JD" state={uploadState} onUpload={handleFileUpload} />
            </div>
            <div className="figma-actions">
              <button onClick={() => setFigmaStep("home")}>Back</button>
              <button onClick={fillDemoJd}>Use demo JD</button>
              <button className="primary" onClick={onStart} disabled={!form.resumeText.trim() || !form.jdText.trim()}>
                Generate profile
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

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
          <FileUploadControl
            target="resumeText"
            label="上传简历文件"
            state={uploadState}
            onUpload={handleFileUpload}
          />
          <textarea
            id="resumeText"
            value={form.resumeText}
            onChange={(event) => onChange({ ...form, resumeText: event.target.value })}
            placeholder="粘贴候选人简历..."
          />
        </div>
        <div className="field">
          <label htmlFor="jdText">JD 文本</label>
          <FileUploadControl target="jdText" label="上传 JD 文件" state={uploadState} onUpload={handleFileUpload} />
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

function FileUploadControl({
  target,
  label,
  variant = "default",
  state,
  onUpload
}: {
  target: UploadTarget;
  label: string;
  variant?: "default" | "figmaHomeUpload";
  state: { target: UploadTarget | null; kind: "idle" | "loading" | "success" | "error"; message: string };
  onUpload: (target: UploadTarget, file: File | undefined) => void;
}) {
  const inputId = `${target}File`;
  const isCurrent = state.target === target && state.kind !== "idle";
  const statusClass =
    state.kind === "error" ? "upload-status error" : state.kind === "success" ? "upload-status success" : "upload-status";
  const isFigmaHomeUpload = variant === "figmaHomeUpload";

  return (
    <div className={isFigmaHomeUpload ? "file-upload-row figma-frame4-frame1-upload" : "file-upload-row"}>
      <label
        className={isFigmaHomeUpload ? "file-upload-button figma-frame4-frame1-button" : "file-upload-button"}
        htmlFor={inputId}
      >
        <span>{label}</span>
      </label>
      <input
        id={inputId}
        className="file-input"
        type="file"
        accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => {
          onUpload(target, event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {!isFigmaHomeUpload && <span className="helper">支持 TXT / PDF / Word(.docx)</span>}
      {isCurrent && <span className={statusClass}>{state.message}</span>}
    </div>
  );
}
