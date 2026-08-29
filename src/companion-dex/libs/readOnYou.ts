import { selectMomentsWorthKeeping } from "./selectMomentsWorthKeeping";
import type { Character } from "../types";
import type { LaylaChatMessage } from "@layla-network/sdk";
import { humaniseDuration } from "../utils/misc";
import { getEmotions } from "./character-emotions";
import {
  READ_ON_YOU_SYSTEM_PROMPT,
  READ_ON_YOU_USER_INSTRUCTION,
} from "./dream-prompts";

export { getEmotions } from "./character-emotions";

export type ReadOnYouStage = "occasionally chatting" | "frequently chatting" | "always chatting";

export interface ReadOnYouPromptValues extends Record<string, string> {
  user: string;
  char: string;
  persona: string;
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

export interface ReadOnYouPromptTemplates {
  systemPrompt?: string;
  userInstruction?: string;
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
  const personaName = cleanPromptValue(character.persona?.name);
  if (personaName) return personaName;

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

export function getPersona(character: Character) {
  const personaName = cleanPromptValue(character.persona?.name);
  const personaDescription = cleanPromptValue(character.persona?.description);

  if (personaName && personaDescription) {
    return `Name: ${personaName}\nDescription: ${personaDescription}`;
  }

  if (personaDescription) return personaDescription;
  if (personaName) return `Name: ${personaName}`;

  return "No persona information available yet.";
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

export function getRecentMemory(character: Character) {
  const threads = character.threads.map(cleanPromptValue).filter(Boolean);

  if (threads.length === 0) return "no recent chats";

  return threads[0];
}

export const SYSTEM_PROMPT = READ_ON_YOU_SYSTEM_PROMPT;
export const USER_INSTRUCTION = READ_ON_YOU_USER_INSTRUCTION;

function renderPromptTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => values[key.trim()] ?? "");
}

export function buildReadOnYouPromptValues(character: Character): ReadOnYouPromptValues {
  return {
    user: getUserName(character),
    char: getCharacterName(character),
    persona: getPersona(character),
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
  templates: ReadOnYouPromptTemplates = {},
): LaylaChatMessage[] {
  return [
    {
      role: "system",
      content: renderPromptTemplate(templates.systemPrompt ?? SYSTEM_PROMPT, values),
    },
    {
      role: "user",
      content: renderPromptTemplate(
        templates.userInstruction ?? USER_INSTRUCTION,
        values,
      ),
    },
  ];
}
