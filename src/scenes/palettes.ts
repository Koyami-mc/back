import { lerp, lerpHex } from "../util/color.js";

export interface ParticleMix {
  snow: number;
  fireflies: number;
  leaves: number;
}

/**
 * Everything about the look of one scene. All palettes share the same
 * structure (6 sky stops, 5 layer colors) so any two can be lerped for
 * seamless transitions while the terrain geometry stays continuous.
 */
export interface ScenePalette {
  name: string;
  skyStops: { pos: number; color: string }[];
  /** What distant terrain fogs into (sky near the ridgeline). */
  horizon: string;
  /** Silhouette color per terrain layer, far → near. */
  layerColors: string[];
  starAlpha: number;
  moonAlpha: number;
  particles: ParticleMix;
  /** Pine-tree density for the two mid layers (index 2 and 3). */
  treeDensity: [number, number];
  /** Near-plane camera speed in px/s. */
  cameraSpeed: number;
  /** 0..1 strength of drifting mist bands between distant layers. */
  mist: number;
}

export const SCENES: ScenePalette[] = [
  {
    name: "predawn",
    skyStops: [
      { pos: 0.0, color: "#070b22" },
      { pos: 0.35, color: "#1c2148" },
      { pos: 0.52, color: "#4b3a63" },
      { pos: 0.63, color: "#8f5a58" },
      { pos: 0.74, color: "#d99a62" },
      { pos: 1.0, color: "#e8b070" },
    ],
    horizon: "#8f5a58",
    layerColors: ["#3a2f50", "#2c2440", "#1f1a30", "#131022", "#080714"],
    starAlpha: 1,
    moonAlpha: 1,
    particles: { snow: 0, fireflies: 0, leaves: 0 },
    treeDensity: [0, 0],
    cameraSpeed: 140,
    mist: 0.5,
  },
  {
    name: "forest",
    skyStops: [
      { pos: 0.0, color: "#08131a" },
      { pos: 0.35, color: "#0e2b2b" },
      { pos: 0.52, color: "#1d4a3c" },
      { pos: 0.63, color: "#3f6b4e" },
      { pos: 0.74, color: "#7fa065" },
      { pos: 1.0, color: "#b8c77e" },
    ],
    horizon: "#3f6b4e",
    layerColors: ["#2e4a3e", "#24403a", "#182f26", "#0e2018", "#050f0a"],
    starAlpha: 0.35,
    moonAlpha: 0.45,
    particles: { snow: 0, fireflies: 1, leaves: 0 },
    treeDensity: [0.72, 0.55],
    cameraSpeed: 120,
    mist: 0.9,
  },
  {
    name: "snowfield",
    skyStops: [
      { pos: 0.0, color: "#2e3c55" },
      { pos: 0.35, color: "#49596f" },
      { pos: 0.52, color: "#6d7d95" },
      { pos: 0.63, color: "#93a3b8" },
      { pos: 0.74, color: "#c3cedd" },
      { pos: 1.0, color: "#e8eef5" },
    ],
    horizon: "#93a3b8",
    layerColors: ["#93a0b5", "#7a879f", "#5d6a84", "#3d4864", "#1f2840"],
    starAlpha: 0,
    moonAlpha: 0.25,
    particles: { snow: 1, fireflies: 0, leaves: 0 },
    treeDensity: [0.18, 0.12],
    cameraSpeed: 100,
    mist: 0.7,
  },
  {
    name: "starryHill",
    skyStops: [
      { pos: 0.0, color: "#030510" },
      { pos: 0.35, color: "#070c1e" },
      { pos: 0.52, color: "#0d1530" },
      { pos: 0.63, color: "#16204a" },
      { pos: 0.74, color: "#232e59" },
      { pos: 1.0, color: "#35406b" },
    ],
    horizon: "#16204a",
    layerColors: ["#1a2244", "#131a38", "#0c1128", "#070a1a", "#03040e"],
    starAlpha: 1.4,
    moonAlpha: 0,
    particles: { snow: 0, fireflies: 0.15, leaves: 0 },
    treeDensity: [0, 0],
    cameraSpeed: 80,
    mist: 0.25,
  },
  {
    name: "sunrise",
    skyStops: [
      { pos: 0.0, color: "#27356b" },
      { pos: 0.35, color: "#4a4677" },
      { pos: 0.52, color: "#7d5878" },
      { pos: 0.63, color: "#c47a68" },
      { pos: 0.74, color: "#f0a266" },
      { pos: 1.0, color: "#ffd08a" },
    ],
    horizon: "#c47a68",
    layerColors: ["#584664", "#4a3a56", "#382c44", "#251d31", "#12101e"],
    starAlpha: 0,
    moonAlpha: 0,
    particles: { snow: 0, fireflies: 0, leaves: 0.5 },
    treeDensity: [0.3, 0.2],
    cameraSpeed: 70,
    mist: 0.6,
  },
];

export function lerpScenePalette(a: ScenePalette, b: ScenePalette, t: number): ScenePalette {
  return {
    name: t < 0.5 ? a.name : b.name,
    skyStops: a.skyStops.map((s, i) => ({
      pos: lerp(s.pos, b.skyStops[i].pos, t),
      color: lerpHex(s.color, b.skyStops[i].color, t),
    })),
    horizon: lerpHex(a.horizon, b.horizon, t),
    layerColors: a.layerColors.map((c, i) => lerpHex(c, b.layerColors[i], t)),
    starAlpha: lerp(a.starAlpha, b.starAlpha, t),
    moonAlpha: lerp(a.moonAlpha, b.moonAlpha, t),
    particles: {
      snow: lerp(a.particles.snow, b.particles.snow, t),
      fireflies: lerp(a.particles.fireflies, b.particles.fireflies, t),
      leaves: lerp(a.particles.leaves, b.particles.leaves, t),
    },
    treeDensity: [
      lerp(a.treeDensity[0], b.treeDensity[0], t),
      lerp(a.treeDensity[1], b.treeDensity[1], t),
    ],
    cameraSpeed: lerp(a.cameraSpeed, b.cameraSpeed, t),
    mist: lerp(a.mist, b.mist, t),
  };
}
