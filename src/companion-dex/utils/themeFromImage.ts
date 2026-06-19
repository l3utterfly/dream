import { extractColors } from "extract-colors";
import type { Theme } from "../types";

type ExtractedColor = Awaited<ReturnType<typeof extractColors>>[number];

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const h = ((hue % 1) + 1) % 1;
  const s = clamp(saturation);
  const l = clamp(lightness);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const toChannel = (offset: number) => {
    let t = h + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const toHex = (channel: number) =>
    Math.round(channel * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(toChannel(1 / 3))}${toHex(toChannel(0))}${toHex(toChannel(-1 / 3))}`;
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  const numeric = Number.parseInt(value, 16);

  return {
    red: (numeric >> 16) & 255,
    green: (numeric >> 8) & 255,
    blue: numeric & 255,
  };
}

function mixHex(a: string, b: string, amount: number) {
  const left = hexToRgb(a);
  const right = hexToRgb(b);
  const t = clamp(amount);
  const mix = (x: number, y: number) => Math.round(x * (1 - t) + y * t);
  const toHex = (value: number) => value.toString(16).padStart(2, "0");

  return `#${toHex(mix(left.red, right.red))}${toHex(mix(left.green, right.green))}${toHex(mix(left.blue, right.blue))}`;
}

function pickAccent(colors: ExtractedColor[]) {
  return [...colors]
    .filter((color) => color.lightness > 0.16 && color.lightness < 0.88)
    .sort((a, b) => {
      const aScore = a.area * (0.75 + a.saturation) * (0.45 + a.intensity);
      const bScore = b.area * (0.75 + b.saturation) * (0.45 + b.intensity);
      return bScore - aScore;
    })[0];
}

function pickSurfaceColor(colors: ExtractedColor[], accent: ExtractedColor) {
  return (
    [...colors]
      .filter((color) => color.lightness < 0.62)
      .sort((a, b) => b.area * (1 - b.lightness) - a.area * (1 - a.lightness))[0] ?? accent
  );
}

function colorToTheme(colors: ExtractedColor[]): Theme | null {
  const accent = pickAccent(colors);
  if (!accent) return null;

  const surface = pickSurfaceColor(colors, accent);
  const saturation = clamp(Math.max(accent.saturation, 0.5), 0.5, 0.88);
  const surfaceSaturation = clamp(surface.saturation * 0.45 + accent.saturation * 0.12, 0.08, 0.28);
  const surfaceHue = Number.isFinite(surface.hue) ? surface.hue : accent.hue;
  const base = hslToHex(surfaceHue, surfaceSaturation, 0.14);
  const panel = mixHex(hslToHex(surfaceHue, surfaceSaturation, 0.18), "#141416", 0.35);
  const chip = mixHex(hslToHex(surfaceHue, surfaceSaturation, 0.25), "#333333", 0.42);

  return {
    primary: hslToHex(accent.hue, saturation, 0.64),
    deep: hslToHex(accent.hue, saturation, 0.7),
    glow: hslToHex(accent.hue, clamp(saturation * 0.76, 0.42, 0.7), 0.78),
    page: mixHex(base, "#161617", 0.44),
    panel: `${panel}e8`,
    panelBorder: `color-mix(in srgb, ${hslToHex(accent.hue, saturation, 0.72)} 24%, transparent)`,
    panelShadow: `0 -22px 54px -22px ${mixHex(base, "#000000", 0.46)}d9`,
    track: mixHex(chip, "#242424", 0.42),
    chip,
    hair: mixHex(chip, "#ffffff", 0.1),
    text: "#ffffff",
    ink1: mixHex(hslToHex(surfaceHue, surfaceSaturation, 0.9), "#ffffff", 0.28),
    ink2: mixHex(hslToHex(surfaceHue, surfaceSaturation, 0.7), "#777777", 0.48),
    muted: mixHex(hslToHex(accent.hue, saturation, 0.72), "#888888", 0.48),
  };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load profile image for color extraction."));
    image.src = url;
  });
}

export async function extractThemeFromUrl(url: string) {
  try {
    const image = await loadImage(url);
    const colors = await extractColors(image, {
      pixels: 32000,
      distance: 0.18,
      colorValidator: (_red, _green, _blue, alpha = 255) => alpha > 200,
      crossOrigin: "anonymous",
    });

    console.log("Extracted colors from image:", colors);

    return colorToTheme(colors);
  } catch (error: unknown) {
    console.error("Error extracting theme from URL:", error);
    return null;
  }
}
