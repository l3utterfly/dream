import { selectMomentsWorthKeeping } from "../../libs/selectMomentsWorthKeeping";
import type { Character, MemorySentimentData } from "../../types";

const EMPTY_MEMORY_SENTIMENT: MemorySentimentData = { scoredTexts: [] };
const EMPTY_TALK_HISTOGRAM = {
  hours: Array.from({ length: 24 }, () => 0),
  peak: "whenever you return",
  total: 0,
};

export function formatMomentDate(timestamp: number) {
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

export function buildTalkHistogram(chatHistory: Character["chatHistory"]) {
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

  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

export function countLongestDayStreak(chatHistory: Character["chatHistory"]) {
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

export function countUniqueHighIntensityEmotions(character: Character) {
  const emotions = new Set<string>();

  for (const scoredText of character.chatSentiment?.scoredTexts ?? []) {
    for (const [emotion, intensity] of Object.entries(scoredText.sentimentValue)) {
      if (emotion !== "neutral" && intensity > 0.5) {
        emotions.add(emotion);
      }
    }
  }

  return emotions.size;
}

export function selectCharacterMomentsWorthKeeping(character: Character) {
  if (!character.chatSentiment) return [];

  return selectMomentsWorthKeeping(
    character.chatSentiment,
    character.memorySentiment ?? EMPTY_MEMORY_SENTIMENT,
  );
}

export function cleanPrivateLanguageText(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function hasPrivateLanguageSource(character: Character) {
  return (
    character.chatHistory.some((entry) => cleanPrivateLanguageText(entry.content)) ||
    character.recentMemories.some((memory) =>
      cleanPrivateLanguageText(memory.summary ?? memory.rawText),
    )
  );
}
