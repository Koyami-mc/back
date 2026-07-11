import type { SKRSContext2D } from "@napi-rs/canvas";
import { type BeatGrid, beatPhase } from "../audio/beatgrid.js";

/**
 * M1 test scene: a slowly hue-shifting vertical gradient with a white
 * flash that decays after every beat, plus a progress bar and beat
 * counter squares. Exists purely to validate the render→encode→mux
 * pipeline and audio/video sync.
 */
export function renderTestFrame(
  ctx: SKRSContext2D,
  t: number,
  durationSec: number,
  grid: BeatGrid,
  width: number,
  height: number,
): void {
  const hue = (200 + t * 12) % 360;
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, `hsl(${hue}, 55%, 12%)`);
  g.addColorStop(1, `hsl(${(hue + 40) % 360}, 60%, 32%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  // Beat flash: bright at the beat instant, ~80ms exponential decay.
  const { index, sinceSec } = beatPhase(grid, t);
  if (index >= 0) {
    const alpha = 0.85 * Math.exp(-sinceSec / 0.08);
    if (alpha > 0.01) {
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  // Beat counter: one square per beat in the current bar (accent first).
  const sq = Math.round(height * 0.03);
  for (let i = 0; i < 4; i++) {
    const active = index >= 0 && index % 4 === i;
    ctx.fillStyle = active ? "#ffffff" : "rgba(255,255,255,0.25)";
    ctx.fillRect(width * 0.05 + i * sq * 1.6, height * 0.08, sq, sq);
  }

  // Progress bar along the bottom.
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillRect(0, height - Math.round(height * 0.01), width * (t / durationSec), Math.round(height * 0.01));
}
