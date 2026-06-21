import { LaylaBridgeUnavailableError, LaylaError } from "@layla-network/sdk";
import type { Character } from "../../types";
import { layla } from "./laylaClient";

const SETTINGS_FILENAME = "settings.json";
const DAY_MS = 24 * 60 * 60 * 1000;
const INITIAL_VITAL_MIN = 10;
const INITIAL_VITAL_MAX = 30;
const VITAL_SETTINGS_KEYS = {
  energy: "energy",
  fed: "hungriness",
  social: "social",
} as const satisfies Record<keyof Character["vitals"], string>;

export interface CharacterReflectionSettings {
  lastReflectedAt?: number;
  memories?: string;
  recentMemory?: string;
}

interface CharacterVitalSettings {
  value?: number;
  lastTapped?: number;
}

type CharacterWellbeingSettings = Partial<
  Record<(typeof VITAL_SETTINGS_KEYS)[keyof Character["vitals"]], CharacterVitalSettings>
>;

export interface DreamPromptSettings {
  dreamSystemPrompt?: string;
  outOfBlueSystemPrompt?: string;
  readOnYouSystemPrompt?: string;
  readOnYouUserInstruction?: string;
}

interface CharacterSettings {
  reflection?: CharacterReflectionSettings;
  howYouAreDoing?: CharacterWellbeingSettings;
  dreamPrompts?: DreamPromptSettings;
}

export interface CompanionDexSettings {
  characters?: Record<string, CharacterSettings>;
}

export interface SettingsState {
  status: "loading" | "ready" | "error";
  settings: CompanionDexSettings;
  error?: string;
}

function contentBase64FromDataUri(contentBase64: string) {
  const commaIndex = contentBase64.indexOf(",");
  return commaIndex >= 0 ? contentBase64.slice(commaIndex + 1) : contentBase64;
}

function base64ToUtf8(contentBase64: string) {
  const binary = atob(contentBase64FromDataUri(contentBase64));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function utf8ToBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function parseSettings(value: string): CompanionDexSettings {
  const parsed: unknown = JSON.parse(value);

  if (!parsed || typeof parsed !== "object") return {};

  const settings = parsed as CompanionDexSettings;
  const characters =
    settings.characters && typeof settings.characters === "object"
      ? settings.characters
      : undefined;

  return {
    ...(characters ? { characters } : {}),
  };
}

export function settingsErrorMessage(error: unknown) {
  if (error instanceof LaylaBridgeUnavailableError) {
    return "Open this mini-app inside Layla to check reflection history.";
  }

  if (error instanceof LaylaError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to check reflection history.";
}

export async function loadPanelSettings(signal: AbortSignal) {
  const result = await layla.utils.readFile(SETTINGS_FILENAME, {
    signal,
  });

  if (!result.content_base64) return {};

  try {
    return parseSettings(base64ToUtf8(result.content_base64));
  } catch {
    return {};
  }
}

async function savePanelSettings(settings: CompanionDexSettings) {
  const contentBase64 = utf8ToBase64(JSON.stringify(settings, null, 2));
  const result = await layla.utils.saveFile(SETTINGS_FILENAME, contentBase64, false);

  if (!result.success) {
    throw new Error(result.message ?? "Unable to save reflection history.");
  }
}

let settingsSaveQueue = Promise.resolve();

export function queueSaveSettings(settings: CompanionDexSettings) {
  const save = () => savePanelSettings(settings);
  settingsSaveQueue = settingsSaveQueue.then(save, save);
  return settingsSaveQueue;
}

export function saveSettingsInBackground(settings: CompanionDexSettings) {
  void queueSaveSettings(settings).catch(() => undefined);
}

export function withCharacterDreamPromptSettings(
  settings: CompanionDexSettings,
  characterId: string,
  dreamPrompts: DreamPromptSettings,
): CompanionDexSettings {
  const characters = settings.characters ?? {};
  const characterSettings = characters[characterId] ?? {};

  return {
    ...settings,
    characters: {
      ...characters,
      [characterId]: {
        ...characterSettings,
        dreamPrompts,
      },
    },
  };
}

export function characterDreamPromptSettings(
  settings: CompanionDexSettings,
  characterId: string,
) {
  return settings.characters?.[characterId]?.dreamPrompts;
}

export function withCharacterReflectionSettings(
  settings: CompanionDexSettings,
  characterId: string,
  reflection: CharacterReflectionSettings,
): CompanionDexSettings {
  const characters = settings.characters ?? {};

  return {
    ...settings,
    characters: {
      ...characters,
      [characterId]: {
        ...characters[characterId],
        reflection,
      },
    },
  };
}

export function characterReflectionSettings(
  settings: CompanionDexSettings,
  characterId: string,
) {
  return settings.characters?.[characterId]?.reflection;
}

function randomInitialVital() {
  return (
    INITIAL_VITAL_MIN +
    Math.floor(Math.random() * (INITIAL_VITAL_MAX - INITIAL_VITAL_MIN + 1))
  );
}

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function decayVital(value: number, lastTapped: number, now = Date.now()) {
  const elapsedDays = Math.max(0, now - lastTapped) / DAY_MS;
  return value * Math.pow(0.5, elapsedDays);
}

function vitalSettingsKey(key: keyof Character["vitals"]) {
  return VITAL_SETTINGS_KEYS[key];
}

function characterVitalSettings(
  settings: CompanionDexSettings,
  characterId: string,
  key: keyof Character["vitals"],
) {
  return settings.characters?.[characterId]?.howYouAreDoing?.[vitalSettingsKey(key)];
}

export function characterVitalValue(
  settings: CompanionDexSettings,
  characterId: string,
  key: keyof Character["vitals"],
  now: number,
) {
  const vital = characterVitalSettings(settings, characterId, key);

  if (!validNumber(vital?.value)) return 0;
  if (!validNumber(vital.lastTapped)) return Math.max(0, vital.value);

  return Math.max(0, decayVital(vital.value, vital.lastTapped, now));
}

export function characterVitals(
  settings: CompanionDexSettings,
  characterId: string,
  now: number,
): Character["vitals"] {
  return {
    energy: characterVitalValue(settings, characterId, "energy", now),
    fed: characterVitalValue(settings, characterId, "fed", now),
    social: characterVitalValue(settings, characterId, "social", now),
  };
}

export function withCharacterVitalSettings(
  settings: CompanionDexSettings,
  characterId: string,
  key: keyof Character["vitals"],
  vital: CharacterVitalSettings,
): CompanionDexSettings {
  const characters = settings.characters ?? {};
  const characterSettings = characters[characterId] ?? {};

  return {
    ...settings,
    characters: {
      ...characters,
      [characterId]: {
        ...characterSettings,
        howYouAreDoing: {
          ...characterSettings.howYouAreDoing,
          [vitalSettingsKey(key)]: vital,
        },
      },
    },
  };
}

export function ensureCharacterVitalSettings(
  settings: CompanionDexSettings,
  characterId: string,
  now: number,
) {
  let nextSettings = settings;
  let changed = false;
  const keys = Object.keys(VITAL_SETTINGS_KEYS) as Array<keyof Character["vitals"]>;

  for (const key of keys) {
    const current = characterVitalSettings(nextSettings, characterId, key);

    if (validNumber(current?.value)) {
      if (!validNumber(current.lastTapped)) {
        nextSettings = withCharacterVitalSettings(nextSettings, characterId, key, {
          ...current,
          lastTapped: now,
        });
        changed = true;
      }

      continue;
    }

    nextSettings = withCharacterVitalSettings(nextSettings, characterId, key, {
      value: randomInitialVital(),
      lastTapped: now,
    });
    changed = true;
  }

  return changed ? nextSettings : settings;
}
