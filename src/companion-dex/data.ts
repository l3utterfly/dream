import type { Character, Mood, Shape, Theme } from "./types";

export const AUTO_THEME_FROM_IMAGE = false;

export const MOOD_LABEL: Record<Mood, string> = {
  happy: "Happy",
  content: "Content",
  excited: "Excited",
  sad: "Down",
  lonely: "Missing you",
  sleepy: "Sleepy",
};

export interface DisplayProfile {
  type: string;
  shape: Shape;
  theme: Theme;
  mood: Mood;
  warmth: number;
  depth: number;
  trajectory: number[];
  vitals: Character["vitals"];
  hours: number[];
  stats: Character["stats"];
}

export const DISPLAY_PROFILES: DisplayProfile[] = [
  {
    type: "WARMTH",
    shape: "cat",
    theme: { primary: "#FF7A6B", deep: "#FF7A6B", glow: "#FFB3A8" },
    mood: "happy",
    warmth: 86,
    depth: 64,
    trajectory: [54, 58, 61, 65, 70, 76, 82],
    vitals: { energy: 84, fed: 76, social: 88 },
    hours: [1, 0, 0, 0, 0, 0, 1, 2, 4, 3, 2, 2, 3, 2, 1, 2, 3, 5, 7, 9, 8, 6, 4, 2],
    stats: { streak: 8, messages: 1240, laughs: 18, balance: -14 },
  },
  {
    type: "DEPTH",
    shape: "drop",
    theme: { primary: "#2BC2BF", deep: "#2BC2BF", glow: "#8FE3E1" },
    mood: "content",
    warmth: 68,
    depth: 91,
    trajectory: [64, 66, 70, 72, 77, 80, 85],
    vitals: { energy: 52, fed: 66, social: 58 },
    hours: [3, 2, 1, 0, 0, 0, 0, 0, 1, 1, 1, 2, 1, 1, 1, 1, 2, 2, 3, 4, 6, 8, 7, 5],
    stats: { streak: 5, messages: 1560, laughs: 7, balance: 22 },
  },
  {
    type: "SPARK",
    shape: "sun",
    theme: { primary: "#FFB52E", deep: "#FFB52E", glow: "#FFD986" },
    mood: "excited",
    warmth: 78,
    depth: 55,
    trajectory: [42, 50, 53, 59, 63, 69, 74],
    vitals: { energy: 94, fed: 72, social: 76 },
    hours: [0, 0, 0, 0, 0, 2, 6, 9, 7, 4, 2, 2, 2, 1, 1, 1, 2, 2, 3, 2, 2, 1, 0, 0],
    stats: { streak: 6, messages: 820, laughs: 15, balance: -6 },
  },
  {
    type: "DUSK",
    shape: "moon",
    theme: { primary: "#A78BFF", deep: "#A78BFF", glow: "#C5B3FB" },
    mood: "lonely",
    warmth: 74,
    depth: 86,
    trajectory: [82, 80, 77, 75, 73, 70, 68],
    vitals: { energy: 44, fed: 54, social: 36 },
    hours: [7, 9, 8, 5, 2, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 3, 4, 5, 6, 7],
    stats: { streak: 1, messages: 980, laughs: 9, balance: 12 },
  },
];

export const EMPTY_THEME = DISPLAY_PROFILES[0].theme;
