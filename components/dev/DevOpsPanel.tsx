import { useEffect, useState } from "react";
import {
  canUseDevControls,
  defaultDevControlState,
  readDevControls,
  resetDevControls,
  writeDevControls,
  type DevControlState,
  type DevDemoMode
} from "@/lib/dev/clientControls";

const faultLabels: Array<{ key: keyof DevControlState["faults"]; label: string }> = [
  { key: "llm", label: "LLM 失败" },
  { key: "tts", label: "TTS 失败" },
  { key: "stt", label: "STT 失败" },
  { key: "clipboard", label: "Clipboard 失败" }
];

export function DevOpsPanel() {
  const [mounted, setMounted] = useState(false);
  const [controls, setControls] = useState<DevControlState>(defaultDevControlState);

  useEffect(() => {
    setMounted(true);
    setControls(readDevControls());
  }, []);

  if (!mounted || !canUseDevControls()) {
    return null;
  }

  function persist(nextControls: DevControlState) {
    setControls(nextControls);
    writeDevControls(nextControls);
  }

  function updateDemoMode(demoMode: DevDemoMode) {
    persist({ ...controls, demoMode });
  }

  function toggleFault(key: keyof DevControlState["faults"]) {
    persist({
      ...controls,
      faults: {
        ...controls.faults,
        [key]: !controls.faults[key]
      }
    });
  }

  function clearControls() {
    resetDevControls();
    setControls(defaultDevControlState);
  }

  const enabledFaults = Object.entries(controls.faults)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
    .join(" / ");

  return (
    <section className="panel dev-panel" aria-label="开发演示控制">
      <div className="panel-header">
        <div>
          <h2>Demo Ops</h2>
          <p className="helper">仅开发环境显示。用于现场前验证 fallback 和故障路径，不进入生产体验。</p>
        </div>
        <button onClick={clearControls}>清空控制</button>
      </div>

      <div className="dev-control-grid">
        <label className="field compact-field">
          <span>数据模式</span>
          <select value={controls.demoMode} onChange={(event) => updateDemoMode(event.target.value as DevDemoMode)}>
            <option value="auto">自动：真实依赖优先，失败后兜底</option>
            <option value="force-fallback">强制演示兜底</option>
          </select>
        </label>

        <div>
          <span className="dev-control-label">故障注入</span>
          <div className="inline-actions compact-actions">
            {faultLabels.map((item) => (
              <button
                className={controls.faults[item.key] ? "danger selected-toggle" : ""}
                key={item.key}
                onClick={() => toggleFault(item.key)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={controls.demoMode === "force-fallback" || enabledFaults ? "status warning" : "status"}>
        当前：{controls.demoMode === "force-fallback" ? "强制演示兜底" : "自动模式"}
        {enabledFaults ? `；故障：${enabledFaults}` : "；无故障注入"}
      </div>
    </section>
  );
}
