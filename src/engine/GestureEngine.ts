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

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TOUCH_THRESHOLD = 0.05; // Tight threshold for physical touch
const PINCH_THRESHOLD = 0.12; // General proximity threshold for stability
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
  private lastThicknessDelta: number | null = null;
  private smoothed: { x: number; y: number } | null = null;

  classify(hands: { lm: Landmark[]; label: string }[], canvasW: number, canvasH: number, handMode: "right" | "left" = "right"): GestureResult {
    if (!hands.length) return { gesture: "idle", point: null };

    // Identify Drawing hand vs Control hand by Visual Screen Position (Stable)
    // MediaPipe Raw X: 0 (Left/Camera) to 1 (Right/Camera)
    // Since video is Mirrored:
    // - Camera Left (Low X) = Screen Right
    // - Camera Right (High X) = Screen Left

    const sortedHands = [...hands].sort((a, b) => a.lm[0].x - b.lm[0].x);

    let drawHand, ctrlHand;
    if (handMode === "right") {
      // User wants to draw with Screen Right hand -> Camera Left (Low X)
      drawHand = sortedHands[0];
      ctrlHand = sortedHands.length > 1 ? sortedHands[sortedHands.length - 1] : undefined;
    } else {
      // User wants to draw with Screen Left hand -> Camera Right (High X)
      drawHand = sortedHands[sortedHands.length - 1];
      ctrlHand = sortedHands.length > 1 ? sortedHands[0] : undefined;
    }

    if (!drawHand) return { gesture: "idle", point: null };

    const drawLm = drawHand.lm;
    const ctrlLm = ctrlHand?.lm;

    // ── 1. Dominant Hand Logic (Draw/Erase) ──
    const lm = drawLm;
    const thumbTip = lm[4];
    const indexPip = lm[6];
    const indexTip = lm[8];
    const middlePip = lm[10];
    const middleTip = lm[12];
    const ringPip = lm[14];
    const ringTip = lm[16];

    const pinching = dist(thumbTip, indexTip) < TOUCH_THRESHOLD;
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
    let maxGesture: GestureType = raw;
    let maxCount = 0;
    for (const g of this.frameBuffer) {
      counts[g] = (counts[g] || 0) + 1;
      if (counts[g] > maxCount) {
        maxCount = counts[g];
        maxGesture = g;
      }
    }
    if (maxCount >= 2) this.confirmed = maxGesture;

    // Point smoothing
    let point: { x: number; y: number } | null = null;

    // Default to index tip for idle/hover, but use pinch center for drawing
    const tx = this.confirmed === "draw" ? (thumbTip.x + indexTip.x) / 2 : indexTip.x;
    const ty = this.confirmed === "draw" ? (thumbTip.y + indexTip.y) / 2 : indexTip.y;

    // Video is ALWAYS mirrored in CSS (selfie view).
    // MediaPipe raw x=0 is camera left, x=1 is camera right.
    const screenX = (1 - tx) * canvasW;
    point = this.applySmoothing(screenX, ty * canvasH);

    // ── 2. Non-Dominant Hand Logic (Vertical Slider) ──
    let thicknessDelta: number | undefined;
    if (ctrlLm) {
      const cThumb = ctrlLm[4];
      const cIndex = ctrlLm[8];

      const isHold = dist(cThumb, cIndex) < TOUCH_THRESHOLD;

      if (isHold) {
        // Vertical mapping: Screen top (y=0.2) -> 1.0 thickness, Screen bottom (y=0.8) -> 0.0 thickness
        const ty = cIndex.y;
        const rawDelta = Math.max(0, Math.min(1, (0.8 - ty) / 0.6));

        // Apply Exponential Smoothing
        if (this.lastThicknessDelta === null) {
          this.lastThicknessDelta = rawDelta;
        } else {
          this.lastThicknessDelta = SMOOTHING_ALPHA * rawDelta + (1 - SMOOTHING_ALPHA) * this.lastThicknessDelta;
        }
        thicknessDelta = this.lastThicknessDelta;
      } else {
        // Not holding "pen" -> no change reported
        thicknessDelta = undefined;
        // Keep the last value so it doesn't jump next time we pinch
        // but don't report it so the UI doesn't overwrite manual changes
      }
    } else {
      this.lastThicknessDelta = null;
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
