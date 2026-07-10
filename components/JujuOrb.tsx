type JujuOrbSize = "large" | "small";

export function JujuOrb({
  className = "",
  progressText,
  showOuterArc = false,
  showEllipse11 = true,
  size = "large"
}: {
  className?: string;
  progressText?: string;
  showOuterArc?: boolean;
  showEllipse11?: boolean;
  size?: JujuOrbSize;
}) {
  const classNames = ["juju-orb-shell", `juju-orb-${size}`, className].filter(Boolean).join(" ");

  return (
    <div className={classNames} aria-hidden="true">
      {showOuterArc && <span className="juju-orb-outer-arc" />}
      <span className="juju-orb-ellipse10" />
      {showEllipse11 && <span className="juju-orb-ellipse11" />}
      <img className="juju-orb-b01" src="/juju/profile/B_01.png?v=202607102314" alt="" />
      {progressText && <span className="juju-orb-progress">{progressText}</span>}
    </div>
  );
}
