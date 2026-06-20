import {
  LaylaBridgeUnavailableError,
  LaylaError,
  type LaylaCharacter,
} from "@layla-network/sdk";
import type { Character } from "../../types";
import {
  characterReflectionSettings,
  type CompanionDexSettings,
  type SettingsState,
} from "./settings";

const REFLECTION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type ReflectionStatus = "idle" | "loading" | "done" | "error";

export interface ReflectionState {
  characterId: string;
  status: ReflectionStatus;
  text: string;
  error?: string;
}

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
