// ─── Toolbar ─────────────────────────────────────────────────────────────────

import { RiPencilLine, RiEraserLine, RiShapeLine, RiArrowGoBackLine, RiArrowGoForwardLine, RiDeleteBinLine, RiDownloadLine } from "react-icons/ri";

export type ToolId = "draw" | "erase";

interface ToolbarProps {
  activeTool: ToolId;
  shapeMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: ToolId) => void;
  onShapeToggle: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onExport: () => void;
}

export default function Toolbar({ activeTool, shapeMode, canUndo, canRedo, onToolChange, onShapeToggle, onUndo, onRedo, onClear, onExport }: ToolbarProps) {
  return (
    <aside className="toolbar">
      {/* ── Tools ── */}
      <button className={`tool-btn ${activeTool === "draw" ? "active" : ""}`} data-tip="Draw" onClick={() => onToolChange("draw")}>
        <RiPencilLine />
      </button>

      <button className={`tool-btn ${activeTool === "erase" ? "active-erase" : ""}`} data-tip="Erase" onClick={() => onToolChange("erase")}>
        <RiEraserLine />
      </button>

      <button className={`tool-btn ${shapeMode ? "active-shape" : ""}`} data-tip="Shape Mode" onClick={onShapeToggle}>
        <RiShapeLine />
      </button>

      <div className="toolbar-sep" />

      {/* ── History ── */}
      <button className="tool-btn" data-tip="Undo" disabled={!canUndo} onClick={onUndo}>
        <RiArrowGoBackLine />
      </button>

      <button className="tool-btn" data-tip="Redo" disabled={!canRedo} onClick={onRedo}>
        <RiArrowGoForwardLine />
      </button>

      <div className="toolbar-sep" />

      {/* ── Actions ── */}
      <button className="tool-btn" data-tip="Clear" onClick={onClear}>
        <RiDeleteBinLine />
      </button>

      <button className="tool-btn" data-tip="Export PNG" onClick={onExport}>
        <RiDownloadLine />
      </button>
    </aside>
  );
}
