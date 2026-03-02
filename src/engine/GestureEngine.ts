// ─── Gesture Engine ──────────────────────────────────────────────────────────
// Classifies hand gestures from MediaPipe landmarks.
// Supports dual-hand interaction: Drawing hand + Control hand.
// ─────────────────────────────────────────────────────────────────────────────

export type GestureType = "idle" | "draw" | "erase" | "clear" | "shape_toggle" | "thickness_up" | "thickness_down";

export interface GestureResult {
  gesture: GestureType;
  point: { x: number; y: number } | null;
  thicknessDelta?: number; // Normalized thickness 0-1 based on second hand pinch
}

interface Landmark {
  x: number;
  y: number;
  z: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PINCH_THRESHOLD = 0.15;
const SMOOTHING_ALPHA = 0.4;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isFingerExtended(tip: Landmark, pip: Landmark): boolean {
  return tip.y < pip.y - 0.02;
}

function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class GestureEngine {
  private frameBuffer: GestureType[] = [];
  private confirmed: GestureType = "idle";
  private prevOneShot: GestureType = "idle";
  private smoothed: { x: number; y: number } | null = null;

  classify(multiLm: Landmark[][], canvasW: number, canvasH: number): GestureResult {
    if (!multiLm.length) return { gesture: "idle", point: null };

    // Identify Drawing hand vs Control hand (by x position)
    const sortedHands = [...multiLm].sort((a, b) => a[0].x - b[0].x);
    // Mirroring: the drawing hand (user's right) is right-most in unmirrored data
    const drawLm = sortedHands[sortedHands.length - 1];
    const ctrlLm = sortedHands.length > 1 ? sortedHands[0] : null;

    // ── 1. Dominant Hand Logic (Draw/Erase) ──
    const lm = drawLm;
    const thumbTip = lm[4];
    const indexPip = lm[6];
    const indexTip = lm[8];
    const middlePip = lm[10];
    const middleTip = lm[12];
    const ringPip = lm[14];
    const ringTip = lm[16];

    const pinching = dist(thumbTip, indexTip) < PINCH_THRESHOLD;
    const indexUp = isFingerExtended(indexTip, indexPip);
    const middleUp = isFingerExtended(middleTip, middlePip);
    const ringUp = isFingerExtended(ringTip, ringPip);

    let raw: GestureType = "idle";
    if (pinching) {
      raw = "draw";
    } else if (indexUp && middleUp && !ringUp) {
      raw = "erase";
    } else if (!indexUp && !middleUp && !ringUp) {
      raw = "clear";
    } else if (indexUp && middleUp && ringUp) {
      raw = "shape_toggle";
    } else {
      raw = "idle";
    }

    // Stability (Majority Vote)
    this.frameBuffer.push(raw);
    if (this.frameBuffer.length > 4) this.frameBuffer.shift();
    const counts: Record<string, number> = {};
    let maxGesture = raw;
    let maxCount = 0;
    for (const g of this.frameBuffer) {
      counts[g] = (counts[g] || 0) + 1;
      if (counts[g] > maxCount) {
        ((maxCount = counts[g]), (maxGesture = g as GestureType));
      }
    }
    if (maxCount >= 2) this.confirmed = maxGesture;

    // Point smoothing
    let point: { x: number; y: number } | null = null;
    if (this.confirmed === "draw" || this.confirmed === "erase") {
      const tx = this.confirmed === "draw" ? (thumbTip.x + indexTip.x) / 2 : (indexTip.x + middleTip.x) / 2;
      const ty = this.confirmed === "draw" ? (thumbTip.y + indexTip.y) / 2 : (indexTip.y + middleTip.y) / 2;
      point = this.applySmoothing((1 - tx) * canvasW, ty * canvasH);
    }

    // ── 2. Non-Dominant Hand Logic (Pinch & Zoom Size) ──
    let thicknessDelta: number | undefined;
    if (ctrlLm) {
      const cThumb = ctrlLm[4];
      const cIndex = ctrlLm[8];
      const d = dist(cThumb, cIndex);
      // Map dist 0.05-0.3 to 0-1
      thicknessDelta = Math.max(0, Math.min(1, (d - 0.05) / 0.25));
    }

    return { gesture: this.confirmed, point, thicknessDelta };
  }

  consumeOneShot(gesture: GestureType): boolean {
    const fired = this.confirmed === gesture && this.prevOneShot !== gesture;
    if (this.confirmed !== this.prevOneShot) this.prevOneShot = this.confirmed;
    return fired;
  }

  reset(): void {
    this.frameBuffer = [];
    this.confirmed = "idle";
    this.smoothed = null;
    this.prevOneShot = "idle";
  }

  private applySmoothing(x: number, y: number): { x: number; y: number } {
    if (!this.smoothed) {
      this.smoothed = { x, y };
    } else {
      this.smoothed = {
        x: SMOOTHING_ALPHA * x + (1 - SMOOTHING_ALPHA) * this.smoothed.x,
        y: SMOOTHING_ALPHA * y + (1 - SMOOTHING_ALPHA) * this.smoothed.y,
      };
    }
    return { x: this.smoothed.x, y: this.smoothed.y };
  }
}
