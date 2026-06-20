import { useMemo } from "react";
import { Coffee, Laugh, MessageCircle, TrendingUp } from "lucide-react";
import type { Character } from "../../../types";
import { CountNum } from "../../CountNum";
import { Block } from "../../MetricSections";
import {
  countLongestDayStreak,
  countUniqueHighIntensityEmotions,
} from "../metrics";

export function NumbersSection({ character }: { character: Character }) {
  const byTheNumbers = useMemo(
    () => ({
      chatHistories: character.chatHistory.length,
      dayStreak: countLongestDayStreak(character.chatHistory),
      emotions: countUniqueHighIntensityEmotions(character),
    }),
    [character],
  );
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
            <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 3 }}>
              {stat.small}
            </div>
          </div>
        ))}
      </div>
    </Block>
  );
}
