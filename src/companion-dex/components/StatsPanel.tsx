import { useEffect, useMemo, useState } from "react";
import { Brain, Clock, Coffee, Cookie, Hand, Heart, Laugh, ListChecks, MessageCircle, Quote, Scale, Smile, Sparkles, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { MOOD_LABEL } from "../data";
import { selectMomentsWorthKeeping } from "../libs/selectMomentsWorthKeeping";
import type { Character, MemorySentimentData, Theme } from "../types";
import { Avatar } from "./Avatar";
import { Bar, Block, Heatmap, SectionSpinner, Vital } from "./MetricSections";
import { CountNum } from "./CountNum";

const EMPTY_MEMORY_SENTIMENT: MemorySentimentData = { scoredSentences: [] };
const EMPTY_TALK_HISTOGRAM = {
  hours: Array.from({ length: 24 }, () => 0),
  peak: "whenever you return",
  total: 0,
};

function formatMomentDate(timestamp: number) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "sometime";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const momentDay = new Date(date);
  momentDay.setHours(0, 0, 0, 0);
  const daysAgo = Math.round((today.getTime() - momentDay.getTime()) / (24 * 60 * 60 * 1000));

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

  const milliseconds = Math.abs(timestamp) < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
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

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const activeVitalTaps = vitalTaps.characterId === character.id ? vitalTaps : { characterId: character.id, energy: 0, fed: 0, social: 0 };
  const v = (n: number) => (mounted ? n : 0);
  const vitalValue = (key: keyof Character["vitals"]) => v(character.vitals[key] + activeVitalTaps[key]);
  const tapVital = (key: keyof Character["vitals"]) => {
    setVitalTaps((current) => {
      const nextTaps = current.characterId === character.id ? current : { characterId: character.id, energy: 0, fed: 0, social: 0 };
      return { ...nextTaps, [key]: nextTaps[key] + 1 };
    });
  };
  const balanceLeft = 50 + character.stats.balance / 2;
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
  const talkHistogram = useMemo(() => buildTalkHistogram(character.chatHistory), [character.chatHistory]);
  const momentsLoading =
    character.isChatSentimentLoading ||
    (character.isMemorySentimentLoading && !character.memorySentiment && !character.memorySentimentError);
  const statItems = [
    { node: <CountNum value={character.stats.streak} />, small: "day streak", icon: <Coffee size={15} /> },
    { node: <CountNum value={character.stats.messages} format={(n) => n.toLocaleString()} />, small: "messages", icon: <MessageCircle size={15} /> },
    { node: <CountNum value={character.stats.laughs} />, small: "laughs / wk", icon: <Laugh size={15} /> },
    {
      node: character.stats.balance === 0 ? "even" : character.stats.balance < 0 ? "you" : "them",
      small: "opens up",
      icon: <Scale size={15} />,
    },
  ];

  return (
    <div style={{ padding: "0 24px 8px" }}>
      <div key={`id-${character.id}`} className="cd-fade" style={{ textAlign: "center" }}>
        <Avatar character={character} theme={theme} failed={imageFailed} />
        <h2 style={{ fontFamily: "var(--display)", fontSize: 38, margin: "16px 0 0", color: "var(--text)", lineHeight: 1 }}>{character.name}</h2>
        <p style={{ margin: "6px 0 0", color: "var(--ink-1)", fontSize: 14.5 }}>{character.tagline}</p>
        <p style={{ margin: "12px 0 0", fontSize: 14, color: "var(--ink-1)", display: "inline-flex", alignItems: "center", gap: 8, maxWidth: 360 }}>
          <span className="cd-mood-dot" />
          <span>
            <strong style={{ color: "var(--deep)" }}>{MOOD_LABEL[character.mood]}</strong> — {character.moodReason}
          </span>
        </p>
        <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 12, fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-2)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Clock size={12} /> {character.lastChat}
          </span>
          <span>·</span>
          <span>
            {character.daysKnown} days · since {character.firstMet}
          </span>
        </div>
      </div>

      <Block icon={<Heart size={15} />} title="Your bond">
        {character.isBondLoading ? (
          <SectionSpinner label="Reading conversation signal" />
        ) : character.bondError ? (
          <p className="cd-fade" style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
            Bond unavailable: {character.bondError}
          </p>
        ) : character.bond ? (
          <div key={`bond-${character.id}`} className="cd-fade">
            <Bar label="WARMTH" value={v(character.bond.warmth)} />
            <Bar label="DEPTH" value={v(character.bond.depth)} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
              <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 600 }}>trend · {trendTimespan}</span>
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
                {trendDifference >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                {trendDifference >= 0 ? "+" : ""}
                {trendDifference}
              </span>
            </div>
          </div>
        ) : null}
      </Block>

      <Block icon={<Sparkles size={15} />} title="How they're doing">
        <div style={{ display: "flex", gap: 8 }}>
          <Vital icon={<Zap size={18} />} label="Poke" value={vitalValue("energy")} onTap={() => tapVital("energy")} />
          <Vital icon={<Cookie size={18} />} label="Feed" value={vitalValue("fed")} onTap={() => tapVital("fed")} />
          <Vital icon={<Hand size={18} />} label="Wave" value={vitalValue("social")} onTap={() => tapVital("social")} />
        </div>
      </Block>

      <Block icon={<Brain size={15} />} title="Holds in mind about you">
        {character.isMemoriesLoading ? (
          <SectionSpinner label="Gathering memories" />
        ) : character.memoriesError ? (
          <p className="cd-fade" style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
            Memories unavailable: {character.memoriesError}
          </p>
        ) : character.remembers.length > 0 ? (
          <div key={`rem-${character.id}`} className="cd-memory-scroller cd-fade" aria-label={`Top memories ${character.name} holds about you`}>
            {character.remembers.map((memory, i) => (
              <figure key={i} className={memory.fresh ? "cd-memory-card cd-memory-card-primary" : "cd-memory-card"}>
                <blockquote>{memory.fact}</blockquote>
              </figure>
            ))}
          </div>
        ) : (
          <p className="cd-fade" style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
            No memories yet.
          </p>
        )}
      </Block>

      <Block icon={<ListChecks size={15} />} title="Open threads">
        <div key={`thr-${character.id}`} className="cd-fade">
          {character.threads.map((thread, i) => (
            <div key={i} style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "9px 0" }}>
              <span style={{ width: 16, height: 16, borderRadius: 6, border: "2px solid var(--primary)", flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 14.5, color: "var(--ink-1)", lineHeight: 1.45 }}>{thread}</span>
            </div>
          ))}
        </div>
      </Block>

      <Block icon={<Quote size={15} />} title="Moments worth keeping">
        {momentsLoading ? (
          <SectionSpinner label="Finding keepable moments" />
        ) : character.chatSentimentError ? (
          <p className="cd-fade" style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
            Moments unavailable: {character.chatSentimentError}
          </p>
        ) : momentsWorthKeeping.length > 0 ? (
          <div key={`mom-${character.id}`} className="cd-fade">
            {momentsWorthKeeping.map((moment, i) => (
              <figure key={`${moment.timestamp}-${i}`} className={i === 0 ? "cd-moment-card cd-moment-card-primary" : "cd-moment-card"}>
                <blockquote>&ldquo;{moment.quote}&rdquo;</blockquote>
                <figcaption>
                  {moment.summary ? <span>{moment.summary}</span> : null}
                  <time dateTime={new Date(moment.timestamp).toISOString()}>{formatMomentDate(moment.timestamp)}</time>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="cd-fade" style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
            No keepable moments yet.
          </p>
        )}
      </Block>

      <Block icon={<Clock size={15} />} title="When you two talk">
        {!character.isChatHistoryLoaded ? (
          <SectionSpinner label="Mapping talk rhythm" />
        ) : character.chatHistoryError ? (
          <p className="cd-fade" style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
            Talk pattern unavailable: {character.chatHistoryError}
          </p>
        ) : talkHistogram.total > 0 ? (
          <Heatmap hours={talkHistogram.hours} peak={talkHistogram.peak} />
        ) : (
          <p className="cd-fade" style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
            No chat history yet.
          </p>
        )}
      </Block>

      <Block icon={<Smile size={15} />} title="Their read on you">
        <div key={`read-${character.id}`} className="cd-fade">
          <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.55, color: "var(--ink-1)" }}>
            Right now, {character.name} {character.theirRead}
          </p>
          <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.55, color: "var(--ink-2)", fontStyle: "italic" }}>{character.impression}</p>
        </div>
      </Block>

      <Block icon={<TrendingUp size={15} />} title="By the numbers">
        <div style={{ display: "flex" }}>
          {statItems.map((stat, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", borderLeft: i ? "1px solid var(--hair)" : "none" }}>
              <div style={{ color: "var(--primary)", display: "flex", justifyContent: "center", marginBottom: 6, transition: "color .5s" }}>{stat.icon}</div>
              <div style={{ fontFamily: "var(--display)", fontSize: 24, color: "var(--deep)", lineHeight: 1, transition: "color .5s" }}>{stat.node}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 3 }}>{stat.small}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-2)", marginBottom: 8, fontWeight: 600, letterSpacing: ".04em" }}>
            <span>YOU OPEN UP</span>
            <span>RECIPROCITY</span>
            <span>THEY OPEN UP</span>
          </div>
          <div style={{ position: "relative", height: 8, borderRadius: 99, background: "linear-gradient(90deg, var(--glow), var(--track) 50%, var(--glow))" }}>
            <div
              style={{
                position: "absolute",
                top: -6,
                left: `calc(${mounted ? balanceLeft : 50}% - 10px)`,
                width: 20,
                height: 20,
                borderRadius: 99,
                background: "var(--page)",
                border: "3px solid var(--primary)",
                transition: "left .8s cubic-bezier(.2,.8,.2,1), border-color .5s",
              }}
            />
          </div>
        </div>
      </Block>

      <Block icon={<Sparkles size={15} />} title="Your private language">
        <div key={`lang-${character.id}`} className="cd-fade">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 22 }}>
            {character.jokes.map((joke, i) => (
              <span key={i} style={{ fontSize: 12.5, padding: "5px 12px", borderRadius: 99, background: "var(--chip)", color: "var(--ink-1)" }}>
                😶‍🌫️ {joke}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline" }}>
            {character.topics.map((topic, i) => (
              <span
                key={i}
                style={{
                  color: "var(--deep)",
                  fontWeight: 700,
                  opacity: 0.5 + topic.weight * 0.16,
                  fontSize: 13 + topic.weight * 5,
                  fontFamily: "var(--display)",
                  transition: "color .5s",
                }}
              >
                {topic.tag}
              </span>
            ))}
          </div>
        </div>
      </Block>

      <div style={{ height: 44 }} />
    </div>
  );
}
