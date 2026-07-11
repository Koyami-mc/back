import type { SKRSContext2D } from "@napi-rs/canvas";
import { Sky, type SkyConfig } from "./sky.js";
import {
  drawTerrainLayer,
  foggedLayerColor,
  terrainHeightAt,
  parallaxFactor,
  type TerrainLayerConfig,
} from "./terrain.js";
import { Traveler } from "./character.js";
import { Particles } from "./particles.js";
import { drawTrees } from "./props.js";
import { resolveTimeline } from "./timeline.js";
import { PostFX } from "./postfx.js";
import { darken, lerp, lerpHex, lighten } from "../util/color.js";
import { hash01, valueNoise1D } from "../util/noise.js";

/**
 * The journey: a traveler walks through a chain of scenes (pre-dawn →
 * forest → snowfield → starry night → sunrise) whose palettes blend
 * into one another while the terrain scrolls continuously underneath.
 */
const SKY_CONFIG: SkyConfig = {
  starCount: 220,
  starMaxY: 0.55,
  moon: { x: 0.72, y: 0.22, radius: 0.035 },
};

const LAYERS: TerrainLayerConfig[] = [
  { depth: 0.12, baseY: 0.72, amp: 0.28, wavelengthPx: 820, color: "#3a2f50", seed: 11, ridged: true },
  { depth: 0.3, baseY: 0.76, amp: 0.19, wavelengthPx: 640, color: "#2c2440", seed: 22, ridged: true },
  { depth: 0.5, baseY: 0.82, amp: 0.12, wavelengthPx: 540, color: "#1f1a30", seed: 33 },
  { depth: 0.75, baseY: 0.88, amp: 0.09, wavelengthPx: 420, color: "#131022", seed: 44, octaves: 5 },
  { depth: 1.0, baseY: 0.95, amp: 0.07, wavelengthPx: 320, color: "#080714", seed: 55, octaves: 5 },
];

/** Fast dark band at the bottom edge — the depth cue that sells parallax. */
const FOREGROUND: TerrainLayerConfig = {
  depth: 1.35,
  baseY: 1.05,
  amp: 0.1,
  wavelengthPx: 300,
  color: "#000000",
  seed: 66,
  octaves: 5,
};

/** Mist bands drifting in front of the distant layers (y, thickness, alpha). */
const MIST_BANDS = [
  { afterLayer: 0, y: 0.58, thickness: 0.16, alpha: 0.09 },
  { afterLayer: 1, y: 0.68, thickness: 0.14, alpha: 0.08 },
  { afterLayer: 2, y: 0.76, thickness: 0.12, alpha: 0.06 },
];

/** Layers that can carry trees, indexed into palette treeDensity. */
const TREE_LAYERS = [2, 3];

/** The layer the traveler walks on (nearest ridge). */
const WALK_LAYER = LAYERS[LAYERS.length - 1];

export class JourneyScene {
  private sky: Sky;
  private traveler: Traveler | null = null;
  private snow: Particles;
  private fireflies: Particles;
  private leaves: Particles;
  private postfx: PostFX;
  /** cameraX sampled at 60 Hz, precomputed so any t is random-accessible. */
  private cameraXTable: Float64Array;

  constructor(
    seed: number,
    /** Total video duration — the scene timeline is scaled to it. */
    private durationSec: number,
  ) {
    this.sky = new Sky(SKY_CONFIG, seed);
    this.snow = new Particles("snow", seed + 100);
    this.fireflies = new Particles("fireflies", seed + 200);
    this.leaves = new Particles("leaves", seed + 300);
    this.postfx = new PostFX(seed + 400);

    // Integrate camera speed once up front. This keeps rendering
    // stateless in t, which segment renders (--from/--to) rely on.
    const steps = Math.ceil(durationSec * 60) + 2;
    this.cameraXTable = new Float64Array(steps);
    let x = 0;
    for (let i = 1; i < steps; i++) {
      x += resolveTimeline((i - 0.5) / 60, durationSec).cameraSpeed / 60;
      this.cameraXTable[i] = x;
    }
  }

  private cameraXAt(t: number): number {
    const idx = Math.max(0, Math.min(this.cameraXTable.length - 2, t * 60));
    const i = Math.floor(idx);
    const f = idx - i;
    return this.cameraXTable[i] * (1 - f) + this.cameraXTable[i + 1] * f;
  }

  render(ctx: SKRSContext2D, t: number, w: number, h: number): void {
    const state = resolveTimeline(t, this.durationSec);
    const cameraX = this.cameraXAt(t);
    const scale = h / 1080;

    // lighting anchors, shared by rim light, mist tint, and the glow pass
    const rimColor = lighten(state.skyStops[4].color, 0.25);
    const mistColor = lighten(state.horizon, 0.2);

    // slow vertical camera drift so the frame breathes
    const driftY = 0.012 * h * Math.sin(t * 0.13 + 0.7);
    ctx.save();
    ctx.translate(0, driftY);

    this.sky.draw(ctx, w, h, t, {
      stops: state.skyStops,
      starAlpha: state.starAlpha,
      moonAlpha: state.moonAlpha,
    });

    for (let i = 0; i < LAYERS.length; i++) {
      const layer = LAYERS[i];
      const fill = foggedLayerColor(layer, state.layerColors[i], state.horizon);
      drawTerrainLayer(ctx, layer, cameraX, {
        fill,
        gradientTop: lerpHex(fill, rimColor, 0.09),
        gradientBottom: darken(fill, 0.28),
        rim: {
          color: rimColor,
          alpha: Math.max(0, 0.34 - 0.24 * layer.depth),
          width: 2.6 * scale,
        },
      }, w, h);

      const treeSlot = TREE_LAYERS.indexOf(i);
      if (treeSlot >= 0) {
        drawTrees(ctx, layer, cameraX, state.treeDensity[treeSlot], fill, w, h);
      }
      for (const band of MIST_BANDS) {
        if (band.afterLayer === i) {
          this.drawMist(ctx, t, w, h, band.y, band.thickness, band.alpha * state.mist, mistColor, i);
        }
      }
    }

    if (!this.traveler) {
      this.traveler = new Traveler({
        screenX: w * 0.34,
        height: h * 0.2,
        bodyColor: "#05040c",
        scarfColor: "#8c3a3f",
      });
    }
    // Smooth the ridge under the character so footing doesn't jitter.
    const groundYAt = (x: number): number => {
      const s = 0.04 * h;
      return (
        (terrainHeightAt(WALK_LAYER, cameraX, x - s, h) +
          terrainHeightAt(WALK_LAYER, cameraX, x, h) +
          terrainHeightAt(WALK_LAYER, cameraX, x + s, h)) / 3
      );
    };
    const walkParallax = parallaxFactor(WALK_LAYER.depth);
    this.traveler.render(ctx, t, cameraX * walkParallax, state.cameraSpeed * walkParallax, groundYAt);

    // foreground band + grass, fastest-moving and darkest
    const fgColor = darken(state.layerColors[4], 0.45);
    drawTerrainLayer(ctx, FOREGROUND, cameraX, { fill: fgColor, gradientBottom: darken(fgColor, 0.3) }, w, h);
    this.drawGrass(ctx, t, cameraX, w, h, fgColor);

    ctx.restore();

    // ambient particles in front of everything (screen-space, no drift)
    this.fireflies.draw(ctx, t, w, h, state.particles.fireflies);
    this.snow.draw(ctx, t, w, h, state.particles.snow);
    this.leaves.draw(ctx, t, w, h, state.particles.leaves);

    // cinematic finish: light glow, vignette, animated grain
    const moonMix = Math.min(1, state.moonAlpha / 0.6);
    const glowX = lerp(0.5 * w, SKY_CONFIG.moon!.x * w, moonMix);
    const glowY = lerp(0.62 * h, SKY_CONFIG.moon!.y * h, moonMix);
    this.postfx.apply(ctx, w, h, Math.round(t * 1000), {
      vignette: 0.32,
      grain: 0.045,
      glow: { x: glowX, y: glowY, color: rimColor, strength: 0.06 + 0.03 * moonMix },
    });
  }

  /** Soft horizontal fog band with slowly breathing opacity. */
  private drawMist(
    ctx: SKRSContext2D,
    t: number,
    w: number,
    h: number,
    yFrac: number,
    thicknessFrac: number,
    alpha: number,
    color: string,
    seed: number,
  ): void {
    if (alpha <= 0.004) return;
    const breathe = 0.75 + 0.5 * valueNoise1D(t * 0.11 + seed * 3.7, 1200 + seed);
    const y = (yFrac + 0.012 * Math.sin(t * 0.07 + seed * 2.1)) * h;
    const th = thicknessFrac * h;
    const g = ctx.createLinearGradient(0, y - th / 2, 0, y + th / 2);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha * breathe);
    ctx.fillStyle = g;
    ctx.fillRect(0, y - th / 2, w, th);
    ctx.restore();
  }

  /** Wind-leaning grass blades along the foreground ridge. */
  private drawGrass(ctx: SKRSContext2D, t: number, cameraX: number, w: number, h: number, color: string): void {
    const cell = 16;
    const offset = cameraX * parallaxFactor(FOREGROUND.depth);
    const first = Math.floor((offset - 30) / cell);
    const last = Math.ceil((offset + w + 30) / cell);
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    for (let i = first; i <= last; i++) {
      const r1 = hash01(i, 9001);
      if (r1 < 0.25) continue; // gaps read more natural than a solid brush
      const x = i * cell + hash01(i, 9002) * cell - offset;
      if (x < -30 || x > w + 30) continue;
      const groundY = terrainHeightAt(FOREGROUND, cameraX, x, h) + 2 * (h / 1080);
      if (groundY > h + 4) continue;
      const len = h * (0.014 + 0.02 * hash01(i, 9003));
      const lean = 0.45 * Math.sin(t * 1.1 + i * 0.8) + 0.3;
      ctx.lineWidth = (1.2 + 1.2 * hash01(i, 9004)) * (h / 1080);
      ctx.beginPath();
      ctx.moveTo(x, groundY);
      ctx.quadraticCurveTo(x + lean * len * 0.3, groundY - len * 0.65, x + lean * len, groundY - len);
      ctx.stroke();
    }
  }
}
