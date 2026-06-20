import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LaylaAbortError,
  type ChatCompletionStream,
  type LaylaCharacter,
} from "@layla-network/sdk";
import {
  buildReflectionPromptValues,
  canRunReflection,
  getReflectTitle,
  isReflectionPromptReady,
  reflectionErrorMessage,
  reflectionGuardState,
  runReflection,
  type ReflectionState,
} from "../libs/reflect";
import type { Character, Theme } from "../types";
import { layla } from "./stats-panel/laylaClient";
import {
  characterVitals,
  characterVitalValue,
  ensureCharacterVitalSettings,
  loadPanelSettings,
  queueSaveSettings,
  saveSettingsInBackground,
  settingsErrorMessage,
  withCharacterVitalSettings,
  type CompanionDexSettings,
  type SettingsState,
} from "./stats-panel/settings";
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

  const activeVitals = useMemo<Character["vitals"]>(
    () =>
      settingsState.status === "ready"
        ? characterVitals(settingsState.settings, character.id, now)
        : character.vitals,
    [
      character.id,
      character.vitals,
      now,
      settingsState.settings,
      settingsState.status,
    ],
  );
  const activeCharacter = useMemo<Character>(
    () => ({
      ...character,
      vitals: activeVitals,
    }),
    [activeVitals, character],
  );

  const energyValue = value(activeVitals.energy);
  const fedValue = value(activeVitals.fed);
  const socialValue = value(activeVitals.social);

  const tapVital = (key: keyof Character["vitals"]) => {
    const tappedAt = Date.now();
    const currentSettings = ensureCharacterVitalSettings(
      settingsRef.current,
      character.id,
      tappedAt,
    );
    const nextValue =
      characterVitalValue(currentSettings, character.id, key, tappedAt) + 1;
    const nextSettings = withCharacterVitalSettings(
      currentSettings,
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
    () => buildReflectionPromptValues(activeCharacter),
    [activeCharacter],
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
      const result = await runReflection(activeCharacter, {
        layla,
        settings: settingsRef.current,
        promptValues,
        onUpdateLaylaCharacter,
        saveSettings: queueSaveSettings,
        onStream: (activeStream) => {
          stream = activeStream;
          reflectionStreamRef.current = activeStream;
        },
        onContent: (snapshot) => {
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
        },
      });

      setReflection((current) =>
        current.characterId === character.id
          ? {
              ...current,
              status: "done",
              text: result.text,
              error: undefined,
            }
          : current,
      );

      settingsRef.current = result.nextSettings;
      setSettingsState({
        status: "ready",
        settings: result.nextSettings,
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
  }, [activeCharacter, character.id, onUpdateLaylaCharacter, reflectionPromptValues]);

  const activeReflection =
    reflection.characterId === character.id ? reflection : null;
  const isReflecting = activeReflection?.status === "loading";
  const reflectedText = activeReflection?.text.trim() ? activeReflection.text : "";
  const reflectionError =
    activeReflection?.status === "error" ? activeReflection.error : undefined;
  const reflectionPromptReady = isReflectionPromptReady(activeCharacter);
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
    settingsState.status === "ready" &&
    canRunReflection({
      character: activeCharacter,
      settings: settingsState.settings,
      promptValues: reflectionPromptValues,
      now,
    });
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
    character: activeCharacter,
    isReflecting,
    reflectionGuard,
    settingsState,
  });

  const updateReflectionSettings = useCallback(
    (nextSettings: CompanionDexSettings) => {
      settingsRef.current = nextSettings;
      setSettingsState({
        status: "ready",
        settings: nextSettings,
      });
    },
    [],
  );

  return (
    <div style={{ padding: "0 24px 8px" }}>
      <StatsPanelHeader
        character={activeCharacter}
        theme={theme}
        imageFailed={imageFailed}
      />
      <DreamSection
        character={activeCharacter}
        canReflectBeforeDream={canReflect && !isReflecting}
        reflectionPromptValues={reflectionPromptValues}
        settingsState={settingsState}
        onSettingsChange={updateReflectionSettings}
        onUpdateLaylaCharacter={onUpdateLaylaCharacter}
      />
      <BondSection character={activeCharacter} value={value} />
      <WellbeingSection
        character={activeCharacter}
        energyValue={energyValue}
        fedValue={fedValue}
        socialValue={socialValue}
        onTapVital={tapVital}
      />
      <MemoriesSection character={activeCharacter} />
      <ThreadsSection character={activeCharacter} />
      <MomentsSection character={activeCharacter} />
      <TalkRhythmSection character={activeCharacter} />
      <ImpressionSection
        character={activeCharacter}
        isReflecting={isReflecting}
        reflectDisabled={reflectDisabled}
        reflectTitle={reflectTitle}
        showReflectGuardStatus={showReflectGuardStatus}
        reflectedText={reflectedText}
        reflectionError={reflectionError}
        onReflect={handleReflect}
      />
      <NumbersSection character={activeCharacter} />
      <PrivateLanguageSection character={activeCharacter} />
      <div style={{ height: 44 }} />
    </div>
  );
}
