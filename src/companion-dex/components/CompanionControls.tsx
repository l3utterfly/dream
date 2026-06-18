import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Character, Theme } from "../types";

interface CompanionControlsProps {
  active: number;
  companions: Character[];
  hasMore: boolean;
  isLoadingMore: boolean;
  themeOf: (character: Character) => Theme;
  onSelect: (index: number) => void;
}

export function CompanionControls({ active, companions, hasMore, isLoadingMore, themeOf, onSelect }: CompanionControlsProps) {
  const isAtLastCompanion = active === companions.length - 1;
  const nextDisabled = (isAtLastCompanion && !hasMore) || (isAtLastCompanion && isLoadingMore);

  return (
    <>
      <button
        className="cd-arrow"
        style={{ left: "max(10px, calc(50% - 252px))" }}
        onClick={() => onSelect(active - 1)}
        disabled={active === 0}
        aria-label="Previous companion"
      >
        <ChevronLeft size={22} />
      </button>
      <button
        className="cd-arrow"
        style={{ right: "max(10px, calc(50% - 252px))" }}
        onClick={() => onSelect(active + 1)}
        disabled={nextDisabled}
        aria-label={isAtLastCompanion && hasMore ? "Load next companions" : "Next companion"}
      >
        <ChevronRight size={22} />
      </button>
      <div className="cd-top">
        <div className="cd-brand">
          <span style={{ width: 12, height: 12, borderRadius: 4, background: "var(--primary)", transition: "background .6s" }} />
          CompanionDex
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {companions.map((character, i) => (
            <button
              key={character.id}
              className="cd-dot"
              onClick={() => onSelect(i)}
              aria-label={`Go to ${character.name}`}
              style={{ width: i === active ? 24 : 7, background: i === active ? themeOf(character).primary : "rgba(255,255,255,.4)" }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
