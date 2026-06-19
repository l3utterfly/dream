import type { Character, Mood, Shape, Theme } from "./types";

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
  }
];

export const EMPTY_THEME = DISPLAY_PROFILES[0].theme;
