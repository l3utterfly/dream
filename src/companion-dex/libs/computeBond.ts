/**
 * bondScore.ts
 *
 * Standalone, dependency-free scoring of conversational "Warmth" and "Depth"
 * from per-sentence multi-label sentiment data (GoEmotions-style).
 *
 *   Warmth = signed valence weighted toward affiliation (affection up, hostility down).
 *   Depth  = emotional intensity / vulnerability, valence-blind. Neutral chitchat is the
 *            penalty term that pulls depth down.
 *
 * Both axes start at 50 (the no-information baseline) and drift as the conversation
 * accumulates, via a per-sentence exponential moving average. The result also reports a
 * trend (net change over the analysed span) plus the timespan it covers.
 *
 * Everything is pure: same input -> same output. Tune the WEIGHTS / CONFIG to taste.
 */

import { SENTIMENT_THRESHOLDS, type SentimentValues } from "@layla-network/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoredSentence {
  sentence: string;
  /** Epoch milliseconds. */
  timestamp: number;
  sentimentValue: SentimentValues;
}

export interface BondResult {
  /** 0..100, anchored at 50. */
  warmth: number;
  /** 0..100, anchored at 50. */
  depth: number;
  trend: {
    /** Net change of the combined bond over the analysed window (rounded, signed). */
    difference: number;
    /** Length of the analysed data span. */
    timespanWeeks: number;
    timespanDays: number;
  };
}

export interface BondConfig {
  /** Per-sentence learning rate for the EMA. Smaller = smoother / slower to move. */
  alpha: number;
  /** How quickly warmth saturates toward 0/100. */
  warmthGain: number;
  /** How quickly depth saturates toward 0/100. */
  depthGain: number;
  /**
   * Depth required just to "break even" at 50. Sentences with less emotional
   * substance than this pull depth below 50 (i.e. neutral talk reads as shallow).
   */
  depthNeutralAnchor: number;
  /**
   * Trend lookback in weeks. The trend compares the bond now vs. its value this
   * far back. If undefined or longer than the data, the full span is used.
   */
  trendWindowWeeks?: number;
}

// ---------------------------------------------------------------------------
// Axis weights.
//   Warmth: SIGNED. Affection positive, hostility negative. Negative-valence-but-
//           vulnerable emotions (grief, fear, remorse...) are near zero, NOT cold —
//           sharing pain with someone is not unfriendly.
//   Depth:  mostly POSITIVE. Vulnerable / heavy emotions score highest; banter low.
//           "neutral" has no depth weight, so neutral sentences contribute 0 depth.
// ---------------------------------------------------------------------------

export const WARMTH_WEIGHTS: Record<string, number> = {
  love: 1.0, caring: 1.0, gratitude: 0.8, admiration: 0.7, joy: 0.7,
  approval: 0.5, amusement: 0.5, optimism: 0.5, excitement: 0.4,
  desire: 0.4, relief: 0.3, pride: 0.3, curiosity: 0.2,
  realization: 0.0, surprise: 0.0, neutral: 0.0,
  // mildly negative-valence but relational — kept close to zero
  sadness: -0.1, grief: -0.1, fear: -0.15, nervousness: -0.15,
  embarrassment: -0.15, remorse: -0.2, confusion: -0.2,
  // genuinely cold / hostile
  disappointment: -0.5, annoyance: -0.6, disapproval: -0.7,
  disgust: -0.9, anger: -1.0,
};

export const DEPTH_WEIGHTS: Record<string, number> = {
  grief: 1.0, love: 0.9, remorse: 0.8, fear: 0.8, sadness: 0.7,
  nervousness: 0.7, realization: 0.6, desire: 0.6, embarrassment: 0.6,
  caring: 0.6, admiration: 0.5, pride: 0.5, gratitude: 0.5, relief: 0.5,
  disappointment: 0.4, excitement: 0.4, anger: 0.4, joy: 0.3,
  optimism: 0.3, curiosity: 0.3, approval: 0.2, confusion: 0.2,
  surprise: 0.2, disgust: 0.2, disapproval: 0.2, amusement: 0.1,
  annoyance: 0.1,
  // neutral intentionally omitted -> 0 depth
};

export const DEFAULT_CONFIG: BondConfig = {
  alpha: 0.08,
  warmthGain: 1.2,
  depthGain: 1.2,
  depthNeutralAnchor: 0.25,
  trendWindowWeeks: undefined, // full span
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

/** tanh squash into (0,100) anchored at 50. */
const squash = (raw: number, gain: number) => 50 + 50 * Math.tanh(gain * raw);

/**
 * Per-sentence axis contributions.
 *   warmthRaw: signed sum of (activation * warmthWeight) over emotions that clear threshold.
 *   depthRaw:  non-negative sum of (activation * depthWeight) for the same.
 */
function scoreSentence(s: SentimentValues): { warmthRaw: number; depthRaw: number } {
  let warmthRaw = 0;
  let depthRaw = 0;
  for (const emotion in s) {
    const value = s[emotion as keyof SentimentValues];
    const threshold = SENTIMENT_THRESHOLDS[emotion as keyof SentimentValues] ?? 1; // unknown emotions need >=1 to count
    if (value < threshold) continue;
    warmthRaw += value * (WARMTH_WEIGHTS[emotion] ?? 0);
    depthRaw += value * (DEPTH_WEIGHTS[emotion] ?? 0);
  }
  return { warmthRaw, depthRaw };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Compute the bond from scored sentences.
 *
 * @param sentences  Per-sentence sentiment, in any order (sorted internally by timestamp).
 * @param config     Optional overrides; merged over DEFAULT_CONFIG.
 */
export function computeBond(
  sentences: ScoredSentence[],
  config: Partial<BondConfig> = {},
): BondResult {
  const cfg: BondConfig = { ...DEFAULT_CONFIG, ...config };

  // No data -> pure baseline.
  if (sentences.length === 0) {
    return { warmth: 50, depth: 50, trend: { difference: 0, timespanWeeks: 0, timespanDays: 0 } };
  }

  const ordered = [...sentences].sort((a, b) => a.timestamp - b.timestamp);

  let warmth = 50;
  let depth = 50;

  // Time series of the combined bond, for the trend.
  const series: Array<{ t: number; bond: number }> = [];

  for (const item of ordered) {
    const { warmthRaw, depthRaw } = scoreSentence(item.sentimentValue);

    const warmthTarget = squash(warmthRaw, cfg.warmthGain);
    const depthTarget = squash(depthRaw - cfg.depthNeutralAnchor, cfg.depthGain);

    warmth += cfg.alpha * (warmthTarget - warmth);
    depth += cfg.alpha * (depthTarget - depth);

    series.push({ t: item.timestamp, bond: (warmth + depth) / 2 });
  }

  warmth = clamp(warmth);
  depth = clamp(depth);

  // --- Trend -------------------------------------------------------------
  const firstT = ordered[0].timestamp;
  const lastT = ordered[ordered.length - 1].timestamp;
  const spanMs = lastT - firstT;

  // Pick the comparison point: trendWindowWeeks back from the end, clamped to the span start.
  const windowMs = cfg.trendWindowWeeks != null ? cfg.trendWindowWeeks * WEEK_MS : Infinity;
  const cutoff = lastT - windowMs;

  // Earliest series point whose timestamp is >= cutoff (first reading inside the window).
  const startPoint = series.find((p) => p.t >= cutoff) ?? series[0];
  const endBond = series[series.length - 1].bond;
  const difference = Math.round(endBond - startPoint.bond);

  // Timespan actually covered by the trend (cutoff..end, but never beyond available data).
  const trendSpanMs = lastT - Math.max(firstT, cutoff === -Infinity ? firstT : cutoff);

  return {
    warmth: Math.round(warmth),
    depth: Math.round(depth),
    trend: {
      difference,
      timespanWeeks: Math.round(trendSpanMs / WEEK_MS),
      timespanDays: Math.round((cfg.trendWindowWeeks != null ? trendSpanMs : spanMs) / DAY_MS),
    },
  };
}