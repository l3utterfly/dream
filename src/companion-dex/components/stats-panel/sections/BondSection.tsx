import { Heart, TrendingDown, TrendingUp } from "lucide-react";
import type { Character } from "../../../types";
import { Bar, Block, SectionSpinner } from "../../MetricSections";

interface BondSectionProps {
  character: Character;
  value: (n: number) => number;
}

export function BondSection({ character, value }: BondSectionProps) {
  const trend = character.bond?.trend;
  const trendTimespan = trend
    ? trend.timespanWeeks > 0
      ? `${trend.timespanWeeks} ${trend.timespanWeeks === 1 ? "week" : "weeks"}`
      : trend.timespanDays > 0
        ? `${trend.timespanDays} ${trend.timespanDays === 1 ? "day" : "days"}`
        : "today"
    : "today";
  const trendDifference = trend?.difference ?? 0;

  return (
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
          <Bar label="WARMTH" value={value(character.bond.warmth)} />
          <Bar label="DEPTH" value={value(character.bond.depth)} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 16,
            }}
          >
            <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 600 }}>
              trend &middot; {trendTimespan}
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
              {trendDifference >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
              {trendDifference >= 0 ? "+" : ""}
              {trendDifference}
            </span>
          </div>
        </div>
      ) : null}
    </Block>
  );
}
