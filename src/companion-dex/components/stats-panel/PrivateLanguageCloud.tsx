import { useEffect, useMemo, useState } from "react";
import cloud from "d3-cloud";
import { eng, removeStopwords } from "stopword";
import { getCharacterName, getUserName } from "../../libs/readOnYou";
import type { Character } from "../../types";
import { SectionSpinner } from "../MetricSections";

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

interface PrivateLanguageWord {
  text: string;
  value: number;
  size: number;
  x?: number;
  y?: number;
  rotate?: number;
}

function tokenizePrivateLanguage(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/\u2019/g, "'")
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

export function PrivateLanguageCloud({ character }: { character: Character }) {
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
                  {word.text} {"\u00b7"} {word.value}{" "}
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
