import LaylaSDK, {
  LaylaBridgeUnavailableError,
  LaylaError,
  type ChatCompletionStream,
  type LaylaCharacter,
} from "@layla-network/sdk";
import {
  buildReadOnYouMessages,
  buildReadOnYouPromptValues,
  type ReadOnYouPromptValues,
} from "./readOnYou";
import type { Character } from "../types";
import {
  characterReflectionSettings,
  withCharacterReflectionSettings,
  type CompanionDexSettings,
  type SettingsState,
} from "../components/stats-panel/settings";

const REFLECTION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const defaultLayla = new LaylaSDK();

export type ReflectionStatus = "idle" | "loading" | "done" | "error";

export interface ReflectionState {
  characterId: string;
  status: ReflectionStatus;
  text: string;
  error?: string;
}

export interface RunReflectionOptions {
  layla?: LaylaSDK;
  settings: CompanionDexSettings;
  promptValues?: ReadOnYouPromptValues;
  signal?: AbortSignal;
  now?: () => number;
  onStream?: (stream: ChatCompletionStream) => void;
  onContent?: (snapshot: string, delta: string) => void;
  onUpdateLaylaCharacter: (
    characterId: string,
    updater: (character: LaylaCharacter) => LaylaCharacter,
  ) => Promise<LaylaCharacter>;
  saveSettings?: (settings: CompanionDexSettings) => Promise<void>;
}

export interface RunReflectionResult {
  text: string;
  impression: string;
  nextSettings: CompanionDexSettings;
  promptValues: ReadOnYouPromptValues;
}

export {
  buildReadOnYouPromptValues as buildReflectionPromptValues,
  type ReadOnYouPromptValues,
};

export function reflectionErrorMessage(error: unknown) {
  if (error instanceof LaylaBridgeUnavailableError) {
    return "Open this mini-app inside Layla to reflect.";
  }

  if (error instanceof LaylaError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to complete reflection.";
}

export function withImpression(
  character: LaylaCharacter,
  impression: string,
): LaylaCharacter {
  return {
    ...character,
    data: {
      ...character.data,
      data: {
        ...character.data.data,
        extensions: {
          ...character.data.data.extensions,
          impression,
        },
      },
    },
  };
}

export function isReflectionPromptReady(character: Character) {
  return (
    character.isChatHistoryLoaded &&
    !character.chatHistoryError &&
    !character.isChatSentimentLoading &&
    !character.chatSentimentError &&
    !!character.chatSentiment &&
    !character.isMemoriesLoading &&
    !character.memoriesError &&
    !character.isPersonaLoading &&
    !character.isMemorySentimentLoading &&
    !character.memorySentimentError &&
    character.recentMemories.length > 0
  );
}

export function reflectionGuardState(
  settings: CompanionDexSettings,
  characterId: string,
  memories: string,
  recentMemory: string,
  now: number,
) {
  const previous = characterReflectionSettings(settings, characterId);
  const lastReflectedAt =
    typeof previous?.lastReflectedAt === "number"
      ? previous.lastReflectedAt
      : undefined;

  return {
    memoriesChanged: previous?.memories !== memories,
    recentMemoryChanged: previous?.recentMemory !== recentMemory,
    cooldownElapsed:
      lastReflectedAt === undefined ||
      now - lastReflectedAt > REFLECTION_COOLDOWN_MS,
  };
}

export function canRunReflection({
  character,
  settings,
  promptValues = buildReadOnYouPromptValues(character),
  now = Date.now(),
}: {
  character: Character;
  settings: CompanionDexSettings;
  promptValues?: ReadOnYouPromptValues;
  now?: number;
}) {
  const reflectionGuard = reflectionGuardState(
    settings,
    character.id,
    promptValues.memories,
    promptValues.recent_memory,
    now,
  );

  return (
    isReflectionPromptReady(character) &&
    reflectionGuard.memoriesChanged &&
    reflectionGuard.recentMemoryChanged &&
    reflectionGuard.cooldownElapsed
  );
}

export function getReflectTitle({
  canReflect,
  character,
  isReflecting,
  reflectionGuard,
  settingsState,
}: {
  canReflect: boolean;
  character: Character;
  isReflecting: boolean;
  reflectionGuard: ReturnType<typeof reflectionGuardState>;
  settingsState: SettingsState;
}) {
  if (canReflect) return "Reflect";
  if (isReflecting) return "Reflecting";
  if (!character.isChatHistoryLoaded) return "Waiting for chat history";
  if (character.chatHistoryError) {
    return `Chat history unavailable: ${character.chatHistoryError}`;
  }

  if (character.chatSentimentError) {
    return `Chat sentiment unavailable: ${character.chatSentimentError}`;
  }

  if (character.isChatSentimentLoading || !character.chatSentiment) {
    return "Reading chat memories";
  }

  if (character.isMemoriesLoading) return "Waiting for memories";
  if (character.memoriesError) {
    return `Memories unavailable: ${character.memoriesError}`;
  }

  if (character.memorySentimentError) {
    return `Memory signal unavailable: ${character.memorySentimentError}`;
  }

  if (character.isMemorySentimentLoading) return "Reading memory signal";
  if (character.recentMemories.length === 0) return "Waiting for recent memories";
  if (settingsState.status === "loading") return "Checking reflection history";
  if (settingsState.status === "error") {
    return settingsState.error ?? "Reflection history unavailable";
  }

  if (!reflectionGuard.memoriesChanged) return "Reflect after memories change";
  if (!reflectionGuard.recentMemoryChanged) {
    return "Reflect after the recent exchange changes";
  }

  if (!reflectionGuard.cooldownElapsed) {
    return "Reflect again after a day has passed";
  }

  return "Reflect unavailable";
}

export async function runReflection(
  character: Character,
  options: RunReflectionOptions,
): Promise<RunReflectionResult> {
  const layla = options.layla ?? defaultLayla;
  const promptValues =
    options.promptValues ?? buildReadOnYouPromptValues(character);
  const stream = layla.chat.completions.stream({
    messages: buildReadOnYouMessages(character, promptValues),
    signal: options.signal,
  });

  options.onStream?.(stream);
  stream.on("content", (delta, snapshot) => {
    options.onContent?.(snapshot, delta);
  });

  const text = await stream.finalContent();
  const impression = text.trim();

  await options.onUpdateLaylaCharacter(character.id, (laylaCharacter) =>
    withImpression(laylaCharacter, impression),
  );

  const nextSettings = withCharacterReflectionSettings(
    options.settings,
    character.id,
    {
      lastReflectedAt: options.now?.() ?? Date.now(),
      memories: promptValues.memories,
      recentMemory: promptValues.recent_memory,
    },
  );

  await options.saveSettings?.(nextSettings);

  return {
    text,
    impression,
    nextSettings,
    promptValues,
  };
}
