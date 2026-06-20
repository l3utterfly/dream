import { useMemo } from "react";
import { Clock } from "lucide-react";
import type { Character } from "../../../types";
import { Block, Heatmap, SectionSpinner } from "../../MetricSections";
import { buildTalkHistogram } from "../metrics";

export function TalkRhythmSection({ character }: { character: Character }) {
  const talkHistogram = useMemo(
    () => buildTalkHistogram(character.chatHistory),
    [character.chatHistory],
  );

  return (
    <Block icon={<Clock size={15} />} title="When you two talk">
      {!character.isChatHistoryLoaded ? (
        <SectionSpinner label="Mapping talk rhythm" />
      ) : character.chatHistoryError ? (
        <p
          className="cd-fade"
          style={{
            margin: 0,
            fontSize: 13.5,
            color: "var(--ink-2)",
            lineHeight: 1.45,
          }}
        >
          Talk pattern unavailable: {character.chatHistoryError}
        </p>
      ) : talkHistogram.total > 0 ? (
        <Heatmap hours={talkHistogram.hours} peak={talkHistogram.peak} />
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
          No chat history yet.
        </p>
      )}
    </Block>
  );
}
