import type { SKRSContext2D } from "@napi-rs/canvas";
import { valueNoise1D } from "../util/noise.js";

export interface TravelerConfig {
  /** Screen x the character is anchored at (world scrolls past). */
  screenX: number;
  /** Character height in pixels. */
  height: number;
  bodyColor: string;
  scarfColor: string;
}

interface ScarfPoint {
  x: number;
  y: number;
  px: number;
  py: number;
}

const SCARF_SEGMENTS = 12;
const STANCE_FRACTION = 0.55;

/**
 * A hooded traveler walking in place while the world scrolls by.
 * Legs are two-bone IK chains driven by a gait cycle tied to distance
 * traveled (feet stay planted relative to the ground); the scarf is a
 * Verlet chain blown backward by headwind; a lantern on the staff casts
 * a warm glow so the silhouette reads against dark terrain.
 */
export class Traveler {
  private scarf: ScarfPoint[] = [];
  private lastT: number | null = null;

  constructor(private cfg: TravelerConfig) {}

  /**
   * groundYAt maps screen x → terrain surface y (pixels from top) of the
   * layer the character walks on. speedPx is ground speed at that layer.
   */
  render(
    ctx: SKRSContext2D,
    t: number,
    cameraX: number,
    speedPx: number,
    groundYAt: (x: number) => number,
  ): void {
    const H = this.cfg.height;
    const x0 = this.cfg.screenX;
    const dt = this.lastT === null ? 1 / 60 : Math.min(t - this.lastT, 1 / 20);
    this.lastT = t;

    // --- gait ---
    const stride = 0.42 * H;
    const distPhase = (cameraX / stride) % 1;
    const legLen1 = 0.26 * H;
    const legLen2 = 0.24 * H;

    const foot = (phaseOffset: number): { x: number; y: number } => {
      const p = (distPhase + phaseOffset) % 1;
      if (p < STANCE_FRACTION) {
        const q = p / STANCE_FRACTION;
        const x = x0 + stride * (0.5 - q);
        return { x, y: groundYAt(x) };
      }
      const q = (p - STANCE_FRACTION) / (1 - STANCE_FRACTION);
      const s = q * q * (3 - 2 * q);
      const x = x0 + stride * (s - 0.5);
      return { x, y: groundYAt(x) - 0.08 * H * Math.sin(Math.PI * q) };
    };
    const footA = foot(0);
    const footB = foot(0.5);

    const groundAvg = (groundYAt(x0 - 0.3 * H) + groundYAt(x0) + groundYAt(x0 + 0.3 * H)) / 3;
    const bob = 0.02 * H * Math.sin(distPhase * Math.PI * 4);
    const hipY = groundAvg - 0.485 * H + bob;
    const hip = { x: x0, y: hipY };

    // --- torso / head ---
    const lean = 0.05 * H;
    const shoulder = { x: x0 + lean * 0.6, y: hipY - 0.3 * H };
    const neck = { x: shoulder.x + lean * 0.3, y: shoulder.y - 0.03 * H };
    const headC = { x: neck.x + 0.02 * H, y: neck.y - 0.055 * H };

    // --- scarf physics (Verlet chain anchored at the neck) ---
    const segLen = 0.05 * H;
    if (this.scarf.length === 0) {
      for (let i = 0; i < SCARF_SEGMENTS; i++) {
        const sx = neck.x - 0.03 * H - i * segLen * 0.7;
        const sy = neck.y + 0.03 * H + i * segLen * 0.5;
        this.scarf.push({ x: sx, y: sy, px: sx, py: sy });
      }
    }
    const gust = valueNoise1D(t * 1.3, 777);
    const windX = -(1.1 * speedPx + 1.6 * H * gust);
    const windY = -1.2 * H * (valueNoise1D(t * 1.7, 888) - 0.5);
    const gravity = 3.2 * H;
    for (let i = 1; i < this.scarf.length; i++) {
      const p = this.scarf[i];
      const vx = (p.x - p.px) * 0.96;
      const vy = (p.y - p.py) * 0.96;
      p.px = p.x;
      p.py = p.y;
      const flutter = 1 + 0.6 * valueNoise1D(t * 4 + i * 0.7, 999);
      p.x += vx + windX * flutter * dt * dt;
      p.y += vy + (gravity + windY) * dt * dt;
    }
    const scarfAnchor = { x: neck.x - 0.03 * H, y: neck.y + 0.03 * H };
    this.scarf[0].x = scarfAnchor.x;
    this.scarf[0].y = scarfAnchor.y;
    for (let iter = 0; iter < 4; iter++) {
      for (let i = 1; i < this.scarf.length; i++) {
        const a = this.scarf[i - 1];
        const b = this.scarf[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        const diff = (d - segLen) / d;
        if (i === 1) {
          // a is the anchor: only b moves
          b.x -= dx * diff;
          b.y -= dy * diff;
        } else {
          a.x += dx * diff * 0.5;
          a.y += dy * diff * 0.5;
          b.x -= dx * diff * 0.5;
          b.y -= dy * diff * 0.5;
        }
      }
      this.scarf[0].x = scarfAnchor.x;
      this.scarf[0].y = scarfAnchor.y;
    }

    // --- staff & lantern (held forward) ---
    const hand = { x: x0 + 0.22 * H, y: hipY - 0.12 * H };
    const staffTop = { x: x0 + 0.26 * H, y: hipY - 0.55 * H };
    // carried, tip floating just above the ground so it doesn't drag
    const staffBottom = { x: x0 + 0.18 * H, y: groundYAt(x0 + 0.18 * H) - 0.05 * H };
    const lantern = { x: staffTop.x + 0.05 * H, y: staffTop.y + 0.09 * H };

    // --- draw: glow first (behind the silhouette), with a live flicker ---
    const flicker = 0.86 + 0.28 * valueNoise1D(t * 5.5, 555);
    const glowR = 1.6 * H * (0.94 + 0.12 * valueNoise1D(t * 3.2, 556));
    const glow = ctx.createRadialGradient(lantern.x, lantern.y, 0.02 * H, lantern.x, lantern.y, glowR);
    glow.addColorStop(0, `rgba(255, 205, 130, ${0.34 * flicker})`);
    glow.addColorStop(0.4, `rgba(255, 180, 110, ${0.12 * flicker})`);
    glow.addColorStop(1, "rgba(255, 180, 110, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(lantern.x - glowR, lantern.y - glowR, glowR * 2, glowR * 2);

    // --- soft contact shadow so the feet feel planted ---
    const shR = 0.34 * H;
    const shadow = ctx.createRadialGradient(x0, groundAvg, 0, x0, groundAvg, shR);
    shadow.addColorStop(0, "rgba(0, 0, 5, 0.38)");
    shadow.addColorStop(1, "rgba(0, 0, 5, 0)");
    ctx.save();
    ctx.translate(x0, groundAvg + 0.01 * H);
    ctx.scale(1, 0.18);
    ctx.translate(-x0, -groundAvg);
    ctx.fillStyle = shadow;
    ctx.fillRect(x0 - shR, groundAvg - shR, shR * 2, shR * 2);
    ctx.restore();

    ctx.fillStyle = this.cfg.bodyColor;
    ctx.strokeStyle = this.cfg.bodyColor;

    // --- legs (back leg then cloak then front leg for depth) ---
    this.drawLeg(ctx, hip, footB, legLen1, legLen2, 0.055 * H);

    // --- cloak: hood to knee-length hem, swaying with gait ---
    const hemSway = 0.03 * H * Math.sin(distPhase * Math.PI * 4 + 1);
    const hemY = hipY + 0.24 * H;
    ctx.beginPath();
    ctx.moveTo(headC.x - 0.02 * H, headC.y - 0.08 * H);
    ctx.quadraticCurveTo(x0 - 0.22 * H, hipY - 0.12 * H, x0 - 0.15 * H + hemSway, hemY);
    ctx.lineTo(x0 + 0.11 * H + hemSway * 0.5, hemY - 0.02 * H);
    ctx.quadraticCurveTo(x0 + 0.17 * H, hipY - 0.25 * H, headC.x + 0.06 * H, headC.y - 0.04 * H);
    ctx.closePath();
    ctx.fill();

    // --- hooded head, merged into the cloak collar ---
    ctx.beginPath();
    ctx.arc(headC.x, headC.y, 0.082 * H, 0, Math.PI * 2);
    ctx.fill();

    // --- front leg ---
    this.drawLeg(ctx, hip, footA, legLen1, legLen2, 0.06 * H);

    // --- scarf (over the cloak so it reads against the silhouette) ---
    ctx.strokeStyle = this.cfg.scarfColor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < this.scarf.length; i++) {
      ctx.lineWidth = 0.045 * H * (1 - (i / this.scarf.length) * 0.6);
      ctx.beginPath();
      ctx.moveTo(this.scarf[i - 1].x, this.scarf[i - 1].y);
      ctx.lineTo(this.scarf[i].x, this.scarf[i].y);
      ctx.stroke();
    }
    ctx.strokeStyle = this.cfg.bodyColor;

    // --- arm + staff + lantern ---
    ctx.lineWidth = 0.05 * H;
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y + 0.03 * H);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();
    ctx.lineWidth = 0.022 * H;
    ctx.beginPath();
    ctx.moveTo(staffTop.x, staffTop.y);
    ctx.lineTo(staffBottom.x, staffBottom.y);
    ctx.stroke();
    // lantern: hanging frame + warm core
    ctx.lineWidth = 0.012 * H;
    ctx.beginPath();
    ctx.moveTo(staffTop.x, staffTop.y);
    ctx.lineTo(lantern.x, lantern.y - 0.045 * H);
    ctx.stroke();
    ctx.fillStyle = this.cfg.bodyColor;
    ctx.fillRect(lantern.x - 0.035 * H, lantern.y - 0.05 * H, 0.07 * H, 0.1 * H);
    ctx.fillStyle = "#ffd9a0";
    ctx.fillRect(lantern.x - 0.022 * H, lantern.y - 0.035 * H, 0.044 * H, 0.07 * H);
  }

  /** Two-bone IK leg: hip → knee → foot, knee biased forward. */
  private drawLeg(
    ctx: SKRSContext2D,
    hip: { x: number; y: number },
    foot: { x: number; y: number },
    l1: number,
    l2: number,
    width: number,
  ): void {
    const dx = foot.x - hip.x;
    const dy = foot.y - hip.y;
    let d = Math.hypot(dx, dy);
    const maxD = (l1 + l2) * 0.999;
    if (d > maxD) d = maxD;
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const ux = dx / (Math.hypot(dx, dy) || 1e-6);
    const uy = dy / (Math.hypot(dx, dy) || 1e-6);
    // perpendicular pointing forward (+x) so the knee bends the right way
    const knee = { x: hip.x + ux * a + uy * h, y: hip.y + uy * a - ux * h };

    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(knee.x, knee.y);
    ctx.lineTo(foot.x, foot.y);
    ctx.stroke();
  }
}
