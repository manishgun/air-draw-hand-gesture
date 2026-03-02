// ─── TopBar ──────────────────────────────────────────────────────────────────

interface TopBarProps {
  status: string;
  shapeMode: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  idle: "Idle",
  draw: "Drawing",
  erase: "Erasing",
  shape: "Shape Mode",
};

function statusKey(status: string, shapeMode: boolean): string {
  if (shapeMode && status === "draw") return "shape";
  if (status === "draw") return "drawing";
  if (status === "erase") return "erasing";
  return "idle";
}

export default function TopBar({ status, shapeMode }: TopBarProps) {
  const key = statusKey(status, shapeMode);

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="topbar-logo">A</div>
        <span className="topbar-name">AirSketch Pro</span>
      </div>

      <div className="topbar-right">
        <div className="status-badge" data-status={key}>
          <span className="status-dot" />
          <span>{STATUS_LABEL[key] ?? "Idle"}</span>
        </div>
      </div>
    </header>
  );
}
