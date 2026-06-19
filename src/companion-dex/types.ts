import type { LaylaChatHistoryEntry, LaylaMemory } from "@layla-network/sdk";
import type { BondResult, ScoredText } from "./libs/computeBond";

export type Mood = "happy" | "content" | "excited" | "sad" | "lonely" | "sleepy";
export type Shape = "sun" | "cat" | "drop" | "moon";

export interface Theme {
  primary: string;
  deep: string;
  glow: string;
  page?: string;
  panel?: string;
  panelBorder?: string;
  panelShadow?: string;
  track?: string;
  chip?: string;
  hair?: string;
  text?: string;
  ink1?: string;
  ink2?: string;
  muted?: string;
}

export interface ChatSentimentData {
  scoredTexts: ScoredText[];
}

export interface MemorySentimentData {
  scoredTexts: ScoredText[];
}

export interface Character {
  id: string;
  name: string;
  type: string;
  shape: Shape;
  image?: string;
  theme: Theme;
  mood: Mood;
  mainMood: string;
  warmth: number;
  depth: number;
  trajectory: number[];
  daysKnown: number;
  lastChat: string;
  latestChatSessionId?: string;
  chatHistory: LaylaChatHistoryEntry[];
  isChatHistoryLoaded: boolean;
  chatHistoryError?: string;
  chatSentiment?: ChatSentimentData;
  chatSentimentPromise?: Promise<ChatSentimentData>;
  isChatSentimentLoading: boolean;
  chatSentimentError?: string;
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
  memorySentiment?: MemorySentimentData;
  memorySentimentPromise?: Promise<MemorySentimentData>;
  isMemorySentimentLoading: boolean;
  memorySentimentError?: string;
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
}

export function waitForCharacterChatSentiment(character: Character): Promise<ChatSentimentData> {
  if (character.chatSentiment) return Promise.resolve(character.chatSentiment);
  if (character.chatSentimentPromise) return character.chatSentimentPromise;

  return Promise.reject(new Error("Chat sentiment data is not available."));
}

export function waitForCharacterMemorySentiment(character: Character): Promise<MemorySentimentData> {
  if (character.memorySentiment) return Promise.resolve(character.memorySentiment);
  if (character.memorySentimentPromise) return character.memorySentimentPromise;

  return Promise.reject(new Error("Memory sentiment data is not available."));
}
