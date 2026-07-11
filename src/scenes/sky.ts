import type { SKRSContext2D } from "@napi-rs/canvas";
import { mulberry32 } from "../util/noise.js";

export interface SkyConfig {
  /** Vertical gradient stops, pos 0 = top of frame, 1 = bottom. */
  stops: { pos: number; color: string }[];
  /** Number of stars scattered over the sky (0 = none). */
  starCount: number;
  /** Stars fade out below this fraction of the frame height. */
  starMaxY: number;
  /** Optional moon: position and radius as fractions of frame size. */
  moon?: { x: number; y: number; radius: number };
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

  constructor(private cfg: SkyConfig, seed: number) {
    const rng = mulberry32(seed);
    this.stars = Array.from({ length: cfg.starCount }, () => ({
      x: rng(),
      y: rng() * cfg.starMaxY,
      size: 0.8 + rng() * 1.6,
      base: 0.35 + rng() * 0.5,
      phase: rng() * Math.PI * 2,
      speed: 0.5 + rng() * 2.5,
    }));
  }

  draw(ctx: SKRSContext2D, w: number, h: number, t: number): void {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    for (const s of this.cfg.stops) g.addColorStop(s.pos, s.color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (const s of this.stars) {
      const twinkle = s.base * (0.7 + 0.3 * Math.sin(t * s.speed + s.phase));
      // fade stars toward the horizon
      const fade = 1 - s.y / this.cfg.starMaxY;
      ctx.fillStyle = `rgba(255, 250, 235, ${(twinkle * (0.3 + 0.7 * fade)).toFixed(3)})`;
      const px = s.x * w;
      const py = s.y * h;
      ctx.fillRect(px, py, s.size, s.size);
    }

    const moon = this.cfg.moon;
    if (moon) {
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
    }
  }
}
