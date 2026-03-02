// ─── AirSketch Pro – App ─────────────────────────────────────────────────────

import { useState, useRef, useCallback } from "react";
import TopBar from "./components/TopBar";
import Toolbar from "./components/Toolbar";
import Stage, { type StageHandle } from "./components/Stage";
import type { GestureType } from "./engine/GestureEngine";
import type { ToolId } from "./components/Toolbar";
import "./styles/app.css";

// Thickness bounds
const MIN_THICKNESS = 1;
const MAX_THICKNESS = 20;
const THICKNESS_STEP = 2;

export default function App() {
  // ── UI state (minimal – only what triggers visual updates) ──
  const [status, setStatus] = useState<GestureType>("idle");
  const [activeTool, setActiveTool] = useState<ToolId>("draw");
  const [shapeMode, setShapeMode] = useState(false);
  const [thickness, setThickness] = useState(4);
  const [color, setColor] = useState("#00e87b");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const stageRef = useRef<StageHandle>(null);

  // ── Callbacks from Stage ────────────────────────────────────────────────

  const handleStatusChange = useCallback((g: GestureType) => {
    setStatus(g);
    // When gesture engine says "erase", mirror to active tool
    if (g === "erase") setActiveTool("erase");
    else if (g === "draw") setActiveTool("draw");
  }, []);

  const handleCountsChange = useCallback((undo: boolean, redo: boolean) => {
    setCanUndo(undo);
    setCanRedo(redo);
  }, []);

  const handleShapeModeChange = useCallback((v: boolean) => {
    setShapeMode(v);
  }, []);

  const handleThicknessChange = useCallback((delta: number) => {
    setThickness((prev) => {
      const next = prev + delta * THICKNESS_STEP;
      return Math.max(MIN_THICKNESS, Math.min(MAX_THICKNESS, next));
    });
  }, []);

  // ── Toolbar actions ─────────────────────────────────────────────────────

  const handleToolChange = useCallback((t: ToolId) => setActiveTool(t), []);
  const handleShapeToggle = useCallback(() => setShapeMode((v) => !v), []);
  const handleUndo = useCallback(() => stageRef.current?.undo(), []);
  const handleRedo = useCallback(() => stageRef.current?.redo(), []);
  const handleClear = useCallback(() => stageRef.current?.clear(), []);
  const handleExport = useCallback(() => stageRef.current?.exportPNG(), []);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      <TopBar status={status} shapeMode={shapeMode} />

      <div style={{ position: "relative", flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Stage
          ref={stageRef}
          color={color}
          thickness={thickness}
          activeTool={activeTool}
          shapeMode={shapeMode}
          onStatusChange={handleStatusChange}
          onCountsChange={handleCountsChange}
          onShapeModeChange={handleShapeModeChange}
          onThicknessChange={handleThicknessChange}
        />

        <Toolbar
          activeTool={activeTool}
          shapeMode={shapeMode}
          canUndo={canUndo}
          canRedo={canRedo}
          onToolChange={handleToolChange}
          onShapeToggle={handleShapeToggle}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClear={handleClear}
          onExport={handleExport}
        />
      </div>

      {/* ── Bottom Panel: Color + Thickness ── */}
      <div className="bottom-panel">
        <div className="panel-group">
          <span className="panel-label">Color</span>
          <input id="color-picker" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="color-swatch" />
        </div>

        <div className="panel-group">
          <span className="panel-label">Thickness</span>
          <input
            id="thickness-slider"
            type="range"
            min={MIN_THICKNESS}
            max={MAX_THICKNESS}
            value={thickness}
            onChange={(e) => setThickness(Number(e.target.value))}
            className="thickness-slider"
          />
          <span className="thickness-value">{thickness}</span>
        </div>
      </div>
    </div>
  );
}
