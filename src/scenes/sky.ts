import type { SKRSContext2D } from "@napi-rs/canvas";
import { mulberry32 } from "../util/noise.js";

export interface SkyConfig {
  /** Number of stars scattered over the sky (0 = none). */
  starCount: number;
  /** Stars fade out below this fraction of the frame height. */
  starMaxY: number;
  /** Optional moon: position and radius as fractions of frame size. */
  moon?: { x: number; y: number; radius: number };
}

export interface SkyState {
  /** Vertical gradient stops, pos 0 = top of frame, 1 = bottom. */
  stops: { pos: number; color: string }[];
  /** Global star brightness multiplier (0 hides stars). */
  starAlpha: number;
  /** Moon + glow opacity (0 hides the moon). */
  moonAlpha: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  base: number;
  phase: number;
  speed: number;
}

export class Sky {
  private stars: Star[];
  /** Extra faint stars revealed only when starAlpha exceeds 1 (deep night). */
  private deepStars: Star[];

  constructor(private cfg: SkyConfig, seed: number) {
    const makeStars = (count: number, rng: () => number, maxY: number): Star[] =>
      Array.from({ length: count }, () => ({
        x: rng(),
        y: rng() * maxY,
        size: 0.8 + rng() * 1.6,
        base: 0.35 + rng() * 0.5,
        phase: rng() * Math.PI * 2,
        speed: 0.5 + rng() * 2.5,
      }));
    this.stars = makeStars(cfg.starCount, mulberry32(seed), cfg.starMaxY);
    this.deepStars = makeStars(Math.round(cfg.starCount * 1.6), mulberry32(seed + 1), cfg.starMaxY * 1.25);
  }

  draw(ctx: SKRSContext2D, w: number, h: number, t: number, state: SkyState): void {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    for (const s of state.stops) g.addColorStop(s.pos, s.color);
    ctx.fillStyle = g;
    // overdraw a little so camera drift never exposes the frame edge
    ctx.fillRect(0, -0.04 * h, w, 1.08 * h);

    const drawStars = (stars: Star[], maxY: number, alphaMul: number): void => {
      if (alphaMul <= 0.001) return;
      for (const s of stars) {
        const twinkle = s.base * (0.7 + 0.3 * Math.sin(t * s.speed + s.phase));
        // fade stars toward the horizon
        const fade = 1 - s.y / maxY;
        const a = Math.min(1, twinkle * (0.3 + 0.7 * fade) * alphaMul);
        ctx.fillStyle = `rgba(255, 250, 235, ${a.toFixed(3)})`;
        ctx.fillRect(s.x * w, s.y * h, s.size, s.size);
      }
    };
    drawStars(this.stars, this.cfg.starMaxY, state.starAlpha);
    drawStars(this.deepStars, this.cfg.starMaxY * 1.25, Math.max(0, (state.starAlpha - 1) / 0.4));

    const moon = this.cfg.moon;
    if (moon && state.moonAlpha > 0.001) {
      ctx.globalAlpha = state.moonAlpha;
      const mx = moon.x * w;
      const my = moon.y * h;
      const r = moon.radius * h;
      const glow = ctx.createRadialGradient(mx, my, r * 0.5, mx, my, r * 5);
      glow.addColorStop(0, "rgba(255, 245, 220, 0.35)");
      glow.addColorStop(1, "rgba(255, 245, 220, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(mx - r * 5, my - r * 5, r * 10, r * 10);
      ctx.fillStyle = "rgba(255, 248, 230, 0.95)";
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
