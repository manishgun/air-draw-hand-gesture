// ─── Stage ───────────────────────────────────────────────────────────────────
// Contains the mirrored webcam feed + transparent drawing canvas.
// All MediaPipe and engine logic lives here, exposed via imperative handle.
// No React state is mutated inside the tracking loop — only refs.
// ─────────────────────────────────────────────────────────────────────────────

import { Hands, type Results } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import { GestureEngine, type GestureType, type Landmark } from "../engine/GestureEngine";
import { StrokeEngine } from "../engine/StrokeEngine";
import GestureGuide from "./GestureGuide";
import ThicknessOverlay from "./ThicknessOverlay";
import { FaArrowPointer } from "react-icons/fa6";
import { useState, forwardRef, useEffect, useImperativeHandle, useRef, useCallback } from "react";

// ─── Public handle ───────────────────────────────────────────────────────────

export interface StageHandle {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  exportPNG: () => void;
}

interface StageProps {
  color: string;
  thickness: number;
  activeTool: "draw" | "erase";
  shapeMode: boolean;
  onStatusChange: (gesture: GestureType) => void;
  onCountsChange: (canUndo: boolean, canRedo: boolean) => void;
  onShapeModeChange: (v: boolean) => void;
  onThicknessChange: (delta: number) => void;
  handMode: "right" | "left";
  showVideo: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

const Stage = forwardRef<StageHandle, StageProps>(function Stage(
  { color, thickness, activeTool, shapeMode, onStatusChange, onCountsChange, onShapeModeChange, onThicknessChange, handMode, showVideo },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  const [showThicknessOverlay, setShowThicknessOverlay] = useState(false);

  // Engine instances (stable across renders)
  const gestureEngineRef = useRef(new GestureEngine());
  const strokeEngineRef = useRef(new StrokeEngine());

  // Mirror props into refs for use inside the tracking loop
  const colorRef = useRef(color);
  const thicknessRef = useRef(thickness);
  const toolRef = useRef(activeTool);
  const shapeModeRef = useRef(shapeMode);

  // Keep refs in sync with incoming props
  colorRef.current = color;
  thicknessRef.current = thickness;
  toolRef.current = activeTool;
  shapeModeRef.current = shapeMode;

  // Sync callbacks into refs to keep onResults stable
  const callbacksRef = useRef({
    onStatusChange,
    onCountsChange,
    onShapeModeChange,
    onThicknessChange,
    handMode,
  });
  callbacksRef.current = { onStatusChange, onCountsChange, onShapeModeChange, onThicknessChange, handMode };

  // Shape-mode sync (prop → engine)
  useEffect(() => {
    strokeEngineRef.current.setShapeMode(shapeMode);
    shapeModeRef.current = shapeMode;
  }, [shapeMode]);

  // Camera / Hands refs (for cleanup)
  const cameraRef = useRef<Camera | null>(null);
  const handsRef = useRef<Hands | null>(null);

  // Track last reported gesture to avoid spamming callbacks
  const lastReportedRef = useRef<GestureType>("idle");

  // ── Imperative handle for parent ────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    undo() {
      const se = strokeEngineRef.current;
      se.undo();
      rerender();
      syncCounts();
    },
    redo() {
      const se = strokeEngineRef.current;
      se.redo();
      rerender();
      syncCounts();
    },
    clear() {
      strokeEngineRef.current.clear();
      rerender();
      syncCounts();
    },
    exportPNG() {
      const canvas = canvasRef.current;
      if (canvas) strokeEngineRef.current.exportPNG(canvas);
    },
  }));

  // ── Helper: re-render strokes to canvas ─────────────────────────────────

  const rerender = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    strokeEngineRef.current.render(ctx, canvas.width, canvas.height);
  }, []);

  const syncCounts = useCallback(() => {
    const se = strokeEngineRef.current;
    callbacksRef.current.onCountsChange(se.undoCount() > 0, se.redoCount() > 0);
  }, []);

  // ── MediaPipe results handler ───────────────────────────────────────────

  const onResults = useCallback(
    (results: Results) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Match canvas resolution to the video feed
      if (results.image) {
        const src = results.image as unknown as { videoWidth?: number; width?: number; videoHeight?: number; height?: number };
        const w = src.videoWidth || src.width || 640;
        const h = src.videoHeight || src.height || 480;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      }

      const ge = gestureEngineRef.current;
      const se = strokeEngineRef.current;

      // ── No hands detected ──
      if (!results.multiHandLandmarks?.length) {
        if (se.isActive()) {
          se.end();
          rerender();
          syncCounts();
        }
        ge.reset();
        hideCursor();
        if (lastReportedRef.current !== "idle") {
          lastReportedRef.current = "idle";
          callbacksRef.current.onStatusChange("idle");
        }
        return;
      }

      // ── Classify gesture ──
      // Use both landmarks and handedness labels (physical Left/Right)
      const hands = results.multiHandLandmarks.map((lm, i) => ({
        lm: lm as unknown as Landmark[],
        label: results.multiHandedness?.[i]?.label || "right", // Fallback if missing
      }));

      const { gesture, point, thicknessDelta } = ge.classify(hands, canvas.width, canvas.height, callbacksRef.current.handMode);

      // Report gesture to UI
      if (gesture !== lastReportedRef.current) {
        lastReportedRef.current = gesture;
        callbacksRef.current.onStatusChange(gesture);
      }

      // Handle Thickness Zoom (if 2nd hand present)
      if (thicknessDelta !== undefined) {
        setShowThicknessOverlay(true);
        // Map 0-1 delta to thickness range (1-50)
        const targetT = 1 + Math.round(thicknessDelta * 49);
        if (targetT !== thicknessRef.current) {
          thicknessRef.current = targetT; // Update ref immediately for the tracking loop
          callbacksRef.current.onThicknessChange(targetT); // Update UI state
        }
      } else {
        setShowThicknessOverlay(false);
      }

      // ── One-shot gestures ──
      if (ge.consumeOneShot("clear")) {
        se.clear();
        rerender();
        syncCounts();
      }
      if (ge.consumeOneShot("shape_toggle")) {
        const next = se.toggleShapeMode();
        shapeModeRef.current = next;
        callbacksRef.current.onShapeModeChange(next);
      }

      // ── Continuous gestures: draw / erase / hover ──
      if (point) {
        // Decide what to show visually on the cursor
        let cursorTool: "draw" | "erase" | "idle";
        if (gesture === "draw") cursorTool = toolRef.current;
        else if (gesture === "erase") cursorTool = "erase";
        else cursorTool = "idle";

        showCursor(point.x, point.y, canvas, cursorTool);

        if (gesture === "draw" || gesture === "erase") {
          const tool = gesture === "erase" ? "erase" : toolRef.current;
          const color = colorRef.current;
          const thickness = thicknessRef.current;

          if (!se.isActive()) {
            se.begin(point, color, thickness, tool);
          } else {
            // Check if attributes changed mid-stroke (e.g. gesture switch or zoom)
            const curr = se.getCurrent();
            if (curr && (curr.tool !== tool || curr.thickness !== thickness || curr.color !== color)) {
              se.end();
              se.begin(point, color, thickness, tool);
            } else {
              se.move(point);
            }
          }
          rerender();
        } else {
          // Gesture is idle/other but hand is present
          if (se.isActive()) {
            se.end();
            rerender();
            syncCounts();
          }
        }
      } else {
        hideCursor();
        if (se.isActive()) {
          se.end();
          rerender();
          syncCounts();
        }
      }
    },
    [rerender, syncCounts],
  );

  // ── Cursor helpers ──────────────────────────────────────────────────────

  const showCursor = (cx: number, cy: number, canvas: HTMLCanvasElement, tool: "draw" | "erase" | "idle") => {
    const el = cursorRef.current;
    if (!el) return;

    const baseT = thicknessRef.current;
    let visualT = baseT;
    if (tool === "erase") visualT = baseT * 3;
    if (tool === "idle") visualT = 40; // Larger container for the big arrow icon

    // Scale cursor size from canvas-space to screen-space
    const stage = el.parentElement;
    const scale = stage ? stage.clientWidth / canvas.width : 1;
    let displayT = Math.max(8, visualT * scale); // Min size for visibility

    // Convert canvas coords → stage-relative percentage
    const pctX = (cx / canvas.width) * 100;
    const pctY = (cy / canvas.height) * 100;
    el.style.left = `${pctX}%`;
    el.style.top = `${pctY}%`;
    el.style.width = `${displayT}px`;
    el.style.height = `${displayT}px`;

    el.setAttribute("data-tool", tool);
    el.setAttribute("data-hidden", "false");
  };

  const hideCursor = () => {
    cursorRef.current?.setAttribute("data-hidden", "true");
  };

  // ── Init MediaPipe Hands + Camera ───────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const hands = new Hands({
      locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    hands.onResults(onResults);
    handsRef.current = hands;

    const camera = new Camera(video, {
      onFrame: async () => {
        if (video.paused) video.play().catch(() => {});
        await hands.send({ image: video });
      },
      width: 640,
      height: 480,
    });

    camera.start();
    cameraRef.current = camera;

    return () => {
      camera.stop();
      hands.close();
    };
  }, [onResults]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="stage">
      <video ref={videoRef} autoPlay muted playsInline className="stage-video" data-visible={showVideo} />
      <canvas ref={canvasRef} className="stage-canvas" />
      <div ref={cursorRef} className="cursor-dot" data-hidden="true">
        <div className="cursor-icon">
          <FaArrowPointer />
        </div>
      </div>

      {/* Side Indicators */}
      <div className="side-indicator left-side">
        <span className="side-label">{handMode === "right" ? "CONTROL" : "DRAWING"} HAND SIDE</span>
      </div>
      <div className="side-indicator right-side">
        <span className="side-label">{handMode === "right" ? "DRAWING" : "CONTROL"} HAND SIDE</span>
      </div>

      <ThicknessOverlay value={thickness} visible={showThicknessOverlay} tool={activeTool} />
      <GestureGuide />
    </div>
  );
});

export default Stage;
