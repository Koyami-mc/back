import type { SKRSContext2D } from "@napi-rs/canvas";
import { hash01, valueNoise1D } from "../util/noise.js";

export type ParticleKind = "snow" | "fireflies" | "leaves";

const POOL: Record<ParticleKind, number> = { snow: 240, fireflies: 36, leaves: 70 };

/**
 * Screen-space ambient particles. Positions are pure functions of (i, t)
 * — no mutable state — so rendering stays deterministic and any frame
 * can be evaluated independently. `weight` (0..1) scales how many pool
 * particles are alive; the last one fades in/out so density changes are
 * smooth during scene transitions.
 */
export class Particles {
  constructor(private kind: ParticleKind, private seed: number) {}

  draw(ctx: SKRSContext2D, t: number, w: number, h: number, weight: number): void {
    if (weight <= 0.001) return;
    const alive = POOL[this.kind] * weight;
    const count = Math.min(POOL[this.kind], Math.ceil(alive));
    for (let i = 0; i < count; i++) {
      const fade = Math.max(0, Math.min(1, alive - i));
      this.drawOne(ctx, i, t, w, h, fade);
    }
  }

  private drawOne(ctx: SKRSContext2D, i: number, t: number, w: number, h: number, fade: number): void {
    const r1 = hash01(i, this.seed);
    const r2 = hash01(i, this.seed + 1);
    const r3 = hash01(i, this.seed + 2);
    const r4 = hash01(i, this.seed + 3);
    const scale = h / 1080;

    if (this.kind === "snow") {
      const fall = h * (0.05 + 0.06 * r3);
      const drift = -w * 0.02 * (1 + r4);
      const x = (((r1 * w + t * drift + Math.sin(t * 0.9 + r2 * 6.28) * 30 * scale) % w) + w) % w;
      const y = (r2 * h + t * fall) % h;
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.45 + 0.4 * r3) * fade})`;
      const s = (1.5 + 2.5 * r4) * scale;
      ctx.fillRect(x, y, s, s);
      return;
    }

    if (this.kind === "fireflies") {
      const gx = r1 * w + Math.sin(t * (0.25 + 0.2 * r3) + r2 * 6.28) * w * 0.04;
      const gy = h * (0.68 + 0.24 * r2) + Math.sin(t * (0.4 + 0.3 * r4) + r1 * 6.28) * h * 0.03;
      const x = ((gx % w) + w) % w;
      const blinkRaw = Math.sin(t * (0.7 + 1.1 * r3) + r4 * 6.28);
      const blink = Math.pow(Math.max(0, blinkRaw), 3);
      if (blink < 0.02) return;
      const a = blink * fade;
      const rad = 6 * scale;
      const glow = ctx.createRadialGradient(x, gy, 0, x, gy, rad * 3);
      glow.addColorStop(0, `rgba(216, 232, 150, ${0.5 * a})`);
      glow.addColorStop(1, "rgba(216, 232, 150, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - rad * 3, gy - rad * 3, rad * 6, rad * 6);
      ctx.fillStyle = `rgba(240, 250, 190, ${0.9 * a})`;
      ctx.beginPath();
      ctx.arc(x, gy, 1.6 * scale, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // leaves: tumbling flecks on a gusty diagonal
    const fall = h * (0.08 + 0.07 * r3);
    const gust = valueNoise1D(t * 0.5 + r1 * 10, this.seed + 9);
    const driftX = -w * (0.05 + 0.09 * gust);
    const x = (((r1 * w + t * driftX + Math.sin(t * 1.3 + r2 * 6.28) * 40 * scale) % w) + w) % w;
    const y = (r2 * h + t * fall + Math.sin(t * 2.1 + r4 * 6.28) * 12 * scale) % h;
    const rot = t * (1.5 + 2 * r3) + r4 * 6.28;
    const len = (5 + 4 * r4) * scale;
    ctx.strokeStyle = `rgba(122, 84, 56, ${(0.5 + 0.4 * r3) * fade})`;
    ctx.lineWidth = 2.2 * scale;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(rot) * len, y - Math.sin(rot) * len);
    ctx.lineTo(x + Math.cos(rot) * len, y + Math.sin(rot) * len);
    ctx.stroke();
  }
}
