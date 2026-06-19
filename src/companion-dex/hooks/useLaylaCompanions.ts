import { useCallback, useEffect, useRef, useState } from "react";
import LaylaSDK, {
  LaylaAbortError,
  LaylaBridgeUnavailableError,
  LaylaError,
  SENTIMENT_THRESHOLDS,
  type LaylaChatHistoryEntry,
  type LaylaCharacter,
  type LaylaMemory,
  type SentimentValues,
} from "@layla-network/sdk";
import { DISPLAY_PROFILES } from "../data";
import { computeBond, type ScoredText } from "../libs/computeBond";
import type { Character, ChatSentimentData, MemorySentimentData } from "../types";

const PAGE_SIZE = 1;
const CHAT_HISTORY_LIMIT = 50;
const TOP_MEMORY_LIMIT = 3;
const RECENT_MEMORY_LIMIT = 50;
const OPEN_THREAD_LIMIT = 3;
const layla = new LaylaSDK();
const NEUTRAL_SENTIMENT = "neutral";
const DAY_MS = 24 * 60 * 60 * 1000;

type SentimentName = keyof SentimentValues;

function imageFromCharacterCard(character: LaylaCharacter) {
  const image = character.data.data.extensions.image;
  return typeof image === "string" && image.length > 0 ? image : null;
}

function cleanSentence(value: string | undefined, fallback: string) {
  const sentence = value?.trim().replace(/\s+/g, " ");
  return sentence && sentence.length > 0 ? sentence : fallback;
}

function shortText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}...` : value;
}

function cleanMemoryText(memory: LaylaMemory) {
  const text = (memory.summary ?? memory.rawText).trim().replace(/\s+/g, " ");
  return text;
}

function cleanScoredText(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function timestampMilliseconds(timestamp: number | null | undefined) {
  if (timestamp == null || !Number.isFinite(timestamp)) return null;

  return Math.abs(timestamp) < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

function formatLastChat(timestampMs: number | null) {
  if (timestampMs == null) return "no chat yet";

  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) return "no chat yet";

  const elapsedMs = Date.now() - timestampMs;
  if (elapsedMs < 0) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  if (elapsedMs < 60 * 1000) return "just now";
  if (elapsedMs < 60 * 60 * 1000) return `${Math.floor(elapsedMs / (60 * 1000))}m ago`;
  if (elapsedMs < DAY_MS) return `${Math.floor(elapsedMs / (60 * 60 * 1000))}h ago`;
  if (elapsedMs < 7 * DAY_MS) return `${Math.floor(elapsedMs / DAY_MS)}d ago`;

  const options: Intl.DateTimeFormatOptions =
    date.getFullYear() === new Date().getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };

  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function daysKnownFromFirstChat(timestampMs: number | null) {
  if (timestampMs == null) return 0;

  const firstChatDate = new Date(timestampMs);
  if (Number.isNaN(firstChatDate.getTime())) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstChatDay = new Date(firstChatDate);
  firstChatDay.setHours(0, 0, 0, 0);

  return Math.max(0, Math.floor((today.getTime() - firstChatDay.getTime()) / DAY_MS));
}

function chatTimingFromHistory(
  chatHistory: LaylaChatHistoryEntry[],
  latestChatTimestamp: number | null,
) {
  const timestamps = chatHistory
    .map((entry) => timestampMilliseconds(entry.timestamp))
    .filter((timestamp): timestamp is number => timestamp !== null);
  const firstChatTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const lastChatTimestamp =
    latestChatTimestamp ??
    (timestamps.length > 0 ? Math.max(...timestamps) : null);

  return {
    daysKnown: daysKnownFromFirstChat(firstChatTimestamp),
    lastChat: formatLastChat(lastChatTimestamp),
  };
}

function formatSentimentName(sentiment: SentimentName) {
  return sentiment.replace(/_/g, " ");
}

function dominantSentiment(sentimentValue: SentimentValues): SentimentName {
  let bestSentiment: SentimentName | null = null;
  let bestValue = -Infinity;

  for (const emotion of Object.keys(sentimentValue) as SentimentName[]) {
    if (emotion === NEUTRAL_SENTIMENT) continue;

    const value = sentimentValue[emotion];
    const threshold = SENTIMENT_THRESHOLDS[emotion] ?? 1;
    if (value < threshold || value <= bestValue) continue;

    bestSentiment = emotion;
    bestValue = value;
  }

  return bestSentiment ?? NEUTRAL_SENTIMENT;
}

function mainMoodFromSentiment(sentimentValue: SentimentValues) {
  return formatSentimentName(dominantSentiment(sentimentValue));
}

function lastSentenceFromMemory(memory: LaylaMemory) {
  const text = cleanMemoryText(memory);
  const sentences = splitSentences(text);
  return sentences.at(-1) ?? text;
}

function openThreadsFromMemories(memories: LaylaMemory[]) {
  const seenSessionIds = new Set<string>();
  const threads: string[] = [];
  const newestFirstMemories = [...memories].sort((a, b) => b.timestamp - a.timestamp);

  for (const memory of newestFirstMemories) {
    const sessionId = memory.session_id?.trim() ?? "";
    if (!sessionId || seenSessionIds.has(sessionId)) continue;

    const thread = lastSentenceFromMemory(memory);
    if (!thread) continue;

    seenSessionIds.add(sessionId);
    threads.push(thread);

    if (threads.length === OPEN_THREAD_LIMIT) break;
  }

  return threads;
}

function splitSentences(value: string | null) {
  if (!value) return [];

  return (
    value
      .replace(/\s+/g, " ")
      .match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? []
  );
}

async function loadRecentChatHistory(characterId: string, signal: AbortSignal) {
  const { sessions } = await layla.chat.getChatSessions(characterId, 0, CHAT_HISTORY_LIMIT, {
    signal,
  });
  const latestChatSessionId = sessions[0]?.session_id;
  const latestChatTimestamp = timestampMilliseconds(sessions[0]?.last_message_timestamp);
  const chatHistory: LaylaChatHistoryEntry[] = [];

  for (const session of sessions) {
    const remaining = CHAT_HISTORY_LIMIT - chatHistory.length;
    if (remaining <= 0) break;

    const sessionHistory = await layla.chat.getChatHistory(
      session.session_id,
      0,
      remaining,
      {
        signal,
      },
    );
    chatHistory.push(...sessionHistory);
  }

  return {
    latestChatSessionId,
    latestChatTimestamp,
    chatHistory,
  };
}

async function computeChatSentimentFromChatHistory(
  chatHistory: LaylaChatHistoryEntry[],
  signal: AbortSignal,
  onScoredText?: (scoredText: ScoredText) => void,
): Promise<ChatSentimentData> {
  const scoredTexts: ScoredText[] = [];

  for (const entry of chatHistory) {
    const text = cleanScoredText(entry.content);
    if (!text) continue;

    const sentimentValue = await layla.classifier.getSentiment(text, {
      signal,
    });

    const scoredText = {
      text,
      timestamp: entry.timestamp,
      sentimentValue,
    };

    scoredTexts.push(scoredText);
    onScoredText?.(scoredText);
  }

  return { scoredTexts };
}

async function computeMemorySentimentFromMemories(
  memories: LaylaMemory[],
  signal: AbortSignal,
): Promise<MemorySentimentData> {
  const scoredTexts: ScoredText[] = [];

  for (const memory of memories) {
    const text = cleanScoredText(cleanMemoryText(memory));
    if (!text) continue;

    const sentimentValue = await layla.classifier.getSentiment(text, {
      signal,
    });

    scoredTexts.push({
      text,
      timestamp: memory.timestamp,
      sentimentValue,
    });
  }

  return { scoredTexts };
}

function toCompanion(character: LaylaCharacter, index: number, image: string | null): Character {
  const profile = DISPLAY_PROFILES[index % DISPLAY_PROFILES.length];
  const data = character.data.data;
  const name = data.name?.trim() || "Layla Character";
  const cardImage = imageFromCharacterCard(character);
  const description = cleanSentence(data.description, `${name} is ready to chat.`);
  const personality = cleanSentence(data.personality, "open, attentive");
  const greeting = cleanSentence(data.first_mes, `Hi, I'm ${name}.`);
  const scenario = cleanSentence(data.scenario, "You are getting to know each other through Layla.");

  return {
    ...profile,
    id: character.id,
    name,
    image: cardImage ?? image ?? undefined,
    mainMood: "reading latest message",
    daysKnown: 0,
    lastChat: "loading...",
    chatHistory: [],
    isChatHistoryLoaded: false,
    isChatSentimentLoading: true,
    isBondLoading: true,
    isMemoriesLoading: true,
    isMemorySentimentLoading: true,
    remembers: [
      { fact: shortText(description, 36), fresh: true },
      { fact: shortText(personality, 36) },
      { fact: shortText(scenario, 36) },
    ],
    recentMemories: [],
    threads: [shortText(scenario, 88), `Ask ${name} what they want you to notice first.`],
    moments: [
      {
        quote: shortText(greeting, 120),
        context: "opening message from their character card",
        when: "today",
      },
      {
        quote: shortText(description, 120),
        context: "how their card introduces them",
        when: "now",
      },
    ],
    peak:
      profile.mood === "excited"
        ? "early bursts of conversation"
        : profile.mood === "lonely"
          ? "quiet hours"
          : "whenever you return",
    theirRead: "is still forming an impression from your first conversations.",
    impression: `${name}'s card suggests ${shortText(description, 96)}`,
  };
}

function messageFromError(error: unknown) {
  if (error instanceof LaylaBridgeUnavailableError) {
    return "Open this mini-app inside Layla to load characters.";
  }

  if (error instanceof LaylaError) {
    return error.message;
  }

  return "Unable to load Layla characters.";
}

export function useLaylaCompanions() {
  const [companions, setCompanions] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const imageAbortControllersRef = useRef<Set<AbortController>>(new Set());
  const chatHistoryAbortControllersRef = useRef<Set<AbortController>>(new Set());
  const memoriesAbortControllersRef = useRef<Set<AbortController>>(new Set());
  const isLoadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const offsetRef = useRef(0);

  const hydrateImages = useCallback((characters: LaylaCharacter[]) => {
    characters.forEach((character) => {
      if (imageFromCharacterCard(character)) return;

      const controller = new AbortController();
      imageAbortControllersRef.current.add(controller);

      void layla.characters
        .getImage(character.id, {
          signal: controller.signal,
        })
        .then((image) => {
          if (!image) return;

          setCompanions((current) =>
            current.map((companion) =>
              companion.id === character.id && !companion.image
                ? { ...companion, image }
                : companion,
            ),
          );
        })
        .catch((imageError) => {
          if (imageError instanceof LaylaAbortError) return;
        })
        .finally(() => {
          imageAbortControllersRef.current.delete(controller);
        });
    });
  }, []);

  const hydrateChatHistories = useCallback((characters: LaylaCharacter[]) => {
    characters.forEach((character) => {
      const controller = new AbortController();
      chatHistoryAbortControllersRef.current.add(controller);

      void loadRecentChatHistory(character.id, controller.signal)
        .then(async ({ latestChatSessionId, latestChatTimestamp, chatHistory }) => {
          let hasSetLatestMood = false;
          const chatTiming = chatTimingFromHistory(chatHistory, latestChatTimestamp);
          const chatSentimentPromise = computeChatSentimentFromChatHistory(
            chatHistory,
            controller.signal,
            (scoredText) => {
              if (hasSetLatestMood) return;

              hasSetLatestMood = true;
              const mainMood = mainMoodFromSentiment(scoredText.sentimentValue);

              setCompanions((current) =>
                current.map((companion) =>
                  companion.id === character.id ? { ...companion, mainMood } : companion,
                ),
              );
            },
          );
          const fallbackMainMood =
            chatHistory.some((entry) => cleanScoredText(entry.content))
              ? "reading latest message"
              : "no chat yet";

          setCompanions((current) =>
            current.map((companion) =>
              companion.id === character.id
                ? {
                    ...companion,
                    latestChatSessionId,
                    chatHistory,
                    daysKnown: chatTiming.daysKnown,
                    lastChat: chatTiming.lastChat,
                    mainMood: fallbackMainMood,
                    isChatHistoryLoaded: true,
                    chatHistoryError: undefined,
                    chatSentiment: undefined,
                    chatSentimentPromise,
                    isChatSentimentLoading: true,
                    chatSentimentError: undefined,
                  }
                : companion,
            ),
          );

          try {
            const chatSentiment = await chatSentimentPromise;
            const bond = computeBond(chatSentiment.scoredTexts);

            setCompanions((current) =>
              current.map((companion) =>
                companion.id === character.id
                  ? {
                      ...companion,
                      chatSentiment,
                      chatSentimentPromise,
                      mainMood:
                        chatSentiment.scoredTexts.length > 0
                          ? mainMoodFromSentiment(chatSentiment.scoredTexts[0].sentimentValue)
                          : "no chat yet",
                      isChatSentimentLoading: false,
                      chatSentimentError: undefined,
                      bond,
                      isBondLoading: false,
                      bondError: undefined,
                    }
                  : companion,
              ),
            );
          } catch (chatSentimentError) {
            if (chatSentimentError instanceof LaylaAbortError) return;

            setCompanions((current) =>
              current.map((companion) =>
                companion.id === character.id
                  ? {
                      ...companion,
                      chatSentiment: undefined,
                      chatSentimentPromise,
                      isChatSentimentLoading: false,
                      mainMood: "mood unavailable",
                      chatSentimentError: messageFromError(chatSentimentError),
                      isBondLoading: false,
                      bondError: messageFromError(chatSentimentError),
                    }
                  : companion,
              ),
            );
          }
        })
        .catch((historyError) => {
          if (historyError instanceof LaylaAbortError) return;

          setCompanions((current) =>
            current.map((companion) =>
              companion.id === character.id
                ? {
                    ...companion,
                    daysKnown: 0,
                    lastChat: "unavailable",
                    isChatHistoryLoaded: true,
                    mainMood: "mood unavailable",
                    chatHistoryError: messageFromError(historyError),
                    isChatSentimentLoading: false,
                    chatSentimentError: messageFromError(historyError),
                    isBondLoading: false,
                    bondError: messageFromError(historyError),
                  }
                : companion,
            ),
          );
        })
        .finally(() => {
          chatHistoryAbortControllersRef.current.delete(controller);
        });
    });
  }, []);

  const hydrateMemories = useCallback((characters: LaylaCharacter[]) => {
    characters.forEach((character) => {
      const controller = new AbortController();
      memoriesAbortControllersRef.current.add(controller);

      void Promise.all([
        layla.memories.getTopMemories(character.id, TOP_MEMORY_LIMIT, {
          signal: controller.signal,
        }),
        layla.memories.list(character.id, 0, RECENT_MEMORY_LIMIT, {
          signal: controller.signal,
        }),
      ])
        .then(async ([topMemories, recentMemories]) => {
          const remembers = topMemories
            .map(cleanMemoryText)
            .filter(Boolean)
            .slice(0, TOP_MEMORY_LIMIT)
            .map((fact, index) => ({
              fact,
              fresh: index === 0,
            }));
          const threads = openThreadsFromMemories(recentMemories);
          const memorySentimentPromise = computeMemorySentimentFromMemories(
            recentMemories,
            controller.signal,
          );

          setCompanions((current) =>
            current.map((companion) =>
              companion.id === character.id
                ? {
                    ...companion,
                    remembers,
                    recentMemories,
                    threads,
                    isMemoriesLoading: false,
                    memoriesError: undefined,
                    memorySentiment: undefined,
                    memorySentimentPromise,
                    isMemorySentimentLoading: true,
                    memorySentimentError: undefined,
                  }
                : companion,
            ),
          );

          try {
            const memorySentiment = await memorySentimentPromise;

            setCompanions((current) =>
              current.map((companion) =>
                companion.id === character.id
                  ? {
                      ...companion,
                      memorySentiment,
                      memorySentimentPromise,
                      isMemorySentimentLoading: false,
                      memorySentimentError: undefined,
                    }
                  : companion,
              ),
            );
          } catch (memorySentimentError) {
            if (memorySentimentError instanceof LaylaAbortError) return;

            setCompanions((current) =>
              current.map((companion) =>
                companion.id === character.id
                  ? {
                      ...companion,
                      memorySentiment: undefined,
                      memorySentimentPromise,
                      isMemorySentimentLoading: false,
                      memorySentimentError: messageFromError(memorySentimentError),
                    }
                  : companion,
              ),
            );
          }
        })
        .catch((memoriesError) => {
          if (memoriesError instanceof LaylaAbortError) return;

          setCompanions((current) =>
            current.map((companion) =>
              companion.id === character.id
                ? {
                    ...companion,
                    remembers: [],
                    recentMemories: [],
                    threads: [],
                    isMemoriesLoading: false,
                    memoriesError: messageFromError(memoriesError),
                    isMemorySentimentLoading: false,
                    memorySentimentError: messageFromError(memoriesError),
                  }
                : companion,
            ),
          );
        })
        .finally(() => {
          memoriesAbortControllersRef.current.delete(controller);
        });
    });
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingRef.current) {
      if (!abortRef.current?.signal.aborted) return 0;

      abortRef.current = null;
      isLoadingRef.current = false;
    }

    if (!hasMoreRef.current) return 0;

    const offset = offsetRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const laylaCharacters = await layla.characters.list(offset, PAGE_SIZE, {
        signal: controller.signal,
      });
      const nextCompanions = laylaCharacters.map((character, index) =>
        toCompanion(character, offset + index, null),
      );

      setCompanions((current) => [...current, ...nextCompanions]);
      offsetRef.current = offset + laylaCharacters.length;
      hasMoreRef.current = laylaCharacters.length === PAGE_SIZE;
      setHasMore(hasMoreRef.current);
      hydrateImages(laylaCharacters);
      hydrateChatHistories(laylaCharacters);
      hydrateMemories(laylaCharacters);

      return nextCompanions.length;
    } catch (loadError) {
      if (!(loadError instanceof LaylaAbortError)) {
        setError(messageFromError(loadError));
      }

      return 0;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    }
  }, [hydrateChatHistories, hydrateImages, hydrateMemories]);

  useEffect(() => {
    void loadMore();
    const imageAbortControllers = imageAbortControllersRef.current;
    const chatHistoryAbortControllers = chatHistoryAbortControllersRef.current;
    const memoriesAbortControllers = memoriesAbortControllersRef.current;

    return () => {
      abortRef.current?.abort();
      imageAbortControllers.forEach((controller) => controller.abort());
      imageAbortControllers.clear();
      chatHistoryAbortControllers.forEach((controller) => controller.abort());
      chatHistoryAbortControllers.clear();
      memoriesAbortControllers.forEach((controller) => controller.abort());
      memoriesAbortControllers.clear();
    };
  }, [loadMore]);

  return {
    companions,
    error,
    hasMore,
    isLoading,
    loadMore,
  };
}
