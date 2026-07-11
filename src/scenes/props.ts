import type { SKRSContext2D } from "@napi-rs/canvas";
import { hash01 } from "../util/noise.js";
import { parallaxFactor, terrainHeightAt, type TerrainLayerConfig } from "./terrain.js";

/**
 * Silhouette pines scattered on a terrain layer. Trees live at fixed
 * world positions (hashed lattice cells) so they scroll with their
 * layer; density is a 0..1 threshold with a soft edge, letting scene
 * transitions fade individual trees in and out instead of popping.
 */
export function drawTrees(
  ctx: SKRSContext2D,
  layer: TerrainLayerConfig,
  cameraX: number,
  density: number,
  color: string,
  w: number,
  h: number,
): void {
  if (density <= 0.001) return;
  const cell = 65 + 90 * (1 - layer.depth);
  const offset = cameraX * parallaxFactor(layer.depth);
  const margin = 80;
  const first = Math.floor((offset - margin) / cell);
  const last = Math.ceil((offset + w + margin) / cell);

  for (let i = first; i <= last; i++) {
    const r = hash01(i, layer.seed * 31 + 5);
    const alpha = Math.max(0, Math.min(1, (density - r) / 0.08));
    if (alpha <= 0) continue;
    const jitter = hash01(i, layer.seed * 31 + 6) * cell * 0.8;
    const x = i * cell + jitter - offset;
    if (x < -margin || x > w + margin) continue;
    const groundY = terrainHeightAt(layer, cameraX, x, h) + 2;
    const size = h * (0.6 + 0.4 * hash01(i, layer.seed * 31 + 7)) * (0.06 + 0.13 * layer.depth);

    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    // three stacked fronds + a stub of trunk
    for (let tier = 0; tier < 3; tier++) {
      const ty = groundY - size * (0.36 + 0.32 * tier);
      const half = size * 0.3 * (1 - tier * 0.26);
      ctx.beginPath();
      ctx.moveTo(x, ty - size * 0.34);
      ctx.lineTo(x - half, ty);
      ctx.lineTo(x + half, ty);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillRect(x - size * 0.035, groundY - size * 0.4, size * 0.07, size * 0.4);
    ctx.globalAlpha = 1;
  }
}
