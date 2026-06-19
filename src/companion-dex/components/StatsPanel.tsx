import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import cloud from "d3-cloud";
import {
  Brain,
  Clock,
  Coffee,
  Cookie,
  Hand,
  Heart,
  Laugh,
  ListChecks,
  MessageCircle,
  Quote,
  Smile,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import LaylaSDK, {
  LaylaAbortError,
  LaylaBridgeUnavailableError,
  LaylaError,
  type ChatCompletionStream,
} from "@layla-network/sdk";
import { eng, removeStopwords } from "stopword";
import { selectMomentsWorthKeeping } from "../libs/selectMomentsWorthKeeping";
import {
  buildReadOnYouMessages,
  getCharacterName,
  getUserName,
} from "../libs/readOnYou";
import type { Character, MemorySentimentData, Theme } from "../types";
import { Avatar } from "./Avatar";
import { Bar, Block, Heatmap, SectionSpinner, Vital } from "./MetricSections";
import { CountNum } from "./CountNum";

const EMPTY_MEMORY_SENTIMENT: MemorySentimentData = { scoredTexts: [] };
const EMPTY_TALK_HISTOGRAM = {
  hours: Array.from({ length: 24 }, () => 0),
  peak: "whenever you return",
  total: 0,
};
const PRIVATE_LANGUAGE_WIDTH = 432;
const PRIVATE_LANGUAGE_HEIGHT = 190;
const PRIVATE_LANGUAGE_WORD_LIMIT = 34;
const EXTRA_PRIVATE_LANGUAGE_STOPWORDS = [
  "cant",
  "character",
  "chat",
  "chats",
  "conversation",
  "conversations",
  "didnt",
  "doesnt",
  "dont",
  "feel",
  "feels",
  "felt",
  "gonna",
  "history",
  "ive",
  "just",
  "layla",
  "like",
  "likes",
  "memory",
  "memories",
  "message",
  "messages",
  "really",
  "remember",
  "remembered",
  "remembering",
  "remembers",
  "reply",
  "replies",
  "said",
  "someone",
  "talk",
  "talked",
  "talking",
  "tend",
  "tends",
  "thats",
  "theyre",
  "thing",
  "things",
  "wanna",
  "youll",
  "youre",
  "youve",
  "i'm",
  "im",
  "okay",
];

const layla = new LaylaSDK();

type ReflectionStatus = "idle" | "loading" | "done" | "error";

interface PrivateLanguageWord {
  text: string;
  value: number;
  size: number;
  x?: number;
  y?: number;
  rotate?: number;
}

interface ReflectionState {
  characterId: string;
  status: ReflectionStatus;
  text: string;
  error?: string;
}

function reflectionErrorMessage(error: unknown) {
  if (error instanceof LaylaBridgeUnavailableError) {
    return "Open this mini-app inside Layla to reflect.";
  }

  if (error instanceof LaylaError) {
    return error.message;
  }

  return "Unable to complete reflection.";
}
function formatMomentDate(timestamp: number) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "sometime";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const momentDay = new Date(date);
  momentDay.setHours(0, 0, 0, 0);
  const daysAgo = Math.round(
    (today.getTime() - momentDay.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (daysAgo === 0) return "today";
  if (daysAgo === 1) return "yesterday";
  if (daysAgo > 1 && daysAgo < 7) return `${daysAgo} days ago`;

  const options: Intl.DateTimeFormatOptions =
    date.getFullYear() === new Date().getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };

  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function dateFromTimestamp(timestamp: number) {
  if (!Number.isFinite(timestamp)) return null;

  const milliseconds =
    Math.abs(timestamp) < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatHour(hour: number) {
  const date = new Date(2020, 0, 1, hour);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(date);
}

function summarizePeakHour(hours: number[]) {
  const peakCount = Math.max(...hours);
  if (peakCount <= 0) return "whenever you return";

  const peakHour = hours.findIndex((count) => count === peakCount);
  return `around ${formatHour(peakHour)}`;
}

function buildTalkHistogram(chatHistory: Character["chatHistory"]) {
  if (chatHistory.length === 0) return EMPTY_TALK_HISTOGRAM;

  const hours = Array.from({ length: 24 }, () => 0);
  let total = 0;

  for (const entry of chatHistory) {
    const date = dateFromTimestamp(entry.timestamp);
    if (!date) continue;

    hours[date.getHours()] += 1;
    total += 1;
  }

  return {
    hours,
    peak: summarizePeakHour(hours),
    total,
  };
}

function dayOrdinalFromTimestamp(timestamp: number) {
  const date = dateFromTimestamp(timestamp);
  if (!date) return null;

  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  );
}

function countLongestDayStreak(chatHistory: Character["chatHistory"]) {
  const days = Array.from(
    new Set(
      chatHistory
        .map((entry) => dayOrdinalFromTimestamp(entry.timestamp))
        .filter((day): day is number => day !== null),
    ),
  ).sort((a, b) => a - b);

  let longest = 0;
  let current = 0;
  let previous: number | null = null;

  for (const day of days) {
    current = previous !== null && day === previous + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = day;
  }

  return longest;
}

function countUniqueHighIntensityEmotions(character: Character) {
  const emotions = new Set<string>();

  for (const scoredText of character.chatSentiment?.scoredTexts ?? []) {
    for (const [emotion, intensity] of Object.entries(
      scoredText.sentimentValue,
    )) {
      if (emotion !== "neutral" && intensity > 0.5) {
        emotions.add(emotion);
      }
    }
  }

  return emotions.size;
}

function cleanPrivateLanguageText(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function hasPrivateLanguageSource(character: Character) {
  return (
    character.chatHistory.some((entry) =>
      cleanPrivateLanguageText(entry.content),
    ) ||
    character.recentMemories.some((memory) =>
      cleanPrivateLanguageText(memory.summary ?? memory.rawText),
    )
  );
}

function tokenizePrivateLanguage(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[’]/g, "'")
      .replace(/['"]s\b/g, "")
      .match(/[\p{L}\p{N}][\p{L}\p{N}'_-]*/gu)
      ?.map((token) => token.replace(/^[-_']+|[-_']+$/g, ""))
      .filter((token) => token.length >= 3 && !/^\d+$/.test(token)) ?? []
  );
}

function nameStopwords(...names: string[]) {
  return names.flatMap((name) => tokenizePrivateLanguage(name));
}

function buildPrivateLanguageWords(
  characterName: string,
  userName: string,
  chatHistory: Character["chatHistory"],
  recentMemories: Character["recentMemories"],
): PrivateLanguageWord[] {
  const sources = [
    ...chatHistory.map((entry) => entry.content),
    ...recentMemories.map((memory) => memory.summary ?? memory.rawText),
  ];
  const tokens = tokenizePrivateLanguage(sources.join(" "));
  const stopwords = [
    ...eng,
    ...EXTRA_PRIVATE_LANGUAGE_STOPWORDS,
    ...nameStopwords(characterName, userName),
  ];
  const words = removeStopwords(tokens, stopwords);
  const counts = new Map<string, number>();

  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  const ranked = Array.from(counts, ([text, value]) => ({ text, value }))
    .sort((a, b) => b.value - a.value || a.text.localeCompare(b.text))
    .slice(0, PRIVATE_LANGUAGE_WORD_LIMIT);
  const max = Math.max(...ranked.map((word) => word.value), 1);
  const min = Math.min(...ranked.map((word) => word.value), max);

  return ranked.map((word) => {
    const t = max === min ? 0.62 : (word.value - min) / (max - min);
    return {
      ...word,
      size: Math.round(15 + Math.pow(t, 0.72) * 23),
    };
  });
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededRandom(seedText: string) {
  let seed = hashString(seedText) || 1;

  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function PrivateLanguageCloud({ character }: { character: Character }) {
  const characterName = getCharacterName(character);
  const userName = getUserName(character);
  const words = useMemo(
    () =>
      buildPrivateLanguageWords(
        characterName,
        userName,
        character.chatHistory,
        character.recentMemories,
      ),
    [character.chatHistory, characterName, character.recentMemories, userName],
  );
  const layoutSeed = useMemo(
    () =>
      `${character.id}:${words
        .map((word) => `${word.text}:${word.value}`)
        .join("|")}`,
    [character.id, words],
  );
  const [layoutState, setLayoutState] = useState<{
    seed: string;
    words: PrivateLanguageWord[];
  } | null>(null);
  const layoutWords = layoutState?.seed === layoutSeed ? layoutState.words : [];

  useEffect(() => {
    let cancelled = false;

    if (words.length === 0) return undefined;

    const layout = cloud<PrivateLanguageWord>()
      .size([PRIVATE_LANGUAGE_WIDTH, PRIVATE_LANGUAGE_HEIGHT])
      .words(words.map((word) => ({ ...word })))
      .padding((word) => (word.value > 2 ? 3 : 2))
      .rotate(() => 0)
      .font("Fredoka")
      .fontWeight((word) => (word.value > 2 ? 700 : 600))
      .fontSize((word) => word.size)
      .random(seededRandom(layoutSeed))
      .on("end", (placedWords) => {
        if (cancelled) return;
        setLayoutState({
          seed: layoutSeed,
          words: placedWords.filter(
            (word) => typeof word.x === "number" && typeof word.y === "number",
          ),
        });
      });

    layout.start();

    return () => {
      cancelled = true;
      layout.stop();
    };
  }, [layoutSeed, words]);

  if (words.length === 0) {
    return (
      <p
        className="cd-fade"
        style={{
          margin: 0,
          fontSize: 13.5,
          color: "var(--ink-2)",
          lineHeight: 1.45,
        }}
      >
        No private language yet.
      </p>
    );
  }

  return (
    <div className="cd-language-cloud" aria-live="polite">
      {layoutWords.length === 0 ? (
        <SectionSpinner label="Shaping private language" />
      ) : (
        <svg
          role="img"
          aria-label={`Word cloud from your chats and memories with ${character.name}`}
          viewBox={`0 0 ${PRIVATE_LANGUAGE_WIDTH} ${PRIVATE_LANGUAGE_HEIGHT}`}
        >
          <g
            transform={`translate(${PRIVATE_LANGUAGE_WIDTH / 2} ${PRIVATE_LANGUAGE_HEIGHT / 2})`}
          >
            {layoutWords.map((word) => (
              <text
                key={`${word.text}-${word.value}`}
                textAnchor="middle"
                transform={`translate(${word.x ?? 0} ${word.y ?? 0})`}
                style={{
                  fill: word.value > 2 ? "var(--deep)" : "var(--ink-1)",
                  fontFamily: "var(--display)",
                  fontSize: word.size,
                  fontWeight: word.value > 2 ? 700 : 600,
                  opacity: Math.min(1, 0.52 + word.value * 0.12),
                }}
              >
                <title>
                  {word.text} · {word.value}{" "}
                  {word.value === 1 ? "time" : "times"}
                </title>
                {word.text}
              </text>
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}

interface StatsPanelProps {
  character: Character;
  theme: Theme;
  imageFailed: boolean;
}

export function StatsPanel({ character, theme, imageFailed }: StatsPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [vitalTaps, setVitalTaps] = useState({
    characterId: character.id,
    energy: 0,
    fed: 0,
    social: 0,
  });

  const [reflection, setReflection] = useState<ReflectionState>({
    characterId: character.id,
    status: "idle",
    text: "",
  });
  const reflectionStreamRef = useRef<ChatCompletionStream | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
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

  const activeVitalTaps =
    vitalTaps.characterId === character.id
      ? vitalTaps
      : { characterId: character.id, energy: 0, fed: 0, social: 0 };
  const v = (n: number) => (mounted ? n : 0);
  const vitalValue = (key: keyof Character["vitals"]) =>
    v(character.vitals[key] + activeVitalTaps[key]);
  const tapVital = (key: keyof Character["vitals"]) => {
    setVitalTaps((current) => {
      const nextTaps =
        current.characterId === character.id
          ? current
          : { characterId: character.id, energy: 0, fed: 0, social: 0 };
      return { ...nextTaps, [key]: nextTaps[key] + 1 };
    });
  };
  const handleReflect = useCallback(async () => {
    reflectionStreamRef.current?.abort();
    setReflection({
      characterId: character.id,
      status: "loading",
      text: "",
    });

    let stream: ChatCompletionStream | null = null;

    try {
      stream = layla.chat.completions.stream({
        messages: buildReadOnYouMessages(character),
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
  }, [character]);

  const trend = character.bond?.trend;
  const trendTimespan = trend
    ? trend.timespanWeeks > 0
      ? `${trend.timespanWeeks} ${trend.timespanWeeks === 1 ? "week" : "weeks"}`
      : trend.timespanDays > 0
        ? `${trend.timespanDays} ${trend.timespanDays === 1 ? "day" : "days"}`
        : "today"
    : "today";
  const trendDifference = trend?.difference ?? 0;
  const momentsWorthKeeping = useMemo(() => {
    if (!character.chatSentiment) return [];

    return selectMomentsWorthKeeping(
      character.chatSentiment,
      character.memorySentiment ?? EMPTY_MEMORY_SENTIMENT,
    );
  }, [character.chatSentiment, character.memorySentiment]);
  const talkHistogram = useMemo(
    () => buildTalkHistogram(character.chatHistory),
    [character.chatHistory],
  );
  const byTheNumbers = useMemo(
    () => ({
      chatHistories: character.chatHistory.length,
      dayStreak: countLongestDayStreak(character.chatHistory),
      emotions: countUniqueHighIntensityEmotions(character),
    }),
    [character],
  );
  const momentsLoading =
    character.isChatSentimentLoading ||
    (character.isMemorySentimentLoading &&
      !character.memorySentiment &&
      !character.memorySentimentError);
  const activeReflection =
    reflection.characterId === character.id ? reflection : null;
  const isReflecting = activeReflection?.status === "loading";
  const reflectedText = activeReflection?.text.trim()
    ? activeReflection.text
    : "";
  const reflectionError =
    activeReflection?.status === "error" ? activeReflection.error : undefined;
  const canReflect =
    character.isChatHistoryLoaded &&
    !character.chatHistoryError &&
    !character.isMemoriesLoading &&
    !character.memoriesError &&
    character.recentMemories.length > 0;
  const reflectDisabled = isReflecting || !canReflect;
  const privateLanguageLoading =
    !character.isChatHistoryLoaded || character.isMemoriesLoading;
  const privateLanguageHasSource = hasPrivateLanguageSource(character);
  const privateLanguageError =
    [character.chatHistoryError, character.memoriesError]
      .filter(Boolean)
      .join(" ") || undefined;
  const statItems = [
    {
      node: <CountNum value={byTheNumbers.dayStreak} />,
      small: "day streak",
      icon: <Coffee size={15} />,
    },
    {
      node: (
        <CountNum
          value={byTheNumbers.chatHistories}
          format={(n) => n.toLocaleString()}
        />
      ),
      small: "chat histories",
      icon: <MessageCircle size={15} />,
    },
    {
      node: <CountNum value={byTheNumbers.emotions} />,
      small: "emotions",
      icon: <Laugh size={15} />,
    },
  ];

  return (
    <div style={{ padding: "0 24px 8px" }}>
      <div
        key={`id-${character.id}`}
        className="cd-fade"
        style={{ textAlign: "center" }}
      >
        <Avatar character={character} theme={theme} failed={imageFailed} />
        <h2
          style={{
            fontFamily: "var(--display)",
            fontSize: 38,
            margin: "16px 0 0",
            color: "var(--text)",
            lineHeight: 1,
          }}
        >
          {character.name}
        </h2>
        <p
          style={{
            margin: "12px 0 0",
            fontSize: 14,
            color: "var(--ink-1)",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            maxWidth: 360,
          }}
        >
          <span className="cd-mood-dot" />
          <span>
            <strong style={{ color: "var(--deep)", textTransform: "capitalize" }}>
              {character.mainMood}
            </strong>{" "}
            — From last message
          </span>
        </p>
        <div
          style={{
            marginTop: 14,
            display: "flex",
            justifyContent: "center",
            gap: 12,
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: "var(--ink-2)",
          }}
        >
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <Clock size={12} /> {character.lastChat}
          </span>
          <span>·</span>
          <span>
            {character.daysKnown} days
          </span>
        </div>
      </div>

      <Block icon={<Heart size={15} />} title="Your bond">
        {character.isBondLoading ? (
          <SectionSpinner label="Reading conversation signal" />
        ) : character.bondError ? (
          <p
            className="cd-fade"
            style={{
              margin: 0,
              fontSize: 13.5,
              color: "var(--ink-2)",
              lineHeight: 1.45,
            }}
          >
            Bond unavailable: {character.bondError}
          </p>
        ) : character.bond ? (
          <div key={`bond-${character.id}`} className="cd-fade">
            <Bar label="WARMTH" value={v(character.bond.warmth)} />
            <Bar label="DEPTH" value={v(character.bond.depth)} />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 16,
              }}
            >
              <span
                style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 600 }}
              >
                trend · {trendTimespan}
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 13,
                  fontWeight: 700,
                  color: trendDifference >= 0 ? "var(--deep)" : "var(--muted)",
                  fontFamily: "var(--mono)",
                  transition: "color .5s",
                }}
              >
                {trendDifference >= 0 ? (
                  <TrendingUp size={15} />
                ) : (
                  <TrendingDown size={15} />
                )}
                {trendDifference >= 0 ? "+" : ""}
                {trendDifference}
              </span>
            </div>
          </div>
        ) : null}
      </Block>

      <Block icon={<Sparkles size={15} />} title="How they're doing">
        <div style={{ display: "flex", gap: 8 }}>
          <Vital
            icon={<Zap size={18} />}
            label="Poke"
            value={vitalValue("energy")}
            onTap={() => tapVital("energy")}
          />
          <Vital
            icon={<Cookie size={18} />}
            label="Feed"
            value={vitalValue("fed")}
            onTap={() => tapVital("fed")}
          />
          <Vital
            icon={<Hand size={18} />}
            label="Wave"
            value={vitalValue("social")}
            onTap={() => tapVital("social")}
          />
        </div>
      </Block>

      <Block icon={<Brain size={15} />} title="Holds in mind about you">
        {character.isMemoriesLoading ? (
          <SectionSpinner label="Gathering memories" />
        ) : character.memoriesError ? (
          <p
            className="cd-fade"
            style={{
              margin: 0,
              fontSize: 13.5,
              color: "var(--ink-2)",
              lineHeight: 1.45,
            }}
          >
            Memories unavailable: {character.memoriesError}
          </p>
        ) : character.remembers.length > 0 ? (
          <div
            key={`rem-${character.id}`}
            className="cd-memory-scroller cd-fade"
            aria-label={`Top memories ${character.name} holds about you`}
          >
            {character.remembers.map((memory, i) => (
              <figure
                key={i}
                className={
                  memory.fresh
                    ? "cd-memory-card cd-memory-card-primary"
                    : "cd-memory-card"
                }
              >
                <blockquote>{memory.fact}</blockquote>
              </figure>
            ))}
          </div>
        ) : (
          <p
            className="cd-fade"
            style={{
              margin: 0,
              fontSize: 13.5,
              color: "var(--ink-2)",
              lineHeight: 1.45,
            }}
          >
            No memories yet.
          </p>
        )}
      </Block>

      <Block icon={<ListChecks size={15} />} title="Open threads">
        <div key={`thr-${character.id}`} className="cd-fade">
          {character.threads.map((thread, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 11,
                alignItems: "flex-start",
                padding: "9px 0",
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 6,
                  border: "2px solid var(--primary)",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              />
              <span
                style={{
                  fontSize: 14.5,
                  color: "var(--ink-1)",
                  lineHeight: 1.45,
                }}
              >
                {thread}
              </span>
            </div>
          ))}
        </div>
      </Block>

      <Block icon={<Quote size={15} />} title="Moments worth keeping">
        {momentsLoading ? (
          <SectionSpinner label="Finding keepable moments" />
        ) : character.chatSentimentError ? (
          <p
            className="cd-fade"
            style={{
              margin: 0,
              fontSize: 13.5,
              color: "var(--ink-2)",
              lineHeight: 1.45,
            }}
          >
            Moments unavailable: {character.chatSentimentError}
          </p>
        ) : momentsWorthKeeping.length > 0 ? (
          <div key={`mom-${character.id}`} className="cd-fade">
            {momentsWorthKeeping.map((moment, i) => (
              <figure
                key={`${moment.timestamp}-${i}`}
                className={
                  i === 0
                    ? "cd-moment-card cd-moment-card-primary"
                    : "cd-moment-card"
                }
              >
                <blockquote>&ldquo;{moment.quote}&rdquo;</blockquote>
                <figcaption>
                  {moment.summary ? <span>{moment.summary}</span> : null}
                  <time dateTime={new Date(moment.timestamp).toISOString()}>
                    {formatMomentDate(moment.timestamp)}
                  </time>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p
            className="cd-fade"
            style={{
              margin: 0,
              fontSize: 13.5,
              color: "var(--ink-2)",
              lineHeight: 1.45,
            }}
          >
            No keepable moments yet.
          </p>
        )}
      </Block>

      <Block icon={<Clock size={15} />} title="When you two talk">
        {!character.isChatHistoryLoaded ? (
          <SectionSpinner label="Mapping talk rhythm" />
        ) : character.chatHistoryError ? (
          <p
            className="cd-fade"
            style={{
              margin: 0,
              fontSize: 13.5,
              color: "var(--ink-2)",
              lineHeight: 1.45,
            }}
          >
            Talk pattern unavailable: {character.chatHistoryError}
          </p>
        ) : talkHistogram.total > 0 ? (
          <Heatmap hours={talkHistogram.hours} peak={talkHistogram.peak} />
        ) : (
          <p
            className="cd-fade"
            style={{
              margin: 0,
              fontSize: 13.5,
              color: "var(--ink-2)",
              lineHeight: 1.45,
            }}
          >
            No chat history yet.
          </p>
        )}
      </Block>

      <Block
        icon={<Smile size={15} />}
        title="Their Impression of You"
        action={
          <button
            type="button"
            className="cd-reflect-button"
            onClick={handleReflect}
            disabled={reflectDisabled}
            aria-busy={isReflecting}
            title={
              canReflect ? "Reflect" : "Waiting for chat history and memories"
            }
          >
            <Sparkles size={14} />
            <span>Reflect</span>
          </button>
        }
      >
        <div
          key={`read-${character.id}`}
          className="cd-fade"
          aria-live="polite"
        >
          {reflectedText ? (
            <p className="cd-reflection-text">
              {reflectedText}
              {isReflecting ? (
                <span className="cd-reflection-caret" aria-hidden />
              ) : null}
            </p>
          ) : isReflecting ? (
            <div
              className="cd-reflection-loading"
              role="status"
              aria-label="Reflecting"
            >
              <span className="cd-reflection-orbit" aria-hidden>
                <span />
                <span />
                <span />
              </span>
              <span className="cd-reflection-shimmer" aria-hidden />
              <span
                className="cd-reflection-shimmer cd-reflection-shimmer-short"
                aria-hidden
              />
            </div>
          ) : (
            <>
              <p
                style={{
                  margin: 0,
                  fontSize: 15.5,
                  lineHeight: 1.55,
                  color: "var(--ink-1)",
                }}
              >
                Right now, {character.name} {character.theirRead}
              </p>
              <p
                style={{
                  margin: "12px 0 0",
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: "var(--ink-2)",
                  fontStyle: "italic",
                }}
              >
                {character.impression}
              </p>
            </>
          )}
          {reflectionError ? (
            <p className="cd-reflection-error">
              Reflection unavailable: {reflectionError}
            </p>
          ) : null}
        </div>
      </Block>

      <Block icon={<TrendingUp size={15} />} title="By the numbers">
        <div style={{ display: "flex" }}>
          {statItems.map((stat, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                textAlign: "center",
                borderLeft: i ? "1px solid var(--hair)" : "none",
              }}
            >
              <div
                style={{
                  color: "var(--primary)",
                  display: "flex",
                  justifyContent: "center",
                  marginBottom: 6,
                  transition: "color .5s",
                }}
              >
                {stat.icon}
              </div>
              <div
                style={{
                  fontFamily: "var(--display)",
                  fontSize: 24,
                  color: "var(--deep)",
                  lineHeight: 1,
                  transition: "color .5s",
                }}
              >
                {stat.node}
              </div>
              <div
                style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 3 }}
              >
                {stat.small}
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block icon={<Sparkles size={15} />} title="Your private language">
        {privateLanguageLoading && !privateLanguageHasSource ? (
          <SectionSpinner label="Reading private language" />
        ) : privateLanguageError && !privateLanguageHasSource ? (
          <p
            className="cd-fade"
            style={{
              margin: 0,
              fontSize: 13.5,
              color: "var(--ink-2)",
              lineHeight: 1.45,
            }}
          >
            Private language unavailable: {privateLanguageError}
          </p>
        ) : (
          <div key={`lang-${character.id}`} className="cd-fade">
            <PrivateLanguageCloud character={character} />
          </div>
        )}
      </Block>

      <div style={{ height: 44 }} />
    </div>
  );
}
