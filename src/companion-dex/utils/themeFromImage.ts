import type { Theme } from "../types";

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;

  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;

    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return [hue, saturation, lightness];
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = Math.max(0, Math.min(1, saturation));
  const l = Math.max(0, Math.min(1, lightness));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];

  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  const toHex = (value: number) => Math.round((value + m) * 255).toString(16).padStart(2, "0");
  const [r, g, b] = rgb;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function themeFromRGB(r: number, g: number, b: number): Theme {
  const [hue, saturation] = rgbToHsl(r, g, b);
  const sat = Math.max(0.5, Math.min(0.9, saturation));

  return {
    primary: hslToHex(hue, sat, 0.66),
    deep: hslToHex(hue, sat, 0.66),
    glow: hslToHex(hue, Math.min(0.7, sat), 0.78),
  };
}

export function extractThemeFromUrl(url: string, onTheme: (theme: Theme) => void) {
  const probe = new Image();
  probe.crossOrigin = "anonymous";
  probe.onload = () => {
    try {
      const size = 56;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(probe, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      const buckets: Record<string, { n: number; r: number; g: number; b: number; sat: number }> = {};

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const alpha = data[i + 3];

        if (alpha < 200) continue;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const lightness = (max + min) / 2 / 255;

        if (lightness < 0.12 || lightness > 0.92) continue;

        const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
        const bucket = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0, sat: 0 });

        bucket.n += 1;
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
        bucket.sat += max - min;
      }

      let best: { n: number; r: number; g: number; b: number; sat: number } | null = null;
      let score = -1;

      for (const key in buckets) {
        const bucket = buckets[key];
        const currentScore = bucket.n * (1 + bucket.sat / bucket.n / 128);

        if (currentScore > score) {
          score = currentScore;
          best = bucket;
        }
      }

      if (best) {
        onTheme(themeFromRGB(Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)));
      }
    } catch {
      // Cross-origin or tainted canvas failures should leave the curated theme intact.
    }
  };
  probe.src = url;
}
