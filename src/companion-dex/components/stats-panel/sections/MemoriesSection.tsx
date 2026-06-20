import { Brain } from "lucide-react";
import type { Character } from "../../../types";
import { Block, SectionSpinner } from "../../MetricSections";

export function MemoriesSection({ character }: { character: Character }) {
  return (
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
  );
}
