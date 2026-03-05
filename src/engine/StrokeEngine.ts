// ─── Stroke Engine ───────────────────────────────────────────────────────────
// Manages stroke history, rendering with quadratic smoothing, undo/redo,
// erasing via composite operations, and shape-mode auto-replacement.
// ─────────────────────────────────────────────────────────────────────────────

import { recognizeShape, type ShapeResult } from "./ShapeRecognizer";

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  points: Point[];
  color: string;
  thickness: number;
  tool: "draw" | "erase";
  shape: ShapeResult | null;
}

export class StrokeEngine {
  private strokes: Stroke[] = [];
  private redoStack: Stroke[] = [];
  private current: Stroke | null = null;
  private shapeMode = false;

  // ── Stroke lifecycle ────────────────────────────────────────────────────

  begin(point: Point, color: string, thickness: number, tool: "draw" | "erase"): void {
    this.current = { points: [point], color, thickness, tool, shape: null };
  }

  move(point: Point): void {
    if (this.current) this.current.points.push(point);
  }

  end(): void {
    if (!this.current) return;

    // Auto-detect shape when in shape mode
    if (this.shapeMode && this.current.tool === "draw" && this.current.points.length > 8) {
      this.current.shape = recognizeShape(this.current.points);
    }

    this.strokes.push(this.current);
    this.redoStack = [];
    this.current = null;
  }

  isActive(): boolean {
    return this.current !== null;
  }

  getCurrent(): Stroke | null {
    return this.current;
  }

  // ── History ─────────────────────────────────────────────────────────────

  undo(): boolean {
    const s = this.strokes.pop();
    if (s) {
      this.redoStack.push(s);
      return true;
    }
    return false;
  }

  redo(): boolean {
    const s = this.redoStack.pop();
    if (s) {
      this.strokes.push(s);
      return true;
    }
    return false;
  }

  clear(): void {
    this.strokes = [];
    this.redoStack = [];
    this.current = null;
  }

  // ── Shape mode ──────────────────────────────────────────────────────────

  toggleShapeMode(): boolean {
    this.shapeMode = !this.shapeMode;
    return this.shapeMode;
  }

  getShapeMode(): boolean {
    return this.shapeMode;
  }

  setShapeMode(v: boolean): void {
    this.shapeMode = v;
  }

  // ── Counts (for UI) ─────────────────────────────────────────────────────

  undoCount(): number {
    return this.strokes.length;
  }

  redoCount(): number {
    return this.redoStack.length;
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.clearRect(0, 0, w, h);
    for (const s of this.strokes) this.drawStroke(ctx, s);
    if (this.current) this.drawStroke(ctx, this.current);
  }

  private drawStroke(ctx: CanvasRenderingContext2D, s: Stroke): void {
    if (s.points.length < 2 && !s.shape) return;

    ctx.save();

    if (s.tool === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = s.color;
    }

    ctx.lineWidth = s.tool === "erase" ? s.thickness * 3 : s.thickness;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (s.shape) {
      this.drawShape(ctx, s.shape);
    } else {
      this.drawFreehand(ctx, s.points);
    }

    ctx.restore();
  }

  /**
   * Quadratic curve smoothing: each interior control point produces a
   * smooth midpoint, eliminating the jagged look of straight lineTo calls.
   */
  private drawFreehand(ctx: CanvasRenderingContext2D, pts: Point[]): void {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }

    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  private drawShape(ctx: CanvasRenderingContext2D, sh: ShapeResult): void {
    ctx.beginPath();
    const p = sh.params;
    switch (sh.type) {
      case "line":
        ctx.moveTo(p.x1, p.y1);
        ctx.lineTo(p.x2, p.y2);
        break;
      case "circle":
        ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
        break;
      case "rectangle":
        ctx.rect(p.x, p.y, p.w, p.h);
        break;
    }
    ctx.stroke();
  }

  // ── Export ───────────────────────────────────────────────────────────────

  exportPNG(canvas: HTMLCanvasElement): void {
    const link = document.createElement("a");
    link.download = "airsketch-export.png";
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
