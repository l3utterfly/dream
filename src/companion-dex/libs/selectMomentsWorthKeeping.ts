/**
 * Selects the top "Moments Worth Keeping" for a character card.
 *
 * Pipeline:
 *   1. Score every raw chat sentence using a GoEmotions-weighted payload that
 *      rewards warm/poignant tone, penalises neutral + negative tone, gates out
 *      diffuse low-confidence sentiment, prefers quotable lengths, and applies a
 *      gentle recency decay.
 *   2. Greedily pick the top N quotes, enforcing a minimum time gap between picks
 *      (default: no two within 1 day) and skipping near-duplicate lines.
 *   3. For each chosen quote, attach a summary line pulled from the already
 *      summarised memories, correlated to the quote by timestamp.
 *
 * The headline `quote` always comes from ChatSentimentData (raw logs).
 * The smaller `summary` always comes from MemorySentimentData (summaries).
 */

import { SENTIMENT_THRESHOLDS, type SentimentValues } from "@layla-network/sdk";
import type { ScoredSentence } from "./computeBond";
import type { ChatSentimentData, MemorySentimentData } from "../types";

// ---------- Output ----------

export interface KeptMoment {
    /** Headline line, from raw chat. */
    quote: string;
    /** Supporting summary line, from summarised memories. null if nothing nearby. */
    summary: string | null;
    /** Timestamp (epoch ms) of the quote. */
    timestamp: number;
    /** Final ranking score — exposed for debugging / telemetry. */
    score: number;
}

// ---------- Tuning ----------

export interface MomentConfig {
    /** How many moments to return. */
    count: number;
    /** Minimum time gap between any two chosen quotes (ms). */
    minSpacingMs: number;
    /** A sentence's strongest "keepable" emotion must clear this to qualify at all. */
    peakThreshold: number;
    /** Recency half-life (ms). Larger = flatter, less recency bias. */
    recencyHalfLifeMs: number;
    /** Floor for the recency multiplier so old gems aren't zeroed out. */
    recencyFloor: number;
    /** Max time gap (ms) for a memory sentence to be a "good" summary match. */
    summaryWindowMs: number;
}

export const DEFAULT_CONFIG: MomentConfig = {
    count: 3,
    minSpacingMs: 24 * 60 * 60 * 1000, // 1 day — the hard spacing rule
    peakThreshold: 0.35,
    recencyHalfLifeMs: 14 * 24 * 60 * 60 * 1000, // 14 days
    recencyFloor: 0.5,
    summaryWindowMs: 12 * 60 * 60 * 1000, // 12 hours
};

// ---------- GoEmotions weighting (27 emotions + neutral) ----------


/** Emotions that count toward the peak-intensity gate. */
const KEEPABLE = new Set<string>([
    "love", "caring", "gratitude", "joy", "admiration", "pride",
    "excitement", "amusement", "optimism", "desire", "relief", "approval",
    "realization", "grief", "remorse", "surprise",
]);

// ---------- Scoring helpers ----------

function wordCount(s: string): number {
    const m = s.trim().match(/\S+/g);
    return m ? m.length : 0;
}

/** Weighted emotional payload + the strongest keepable activation in the sentence. */
function emotionalScore(sentiment: SentimentValues): { base: number; peakKeepable: number } {
    let base = 0;
    let peakKeepable = 0;
    for (const emotion in sentiment) {
        const activation = sentiment[emotion as keyof SentimentValues];
        base += activation * (SENTIMENT_THRESHOLDS[emotion as keyof SentimentValues] ?? 0);
        if (KEEPABLE.has(emotion) && activation > peakKeepable) {
            peakKeepable = activation;
        }
    }
    return { base, peakKeepable };
}

/** Soft preference for punchy, quotable lengths. Peaks ~6-20 words, floored at 0.4. */
function lengthMultiplier(words: number): number {
    if (words < 3) return 0.25; // bare fragments read badly in the card
    const ideal = 12;
    const sigma = 10;
    const gaussian = Math.exp(-((words - ideal) ** 2) / (2 * sigma * sigma));
    return 0.4 + 0.6 * gaussian;
}

/** Gentle recency decay relative to `now`, with a floor so old gems survive. */
function recencyMultiplier(
    ts: number,
    now: number,
    halfLife: number,
    floor: number,
): number {
    const age = Math.max(0, now - ts);
    const decay = Math.pow(0.5, age / halfLife);
    return floor + (1 - floor) * decay;
}

function normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function latestTimestamp(...lists: ScoredSentence[][]): number {
    let max = 0;
    for (const list of lists) {
        for (const s of list) {
            if (s.timestamp > max) max = s.timestamp;
        }
    }
    return max;
}

/**
 * Picks the summary line for a quote.
 * Prefers the most emotionally resonant memory sentence within `windowMs` of the
 * quote; if none fall in-window, falls back to the single closest in time.
 */
function pickSummary(
    quoteTs: number,
    memorySentences: ScoredSentence[],
    windowMs: number,
): string | null {
    if (memorySentences.length === 0) return null;

    const inWindow = memorySentences.filter(
        (m) => Math.abs(m.timestamp - quoteTs) <= windowMs,
    );

    if (inWindow.length > 0) {
        let best = inWindow[0];
        let bestScore = emotionalScore(best.sentimentValue).base;
        for (let i = 1; i < inWindow.length; i++) {
            const s = emotionalScore(inWindow[i].sentimentValue).base;
            if (s > bestScore) {
                best = inWindow[i];
                bestScore = s;
            }
        }
        return best.sentence;
    }

    // Fallback: closest in time.
    let nearest = memorySentences[0];
    let nearestDist = Math.abs(nearest.timestamp - quoteTs);
    for (let i = 1; i < memorySentences.length; i++) {
        const d = Math.abs(memorySentences[i].timestamp - quoteTs);
        if (d < nearestDist) {
            nearest = memorySentences[i];
            nearestDist = d;
        }
    }
    return nearest.sentence;
}

// ---------- Main ----------

interface Candidate {
    sentence: ScoredSentence;
    score: number;
}

export function selectMomentsWorthKeeping(
    chat: ChatSentimentData,
    memory: MemorySentimentData,
    config: Partial<MomentConfig> = {},
): KeptMoment[] {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    const chatSentences = chat?.scoredSentences ?? [];
    const memorySentences = memory?.scoredSentences ?? [];
    if (chatSentences.length === 0) return [];

    // Reference "now" = latest activity across both datasets, so decay tracks the
    // conversation rather than wall-clock time (which matters if the data is stale).
    const now = latestTimestamp(chatSentences, memorySentences) || Date.now();

    // 1. Score every chat sentence; drop anything that fails the intensity gate.
    const candidates: Candidate[] = [];
    for (const sentence of chatSentences) {
        const { base, peakKeepable } = emotionalScore(sentence.sentimentValue);

        // Gate: requires a confident keepable emotion AND net-positive tone.
        if (peakKeepable < cfg.peakThreshold || base <= 0) continue;

        const score =
            base *
            peakKeepable * // reward confident emotion over diffuse noise
            lengthMultiplier(wordCount(sentence.sentence)) *
            recencyMultiplier(sentence.timestamp, now, cfg.recencyHalfLifeMs, cfg.recencyFloor);

        candidates.push({ sentence, score });
    }

    if (candidates.length === 0) return [];

    // 2. Rank by score (descending).
    candidates.sort((a, b) => b.score - a.score);

    // 3. Greedily pick the top N: enforce time spacing + skip near-duplicate lines.
    const chosen: Candidate[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
        if (chosen.length >= cfg.count) break;

        const norm = normalize(candidate.sentence.sentence);
        if (seen.has(norm)) continue;

        const tooClose = chosen.some(
            (c) =>
                Math.abs(c.sentence.timestamp - candidate.sentence.timestamp) <
                cfg.minSpacingMs,
        );
        if (tooClose) continue;

        chosen.push(candidate);
        seen.add(norm);
    }

    // 4. Correlate each quote with a memory-derived summary by timestamp.
    return chosen.map((c) => ({
        quote: c.sentence.sentence,
        summary: pickSummary(c.sentence.timestamp, memorySentences, cfg.summaryWindowMs),
        timestamp: c.sentence.timestamp,
        score: c.score,
    }));
}

/* ---------- Example usage ----------

const moments = selectMomentsWorthKeeping(chatSentimentData, memorySentimentData);
// → up to 3 { quote, summary, timestamp, score }, newest-leaning, spaced >= 1 day apart.

// Tune for a tighter, warmer feel:
const strict = selectMomentsWorthKeeping(chatSentimentData, memorySentimentData, {
  peakThreshold: 0.5,        // only very confident moments
  recencyHalfLifeMs: 30 * 24 * 60 * 60 * 1000, // flatter recency
});

------------------------------------- */