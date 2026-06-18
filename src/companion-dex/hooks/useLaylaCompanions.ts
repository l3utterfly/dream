import { useCallback, useEffect, useRef, useState } from "react";
import LaylaSDK, {
  LaylaAbortError,
  LaylaBridgeUnavailableError,
  LaylaError,
  type LaylaChatHistoryEntry,
  type LaylaCharacter,
} from "@layla-network/sdk";
import { DISPLAY_PROFILES } from "../data";
import type { Character } from "../types";

const PAGE_SIZE = 5;
const CHAT_HISTORY_LIMIT = 50;
const layla = new LaylaSDK();

function imageFromCharacterCard(character: LaylaCharacter) {
  const image = character.data.data.extensions.image;
  return typeof image === "string" && image.length > 0 ? image : null;
}

function splitTerms(value: string) {
  return value
    .split(/[,;|]/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function termsFromCharacterCard(character: LaylaCharacter) {
  const data = character.data.data;
  const tags = data.tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0 && tag !== "mock");
  const personality = splitTerms(data.personality);
  return [...tags, ...personality].slice(0, 5);
}

function cleanSentence(value: string | undefined, fallback: string) {
  const sentence = value?.trim().replace(/\s+/g, " ");
  return sentence && sentence.length > 0 ? sentence : fallback;
}

function shortText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}...` : value;
}

async function loadRecentChatHistory(characterId: string, signal: AbortSignal) {
  const { sessions } = await layla.chat.getChatSessions(characterId, 0, CHAT_HISTORY_LIMIT, {
    signal,
  });
  const latestChatSessionId = sessions[0]?.session_id;
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
    chatHistory,
  };
}

function toCompanion(character: LaylaCharacter, index: number, image: string | null): Character {
  const profile = DISPLAY_PROFILES[index % DISPLAY_PROFILES.length];
  const data = character.data.data;
  const name = data.name?.trim() || "Layla Character";
  const cardImage = imageFromCharacterCard(character);
  const description = cleanSentence(data.description, `${name} is ready to chat.`);
  const personality = cleanSentence(data.personality, "open, attentive");
  const terms = termsFromCharacterCard(character);
  const topicTerms = terms.length > 0 ? terms : ["conversation", "memory", "connection"];
  const greeting = cleanSentence(data.first_mes, `Hi, I'm ${name}.`);
  const scenario = cleanSentence(data.scenario, "You are getting to know each other through Layla.");

  return {
    ...profile,
    id: character.id,
    name,
    tagline: shortText(personality.toLowerCase(), 42),
    image: cardImage ?? image ?? undefined,
    moodReason: `${name}'s card feels ${topicTerms.slice(0, 2).join(" and ")} today`,
    daysKnown: 1,
    firstMet: "today",
    lastChat: "just now",
    chatHistory: [],
    isChatHistoryLoaded: false,
    remembers: [
      { fact: shortText(description, 36), fresh: true },
      { fact: shortText(personality, 36) },
      { fact: shortText(scenario, 36) },
    ],
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
    jokes: topicTerms.slice(0, 3),
    topics: topicTerms.map((tag, topicIndex) => ({
      tag,
      weight: Math.max(1, 3 - Math.floor(topicIndex / 2)),
    })),
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
        .then(({ latestChatSessionId, chatHistory }) => {
          setCompanions((current) =>
            current.map((companion) =>
              companion.id === character.id
                ? {
                    ...companion,
                    latestChatSessionId,
                    chatHistory,
                    isChatHistoryLoaded: true,
                    chatHistoryError: undefined,
                  }
                : companion,
            ),
          );
        })
        .catch((historyError) => {
          if (historyError instanceof LaylaAbortError) return;

          setCompanions((current) =>
            current.map((companion) =>
              companion.id === character.id
                ? {
                    ...companion,
                    isChatHistoryLoaded: true,
                    chatHistoryError: messageFromError(historyError),
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
  }, [hydrateChatHistories, hydrateImages]);

  useEffect(() => {
    void loadMore();
    const imageAbortControllers = imageAbortControllersRef.current;
    const chatHistoryAbortControllers = chatHistoryAbortControllersRef.current;

    return () => {
      abortRef.current?.abort();
      imageAbortControllers.forEach((controller) => controller.abort());
      imageAbortControllers.clear();
      chatHistoryAbortControllers.forEach((controller) => controller.abort());
      chatHistoryAbortControllers.clear();
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
