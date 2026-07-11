import type { SKRSContext2D } from "@napi-rs/canvas";
import { Sky, type SkyConfig } from "./sky.js";
import { drawTerrainLayer, type TerrainLayerConfig } from "./terrain.js";

/**
 * M2 journey scene: a pre-dawn landscape — deep indigo sky with stars
 * and a low moon, amber glow at the horizon, and layered silhouette
 * ridges scrolling with parallax. The camera moves forward at a
 * constant speed; no character yet (that's M3).
 */
const PREDAWN_SKY: SkyConfig = {
  stops: [
    { pos: 0.0, color: "#070b22" },
    { pos: 0.35, color: "#1c2148" },
    { pos: 0.52, color: "#4b3a63" },
    { pos: 0.63, color: "#8f5a58" },
    { pos: 0.74, color: "#d99a62" },
    { pos: 1.0, color: "#e8b070" },
  ],
  starCount: 220,
  starMaxY: 0.55,
  moon: { x: 0.72, y: 0.22, radius: 0.035 },
};

/** Sky color near the ridgelines — what distant layers fog into. */
const HORIZON_COLOR = "#8f5a58";

const LAYERS: TerrainLayerConfig[] = [
  { depth: 0.12, baseY: 0.72, amp: 0.28, wavelengthPx: 820, color: "#3a2f50", seed: 11, ridged: true },
  { depth: 0.3, baseY: 0.76, amp: 0.19, wavelengthPx: 640, color: "#2c2440", seed: 22, ridged: true },
  { depth: 0.5, baseY: 0.82, amp: 0.12, wavelengthPx: 540, color: "#1f1a30", seed: 33 },
  { depth: 0.75, baseY: 0.88, amp: 0.09, wavelengthPx: 420, color: "#131022", seed: 44, octaves: 5 },
  { depth: 1.0, baseY: 0.95, amp: 0.07, wavelengthPx: 320, color: "#080714", seed: 55, octaves: 5 },
];

export class JourneyScene {
  private sky: Sky;

  constructor(
    seed: number,
    /** Camera speed on the near plane, in world pixels per second. */
    private cameraSpeedPx = 140,
  ) {
    this.sky = new Sky(PREDAWN_SKY, seed);
  }

  render(ctx: SKRSContext2D, t: number, w: number, h: number): void {
    const cameraX = t * this.cameraSpeedPx;
    this.sky.draw(ctx, w, h, t);
    for (const layer of LAYERS) {
      drawTerrainLayer(ctx, layer, cameraX, HORIZON_COLOR, w, h);
    }
  }
}
