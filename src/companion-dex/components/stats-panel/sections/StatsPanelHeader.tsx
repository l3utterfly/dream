import { Clock } from "lucide-react";
import type { Character, Theme } from "../../../types";
import { Avatar } from "../../Avatar";

interface StatsPanelHeaderProps {
  character: Character;
  theme: Theme;
  imageFailed: boolean;
}

export function StatsPanelHeader({
  character,
  theme,
  imageFailed,
}: StatsPanelHeaderProps) {
  return (
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
          &mdash; From last message
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
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Clock size={12} /> {character.lastChat}
        </span>
        <span>&middot;</span>
        <span>{character.daysKnown} days</span>
      </div>
    </div>
  );
}
