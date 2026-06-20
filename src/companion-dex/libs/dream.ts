import LaylaSDK, {
  type LaylaCharacter,
  type LaylaChatHistoryEntry,
  type LaylaChatMessage,
  type LaylaScheduledChatMessage,
} from "@layla-network/sdk";
import type { Character } from "../types";
import { humaniseDuration } from "../utils/misc";

const MIN_DREAM_DELAY_HOURS = 5;
const MAX_DREAM_DELAY_HOURS = 100;
const HOUR_MS = 60 * 60 * 1000;

const defaultLayla = new LaylaSDK();

export interface ContinueConversationOptions {
  layla?: LaylaSDK;
  now?: number;
  random?: () => number;
  delayHours?: number;
  signal?: AbortSignal;
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

function isCompanionCharacter(
  character: Character | LaylaCharacter,
): character is Character {
  return "laylaCharacter" in character;
}

function laylaCharacterFrom(character: Character | LaylaCharacter) {
  return isCompanionCharacter(character) ? character.laylaCharacter : character;
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

export function buildDreamSystemPrompt(character: LaylaCharacter) {
  const name = cleanPromptValue(character.data.data.name) || "the character";
  const details = characterPromptDetails(character);

  return `BECOME ${name}.

You are writing the next scheduled chat message from ${name} to the user.
Stay fully in character. Use ${name}'s voice, personality, relationship context, and emotional continuity.
Do not mention that you are an AI, a model, a scheduled message, or that you were given instructions.
Reply with only the message ${name} should send. Do not include labels, narration, analysis, or quotation marks.

CHARACTER CARD
${details || `Name: ${name}`}`;
}

export function buildOutOfBlueSystemPrompt(character: LaylaCharacter) {
  const name = cleanPromptValue(character.data.data.name) || "the character";
  const details = characterPromptDetails(character);

  return `You are ${name}.

CHARACTER CARD
${details || `Name: ${name}`}

The user will ask you to write a message from the perspective of this character based on what you know.
Write in ${name}'s voice and perspective. Reply only with the message ${name} would send.`;
}

function buildOutOfBlueUserMessage(character: Character) {
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

  return `MOMENTS WORTH KEEPING
${moments || "No moments worth keeping yet."}

CURRENT IMPRESSION OF THE USER
${impression}

Write a message ${name} sends to the user out of the blue. It should feel natural, specific to what ${name} knows, and like something ${name} chose to send. Reply only with the message.`;
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
): DreamSelection[] {
  const candidates: DreamSelection[] = dreamSessionCandidates(
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
) {
  const candidates = dreamSelectionCandidates(
    chatHistory,
    scheduledMessages,
    characterId,
  );

  if (candidates.length === 0) {
    throw new Error("Dream needs an unscheduled conversation option.");
  }

  return candidates[randomIndex(candidates.length, random)];
}

export async function continueConversation(
  chatHistory: LaylaChatHistoryEntry[],
  character: Character | LaylaCharacter,
  options: ContinueConversationOptions = {},
): Promise<ContinueConversationResult> {
  const layla = options.layla ?? defaultLayla;
  const laylaCharacter = laylaCharacterFrom(character);
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
      content: buildDreamSystemPrompt(laylaCharacter),
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
      character_id: laylaCharacter.id,
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
  options: ContinueConversationOptions = {},
): Promise<OutOfBlueMessageResult> {
  const layla = options.layla ?? defaultLayla;
  const laylaCharacter = character.laylaCharacter;
  const now = options.now ?? Date.now();
  const delayHours = options.delayHours ?? randomDelayHours(options.random ?? Math.random);
  const scheduledAt = now + delayHours * HOUR_MS;
  const messages: LaylaChatMessage[] = [
    {
      role: "system",
      content: buildOutOfBlueSystemPrompt(laylaCharacter),
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
