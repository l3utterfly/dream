import { Smile, Sparkles } from "lucide-react";
import type { Character } from "../../../types";
import { Block } from "../../MetricSections";

interface ImpressionSectionProps {
  character: Character;
  isReflecting: boolean;
  reflectDisabled: boolean;
  reflectTitle: string;
  showReflectGuardStatus: boolean;
  reflectedText: string;
  reflectionError?: string;
  onReflect: () => void;
}

export function ImpressionSection({
  character,
  isReflecting,
  reflectDisabled,
  reflectTitle,
  showReflectGuardStatus,
  reflectedText,
  reflectionError,
  onReflect,
}: ImpressionSectionProps) {
  return (
    <Block
      icon={<Smile size={15} />}
      title="Their Impression of You"
      action={
        <button
          type="button"
          className="cd-reflect-button"
          onClick={onReflect}
          disabled={reflectDisabled}
          aria-busy={isReflecting}
          title={reflectTitle}
        >
          <Sparkles size={14} />
          <span>Reflect</span>
        </button>
      }
    >
      {showReflectGuardStatus ? (
        <p className="cd-reflection-status">no new information to reflect on</p>
      ) : null}
      <div key={`read-${character.id}`} className="cd-fade" aria-live="polite">
        {reflectedText ? (
          <p className="cd-reflection-text">
            {reflectedText}
            {isReflecting ? (
              <span className="cd-reflection-caret" aria-hidden />
            ) : null}
          </p>
        ) : isReflecting ? (
          <div
            className="cd-reflection-loading"
            role="status"
            aria-label="Reflecting"
          >
            <span className="cd-reflection-orbit" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            <span className="cd-reflection-shimmer" aria-hidden />
            <span
              className="cd-reflection-shimmer cd-reflection-shimmer-short"
              aria-hidden
            />
          </div>
        ) : (
          <>
            <p
              style={{
                margin: 0,
                fontSize: 15.5,
                lineHeight: 1.55,
                color: "var(--ink-1)",
              }}
            >
              Right now, {character.name} {character.theirRead}
            </p>
            <p
              style={{
                margin: "12px 0 0",
                fontSize: 14,
                lineHeight: 1.55,
                color: "var(--ink-2)",
                fontStyle: "italic",
              }}
            >
              {character.impression}
            </p>
          </>
        )}
        {reflectionError ? (
          <p className="cd-reflection-error">
            Reflection unavailable: {reflectionError}
          </p>
        ) : null}
      </div>
    </Block>
  );
}
