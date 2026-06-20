import { ListChecks } from "lucide-react";
import type { Character } from "../../../types";
import { Block } from "../../MetricSections";

export function ThreadsSection({ character }: { character: Character }) {
  return (
    <Block icon={<ListChecks size={15} />} title="Open threads">
      <div key={`thr-${character.id}`} className="cd-fade">
        {character.threads.map((thread, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 11,
              alignItems: "flex-start",
              padding: "9px 0",
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 6,
                border: "2px solid var(--primary)",
                flexShrink: 0,
                marginTop: 2,
              }}
            />
            <span
              style={{
                fontSize: 14.5,
                color: "var(--ink-1)",
                lineHeight: 1.45,
              }}
            >
              {thread}
            </span>
          </div>
        ))}
      </div>
    </Block>
  );
}
