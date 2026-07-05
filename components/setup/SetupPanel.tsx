import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

const MIN_RESUME_CHAR_COUNT = 100;
const MIN_JD_CHAR_COUNT = 100;

function formatSystemTime(date: Date) {
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${date.getHours()}:${minutes}`;
}

function countResumeChars(text: string) {
  return text.replace(/\s/g, "").length;
}

function getResumeValidationMessage(text: string) {
  const charCount = countResumeChars(text);
  if (charCount === 0) {
    return "请输入个人简历，至少需要100字";
  }

  if (charCount < MIN_RESUME_CHAR_COUNT) {
    return `个人简历至少需要${MIN_RESUME_CHAR_COUNT}字，当前${charCount}字`;
  }

  return "";
}

function getJdValidationMessage(text: string) {
  const charCount = countResumeChars(text);
  if (charCount < MIN_JD_CHAR_COUNT) {
    return "请输入职位介绍，至少需要100字";
  }

  return "";
}

export function SetupPanel({
  form,
  initialFigmaStep = "home",
  visualTheme = "classic",
  onChange,
  onFillDemo,
  onFillDemoAndStart,
  onStart
}: {
  form: SetupForm;
  initialFigmaStep?: "home" | "jd";
  visualTheme?: "figma" | "classic";
  onChange: (form: SetupForm) => void;
  onFillDemo: () => void;
  onFillDemoAndStart: () => void;
  onStart: () => void;
}) {
  const [figmaStep, setFigmaStep] = useState<"home" | "jd">(initialFigmaStep);
  const [figmaUploadOpen, setFigmaUploadOpen] = useState(false);
  const [figmaResumeFocused, setFigmaResumeFocused] = useState(false);
  const [figmaResumeSelection, setFigmaResumeSelection] = useState(0);
  const [figmaResumeRows, setFigmaResumeRows] = useState(2);
  const [figmaResumeError, setFigmaResumeError] = useState("");
  const [figmaJdUploadOpen, setFigmaJdUploadOpen] = useState(false);
  const [figmaJdFocused, setFigmaJdFocused] = useState(false);
  const [figmaJdSelection, setFigmaJdSelection] = useState(0);
  const [figmaJdRows, setFigmaJdRows] = useState(2);
  const [figmaJdError, setFigmaJdError] = useState("");
  const [currentSystemTime, setCurrentSystemTime] = useState("9:41");
  const figmaResumeTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const figmaJdTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [uploadState, setUploadState] = useState<{
    target: UploadTarget | null;
    kind: "idle" | "loading" | "success" | "error";
    message: string;
  }>({
    target: null,
    kind: "idle",
    message: ""
  });

  useEffect(() => {
    function refreshSystemTime() {
      setCurrentSystemTime(formatSystemTime(new Date()));
    }

    refreshSystemTime();
    const timer = window.setInterval(refreshSystemTime, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    if (visualTheme !== "figma" || figmaStep !== "home") return;

    const textarea = figmaResumeTextareaRef.current;
    if (!textarea) return;

    const previousHeight = textarea.style.height;
    textarea.style.height = "0px";
    const measuredRows = Math.ceil(textarea.scrollHeight / 22);
    textarea.style.height = previousHeight;
    const nextRows = Math.min(3, Math.max(2, measuredRows));

    setFigmaResumeRows((currentRows) => (currentRows === nextRows ? currentRows : nextRows));
  }, [figmaStep, form.resumeText, visualTheme]);

  useLayoutEffect(() => {
    if (visualTheme !== "figma" || figmaStep !== "jd") return;

    const textarea = figmaJdTextareaRef.current;
    if (!textarea) return;

    const previousHeight = textarea.style.height;
    textarea.style.height = "0px";
    const measuredRows = Math.ceil(textarea.scrollHeight / 22);
    textarea.style.height = previousHeight;
    const nextRows = Math.min(3, Math.max(2, measuredRows));

    setFigmaJdRows((currentRows) => (currentRows === nextRows ? currentRows : nextRows));
  }, [figmaStep, form.jdText, visualTheme]);

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
      if (target === "resumeText") {
        setFigmaResumeError((currentError) =>
          currentError ? getResumeValidationMessage(payload.data.text) : currentError
        );
      } else {
        setFigmaJdError((currentError) => (currentError ? getJdValidationMessage(payload.data.text) : currentError));
      }
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
    const validationMessage = getResumeValidationMessage(form.resumeText);
    if (validationMessage) {
      setFigmaResumeError(validationMessage);
      setFigmaResumeFocused(true);
      figmaResumeTextareaRef.current?.focus();
      return;
    }
    setFigmaResumeError("");
    setFigmaStep("jd");
  }

  function fillDemoResume() {
    onChange({ ...form, resumeText: demoScenario.resumeText });
    setFigmaResumeError("");
    setFigmaUploadOpen(false);
    setUploadState({ target: null, kind: "idle", message: "" });
  }

  function fillDemoJd() {
    onChange({ ...form, jdText: demoScenario.jdText });
    setFigmaJdError(getJdValidationMessage(demoScenario.jdText));
    setFigmaJdUploadOpen(false);
    setUploadState({ target: null, kind: "idle", message: "" });
  }

  function syncFigmaResumeSelection(target: HTMLTextAreaElement) {
    setFigmaResumeSelection(target.selectionStart ?? target.value.length);
  }

  function syncFigmaJdSelection(target: HTMLTextAreaElement) {
    setFigmaJdSelection(target.selectionStart ?? target.value.length);
  }

  function startFromJd() {
    const validationMessage = getJdValidationMessage(form.jdText);
    if (validationMessage) {
      setFigmaJdError(validationMessage);
      setFigmaJdFocused(true);
      figmaJdTextareaRef.current?.focus();
      return;
    }

    setFigmaJdError("");
    onStart();
  }

  if (visualTheme === "figma") {
    return (
      <section className="figma-phone-stage" aria-label="Figma setup flow">
        {figmaStep === "home" ? (
          <div className="figma-phone-card figma-home-card">
            <div className="figma-statusbar">
              <span>{currentSystemTime}</span>
              <span>Facewall</span>
            </div>
            <div
              className="figma-home-comp"
              aria-hidden="true"
              data-figma-layer="home / Comp 1024 1"
            >
              <img
                className="figma-home-comp-asset"
                src="/figma/home/comp-1024-1@2x.png?v=2026070302"
                alt=""
              />
            </div>
            <div className="figma-copy">
              <h2>Hey Dark !</h2>
              <p>我是Lili，请告诉我您的过往经历，以便我能够更好地了解您。</p>
              <p className="figma-home-help">您可粘贴至输入框或点击“+”上传 PDF 、word 文档 最大不超过20m。</p>
            </div>
            <div
              className="figma-home-toolbar"
              aria-label="Resume input toolbar"
              data-expanded={figmaUploadOpen}
              data-resume-rows={figmaResumeRows}
            >
              <div className="figma-home-textfield" data-focused={figmaResumeFocused}>
                <textarea
                  ref={figmaResumeTextareaRef}
                  id="figmaResumeText"
                  value={form.resumeText}
                  aria-invalid={Boolean(figmaResumeError)}
                  aria-describedby={figmaResumeError ? "figmaResumeError" : undefined}
                  onBlur={() => setFigmaResumeFocused(false)}
                  onChange={(event) => {
                    const nextResumeText = event.target.value;
                    onChange({ ...form, resumeText: nextResumeText });
                    if (figmaResumeError) {
                      setFigmaResumeError(getResumeValidationMessage(nextResumeText));
                    }
                    syncFigmaResumeSelection(event.target);
                  }}
                  onClick={(event) => syncFigmaResumeSelection(event.currentTarget)}
                  onFocus={(event) => {
                    setFigmaResumeFocused(true);
                    syncFigmaResumeSelection(event.currentTarget);
                  }}
                  onKeyUp={(event) => syncFigmaResumeSelection(event.currentTarget)}
                  onSelect={(event) => syncFigmaResumeSelection(event.currentTarget)}
                  placeholder="您好"
                />
                {figmaResumeFocused && (
                  <span className="figma-home-caret" aria-hidden="true">
                    {form.resumeText ? form.resumeText.slice(0, figmaResumeSelection) : ""}
                  </span>
                )}
              </div>
              <div className="figma-toolbar-frame4">
                {figmaUploadOpen ? (
                  <div className="figma-frame4-frame3-menu" aria-label="Upload options">
                    <button
                      className="figma-frame4-icon-button figma-frame4-close-button"
                      aria-label="Close upload options"
                      onClick={() => setFigmaUploadOpen(false)}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                    <button className="figma-frame4-pill-button" onClick={fillDemoResume}>
                      <span>UseDemoCV</span>
                    </button>
                    <label className="figma-frame4-pill-button figma-frame4-file-button" htmlFor="figmaResumeFile">
                      <img
                        className="figma-file-upload-icon"
                        src="/figma/home/frame4-frame3-frame2-file@2x.png?v=2026070303"
                        alt=""
                        aria-hidden="true"
                      />
                      <span>文件上传</span>
                    </label>
                    <input
                      id="figmaResumeFile"
                      className="file-input"
                      type="file"
                      accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(event) => {
                        handleFileUpload("resumeText", event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </div>
                ) : (
                  <button
                    className="figma-frame4-frame1-button"
                    aria-label="Open upload options"
                    onClick={() => setFigmaUploadOpen(true)}
                  >
                    <img src="/figma/home/frame4-frame1-upload@2x.png?v=2026070302" alt="" aria-hidden="true" />
                  </button>
                )}
                <button
                  className="figma-frame4-group1-button"
                  aria-label="Continue"
                  onClick={continueToJd}
                >
                  <img src="/figma/home/frame4-group1-continue@2x.png?v=2026070302" alt="" aria-hidden="true" />
                </button>
              </div>
              {figmaResumeError ? (
                <span id="figmaResumeError" className="figma-home-validation-error" role="alert">
                  {figmaResumeError}
                </span>
              ) : uploadState.target === "resumeText" && uploadState.kind !== "idle" && (
                <span
                  className={
                    uploadState.kind === "error"
                      ? "upload-status figma-home-upload-status error"
                      : uploadState.kind === "success"
                        ? "upload-status figma-home-upload-status success"
                        : "upload-status figma-home-upload-status"
                  }
                >
                  {uploadState.message}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="figma-phone-card figma-home-card figma-jd-card">
            <div className="figma-statusbar">
              <span>{currentSystemTime}</span>
              <span>Facewall</span>
            </div>
            <button className="figma-jd-back-button" aria-label="Back" onClick={() => setFigmaStep("home")}>
              <span aria-hidden="true" />
            </button>
            <div
              className="figma-home-comp"
              aria-hidden="true"
              data-figma-layer="input JD / Comp 1024 1"
            >
              <img
                className="figma-home-comp-asset"
                src="/figma/home/comp-1024-1-jd@2x.png?v=2026070501"
                alt=""
              />
            </div>
            <div className="figma-copy">
              <h2>已经知悉了您的过往 ...</h2>
              <p>请输入您的意向 JD，以便我给您匹配合适的面试官。</p>
            </div>
            <div
              className="figma-home-toolbar figma-jd-toolbar"
              aria-label="JD input toolbar"
              data-expanded={figmaJdUploadOpen}
              data-resume-rows={figmaJdRows}
            >
              <div className="figma-home-textfield figma-jd-textfield" data-focused={figmaJdFocused}>
                <textarea
                  ref={figmaJdTextareaRef}
                  id="figmaJdText"
                  value={form.jdText}
                  aria-invalid={Boolean(figmaJdError)}
                  aria-describedby={figmaJdError ? "figmaJdError" : undefined}
                  onBlur={() => setFigmaJdFocused(false)}
                  onChange={(event) => {
                    const nextJdText = event.target.value;
                    onChange({ ...form, jdText: nextJdText });
                    if (figmaJdError) {
                      setFigmaJdError(getJdValidationMessage(nextJdText));
                    }
                    syncFigmaJdSelection(event.target);
                  }}
                  onClick={(event) => syncFigmaJdSelection(event.currentTarget)}
                  onFocus={(event) => {
                    setFigmaJdFocused(true);
                    syncFigmaJdSelection(event.currentTarget);
                  }}
                  onKeyUp={(event) => syncFigmaJdSelection(event.currentTarget)}
                  onSelect={(event) => syncFigmaJdSelection(event.currentTarget)}
                  placeholder="您好"
                />
                {figmaJdFocused && (
                  <span className="figma-home-caret" aria-hidden="true">
                    {form.jdText ? form.jdText.slice(0, figmaJdSelection) : ""}
                  </span>
                )}
              </div>
              <div className="figma-toolbar-frame4">
                {figmaJdUploadOpen ? (
                  <div className="figma-frame4-frame3-menu" aria-label="JD upload options">
                    <button
                      className="figma-frame4-icon-button figma-frame4-close-button"
                      aria-label="Close JD upload options"
                      onClick={() => setFigmaJdUploadOpen(false)}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                    <button className="figma-frame4-pill-button" onClick={fillDemoJd}>
                      <span>UseDemoJD</span>
                    </button>
                    <label className="figma-frame4-pill-button figma-frame4-file-button" htmlFor="figmaJdFile">
                      <img
                        className="figma-file-upload-icon"
                        src="/figma/home/frame4-frame3-frame2-file@2x.png?v=2026070303"
                        alt=""
                        aria-hidden="true"
                      />
                      <span>文件上传</span>
                    </label>
                    <input
                      id="figmaJdFile"
                      className="file-input"
                      type="file"
                      accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(event) => {
                        handleFileUpload("jdText", event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </div>
                ) : (
                  <button
                    className="figma-frame4-frame1-button"
                    aria-label="Open JD upload options"
                    onClick={() => setFigmaJdUploadOpen(true)}
                  >
                    <img src="/figma/home/frame4-frame1-upload@2x.png?v=2026070302" alt="" aria-hidden="true" />
                  </button>
                )}
                <button className="figma-frame4-group1-button" aria-label="Generate profile" onClick={startFromJd}>
                  <img src="/figma/home/frame4-group1-continue@2x.png?v=2026070302" alt="" aria-hidden="true" />
                </button>
              </div>
              {figmaJdError ? (
                <span id="figmaJdError" className="figma-home-validation-error" role="alert">
                  {figmaJdError}
                </span>
              ) : uploadState.target === "jdText" && uploadState.kind !== "idle" && (
                <span
                  className={
                    uploadState.kind === "error"
                      ? "upload-status figma-home-upload-status error"
                      : uploadState.kind === "success"
                        ? "upload-status figma-home-upload-status success"
                        : "upload-status figma-home-upload-status"
                  }
                >
                  {uploadState.message}
                </span>
              )}
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
