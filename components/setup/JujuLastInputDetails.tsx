import {
  type LastSetupInputEntry,
  type LastSetupInputSnapshot
} from "@/lib/setup/lastInputStore";

function formatSavedAt(savedAt: string) {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return "保存时间未知";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function describeSource(entry: LastSetupInputEntry) {
  if (entry.source !== "file") return "文本录入";
  if (entry.fileName) return entry.fileName;
  return entry.fileType ? `${entry.fileType.toUpperCase()} 文件` : "文件上传";
}

function LastInputCard({
  entry,
  label,
  tabIndex
}: {
  entry: LastSetupInputEntry | undefined;
  label: "CV" | "JD";
  tabIndex: number;
}) {
  const headingId = `juju-last-input-${label.toLowerCase()}-title`;

  return (
    <article className="juju-last-input-card" aria-labelledby={headingId}>
      <div className="juju-last-input-card-heading">
        <h3 id={headingId}>{label}</h3>
        <span>{entry ? "上次录入" : "暂无记录"}</span>
      </div>
      {entry ? (
        <>
          <dl className="juju-last-input-meta">
            <div>
              <dt>来源</dt>
              <dd title={entry.fileName}>{describeSource(entry)}</dd>
            </div>
            <div>
              <dt>保存</dt>
              <dd>
                <time dateTime={entry.savedAt}>{formatSavedAt(entry.savedAt)}</time>
              </dd>
            </div>
            <div>
              <dt>字数</dt>
              <dd>{entry.text.replace(/\s/g, "").length} 字</dd>
            </div>
          </dl>
          <div className="juju-last-input-text" tabIndex={tabIndex}>
            {entry.text}
          </div>
        </>
      ) : (
        <p className="juju-last-input-card-empty">完成一次录入后，可在这里查看最后保存的内容。</p>
      )}
    </article>
  );
}

export function JujuLastInputDetails({
  ownerId,
  sessionLoading,
  snapshot,
  onBack,
  tabIndex
}: {
  ownerId: string;
  sessionLoading: boolean;
  snapshot: LastSetupInputSnapshot;
  onBack: () => void;
  tabIndex: number;
}) {
  // Guard at render time so switching accounts can never flash another owner's
  // CV/JD while the owner-scoped localStorage snapshot is being refreshed.
  const isCurrentOwner = Boolean(ownerId) && snapshot.ownerId === ownerId.trim();
  const cv = isCurrentOwner ? snapshot.cv : undefined;
  const jd = isCurrentOwner ? snapshot.jd : undefined;
  const hasEntry = Boolean(cv || jd);

  return (
    <div className="juju-last-input-detail">
      <header className="juju-last-input-header">
        <button aria-label="返回账户与记录" onClick={onBack} tabIndex={tabIndex} type="button">
          <i aria-hidden="true" />
        </button>
        <div>
          <h2>上次录入详情</h2>
          <p>仅保留当前账号在这台设备上的最后一份 CV 和 JD</p>
        </div>
      </header>

      {sessionLoading ? (
        <p className="juju-last-input-state" role="status">
          正在确认当前账号...
        </p>
      ) : !ownerId ? (
        <p className="juju-last-input-state is-warning" role="status">
          暂时无法确认当前账号，请稍后重新打开。
        </p>
      ) : !isCurrentOwner ? (
        <p className="juju-last-input-state" role="status">
          正在读取上次录入...
        </p>
      ) : (
        <div className="juju-last-input-scroll">
          {!hasEntry && (
            <p className="juju-last-input-state">还没有上次录入记录。完成 CV 和 JD 录入后会显示在这里。</p>
          )}
          <LastInputCard entry={cv} label="CV" tabIndex={tabIndex} />
          <LastInputCard entry={jd} label="JD" tabIndex={tabIndex} />
        </div>
      )}
    </div>
  );
}
