import type { SKRSContext2D } from "@napi-rs/canvas";
import { fbm1D, ridgedFbm1D } from "../util/noise.js";
import { lerpHexCss } from "../util/color.js";

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

/**
 * Draws one silhouette ridge layer. cameraX is the camera position in
 * near-plane world pixels; fogColor is what the layer fades into with
 * distance (normally the sky color at the horizon).
 */
export function drawTerrainLayer(
  ctx: SKRSContext2D,
  cfg: TerrainLayerConfig,
  cameraX: number,
  fogColor: string,
  w: number,
  h: number,
): void {
  const fogMix = 0.2 + 0.8 * cfg.depth; // 1 = pure layer color, lower = foggier
  ctx.fillStyle = lerpHexCss(fogColor, cfg.color, fogMix);

  const offset = cameraX * parallaxFactor(cfg.depth);
  const step = 4;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + step; x += step) {
    const y = (cfg.baseY - cfg.amp * ridgeHeight(cfg, x + offset)) * h;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
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
