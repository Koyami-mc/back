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
  private cameraX = 0;
  private lastT: number | null = null;

  constructor(
    seed: number,
    /** Total video duration — the scene timeline is scaled to it. */
    private durationSec: number,
  ) {
    this.sky = new Sky(SKY_CONFIG, seed);
    this.snow = new Particles("snow", seed + 100);
    this.fireflies = new Particles("fireflies", seed + 200);
    this.leaves = new Particles("leaves", seed + 300);
  }

  render(ctx: SKRSContext2D, t: number, w: number, h: number): void {
    const state = resolveTimeline(t, this.durationSec);
    const dt = this.lastT === null ? 1 / 60 : t - this.lastT;
    this.lastT = t;
    this.cameraX += state.cameraSpeed * dt;
    const cameraX = this.cameraX;

    this.sky.draw(ctx, w, h, t, {
      stops: state.skyStops,
      starAlpha: state.starAlpha,
      moonAlpha: state.moonAlpha,
    });

    for (let i = 0; i < LAYERS.length; i++) {
      const layer = LAYERS[i];
      const color = foggedLayerColor(layer, state.layerColors[i], state.horizon);
      drawTerrainLayer(ctx, layer, cameraX, color, w, h);
      const treeSlot = TREE_LAYERS.indexOf(i);
      if (treeSlot >= 0) {
        drawTrees(ctx, layer, cameraX, state.treeDensity[treeSlot], color, w, h);
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

    // ambient particles in front of everything
    this.fireflies.draw(ctx, t, w, h, state.particles.fireflies);
    this.snow.draw(ctx, t, w, h, state.particles.snow);
    this.leaves.draw(ctx, t, w, h, state.particles.leaves);
  }
}
