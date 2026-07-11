import { createCanvas, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import { mulberry32, hash01 } from "../util/noise.js";

export interface PostFXOptions {
  /** 0..1 vignette darkness at the corners. */
  vignette: number;
  /** 0..1 film-grain opacity. */
  grain: number;
  /** Soft atmospheric glow around the scene's light source. */
  glow?: { x: number; y: number; color: string; strength: number };
}

const GRAIN_TILE = 256;

/**
 * Cinematic finishing pass: light-source glow, vignette, and animated
 * film grain. Grain uses a pre-generated RGBA tile (random black/white
 * pixels at low alpha) drawn at a per-frame hashed offset, which also
 * dithers away gradient banding.
 */
export class PostFX {
  private grainPattern: Canvas;
  private pattern: ReturnType<SKRSContext2D["createPattern"]> | null = null;
  private vignetteCache: Canvas | null = null;

  constructor(seed: number) {
    this.grainPattern = createCanvas(GRAIN_TILE, GRAIN_TILE);
    const gctx = this.grainPattern.getContext("2d");
    const img = gctx.createImageData(GRAIN_TILE, GRAIN_TILE);
    const rng = mulberry32(seed);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rng() < 0.5 ? 0 : 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = Math.floor(rng() * 255);
    }
    gctx.putImageData(img, 0, 0);
  }

  apply(ctx: SKRSContext2D, w: number, h: number, frame: number, opts: PostFXOptions): void {
    // --- light-source glow (screen blend brightens without washing out) ---
    if (opts.glow && opts.glow.strength > 0.001) {
      const { x, y, color, strength } = opts.glow;
      const r = h * 0.95;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = strength;
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.restore();
    }

    // --- vignette (static per resolution — rendered once and cached) ---
    if (opts.vignette > 0.001) {
      if (!this.vignetteCache || this.vignetteCache.width !== w || this.vignetteCache.height !== h) {
        this.vignetteCache = createCanvas(w, h);
        const vctx = this.vignetteCache.getContext("2d");
        const cx = w / 2;
        const cy = h / 2;
        const inner = Math.min(w, h) * 0.42;
        const outer = Math.hypot(cx, cy) * 1.02;
        const g = vctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
        g.addColorStop(0, "rgba(4, 4, 12, 0)");
        g.addColorStop(1, `rgba(4, 4, 12, ${opts.vignette})`);
        vctx.fillStyle = g;
        vctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(this.vignetteCache, 0, 0);
    }

    // --- animated film grain (single pattern fill; offset via transform) ---
    if (opts.grain > 0.001) {
      const ox = Math.floor(hash01(frame, 4242) * GRAIN_TILE);
      const oy = Math.floor(hash01(frame, 2424) * GRAIN_TILE);
      if (!this.pattern) {
        this.pattern = ctx.createPattern(this.grainPattern, "repeat");
      }
      ctx.save();
      ctx.globalAlpha = opts.grain;
      ctx.translate(-ox, -oy);
      ctx.fillStyle = this.pattern;
      ctx.fillRect(0, 0, w + GRAIN_TILE, h + GRAIN_TILE);
      ctx.restore();
    }
  }
}
