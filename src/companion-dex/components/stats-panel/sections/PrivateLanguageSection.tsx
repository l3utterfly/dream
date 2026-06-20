import { Sparkles } from "lucide-react";
import type { Character } from "../../../types";
import { Block, SectionSpinner } from "../../MetricSections";
import { hasPrivateLanguageSource } from "../metrics";
import { PrivateLanguageCloud } from "../PrivateLanguageCloud";

export function PrivateLanguageSection({ character }: { character: Character }) {
  const privateLanguageLoading =
    !character.isChatHistoryLoaded || character.isMemoriesLoading;
  const privateLanguageHasSource = hasPrivateLanguageSource(character);
  const privateLanguageError =
    [character.chatHistoryError, character.memoriesError].filter(Boolean).join(" ") ||
    undefined;

  return (
    <Block icon={<Sparkles size={15} />} title="Your private language">
      {privateLanguageLoading && !privateLanguageHasSource ? (
        <SectionSpinner label="Reading private language" />
      ) : privateLanguageError && !privateLanguageHasSource ? (
        <p
          className="cd-fade"
          style={{
            margin: 0,
            fontSize: 13.5,
            color: "var(--ink-2)",
            lineHeight: 1.45,
          }}
        >
          Private language unavailable: {privateLanguageError}
        </p>
      ) : (
        <div key={`lang-${character.id}`} className="cd-fade">
          <PrivateLanguageCloud character={character} />
        </div>
      )}
    </Block>
  );
}
