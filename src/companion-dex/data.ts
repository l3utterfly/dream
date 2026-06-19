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
    theme: {
      primary: "#f4f4f5",
      deep: "#d4d4d8",
      glow: "#ffffff",
      page: "#101011",
      panel: "rgba(18, 18, 20, 0.88)",
      panelBorder: "rgba(255, 255, 255, 0.08)",
      panelShadow: "0 -20px 50px -20px rgba(0, 0, 0, 0.72)",
      track: "#2a2a2e",
      chip: "#242428",
      hair: "#333338",
      text: "#ffffff",
      ink1: "#d7d7dc",
      ink2: "#a1a1aa",
      muted: "#85858f",
    },
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
