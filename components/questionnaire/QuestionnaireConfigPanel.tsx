"use client";

import { useEffect, useState } from "react";

import {
  defaultQuestionnaireConfig,
  type QuestionnaireConfig,
  type QuestionnaireQuestion,
  type QuestionnaireQuestionType
} from "@/lib/questionnaire/schema";

const typeLabels: Record<QuestionnaireQuestionType, string> = {
  rating: "打星评分",
  single: "单选",
  multiple: "多选",
  text: "开放式回答"
};

function cloneDefaultConfig(): QuestionnaireConfig {
  return structuredClone(defaultQuestionnaireConfig);
}
function nextQuestion(type: QuestionnaireQuestionType): QuestionnaireQuestion {
  const id = `question_${Date.now().toString(36)}`;
  return {
    id,
    type,
    prompt: "请输入问题",
    required: false,
    options:
      type === "single" || type === "multiple"
        ? [
            { id: "option_1", label: "选项 1" },
            { id: "option_2", label: "选项 2" }
          ]
        : [],
    ...(type === "text" ? { maxLength: 500 } : {})
  };
}

export function QuestionnaireConfigPanel() {
  const [config, setConfig] = useState<QuestionnaireConfig>(cloneDefaultConfig);
  const [writable, setWritable] = useState(false);
  const [message, setMessage] = useState("正在加载问卷配置…");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/questionnaire/config", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("read failed");
        return response.json();
      })
      .then((body) => {
        if (cancelled) return;
        setConfig(body.data.config as QuestionnaireConfig);
        setWritable(Boolean(body.data.writable));
        setMessage(
          body.data.writable
            ? "当前配置会用于 Juju 首次面试完成后的调研问卷。"
            : "当前环境为只读；需显式开启问卷配置写入。"
        );
      })
      .catch(() => {
        if (!cancelled) setMessage("问卷配置读取失败，当前显示内置默认值。");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function patchQuestion(index: number, patch: Partial<QuestionnaireQuestion>) {
    setConfig((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...patch } : question
      )
    }));
  }

  function changeQuestionType(index: number, type: QuestionnaireQuestionType) {
    const current = config.questions[index];
    const needsOptions = type === "single" || type === "multiple";
    patchQuestion(index, {
      type,
      options: needsOptions
        ? current.options.length >= 2
          ? current.options
          : [
              { id: "option_1", label: "选项 1" },
              { id: "option_2", label: "选项 2" }
            ]
        : [],
      ...(type === "text" ? { maxLength: current.maxLength ?? 500 } : {})
    });
  }

  async function save() {
    setSaving(true);
    setMessage("正在保存问卷配置…");
    try {
      const response = await fetch("/api/questionnaire/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config })
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error?.message || "问卷配置保存失败。");
        return;
      }
      setConfig(body.data.config as QuestionnaireConfig);
      setMessage("问卷配置已保存，新版本会用于后续符合条件的 Juju 用户。");
    } catch {
      setMessage("问卷配置保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="questionnaire-config-panel">
      <div className="questionnaire-config-header">
        <div>
          <p className="auth-eyebrow">QUESTIONNAIRE CONFIG</p>
          <h2>问卷调查配置</h2>
          <p>支持打星、单选、多选和开放式回答；保存时生成新版本。</p>
        </div>
        <button
          className="auth-primary"
          disabled={!writable || saving}
          onClick={save}
          type="button"
        >
          {saving ? "保存中…" : "保存全局问卷"}
        </button>
      </div>

      <div className="questionnaire-config-meta">
        <label>
          问卷标题
          <input
            maxLength={80}
            onChange={(event) =>
              setConfig((current) => ({ ...current, title: event.target.value }))
            }
            value={config.title}
          />
        </label>
        <label>
          副标题
          <input
            maxLength={120}
            onChange={(event) =>
              setConfig((current) => ({ ...current, subtitle: event.target.value }))
            }
            value={config.subtitle}
          />
        </label>
        <label>
          邀请弹窗标题
          <input
            maxLength={100}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                inviteTitle: event.target.value
              }))
            }
            value={config.inviteTitle}
          />
        </label>
        <label>
          邀请弹窗说明
          <textarea
            maxLength={240}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                inviteDescription: event.target.value
              }))
            }
            value={config.inviteDescription}
          />
        </label>
      </div>

      <div className="questionnaire-config-list">
        {config.questions.map((question, index) => (
          <article className="questionnaire-config-question" key={question.id}>
            <div className="questionnaire-config-question-head">
              <strong>问题 {index + 1}</strong>
              <select
                aria-label={`问题 ${index + 1} 类型`}
                onChange={(event) =>
                  changeQuestionType(
                    index,
                    event.target.value as QuestionnaireQuestionType
                  )
                }
                value={question.type}
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <label className="questionnaire-required-toggle">
                <input
                  checked={question.required}
                  onChange={(event) =>
                    patchQuestion(index, { required: event.target.checked })
                  }
                  type="checkbox"
                />
                必答
              </label>
              <button
                disabled={config.questions.length <= 1}
                onClick={() =>
                  setConfig((current) => ({
                    ...current,
                    questions: current.questions.filter(
                      (_, questionIndex) => questionIndex !== index
                    )
                  }))
                }
                type="button"
              >
                删除
              </button>
            </div>
            <input
              aria-label={`问题 ${index + 1} 文案`}
              maxLength={160}
              onChange={(event) =>
                patchQuestion(index, { prompt: event.target.value })
              }
              value={question.prompt}
            />
            {(question.type === "single" || question.type === "multiple") && (
              <div className="questionnaire-option-editor">
                {question.options.map((option, optionIndex) => (
                  <div key={option.id}>
                    <input
                      aria-label={`问题 ${index + 1} 选项 ${optionIndex + 1}`}
                      maxLength={80}
                      onChange={(event) =>
                        patchQuestion(index, {
                          options: question.options.map((item, itemIndex) =>
                            itemIndex === optionIndex
                              ? { ...item, label: event.target.value }
                              : item
                          )
                        })
                      }
                      value={option.label}
                    />
                    <button
                      disabled={question.options.length <= 2}
                      onClick={() =>
                        patchQuestion(index, {
                          options: question.options.filter(
                            (_, itemIndex) => itemIndex !== optionIndex
                          )
                        })
                      }
                      type="button"
                    >
                      移除
                    </button>
                  </div>
                ))}
                <button
                  disabled={question.options.length >= 8}
                  onClick={() =>
                    patchQuestion(index, {
                      options: [
                        ...question.options,
                        {
                          id: `option_${question.options.length + 1}`,
                          label: `选项 ${question.options.length + 1}`
                        }
                      ]
                    })
                  }
                  type="button"
                >
                  添加选项
                </button>
              </div>
            )}
            {question.type === "text" && (
              <label>
                最大字数
                <input
                  max={1000}
                  min={50}
                  onChange={(event) =>
                    patchQuestion(index, {
                      maxLength: Number(event.target.value)
                    })
                  }
                  type="number"
                  value={question.maxLength ?? 500}
                />
              </label>
            )}
          </article>
        ))}
      </div>

      <div className="questionnaire-config-add">
        {(Object.keys(typeLabels) as QuestionnaireQuestionType[]).map((type) => (
          <button
            disabled={config.questions.length >= 12}
            key={type}
            onClick={() =>
              setConfig((current) => ({
                ...current,
                questions: [...current.questions, nextQuestion(type)]
              }))
            }
            type="button"
          >
            + {typeLabels[type]}
          </button>
        ))}
      </div>
      <p className="feedback-message" role="status">
        {message}
      </p>
    </section>
  );
}
