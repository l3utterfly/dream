import type { RefObject } from "react";
import type { Character, Theme } from "../types";
import { Creature } from "./Creature";

interface CompanionBackgroundProps {
  character: Character;
  theme: Theme;
  imageFailed: boolean;
  onImageError: () => void;
  backgroundRef: RefObject<HTMLDivElement | null>;
}

export function CompanionBackground({ character, theme, imageFailed, onImageError, backgroundRef }: CompanionBackgroundProps) {
  return (
    <>
      <div className="cd-bg" ref={backgroundRef} aria-hidden>
        <div className="cd-bg-media" key={character.id}>
          {character.image && !imageFailed ? (
            <img className="cd-bg-img" src={character.image} alt="" onError={onImageError} />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "grid",
                placeItems: "center",
                background: `radial-gradient(120% 70% at 50% 26%, ${theme.glow}40 0%, ${theme.primary}26 42%, #1c1c1c 78%)`,
              }}
            >
              <div className="cd-float">
                <Creature shape={character.shape} theme={theme} mood={character.mood} size={250} />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="cd-bg-scrim" aria-hidden />
    </>
  );
}
