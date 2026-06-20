import { selectMomentsWorthKeeping } from "./selectMomentsWorthKeeping";
import type { Character } from "../types";
import type { LaylaChatMessage } from "@layla-network/sdk";

export type ReadOnYouStage = "occasionally chatting" | "frequently chatting" | "always chatting";

export interface ReadOnYouPromptValues extends Record<string, string> {
  user: string;
  char: string;
  description: string;
  personality: string;
  stage: ReadOnYouStage;
  time_together: string;
  warmth_and_depth: string;
  previous_impression: string;
  memories: string;
  emotions: string;
  recent_memory: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function cleanPromptValue(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function timestampMs(timestamp: number) {
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

export function getUserName(character: Character) {
    // find the first chat history where character_id == 'user'
    const userEntry = character.chatHistory.find((entry) => entry.character_id === "user");
    return userEntry?.name ?? "User";
}

export function getCharacterName(character: Character) {
  return cleanPromptValue(character.name);
}

export function getCharacterDescription(character: Character) {
  const cardDescription = character.moments.find(
    (moment) => moment.context === "how their card introduces them",
  )?.quote;

  return cleanPromptValue(cardDescription ?? "No description available");
}

export function getCharacterPersonality(character: Character) {
  const cardPersonality = character.remembers.find((memory) => !memory.fresh)?.fact;

  return cleanPromptValue(cardPersonality ?? "No personality description available");
}

export function getStage(character: Character): ReadOnYouStage {
  const timestamps = character.chatHistory
    .map((entry) => timestampMs(entry.timestamp))
    .filter((timestamp) => Number.isFinite(timestamp))
    .sort((a, b) => a - b);

  if (timestamps.length === 0) return "occasionally chatting";

  const firstTimestamp = timestamps[0];
  const lastTimestamp = timestamps[timestamps.length - 1];
  const observedWindowMs = Math.max(lastTimestamp - firstTimestamp, DAY_MS);
  const messagesPerMs = timestamps.length / observedWindowMs;

  if (messagesPerMs > 1 / DAY_MS) return "always chatting";
  if (messagesPerMs > 1 / (3 * DAY_MS)) return "frequently chatting";
  if (messagesPerMs > 1 / WEEK_MS) return "occasionally chatting";

  return "occasionally chatting";
}

export function humaniseDuration(seconds: number): string {
  try {
    if (seconds < 60) {
      return `${seconds.toFixed(0)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes.toFixed(0)} minutes`;
    } else if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      return `${hours.toFixed(0)} hours`;
    } else {
      const days = Math.floor(seconds / 86400);
      return `${days.toFixed(0)} days`;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to humanise duration";
    console.warn(message + " - " + seconds.toString());
    return seconds.toString();
  }
}

export function getTimeTogether(character: Character) {
  const timestamps = character.chatHistory
    .map((entry) => timestampMs(entry.timestamp))
    .filter((timestamp) => Number.isFinite(timestamp));

  if (timestamps.length === 0) return humaniseDuration(0);

  const firstTimestamp = Math.min(...timestamps);
  const secondsTogether = Math.max(0, (Date.now() - firstTimestamp) / 1000);

  return humaniseDuration(secondsTogether);
}

export function getWarmthAndDepth(character: Character) {
    const warmth = character.warmth;
    const depth = character.depth;

    if (warmth > 70 && depth > 70) {
        return "You've shared plenty of close, meaningful moments together";
    } else if (warmth > 70 && depth < 30) {
        return "Lots of friendly chats, though they've stayed pretty light";
    } else if (warmth < 30 && depth > 70) {
        return "Your conversations run deep, even if they're few and far between";
    } else if (warmth < 30 && depth < 30) {
        return "You've only crossed paths briefly, and kept things surface-level";
    } else {
        return "You've had a nice mix of warm and thoughtful exchanges";
    }
}

export function getPreviousImpression(character: Character) {
  const impression = character.laylaCharacter.data.data.extensions["impression"];

  return typeof impression === "string" && impression.trim().length > 0
    ? cleanPromptValue(impression)
    : "No previous impression yet.";
}

export function getMemories(character: Character) {
  if (!character.chatSentiment) return "No memories yet";

  const moments = selectMomentsWorthKeeping(
    character.chatSentiment,
    character.memorySentiment ?? { scoredTexts: [] },
  );
  const summaries = moments
    .map((moment) => cleanPromptValue(moment.summary ?? undefined))
    .filter(Boolean);

  if (summaries.length === 0) return "No memories yet";

  return summaries.map((summary) => `- ${summary}`).join("\n");
}

export function getEmotions(character: Character) {
    let e = 'Neutral';
    if(character.vitals.energy < 30) e = 'Sleepy';
    else if(character.vitals.energy > 70) e = 'Energetic';
    
    const f = 'Normal';
    if(character.vitals.fed < 30) e += 'Hungry';
    else if(character.vitals.fed > 70) e += 'Well-fed';

    let s = 'Ambivalent';
    if(character.vitals.social < 30) s = 'Lonely';
    else if(character.vitals.social > 70) s = 'Warm';
    return `${e}, ${f}, ${s}`;
}

export function getRecentMemory(character: Character) {
  const threads = character.threads.map(cleanPromptValue).filter(Boolean);

  if (threads.length === 0) return "no recent chats";

  return threads[0];
}

export const SYSTEM_PROMPT = `You are to write an impression of {{user}} from {{char}}'s point of view.

VOICE
- Inhabit {{char}}'s personality and register (given below). It must sound like {{char}}, not a neutral assistant.

GROUNDING — the most important rule
- Invent nothing: no facts, events, names, or feelings the user never showed.
- One true, specific line beats three vague flattering ones.

CONFIDENCE — obey the STAGE
- forming: barely know them; tentative, first-impressions only.
- warming: a real pattern is emerging; cautiously confident.
- settled: a stable read; confident, may reference shared history.
Never sound more certain than the stage allows.

CONTINUITY
- You are given a PREVIOUS READ. Treat it as a starting point that may now be
  outdated, NOT a template. Keep what the current evidence still supports, drop
  what it doesn't, and let the read move when the evidence has moved.
- Do not merely reword the previous read.`;

export const USER_INSTRUCTION = `CHARACTER
Name: {{char}}
Description: {{description}}
Personality: {{personality}}

STAGE
Current: {{stage}}
Time together: {{time_together}}
{{warmth_and_depth}}

PREVIOUS IMPRESSION  (may be outdated — revise against the evidence below)
{{previous_impression}}

Moments that stood out:
{{memories}}

Current emotions: {{emotions}}

Recent exchange (for texture, optional):
{{recent_memory}}

Write a concise impression of {{user}} from {{char}}'s point of view, following the SYSTEM instructions. Write in the first person, as if you are {{char}}. Only write a short paragraph — 2-3 sentences — that captures your current impression of {{user}} based on your shared history so far.`;

function renderPromptTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => values[key.trim()] ?? "");
}

export function buildReadOnYouPromptValues(character: Character): ReadOnYouPromptValues {
  return {
    user: getUserName(character),
    char: getCharacterName(character),
    description: getCharacterDescription(character),
    personality: getCharacterPersonality(character),
    stage: getStage(character),
    time_together: getTimeTogether(character),
    warmth_and_depth: getWarmthAndDepth(character),
    previous_impression: getPreviousImpression(character),
    memories: getMemories(character),
    emotions: getEmotions(character),
    recent_memory: getRecentMemory(character),
  };
}

export function buildReadOnYouMessages(
  character: Character,
  values = buildReadOnYouPromptValues(character),
): LaylaChatMessage[] {
  return [
    {
      role: "system",
      content: renderPromptTemplate(SYSTEM_PROMPT, values),
    },
    {
      role: "user",
      content: renderPromptTemplate(USER_INSTRUCTION, values),
    },
  ];
}
