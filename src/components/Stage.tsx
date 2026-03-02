// ─── Stage ───────────────────────────────────────────────────────────────────
// Contains the mirrored webcam feed + transparent drawing canvas.
// All MediaPipe and engine logic lives here, exposed via imperative handle.
// No React state is mutated inside the tracking loop — only refs.
// ─────────────────────────────────────────────────────────────────────────────

import { forwardRef, useEffect, useImperativeHandle, useRef, useCallback } from "react";
import { Hands, type Results } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import { GestureEngine, type GestureType } from "../engine/GestureEngine";
import { StrokeEngine } from "../engine/StrokeEngine";

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
}

// ─── Component ───────────────────────────────────────────────────────────────

const Stage = forwardRef<StageHandle, StageProps>(function Stage(
  { color, thickness, activeTool, shapeMode, onStatusChange, onCountsChange, onShapeModeChange, onThicknessChange },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

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
    onCountsChange(se.undoCount() > 0, se.redoCount() > 0);
  }, [onCountsChange]);

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
          onStatusChange("idle");
        }
        return;
      }

      // ── Classify gesture ──
      const result = ge.classify(results.multiHandLandmarks as unknown as { x: number; y: number; z: number }[][], canvas.width, canvas.height);
      const { gesture, point, thicknessDelta } = result;

      // Report gesture to UI
      if (gesture !== lastReportedRef.current) {
        lastReportedRef.current = gesture;
        onStatusChange(gesture);
      }

      // Handle Thickness Zoom (if 2nd hand present)
      if (thicknessDelta !== undefined) {
        // Map 0-1 delta to thickness range (1-20)
        const targetT = 1 + Math.round(thicknessDelta * 19);
        if (Math.abs(targetT - thicknessRef.current) >= 1) {
          onThicknessChange(targetT - thicknessRef.current);
        }
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
        onShapeModeChange(next);
      }

      // ── Continuous gestures: draw / erase ──
      if ((gesture === "draw" || gesture === "erase") && point) {
        showCursor(point.x, point.y, canvas);
        const tool = gesture === "erase" ? "erase" : toolRef.current;

        if (!se.isActive()) {
          se.begin(point, colorRef.current, thicknessRef.current, tool);
        } else {
          se.move(point);
        }
        rerender();
      } else {
        hideCursor();
        if (se.isActive()) {
          se.end();
          rerender();
          syncCounts();
        }
      }
    },
    [onStatusChange, onShapeModeChange, onThicknessChange, rerender, syncCounts],
  );

  // ── Cursor helpers ──────────────────────────────────────────────────────

  const showCursor = (cx: number, cy: number, canvas: HTMLCanvasElement) => {
    const el = cursorRef.current;
    if (!el) return;
    // Convert canvas coords → stage-relative percentage
    const pctX = (cx / canvas.width) * 100;
    const pctY = (cy / canvas.height) * 100;
    el.style.left = `${pctX}%`;
    el.style.top = `${pctY}%`;
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
      <video ref={videoRef} autoPlay muted playsInline className="stage-video" />
      <canvas ref={canvasRef} className="stage-canvas" />
      <div ref={cursorRef} className="cursor-dot" data-hidden="true" />
      <div className="gesture-hint">Pinch to draw &middot; Two fingers to erase &middot; Fist to clear &middot; Open palm for idle</div>
    </div>
  );
});

export default Stage;
