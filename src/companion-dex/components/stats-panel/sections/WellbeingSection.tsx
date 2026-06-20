import { Cookie, Hand, Sparkles, Zap } from "lucide-react";
import type { Character } from "../../../types";
import { Block, Vital } from "../../MetricSections";

interface WellbeingSectionProps {
  character: Character;
  energyValue: number;
  fedValue: number;
  socialValue: number;
  onTapVital: (key: keyof Character["vitals"]) => void;
}

function vitalActionLabel(
  value: number,
  defaultLabel: string,
  states: { low: string; veryLow: string },
) {
  const state = value < 30 ? states.veryLow : value < 70 ? states.low : null;

  if (!state) return defaultLabel;

  return (
    <>
      <span style={{ color: "var(--primary)" }}>{state}</span> - {defaultLabel}
    </>
  );
}

export function WellbeingSection({
  character,
  energyValue,
  fedValue,
  socialValue,
  onTapVital,
}: WellbeingSectionProps) {
  return (
    <Block icon={<Sparkles size={15} />} title="How they're doing">
      <div key={`vitals-${character.id}`} style={{ display: "flex", gap: 8 }}>
        <Vital
          icon={<Zap size={18} />}
          label={vitalActionLabel(energyValue, "Poke", {
            low: "Bored",
            veryLow: "Sleepy",
          })}
          ariaLabel={energyValue < 30 ? "Sleepy - Poke" : energyValue < 70 ? "Bored - Poke" : "Poke"}
          value={energyValue}
          onTap={() => onTapVital("energy")}
        />
        <Vital
          icon={<Cookie size={18} />}
          label={vitalActionLabel(fedValue, "Feed", {
            low: "Peckish",
            veryLow: "Hungry",
          })}
          ariaLabel={fedValue < 30 ? "Hungry - Feed" : fedValue < 70 ? "Peckish - Feed" : "Feed"}
          value={fedValue}
          onTap={() => onTapVital("fed")}
        />
        <Vital
          icon={<Hand size={18} />}
          label={vitalActionLabel(socialValue, "Wave", {
            low: "Neglectd",
            veryLow: "Lonely",
          })}
          ariaLabel={socialValue < 30 ? "Lonely - Wave" : socialValue < 70 ? "Neglectd - Wave" : "Wave"}
          value={socialValue}
          onTap={() => onTapVital("social")}
        />
      </div>
    </Block>
  );
}
