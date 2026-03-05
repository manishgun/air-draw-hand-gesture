import { FaHandPointer, FaRegHandPointer, FaVideo, FaVideoSlash } from "react-icons/fa6";

interface TopBarProps {
  status: string;
  shapeMode: boolean;
  handMode: "right" | "left";
  onToggleHandMode: () => void;
  showVideo: boolean;
  onToggleVideo: () => void;
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

export default function TopBar({ status, shapeMode, handMode, onToggleHandMode, showVideo, onToggleVideo }: TopBarProps) {
  const key = statusKey(status, shapeMode);

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="topbar-logo">A</div>
        <span className="topbar-name">Air Draw</span>
      </div>

      <div className="topbar-right">
        {/* Video Toggle */}
        <button className={`video-toggle ${showVideo ? "is-on" : "is-off"}`} onClick={onToggleVideo} title={showVideo ? "Hide Video Feed" : "Show Video Feed"}>
          {showVideo ? <FaVideo /> : <FaVideoSlash />}
          <span>{showVideo ? "Video On" : "Video Off"}</span>
        </button>

        {/* Hand Mode Toggle */}
        <button
          className={`hand-toggle ${handMode === "right" ? "is-right" : "is-left"}`}
          onClick={onToggleHandMode}
          title={handMode === "right" ? "Switch to Left Handed" : "Switch to Right Handed"}>
          {handMode === "right" ? <FaHandPointer /> : <FaRegHandPointer />}
          <span>{handMode === "right" ? "Right Handed" : "Left Handed"}</span>
        </button>

        <div className="status-badge" data-status={key}>
          <span className="status-dot" />
          <span>{STATUS_LABEL[key] ?? "Idle"}</span>
        </div>
      </div>
    </header>
  );
}
