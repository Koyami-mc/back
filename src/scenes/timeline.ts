import { SCENES, lerpScenePalette, type ScenePalette } from "./palettes.js";

/**
 * Maps time → blended scene palette. The song duration is divided
 * evenly among the scenes (M5 will replace this with per-track JSON);
 * around each boundary the two adjacent palettes are smoothstep-blended
 * so the landscape changes while walking, never cutting.
 */
export function resolveTimeline(t: number, durationSec: number, scenes: ScenePalette[] = SCENES): ScenePalette {
  const n = scenes.length;
  const slice = durationSec / n;
  const transition = Math.min(5, slice * 0.4);

  const idx = Math.min(n - 1, Math.max(0, Math.floor(t / slice)));
  // distance to the nearest boundary ahead/behind decides blending
  for (let b = 1; b < n; b++) {
    const boundary = b * slice;
    const from = boundary - transition / 2;
    const to = boundary + transition / 2;
    if (t >= from && t <= to) {
      const q = (t - from) / (to - from);
      const s = q * q * (3 - 2 * q);
      return lerpScenePalette(scenes[b - 1], scenes[b], s);
    }
  }
  return scenes[idx];
}
