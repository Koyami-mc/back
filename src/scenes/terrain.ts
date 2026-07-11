import type { SKRSContext2D } from "@napi-rs/canvas";
import { fbm1D, ridgedFbm1D } from "../util/noise.js";
import { lerpHex } from "../util/color.js";

export interface TerrainLayerConfig {
  /** 0 = farthest, 1 = nearest. Controls parallax speed and fog amount. */
  depth: number;
  /** Ridge baseline as a fraction of frame height. */
  baseY: number;
  /** Ridge amplitude as a fraction of frame height. */
  amp: number;
  /** Horizontal noise wavelength in near-plane pixels. */
  wavelengthPx: number;
  /** Silhouette color at depth 1 (no fog). */
  color: string;
  /** Noise seed offset so layers don't share ridgelines. */
  seed: number;
  octaves?: number;
  /** Ridged noise (sharp peaks) instead of rolling hills — for mountains. */
  ridged?: boolean;
}

/** Parallax multiplier: far layers barely move, near layers move at camera speed. */
export function parallaxFactor(depth: number): number {
  return 0.06 + 0.94 * Math.pow(depth, 1.7);
}

function ridgeHeight(cfg: TerrainLayerConfig, worldX: number): number {
  const x = worldX / cfg.wavelengthPx;
  return cfg.ridged
    ? ridgedFbm1D(x, cfg.seed, cfg.octaves ?? 5)
    : fbm1D(x, cfg.seed, cfg.octaves ?? 4);
}

/** Layer silhouette color after distance fog toward the horizon color (hex). */
export function foggedLayerColor(cfg: TerrainLayerConfig, layerColor: string, fogColor: string): string {
  const fogMix = 0.2 + 0.8 * Math.min(1, cfg.depth); // 1 = pure layer color, lower = foggier
  return lerpHex(fogColor, layerColor, fogMix);
}

export interface LayerPaint {
  /** Base (fogged) fill; see foggedLayerColor. */
  fill: string;
  /** Optional lighter color near the ridgeline (atmospheric backlight). */
  gradientTop?: string;
  /** Optional darker color toward the frame bottom. */
  gradientBottom?: string;
  /** Optional rim-light stroke along the ridgeline. */
  rim?: { color: string; alpha: number; width: number };
}

/**
 * Draws one silhouette ridge layer. cameraX is the camera position in
 * near-plane world pixels. The fill can be a subtle vertical gradient
 * (lit near the ridge, darker below) with a backlit rim stroke — flat
 * fills read as amateur; this is most of the "pro" look.
 */
export function drawTerrainLayer(
  ctx: SKRSContext2D,
  cfg: TerrainLayerConfig,
  cameraX: number,
  paint: LayerPaint,
  w: number,
  h: number,
): void {
  const offset = cameraX * parallaxFactor(cfg.depth);
  const step = 4;
  const points: number[] = [];
  for (let x = 0; x <= w + step; x += step) {
    points.push((cfg.baseY - cfg.amp * ridgeHeight(cfg, x + offset)) * h);
  }

  if (paint.gradientTop || paint.gradientBottom) {
    const topY = (cfg.baseY - cfg.amp) * h;
    const g = ctx.createLinearGradient(0, topY, 0, h);
    g.addColorStop(0, paint.gradientTop ?? paint.fill);
    g.addColorStop(0.45, paint.fill);
    g.addColorStop(1, paint.gradientBottom ?? paint.fill);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = paint.fill;
  }

  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < points.length; i++) ctx.lineTo(i * step, points[i]);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  if (paint.rim && paint.rim.alpha > 0.004) {
    ctx.save();
    ctx.strokeStyle = paint.rim.color;
    ctx.globalAlpha = paint.rim.alpha;
    ctx.lineWidth = paint.rim.width;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(0, points[0]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(i * step, points[i]);
    ctx.stroke();
    ctx.restore();
  }
}

/** Ridge height (in pixels from the top) of a layer at a given screen x. */
export function terrainHeightAt(
  cfg: TerrainLayerConfig,
  cameraX: number,
  x: number,
  h: number,
): number {
  const offset = cameraX * parallaxFactor(cfg.depth);
  return (cfg.baseY - cfg.amp * ridgeHeight(cfg, x + offset)) * h;
}
