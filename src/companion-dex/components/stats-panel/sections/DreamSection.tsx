import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LaylaAbortError,
  LaylaBridgeUnavailableError,
  LaylaError,
  type LaylaScheduledChatMessage,
} from "@layla-network/sdk";
import { Clock, MoonStar, Sparkles } from "lucide-react";
import {
  continueConversation,
  dreamSelectionCandidates,
  scheduleOutOfBlueMessage,
  selectRandomDreamCandidate,
} from "../../../libs/dream";
import type { Character } from "../../../types";
import { layla } from "../laylaClient";
import { Block } from "../../MetricSections";

interface DreamSectionProps {
  character: Character;
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

export function DreamSection({ character }: DreamSectionProps) {
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

  const refreshScheduledMessages = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const scheduledMessages = await layla.chat.getScheduledChatMessages({
          signal,
        });
        const messages = scheduledMessagesForCharacter(
          scheduledMessages,
          character.id,
        );

        setScheduledMessagesState({
          characterId: character.id,
          status: "ready",
          messages,
        });
      } catch (error) {
        if (error instanceof LaylaAbortError) return;

        setScheduledMessagesState({
          characterId: character.id,
          status: "error",
          messages: [],
          error: scheduledMessagesErrorMessage(error),
        });
      }
    },
    [character.id],
  );

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
  } else if (dreamCandidateCount === 0) {
    dreamTitle = "No unscheduled conversation sessions";
  }
  const spoilerKey = scheduledMessages.map((message) => message.id).join("-");

  const handleDream = useCallback(async () => {
    dreamControllerRef.current?.abort();
    const controller = new AbortController();
    dreamControllerRef.current = controller;

    setDreamState({
      characterId: character.id,
      status: "loading",
    });

    try {
      const selectedDream = selectRandomDreamCandidate(
        character.chatHistory,
        scheduledMessages,
        character.id,
      );

      if (selectedDream.kind === "continue") {
        await continueConversation(selectedDream.messages, character, {
          layla,
          signal: controller.signal,
        });
      } else {
        await scheduleOutOfBlueMessage(character, {
          layla,
          signal: controller.signal,
        });
      }
      setDreamState({
        characterId: character.id,
        status: "done",
      });
      setScheduledMessagesState({
        characterId: character.id,
        status: "loading",
        messages: [],
      });
      await refreshScheduledMessages(controller.signal);
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
  }, [character, refreshScheduledMessages, scheduledMessages]);

  return (
    <Block icon={<MoonStar size={15} />} title="Dream">
      <div className="cd-dream-card cd-fade">
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
