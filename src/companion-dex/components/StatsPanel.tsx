import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LaylaAbortError,
  type ChatCompletionStream,
  type LaylaCharacter,
} from "@layla-network/sdk";
import {
  buildReadOnYouMessages,
  buildReadOnYouPromptValues,
} from "../libs/readOnYou";
import type { Character, Theme } from "../types";
import { layla } from "./stats-panel/laylaClient";
import {
  characterVitalValue,
  ensureCharacterVitalSettings,
  loadPanelSettings,
  queueSaveSettings,
  saveSettingsInBackground,
  settingsErrorMessage,
  withCharacterReflectionSettings,
  withCharacterVitalSettings,
  type CompanionDexSettings,
  type SettingsState,
} from "./stats-panel/settings";
import {
  getReflectTitle,
  reflectionErrorMessage,
  reflectionGuardState,
  withImpression,
  type ReflectionState,
} from "./stats-panel/reflection";
import { BondSection } from "./stats-panel/sections/BondSection";
import { DreamSection } from "./stats-panel/sections/DreamSection";
import { ImpressionSection } from "./stats-panel/sections/ImpressionSection";
import { MemoriesSection } from "./stats-panel/sections/MemoriesSection";
import { MomentsSection } from "./stats-panel/sections/MomentsSection";
import { NumbersSection } from "./stats-panel/sections/NumbersSection";
import { PrivateLanguageSection } from "./stats-panel/sections/PrivateLanguageSection";
import { StatsPanelHeader } from "./stats-panel/sections/StatsPanelHeader";
import { TalkRhythmSection } from "./stats-panel/sections/TalkRhythmSection";
import { ThreadsSection } from "./stats-panel/sections/ThreadsSection";
import { WellbeingSection } from "./stats-panel/sections/WellbeingSection";

interface StatsPanelProps {
  character: Character;
  theme: Theme;
  imageFailed: boolean;
  onUpdateLaylaCharacter: (
    characterId: string,
    updater: (character: LaylaCharacter) => LaylaCharacter,
  ) => Promise<LaylaCharacter>;
}

export function StatsPanel({
  character,
  theme,
  imageFailed,
  onUpdateLaylaCharacter,
}: StatsPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [reflection, setReflection] = useState<ReflectionState>({
    characterId: character.id,
    status: "idle",
    text: "",
  });
  const [settingsState, setSettingsState] = useState<SettingsState>({
    status: "loading",
    settings: {},
  });
  const [now, setNow] = useState(() => Date.now());
  const reflectionStreamRef = useRef<ChatCompletionStream | null>(null);
  const settingsRef = useRef<CompanionDexSettings>({});

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    settingsRef.current = settingsState.settings;
  }, [settingsState.settings]);

  useEffect(() => {
    const controller = new AbortController();

    void loadPanelSettings(controller.signal)
      .then((settings) => {
        settingsRef.current = settings;
        setSettingsState({
          status: "ready",
          settings,
        });
      })
      .catch((error) => {
        if (error instanceof LaylaAbortError) return;

        setSettingsState({
          status: "error",
          settings: {},
          error: settingsErrorMessage(error),
        });
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (settingsState.status !== "ready") return;

    const initializedAt = Date.now();
    const nextSettings = ensureCharacterVitalSettings(
      settingsRef.current,
      character.id,
      initializedAt,
    );

    if (nextSettings === settingsRef.current) return;

    settingsRef.current = nextSettings;
    setSettingsState({
      status: "ready",
      settings: nextSettings,
    });
    saveSettingsInBackground(nextSettings);
  }, [character.id, settingsState.status, settingsState.settings]);

  useEffect(() => {
    reflectionStreamRef.current?.abort();
    reflectionStreamRef.current = null;
    setReflection({
      characterId: character.id,
      status: "idle",
      text: "",
    });

    return () => {
      reflectionStreamRef.current?.abort();
      reflectionStreamRef.current = null;
    };
  }, [character.id]);

  const value = (n: number) => (mounted ? n : 0);
  const vitalValue = (key: keyof Character["vitals"]) =>
    value(characterVitalValue(settingsState.settings, character.id, key, now));
  const energyValue = vitalValue("energy");
  const fedValue = vitalValue("fed");
  const socialValue = vitalValue("social");

  const tapVital = (key: keyof Character["vitals"]) => {
    const tappedAt = Date.now();
    const nextValue =
      characterVitalValue(settingsRef.current, character.id, key, tappedAt) + 1;
    const nextSettings = withCharacterVitalSettings(
      settingsRef.current,
      character.id,
      key,
      {
        value: nextValue,
        lastTapped: tappedAt,
      },
    );

    settingsRef.current = nextSettings;
    setNow(tappedAt);
    setSettingsState({
      status: "ready",
      settings: nextSettings,
    });
    saveSettingsInBackground(nextSettings);
  };

  const reflectionPromptValues = useMemo(
    () => buildReadOnYouPromptValues(character),
    [character],
  );

  const handleReflect = useCallback(async () => {
    const promptValues = reflectionPromptValues;

    reflectionStreamRef.current?.abort();
    setReflection({
      characterId: character.id,
      status: "loading",
      text: "",
    });

    let stream: ChatCompletionStream | null = null;

    try {
      stream = layla.chat.completions.stream({
        messages: buildReadOnYouMessages(character, promptValues),
      });
      reflectionStreamRef.current = stream;

      stream.on("content", (_delta, snapshot) => {
        setReflection((current) =>
          current.characterId === character.id
            ? {
                ...current,
                status: "loading",
                text: snapshot,
                error: undefined,
              }
            : current,
        );
      });

      const finalText = await stream.finalContent();
      const finalImpression = finalText.trim();
      setReflection((current) =>
        current.characterId === character.id
          ? {
              ...current,
              status: "done",
              text: finalText,
              error: undefined,
            }
          : current,
      );

      await onUpdateLaylaCharacter(character.id, (laylaCharacter) =>
        withImpression(laylaCharacter, finalImpression),
      );

      const nextSettings = withCharacterReflectionSettings(
        settingsRef.current,
        character.id,
        {
          lastReflectedAt: Date.now(),
          memories: promptValues.memories,
          recentMemory: promptValues.recent_memory,
        },
      );

      await queueSaveSettings(nextSettings);
      settingsRef.current = nextSettings;
      setSettingsState({
        status: "ready",
        settings: nextSettings,
      });
    } catch (error) {
      if (error instanceof LaylaAbortError) return;

      setReflection((current) =>
        current.characterId === character.id
          ? {
              ...current,
              status: "error",
              error: reflectionErrorMessage(error),
            }
          : current,
      );
    } finally {
      if (stream && reflectionStreamRef.current === stream) {
        reflectionStreamRef.current = null;
      }
    }
  }, [character, onUpdateLaylaCharacter, reflectionPromptValues]);

  const activeReflection =
    reflection.characterId === character.id ? reflection : null;
  const isReflecting = activeReflection?.status === "loading";
  const reflectedText = activeReflection?.text.trim() ? activeReflection.text : "";
  const reflectionError =
    activeReflection?.status === "error" ? activeReflection.error : undefined;
  const reflectionPromptReady =
    character.isChatHistoryLoaded &&
    !character.chatHistoryError &&
    !character.isChatSentimentLoading &&
    !character.chatSentimentError &&
    !!character.chatSentiment &&
    !character.isMemoriesLoading &&
    !character.memoriesError &&
    !character.isMemorySentimentLoading &&
    !character.memorySentimentError &&
    character.recentMemories.length > 0;
  const reflectionGuard = useMemo(
    () =>
      reflectionGuardState(
        settingsState.settings,
        character.id,
        reflectionPromptValues.memories,
        reflectionPromptValues.recent_memory,
        now,
      ),
    [
      character.id,
      now,
      reflectionPromptValues.memories,
      reflectionPromptValues.recent_memory,
      settingsState.settings,
    ],
  );
  const canReflect =
    reflectionPromptReady &&
    settingsState.status === "ready" &&
    reflectionGuard.memoriesChanged &&
    reflectionGuard.recentMemoryChanged &&
    reflectionGuard.cooldownElapsed;
  const reflectDisabled = isReflecting || !canReflect;
  const showReflectGuardStatus =
    !isReflecting &&
    reflectionPromptReady &&
    settingsState.status === "ready" &&
    (!reflectionGuard.memoriesChanged ||
      !reflectionGuard.recentMemoryChanged ||
      !reflectionGuard.cooldownElapsed);
  const reflectTitle = getReflectTitle({
    canReflect,
    character,
    isReflecting,
    reflectionGuard,
    settingsState,
  });

  return (
    <div style={{ padding: "0 24px 8px" }}>
      <StatsPanelHeader
        character={character}
        theme={theme}
        imageFailed={imageFailed}
      />
      <DreamSection character={character} />
      <BondSection character={character} value={value} />
      <WellbeingSection
        character={character}
        energyValue={energyValue}
        fedValue={fedValue}
        socialValue={socialValue}
        onTapVital={tapVital}
      />
      <MemoriesSection character={character} />
      <ThreadsSection character={character} />
      <MomentsSection character={character} />
      <TalkRhythmSection character={character} />
      <ImpressionSection
        character={character}
        isReflecting={isReflecting}
        reflectDisabled={reflectDisabled}
        reflectTitle={reflectTitle}
        showReflectGuardStatus={showReflectGuardStatus}
        reflectedText={reflectedText}
        reflectionError={reflectionError}
        onReflect={handleReflect}
      />
      <NumbersSection character={character} />
      <PrivateLanguageSection character={character} />
      <div style={{ height: 44 }} />
    </div>
  );
}
