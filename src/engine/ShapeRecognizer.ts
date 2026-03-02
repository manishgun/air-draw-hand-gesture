// ─── Shape Recognizer ────────────────────────────────────────────────────────
// Pure-math module that detects lines, circles, and rectangles from a
// freehand stroke.  Returns null when no shape is detected with sufficient
// confidence.
// ─────────────────────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface ShapeResult {
  type: "line" | "circle" | "rectangle";
  confidence: number;
  params: Record<string, number>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Perpendicular distance from `p` to the segment `a→b`. */
function pointToSegDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer-Douglas-Peucker path simplification. */
function simplify(pts: Point[], eps: number): Point[] {
  if (pts.length <= 2) return [...pts];
  let maxD = 0;
  let maxI = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = pointToSegDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) {
      maxD = d;
      maxI = i;
    }
  }
  if (maxD > eps) {
    const left = simplify(pts.slice(0, maxI + 1), eps);
    const right = simplify(pts.slice(maxI), eps);
    return [...left.slice(0, -1), ...right];
  }
  return [pts[0], pts[pts.length - 1]];
}

/** Interior angle (degrees) at vertex `b` formed by segments `a→b→c`. */
function angleDeg(a: Point, b: Point, c: Point): number {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const cross = ba.x * bc.y - ba.y * bc.x;
  return Math.abs(Math.atan2(cross, dot) * (180 / Math.PI));
}

// ─── Detectors ───────────────────────────────────────────────────────────────

function detectLine(pts: Point[]): ShapeResult | null {
  const a = pts[0];
  const b = pts[pts.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 30) return null;

  let total = 0;
  let max = 0;
  for (const p of pts) {
    const d = pointToSegDist(p, a, b);
    total += d;
    if (d > max) max = d;
  }
  const avg = total / pts.length;
  if (avg < len * 0.08 && max < len * 0.15) {
    return {
      type: "line",
      confidence: 1 - avg / len,
      params: { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
    };
  }
  return null;
}

function detectCircle(pts: Point[]): ShapeResult | null {
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;

  const radii = pts.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const avgR = radii.reduce((s, r) => s + r, 0) / radii.length;
  if (avgR < 20) return null;

  const variance = Math.sqrt(radii.reduce((s, r) => s + (r - avgR) ** 2, 0) / radii.length);
  const relVar = variance / avgR;

  // Closure check – start/end should be close
  const closure = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  if (relVar < 0.25 && closure / avgR < 0.8) {
    return {
      type: "circle",
      confidence: 1 - relVar,
      params: { cx, cy, r: avgR },
    };
  }
  return null;
}

function detectRectangle(pts: Point[]): ShapeResult | null {
  // Total path length for proportional thresholds
  let pathLen = 0;
  for (let i = 1; i < pts.length; i++) {
    pathLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }

  const closure = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  if (closure > pathLen * 0.25) return null; // not closed

  const simplified = simplify(pts, pathLen * 0.04);
  if (simplified.length < 4 || simplified.length > 7) return null;

  let rightAngles = 0;
  const n = simplified.length;
  for (let i = 0; i < n; i++) {
    const prev = simplified[(i - 1 + n) % n];
    const curr = simplified[i];
    const next = simplified[(i + 1) % n];
    if (Math.abs(angleDeg(prev, curr, next) - 90) < 25) {
      rightAngles++;
    }
  }

  if (rightAngles >= 3) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      type: "rectangle",
      confidence: rightAngles / n,
      params: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    };
  }
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Runs all detectors on `pts` and returns the best match,
 * or `null` when the stroke does not resemble any known shape.
 */
export function recognizeShape(pts: Point[]): ShapeResult | null {
  if (pts.length < 8) return null;

  const line = detectLine(pts);
  if (line && line.confidence > 0.85) return line;

  const circle = detectCircle(pts);
  if (circle && circle.confidence > 0.7) return circle;

  const rect = detectRectangle(pts);
  if (rect && rect.confidence > 0.55) return rect;

  return null;
}
