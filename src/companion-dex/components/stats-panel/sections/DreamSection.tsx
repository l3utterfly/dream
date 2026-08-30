import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LaylaAbortError,
  LaylaBridgeUnavailableError,
  LaylaError,
  type LaylaScheduledChatMessage,
} from "@layla-network/sdk";
import { Clock, MoonStar, RotateCcw, Settings, Sparkles } from "lucide-react";
import {
  dreamSelectionCandidates,
} from "../../../libs/dream";
import {
  resolveDreamPrompts,
  type DreamPromptSettings,
} from "../../../libs/dream-prompts";
import { runReflection, type ReadOnYouPromptValues } from "../../../libs/reflect";
import { runDream } from "../../../libs/runDream";
import type { Character } from "../../../types";
import { layla } from "../laylaClient";
import {
  characterDreamPromptSettings,
  queueSaveSettings,
  saveSettingsInBackground,
  type CompanionDexSettings,
  type SettingsState,
  withCharacterDreamPromptSettings,
} from "../settings";
import { Block } from "../../MetricSections";

interface DreamSectionProps {
  character: Character;
  canReflectBeforeDream: boolean;
  reflectionPromptValues: ReadOnYouPromptValues;
  settingsState: SettingsState;
  onSettingsChange: (settings: CompanionDexSettings) => void;
  onUpdateLaylaCharacter: Parameters<typeof runReflection>[1]["onUpdateLaylaCharacter"];
}

interface ScheduledMessagesState {
  characterId: string;
  status: "loading" | "ready" | "error";
  messages: LaylaScheduledChatMessage[];
  error?: string;
}

interface DreamState {
  characterId: string;
  status: "idle" | "loading" | "done" | "error";
  error?: string;
}

type DreamPromptSettingKey = keyof DreamPromptSettings;

const DREAM_PROMPT_FIELDS: Array<{
  key: DreamPromptSettingKey;
  label: string;
  rows: number;
}> = [
  {
    key: "dreamSystemPrompt",
    label: "Dream System Prompt",
    rows: 10,
  },
  {
    key: "outOfBlueSystemPrompt",
    label: "New Conversation System Prompt",
    rows: 7,
  },
  {
    key: "readOnYouSystemPrompt",
    label: "Impression System Prompt",
    rows: 11,
  },
  {
    key: "readOnYouUserInstruction",
    label: "Impression User Instruction",
    rows: 12,
  },
];

const DREAM_TEMPLATE_ROWS = [
  ["{{char}}", "Character's name."],
  ["{{user}}", "Your name."],
  ["{{persona}}", "Your persona attached to this character."],
  ["{{character_card}}", "Full character details including description, personality, prompt, etc."],
  ["{{description}}", "A compact character description."],
  ["{{personality}}", "A compact personality for the character."],
  ["{{stage}}", "How established the relationship currently appears."],
  ["{{time_together}}", "How long you have been chatting with this character."],
  ["{{warmth_and_depth}}", "A short summary of warmth/depth signals in the relationship."],
  ["{{previous_impression}}", "The last saved impression of the user, if one exists."],
  ["{{memories}}", "Selected moments worth keeping from chat and memory sentiment."],
  ["{{emotions}}", "The character's current energy, hunger, and social state."],
  ["{{recent_memory}}", "The most recent conversation thread summary."],
] as const;

function scheduledMessagesErrorMessage(error: unknown) {
  if (error instanceof LaylaBridgeUnavailableError) {
    return "Open this mini-app inside Layla to check scheduled messages.";
  }

  if (error instanceof LaylaError) return error.message;
  if (error instanceof Error) return error.message;

  return "Unable to check scheduled messages.";
}

function dreamErrorMessage(error: unknown) {
  if (error instanceof LaylaBridgeUnavailableError) {
    return "Open this mini-app inside Layla to dream.";
  }

  if (error instanceof LaylaError) return error.message;
  if (error instanceof Error) return error.message;

  return "Unable to dream right now.";
}

function timestampMilliseconds(timestamp: number) {
  return Math.abs(timestamp) < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

function formatScheduledTime(timestamp: number) {
  const date = new Date(timestampMilliseconds(timestamp));

  if (Number.isNaN(date.getTime())) return "time unavailable";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function scheduledMessagesForCharacter(
  scheduledMessages: LaylaScheduledChatMessage[],
  characterId: string,
) {
  return scheduledMessages
    .filter((message) => message.character_id === characterId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function appendScheduledMessage(
  scheduledMessages: LaylaScheduledChatMessage[],
  scheduledMessage: LaylaScheduledChatMessage,
  characterId: string,
) {
  const nextMessages = scheduledMessages.filter(
    (message) => message.id !== scheduledMessage.id,
  );

  return scheduledMessagesForCharacter(
    [...nextMessages, scheduledMessage],
    characterId,
  );
}

export function DreamSection({
  character,
  canReflectBeforeDream,
  reflectionPromptValues,
  settingsState,
  onSettingsChange,
  onUpdateLaylaCharacter,
}: DreamSectionProps) {
  const descriptionId = `dream-description-${character.id}`;
  const dreamControllerRef = useRef<AbortController | null>(null);
  const [scheduledMessagesState, setScheduledMessagesState] =
    useState<ScheduledMessagesState>({
      characterId: character.id,
      status: "loading",
      messages: [],
    });
  const [dreamState, setDreamState] = useState<DreamState>({
    characterId: character.id,
    status: "idle",
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void layla.chat
      .getScheduledChatMessages({
        signal: controller.signal,
      })
      .then((scheduledMessages) => {
        const messages = scheduledMessagesForCharacter(
          scheduledMessages,
          character.id,
        );

        setScheduledMessagesState({
          characterId: character.id,
          status: "ready",
          messages,
        });
      })
      .catch((error) => {
        if (error instanceof LaylaAbortError) return;

        setScheduledMessagesState({
          characterId: character.id,
          status: "error",
          messages: [],
          error: scheduledMessagesErrorMessage(error),
        });
      });

    return () => controller.abort();
  }, [character.id]);

  useEffect(() => {
    dreamControllerRef.current?.abort();

    return () => {
      dreamControllerRef.current?.abort();
      dreamControllerRef.current = null;
    };
  }, [character.id]);

  const activeScheduleState =
    scheduledMessagesState.characterId === character.id
      ? scheduledMessagesState
      : null;
  const activeDreamState = dreamState.characterId === character.id ? dreamState : null;
  const isLoadingScheduledMessages =
    !activeScheduleState || activeScheduleState.status === "loading";
  const isDreaming = activeDreamState?.status === "loading";
  const scheduledMessages = useMemo(
    () =>
      activeScheduleState?.status === "ready" ? activeScheduleState.messages : [],
    [activeScheduleState],
  );
  const scheduledMessagesError =
    activeScheduleState?.status === "error" ? activeScheduleState.error : null;
  const dreamError =
    activeDreamState?.status === "error" ? activeDreamState.error : null;
  const scheduledCount = scheduledMessages.length;
  const isScheduleReady = activeScheduleState?.status === "ready";
  const dreamCandidateCount = isScheduleReady
    ? dreamSelectionCandidates(
        character.chatHistory,
        scheduledMessages,
        character.id,
      ).length
    : 0;
  const canDream =
    character.isChatHistoryLoaded &&
    !character.chatHistoryError &&
    isScheduleReady &&
    dreamCandidateCount > 0;
  let dreamTitle = "Waiting for chat history";
  if (canDream) {
    dreamTitle = "Dream";
  } else if (character.chatHistoryError) {
    dreamTitle = `Chat history unavailable: ${character.chatHistoryError}`;
  } else if (!character.isChatHistoryLoaded) {
    dreamTitle = "Waiting for chat history";
  } else if (activeScheduleState?.status === "error") {
    dreamTitle = scheduledMessagesError ?? "Scheduled messages unavailable";
  } else if (!isScheduleReady) {
    dreamTitle = "Checking scheduled messages";
  } else if (scheduledCount > 0) {
    dreamTitle = "A message is already scheduled";
  } else if (dreamCandidateCount === 0) {
    dreamTitle = "No unscheduled conversation sessions";
  }
  const spoilerKey = scheduledMessages.map((message) => message.id).join("-");
  const settingsUnavailableMessage =
    settingsState.status === "loading"
      ? "Loading prompt settings..."
      : settingsState.status === "error"
        ? (settingsState.error ?? "Prompt settings unavailable.")
        : null;
  const promptDrafts = useMemo(
    () =>
      resolveDreamPrompts(
        characterDreamPromptSettings(settingsState.settings, character.id),
      ),
    [character.id, settingsState.settings],
  );

  const updatePromptDraft = useCallback(
    (key: DreamPromptSettingKey, value: string) => {
      if (settingsState.status !== "ready") return;

      const nextSettings = withCharacterDreamPromptSettings(
        settingsState.settings,
        character.id,
        {
          ...characterDreamPromptSettings(settingsState.settings, character.id),
          [key]: value,
        },
      );

      onSettingsChange(nextSettings);
      saveSettingsInBackground(nextSettings);
    },
    [character.id, onSettingsChange, settingsState],
  );

  const resetPromptDrafts = useCallback(() => {
    if (settingsState.status !== "ready") return;

    const nextSettings = withCharacterDreamPromptSettings(
      settingsState.settings,
      character.id,
      {},
    );
    onSettingsChange(nextSettings);
    saveSettingsInBackground(nextSettings);
  }, [character.id, onSettingsChange, settingsState]);

  const handleDream = useCallback(async () => {
    dreamControllerRef.current?.abort();
    const controller = new AbortController();
    dreamControllerRef.current = controller;

    setDreamState({
      characterId: character.id,
      status: "loading",
    });

    try {
      const { dream: dreamResult } = await runDream({
        layla,
        character,
        scheduledMessages,
        prompts: promptDrafts,
        signal: controller.signal,
        beforeDream:
          canReflectBeforeDream && settingsState.status === "ready"
            ? async () => {
                const reflectionResult = await runReflection(character, {
                  layla,
                  settings: settingsState.settings,
                  promptValues: reflectionPromptValues,
                  promptTemplates: {
                    systemPrompt: promptDrafts.readOnYouSystemPrompt,
                    userInstruction: promptDrafts.readOnYouUserInstruction,
                  },
                  signal: controller.signal,
                  onUpdateLaylaCharacter,
                  saveSettings: queueSaveSettings,
                });

                onSettingsChange(reflectionResult.nextSettings);
                return reflectionResult;
              }
            : undefined,
      });

      setScheduledMessagesState({
        characterId: character.id,
        status: "ready",
        messages: appendScheduledMessage(
          scheduledMessages,
          dreamResult.scheduledMessage,
          character.id,
        ),
      });
      setDreamState({
        characterId: character.id,
        status: "done",
      });
    } catch (error) {
      if (error instanceof LaylaAbortError) return;

      setDreamState({
        characterId: character.id,
        status: "error",
        error: dreamErrorMessage(error),
      });
    } finally {
      if (dreamControllerRef.current === controller) {
        dreamControllerRef.current = null;
      }
    }
  }, [
    canReflectBeforeDream,
    character,
    onSettingsChange,
    onUpdateLaylaCharacter,
    promptDrafts,
    reflectionPromptValues,
    scheduledMessages,
    settingsState,
  ]);

  return (
    <Block
      icon={<MoonStar size={15} />}
      title="Dream"
      action={
        <button
          type="button"
          className="cd-dream-settings-toggle"
          aria-label="Dream settings"
          aria-expanded={isSettingsOpen}
          title="Dream settings"
          onClick={() => setIsSettingsOpen((open) => !open)}
        >
          <Settings size={16} />
        </button>
      }
    >
      <div className="cd-dream-card cd-fade">
        {isSettingsOpen ? (
          <section className="cd-dream-settings-panel" aria-label="Dream settings">
            <div className="cd-dream-settings-actions">
              {settingsUnavailableMessage ? (
                <p>{settingsUnavailableMessage}</p>
              ) : (
                <p>Prompt settings save automatically per character.</p>
              )}
              <button
                type="button"
                className="cd-dream-reset-button"
                disabled={settingsState.status !== "ready"}
                onClick={resetPromptDrafts}
              >
                <RotateCcw size={14} />
                <span>Reset</span>
              </button>
            </div>
            <div className="cd-dream-prompt-grid">
              {DREAM_PROMPT_FIELDS.map((field) => (
                <label key={field.key} className="cd-dream-prompt-field">
                  <span>{field.label}</span>
                  <textarea
                    value={promptDrafts[field.key]}
                    rows={field.rows}
                    spellCheck={false}
                    disabled={settingsState.status !== "ready"}
                    onChange={(event) =>
                      updatePromptDraft(field.key, event.currentTarget.value)
                    }
                  />
                </label>
              ))}
            </div>
            <details className="cd-dream-template-spoiler">
              <summary>Templates</summary>
              <div className="cd-dream-template-table-wrap">
                <table className="cd-dream-template-table">
                  <thead>
                    <tr>
                      <th scope="col">Template</th>
                      <th scope="col">Meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DREAM_TEMPLATE_ROWS.map(([template, description]) => (
                      <tr key={template}>
                        <td>
                          <code>{template}</code>
                        </td>
                        <td>{description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        ) : null}
        <button
          type="button"
          className="cd-dream-button"
          aria-describedby={descriptionId}
          aria-busy={isDreaming}
          disabled={isDreaming || !canDream}
          title={dreamTitle}
          onClick={handleDream}
        >
          <Sparkles size={21} />
          <span>{isDreaming ? "Dreaming..." : "Dream"}</span>
        </button>
        <p id={descriptionId} className="cd-dream-copy">
          Dream will allow {character.name} to reflect on your past
          conversations, form an impression of you, and may even allow them to
          proactively message you during the day!
        </p>
        <div className="cd-dream-schedule" aria-live="polite">
          <p className="cd-dream-schedule-count">
            {isLoadingScheduledMessages
              ? `Checking scheduled messages for ${character.name}...`
              : `${scheduledCount} ${
                  scheduledCount === 1 ? "message" : "messages"
                } scheduled for ${character.name}`}
          </p>
          {scheduledMessagesError ? (
            <p className="cd-dream-schedule-error">
              Scheduled messages unavailable: {scheduledMessagesError}
            </p>
          ) : null}
          {dreamError ? (
            <p className="cd-dream-schedule-error">Dream unavailable: {dreamError}</p>
          ) : null}
          {scheduledCount > 0 ? (
            <details
              key={`${character.id}-${spoilerKey}`}
              className="cd-dream-schedule-spoiler"
            >
              <summary>Reveal scheduled messages</summary>
              <ul className="cd-dream-schedule-list">
                {scheduledMessages.map((scheduledMessage) => (
                  <li key={scheduledMessage.id}>
                    <span className="cd-dream-schedule-time">
                      <Clock size={13} />
                      {formatScheduledTime(scheduledMessage.timestamp)}
                    </span>
                    <p>{scheduledMessage.message}</p>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
    </Block>
  );
}
