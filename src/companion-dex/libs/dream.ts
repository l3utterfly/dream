import type LaylaSDK from "@layla-network/sdk";
import type {
  LaylaCharacter,
  LaylaChatHistoryEntry,
  LaylaChatMessage,
  LaylaScheduledChatMessage,
} from "@layla-network/sdk";
import type { Character } from "../types";
import { humaniseDuration } from "../utils/misc";
import { getEmotions } from "./character-emotions";
import {
  DREAM_SYSTEM_PROMPT,
  OUT_OF_BLUE_SYSTEM_PROMPT,
  OUT_OF_BLUE_USER_INSTRUCTION,
} from "./dream-prompts";

export {
  DREAM_SYSTEM_PROMPT,
  OUT_OF_BLUE_SYSTEM_PROMPT,
  OUT_OF_BLUE_USER_INSTRUCTION,
} from "./dream-prompts";

const MIN_DREAM_DELAY_HOURS = 5;
const MAX_DREAM_DELAY_HOURS = 100;
const HOUR_MS = 60 * 60 * 1000;

export interface ContinueConversationOptions {
  layla: LaylaSDK;
  now?: number;
  random?: () => number;
  delayHours?: number;
  signal?: AbortSignal;
  dreamSystemPrompt?: string;
  outOfBlueSystemPrompt?: string;
}

export interface ContinueConversationResult {
  kind: "continue";
  response: string;
  scheduledMessage: LaylaScheduledChatMessage;
  scheduledAt: number;
  delayHours: number;
  sessionId: string;
  elapsedMessage: LaylaChatMessage;
  messages: LaylaChatMessage[];
}

export interface OutOfBlueMessageResult {
  kind: "out_of_blue";
  response: string;
  scheduledMessage: LaylaScheduledChatMessage;
  scheduledAt: number;
  delayHours: number;
  sessionId: null;
  messages: LaylaChatMessage[];
}

export type DreamSelection =
  | {
    kind: "continue";
    sessionId: string;
    messages: LaylaChatHistoryEntry[];
  }
  | {
    kind: "out_of_blue";
    sessionId: null;
  };

export interface DreamSelectionOptions {
  // Defaults to true, so callers that predate the per-character
  // "do not continue old conversations" setting behave exactly as before.
  allowContinueConversations?: boolean;
}

export interface DreamSystemPromptValues extends Record<string, string> {
  char: string;
  character_card: string;
}

export interface OutOfBlueSystemPromptValues extends Record<string, string> {
  char: string;
  character_card: string;
  user: string;
  persona: string;
}

export interface OutOfBlueUserPromptValues extends Record<string, string> {
  char: string;
  user: string;
  moments: string;
  impression: string;
}

function cleanPromptValue(value: string | undefined | null) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function timestampMilliseconds(timestamp: number) {
  return Math.abs(timestamp) < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

function randomDelayHours(random: () => number) {
  return (
    MIN_DREAM_DELAY_HOURS +
    Math.floor(random() * (MAX_DREAM_DELAY_HOURS - MIN_DREAM_DELAY_HOURS + 1))
  );
}

function renderPromptTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => values[key.trim()] ?? "");
}

function characterPromptDetails(character: LaylaCharacter) {
  const data = character.data.data;
  const fields = [
    ["Name", data.name],
    ["Description", data.description],
    ["Personality", data.personality],
    ["Scenario", data.scenario],
    ["First message", data.first_mes],
    ["Example dialogue", data.mes_example],
    ["Character system prompt", data.system_prompt],
    ["Post-history instructions", data.post_history_instructions],
  ];

  return fields
    .map(([label, value]) => {
      const cleanValue = cleanPromptValue(value);
      return cleanValue ? `${label}: ${cleanValue}` : null;
    })
    .filter((value): value is string => value !== null)
    .join("\n");
}

export function buildDreamSystemPromptValues(character: Character): DreamSystemPromptValues {
  const name = cleanPromptValue(character.name) || "the character";
  const details = characterPromptDetails(character.laylaCharacter);
  const emotions = getEmotions(character);

  return {
    char: name,
    character_card: details || `Name: ${name}`,
    user: character.persona?.name ? cleanPromptValue(character.persona.name) : "user",
    persona: character.persona?.description ? cleanPromptValue(character.persona.description) : "",
    emotions,
  };
}

export function buildOutOfBlueSystemPromptValues(
  character: Character,
): OutOfBlueSystemPromptValues {
  const name = cleanPromptValue(character.laylaCharacter.data.data.name) || "the character";
  const details = characterPromptDetails(character.laylaCharacter);
  const emotions = getEmotions(character);

  return {
    char: name,
    character_card: details || `Name: ${name}`,
    user: character.persona?.name
      ? cleanPromptValue(character.persona.name)
      : "user",
    persona: character.persona?.description
      ? cleanPromptValue(character.persona.description)
      : "",
    emotions,
  };
}

export function buildOutOfBlueUserPromptValues(character: Character): OutOfBlueUserPromptValues {
  const name = cleanPromptValue(character.name) || "the character";
  const moments = character.moments
    .map((moment) => {
      const quote = cleanPromptValue(moment.quote);
      const context = cleanPromptValue(moment.context);
      const when = cleanPromptValue(moment.when);

      if (!quote) return null;

      return `- ${quote}${context || when ? ` (${[context, when].filter(Boolean).join(", ")})` : ""}`;
    })
    .filter((moment): moment is string => moment !== null)
    .join("\n");
  const impression =
    cleanPromptValue(character.impression) || "No current impression available.";

  return {
    char: name,
    user: character.persona?.name ? cleanPromptValue(character.persona.name) : "user",
    moments: moments || "No moments worth keeping yet.",
    impression,
  };
}

export function buildDreamSystemPrompt(
  character: Character,
  values = buildDreamSystemPromptValues(character),
  template = DREAM_SYSTEM_PROMPT,
) {
  return renderPromptTemplate(template, values);
}

export function buildOutOfBlueSystemPrompt(
  character: Character,
  values = buildOutOfBlueSystemPromptValues(character),
  template = OUT_OF_BLUE_SYSTEM_PROMPT,
) {
  return renderPromptTemplate(template, values);
}

function buildOutOfBlueUserMessage(
  character: Character,
  values = buildOutOfBlueUserPromptValues(character),
) {
  return renderPromptTemplate(OUT_OF_BLUE_USER_INSTRUCTION, values);
}

function toConversationMessage(entry: LaylaChatHistoryEntry): LaylaChatMessage {
  return {
    role: entry.role === "assistant" ? "assistant" : "user",
    content: entry.content ?? "",
    name: entry.name,
  };
}

function validSessionId(sessionId: string | null | undefined) {
  const cleanSessionId = sessionId?.trim();
  return cleanSessionId && cleanSessionId.length > 0 ? cleanSessionId : null;
}

function hasCharacterMessage(chatHistory: LaylaChatHistoryEntry[]) {
  return chatHistory.some(
    (entry) =>
      entry.role === "assistant" && cleanPromptValue(entry.content).length > 0,
  );
}

function randomIndex(length: number, random: () => number) {
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}

function hasScheduledOutOfBlueMessage(
  scheduledMessages: LaylaScheduledChatMessage[],
  characterId: string,
) {
  return scheduledMessages.some(
    (message) =>
      message.character_id === characterId &&
      validSessionId(message.session_id) === null,
  );
}

function hasScheduledMessage(
  scheduledMessages: LaylaScheduledChatMessage[],
  characterId: string,
) {
  return scheduledMessages.some(
    (message) => message.character_id === characterId,
  );
}

function recentHistoryEndingWithCharacter(chatHistory: LaylaChatHistoryEntry[]) {
  const conversationHistory = [...chatHistory]
    .filter(
      (entry) =>
        (entry.role === "user" || entry.role === "assistant") &&
        cleanPromptValue(entry.content).length > 0,
    )
    .sort(
      (a, b) => timestampMilliseconds(a.timestamp) - timestampMilliseconds(b.timestamp),
    );

  const lastCharacterIndex = conversationHistory.findLastIndex(
    (entry) => entry.role === "assistant",
  );

  if (lastCharacterIndex < 0) {
    throw new Error("Dream needs at least one previous character message.");
  }

  return conversationHistory.slice(Math.max(0, lastCharacterIndex - 5), lastCharacterIndex + 1);
}

export function dreamSessionCandidates(
  chatHistory: LaylaChatHistoryEntry[],
  scheduledMessages: LaylaScheduledChatMessage[],
  characterId: string,
) {
  const scheduledSessionIds = new Set(
    scheduledMessages
      .filter((message) => message.character_id === characterId)
      .map((message) => validSessionId(message.session_id))
      .filter((sessionId): sessionId is string => sessionId !== null),
  );
  const sessions = new Map<string, LaylaChatHistoryEntry[]>();

  for (const entry of chatHistory) {
    const sessionId = validSessionId(entry.session_id);
    if (!sessionId || scheduledSessionIds.has(sessionId)) continue;

    const messages = sessions.get(sessionId) ?? [];
    messages.push(entry);
    sessions.set(sessionId, messages);
  }

  return [...sessions.entries()].filter(([, messages]) =>
    hasCharacterMessage(messages),
  );
}

export function selectRandomDreamSessionMessages(
  chatHistory: LaylaChatHistoryEntry[],
  scheduledMessages: LaylaScheduledChatMessage[],
  characterId: string,
  random: () => number = Math.random,
) {
  const candidates = dreamSessionCandidates(
    chatHistory,
    scheduledMessages,
    characterId,
  );

  if (candidates.length === 0) {
    throw new Error("Dream needs an unscheduled conversation session to continue.");
  }

  const [sessionId, messages] = candidates[randomIndex(candidates.length, random)];

  return {
    sessionId,
    messages,
  };
}

export function dreamSelectionCandidates(
  chatHistory: LaylaChatHistoryEntry[],
  scheduledMessages: LaylaScheduledChatMessage[],
  characterId: string,
  options: DreamSelectionOptions = {},
): DreamSelection[] {
  // Dreaming is a no-op once the character already has any scheduled
  // (still unread) message. Only offer candidates when nothing is queued.
  if (hasScheduledMessage(scheduledMessages, characterId)) {
    return [];
  }

  // Characters set to never continue old conversations skip straight to the
  // out-of-the-blue option below.
  const candidates: DreamSelection[] =
    options.allowContinueConversations === false
      ? []
      : dreamSessionCandidates(
          chatHistory,
          scheduledMessages,
          characterId,
        ).map(([sessionId, messages]) => ({
          kind: "continue",
          sessionId,
          messages,
        }));

  if (!hasScheduledOutOfBlueMessage(scheduledMessages, characterId)) {
    candidates.push({
      kind: "out_of_blue",
      sessionId: null,
    });
  }

  return candidates;
}

export function selectRandomDreamCandidate(
  chatHistory: LaylaChatHistoryEntry[],
  scheduledMessages: LaylaScheduledChatMessage[],
  characterId: string,
  random: () => number = Math.random,
  options: DreamSelectionOptions = {},
) {
  const candidates = dreamSelectionCandidates(
    chatHistory,
    scheduledMessages,
    characterId,
    options,
  );

  if (candidates.length === 0) {
    throw new Error("Dream needs an unscheduled conversation option.");
  }

  return candidates[randomIndex(candidates.length, random)];
}

export async function continueConversation(
  chatHistory: LaylaChatHistoryEntry[],
  character: Character,
  options: ContinueConversationOptions,
): Promise<ContinueConversationResult> {
  const layla = options.layla;
  const now = options.now ?? Date.now();
  const delayHours = options.delayHours ?? randomDelayHours(options.random ?? Math.random);
  const delayMs = delayHours * HOUR_MS;
  const scheduledAt = now + delayMs;
  const recentHistory = recentHistoryEndingWithCharacter(chatHistory);
  const lastCharacterMessage = recentHistory[recentHistory.length - 1];
  const sessionId = validSessionId(lastCharacterMessage.session_id);

  if (!sessionId) {
    throw new Error("Dream needs a conversation session to continue.");
  }

  const lastMessageAt = timestampMilliseconds(lastCharacterMessage.timestamp);
  const elapsedSeconds = Math.max(0, now - lastMessageAt + delayMs) / 1000;
  const elapsedMessage: LaylaChatMessage = {
    role: "user",
    content: `[${humaniseDuration(elapsedSeconds)} have passed]`,
  };
  const messages: LaylaChatMessage[] = [
    {
      role: "system",
      content: buildDreamSystemPrompt(
        character,
        buildDreamSystemPromptValues(character),
        options.dreamSystemPrompt,
      ),
    },
    ...recentHistory.map(toConversationMessage),
    elapsedMessage,
  ];

  const completion = await layla.chat.completions.create({
    messages,
    signal: options.signal,
  });
  const response = completion.choices[0]?.message.content?.trim() ?? "";

  if (!response) {
    throw new Error("Dream did not return a message to schedule.");
  }

  const scheduledMessage = await layla.chat.scheduleChatMessage(
    {
      id: 0,
      character_id: character.laylaCharacter.id,
      session_id: sessionId,
      timestamp: scheduledAt,
      message: response,
    },
    {
      signal: options.signal,
    },
  );

  return {
    kind: "continue",
    response,
    scheduledMessage,
    scheduledAt,
    delayHours,
    sessionId,
    elapsedMessage,
    messages,
  };
}

export async function scheduleOutOfBlueMessage(
  character: Character,
  options: ContinueConversationOptions,
): Promise<OutOfBlueMessageResult> {
  const layla = options.layla;
  const laylaCharacter = character.laylaCharacter;
  const now = options.now ?? Date.now();
  const delayHours = options.delayHours ?? randomDelayHours(options.random ?? Math.random);
  const scheduledAt = now + delayHours * HOUR_MS;
  const messages: LaylaChatMessage[] = [
    {
      role: "system",
      content: buildOutOfBlueSystemPrompt(
        character,
        buildOutOfBlueSystemPromptValues(character),
        options.outOfBlueSystemPrompt,
      ),
    },
    {
      role: "user",
      content: buildOutOfBlueUserMessage(character),
    },
  ];

  const completion = await layla.chat.completions.create({
    messages,
    signal: options.signal,
  });
  const response = completion.choices[0]?.message.content?.trim() ?? "";

  if (!response) {
    throw new Error("Dream did not return a message to schedule.");
  }

  const scheduledMessage = await layla.chat.scheduleChatMessage(
    {
      id: 0,
      character_id: laylaCharacter.id,
      session_id: null,
      timestamp: scheduledAt,
      message: response,
    },
    {
      signal: options.signal,
    },
  );

  return {
    kind: "out_of_blue",
    response,
    scheduledMessage,
    scheduledAt,
    delayHours,
    sessionId: null,
    messages,
  };
}
