import { useEffect, useState } from "react";
import {
  LaylaAbortError,
  LaylaBridgeUnavailableError,
  LaylaError,
  type LaylaScheduledChatMessage,
} from "@layla-network/sdk";
import { Clock, MoonStar, Sparkles } from "lucide-react";
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

function scheduledMessagesErrorMessage(error: unknown) {
  if (error instanceof LaylaBridgeUnavailableError) {
    return "Open this mini-app inside Layla to check scheduled messages.";
  }

  if (error instanceof LaylaError) return error.message;
  if (error instanceof Error) return error.message;

  return "Unable to check scheduled messages.";
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

export function DreamSection({ character }: DreamSectionProps) {
  const descriptionId = `dream-description-${character.id}`;
  const [scheduledMessagesState, setScheduledMessagesState] =
    useState<ScheduledMessagesState>({
      characterId: character.id,
      status: "loading",
      messages: [],
    });

  useEffect(() => {
    const controller = new AbortController();

    void layla.chat
      .getScheduledChatMessages({
        signal: controller.signal,
      })
      .then((scheduledMessages) => {
        const messages = scheduledMessages
          .filter((message) => message.character_id === character.id)
          .sort((a, b) => a.timestamp - b.timestamp);

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

  const activeScheduleState =
    scheduledMessagesState.characterId === character.id
      ? scheduledMessagesState
      : null;
  const isLoadingScheduledMessages =
    !activeScheduleState || activeScheduleState.status === "loading";
  const scheduledMessages =
    activeScheduleState?.status === "ready" ? activeScheduleState.messages : [];
  const scheduledMessagesError =
    activeScheduleState?.status === "error" ? activeScheduleState.error : null;
  const scheduledCount = scheduledMessages.length;

  return (
    <Block icon={<MoonStar size={15} />} title="Dream">
      <div className="cd-dream-card cd-fade">
        <button
          type="button"
          className="cd-dream-button"
          aria-describedby={descriptionId}
        >
          <Sparkles size={21} />
          <span>Dream</span>
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
          {scheduledCount > 0 ? (
            <details className="cd-dream-schedule-spoiler">
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
