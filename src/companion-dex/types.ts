import type { LaylaChatHistoryEntry, LaylaMemory } from "@layla-network/sdk";
import type { BondResult } from "./libs/computeBond";

export type Mood = "happy" | "content" | "excited" | "sad" | "lonely" | "sleepy";
export type Shape = "sun" | "cat" | "drop" | "moon";

export interface Theme {
  primary: string;
  deep: string;
  glow: string;
}

export interface Character {
  id: string;
  name: string;
  tagline: string;
  type: string;
  shape: Shape;
  image?: string;
  theme: Theme;
  mood: Mood;
  moodReason: string;
  warmth: number;
  depth: number;
  trajectory: number[];
  daysKnown: number;
  firstMet: string;
  lastChat: string;
  latestChatSessionId?: string;
  chatHistory: LaylaChatHistoryEntry[];
  isChatHistoryLoaded: boolean;
  chatHistoryError?: string;
  bond?: BondResult;
  isBondLoading: boolean;
  bondError?: string;
  vitals: {
    energy: number;
    fed: number;
    social: number;
  };
  remembers: {
    fact: string;
    fresh?: boolean;
  }[];
  recentMemories: LaylaMemory[];
  isMemoriesLoading: boolean;
  memoriesError?: string;
  threads: string[];
  moments: {
    quote: string;
    context: string;
    when: string;
  }[];
  hours: number[];
  peak: string;
  theirRead: string;
  impression: string;
  stats: {
    streak: number;
    messages: number;
    laughs: number;
    balance: number;
  };
  jokes: string[];
  topics: {
    tag: string;
    weight: number;
  }[];
}
