import { useMemo } from "react";
import { Quote } from "lucide-react";
import type { Character } from "../../../types";
import { Block, SectionSpinner } from "../../MetricSections";
import { formatMomentDate, selectCharacterMomentsWorthKeeping } from "../metrics";

export function MomentsSection({ character }: { character: Character }) {
  const momentsWorthKeeping = useMemo(
    () => selectCharacterMomentsWorthKeeping(character),
    [character],
  );
  const momentsLoading =
    character.isChatSentimentLoading ||
    (character.isMemorySentimentLoading &&
      !character.memorySentiment &&
      !character.memorySentimentError);

  return (
    <Block icon={<Quote size={15} />} title="Moments worth keeping">
      {momentsLoading ? (
        <SectionSpinner label="Finding keepable moments" />
      ) : character.chatSentimentError ? (
        <p
          className="cd-fade"
          style={{
            margin: 0,
            fontSize: 13.5,
            color: "var(--ink-2)",
            lineHeight: 1.45,
          }}
        >
          Moments unavailable: {character.chatSentimentError}
        </p>
      ) : momentsWorthKeeping.length > 0 ? (
        <div key={`mom-${character.id}`} className="cd-fade">
          {momentsWorthKeeping.map((moment, i) => (
            <figure
              key={`${moment.timestamp}-${i}`}
              className={
                i === 0
                  ? "cd-moment-card cd-moment-card-primary"
                  : "cd-moment-card"
              }
            >
              <blockquote>&ldquo;{moment.quote}&rdquo;</blockquote>
              <figcaption>
                {moment.summary ? <span>{moment.summary}</span> : null}
                <time dateTime={new Date(moment.timestamp).toISOString()}>
                  {formatMomentDate(moment.timestamp)}
                </time>
              </figcaption>
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
          No keepable moments yet.
        </p>
      )}
    </Block>
  );
}
