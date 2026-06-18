import type { Character, Theme } from "../types";
import { Creature } from "./Creature";

interface AvatarProps {
  character: Character;
  theme: Theme;
  failed: boolean;
}

export function Avatar({ character, theme, failed }: AvatarProps) {
  return (
    <div className="cd-avatar" style={{ borderColor: theme.primary }}>
      {character.image && !failed ? (
        <img src={character.image} alt={character.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "grid",
            placeItems: "center",
            background: `radial-gradient(circle at 50% 35%, ${theme.glow}40, ${theme.primary}22)`,
          }}
        >
          <Creature shape={character.shape} theme={theme} mood={character.mood} size={84} />
        </div>
      )}
    </div>
  );
}
