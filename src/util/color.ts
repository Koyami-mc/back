export type RGB = readonly [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function rgbCss(c: RGB, alpha = 1): string {
  const [r, g, b] = c.map(Math.round);
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function lerpHexCss(a: string, b: string, t: number, alpha = 1): string {
  return rgbCss(lerpRgb(hexToRgb(a), hexToRgb(b), t), alpha);
}

export function rgbToHex(c: RGB): string {
  const [r, g, b] = c.map(Math.round);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Lerp two hex colors, returning hex (safe to feed back into lerps). */
export function lerpHex(a: string, b: string, t: number): string {
  return rgbToHex(lerpRgb(hexToRgb(a), hexToRgb(b), t));
}

export function lighten(hex: string, k: number): string {
  return lerpHex(hex, "#ffffff", k);
}

export function darken(hex: string, k: number): string {
  return lerpHex(hex, "#000000", k);
}
