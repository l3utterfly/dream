import { MoonStar, Sparkles } from "lucide-react";
import type { Character } from "../../../types";
import { Block } from "../../MetricSections";

interface DreamSectionProps {
  character: Character;
}

export function DreamSection({ character }: DreamSectionProps) {
  const descriptionId = `dream-description-${character.id}`;

  return (
    <Block icon={<MoonStar size={15} />} title="Dream">
      <div className="cd-dream-card cd-fade">
        <button
          type="button"
          className="cd-dream-button"
          aria-describedby={descriptionId}
        >
          <Sparkles size={21} />
          <span>Dream</span>
        </button>
        <p id={descriptionId} className="cd-dream-copy">
          Dream will allow {character.name} to reflect on your past
          conversations, form an impression of you, and may even allow them to
          proactively message you during the day!
        </p>
      </div>
    </Block>
  );
}
