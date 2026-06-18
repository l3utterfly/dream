import type { Mood, Shape, Theme } from "../types";

interface CreatureProps {
  shape: Shape;
  theme: Theme;
  mood: Mood;
  size?: number;
}

export function Creature({ shape, theme, mood, size = 200 }: CreatureProps) {
  const sleepy = mood === "sleepy";
  const eye = (cx: number) =>
    sleepy ? (
      <path key={cx} d={`M${cx - 9} 96 q9 7 18 0`} stroke={theme.deep} strokeWidth="4" fill="none" strokeLinecap="round" />
    ) : (
      <g key={cx}>
        <circle cx={cx} cy={96} r={11} fill="#fff" />
        <circle cx={cx + (mood === "lonely" ? -2 : 0)} cy={mood === "sad" || mood === "lonely" ? 100 : 98} r={5.5} fill={theme.deep} />
        <circle cx={cx + 2} cy={94} r={2} fill="#fff" />
      </g>
    );

  const mouth = () => {
    switch (mood) {
      case "happy":
        return <path d="M86 120 q24 22 48 0" stroke={theme.deep} strokeWidth="4.5" fill="none" strokeLinecap="round" />;
      case "excited":
        return <path d="M88 118 q22 30 44 0 z" fill={theme.deep} />;
      case "content":
        return <path d="M92 122 q18 12 36 0" stroke={theme.deep} strokeWidth="4.5" fill="none" strokeLinecap="round" />;
      case "sad":
        return <path d="M90 128 q20 -16 40 0" stroke={theme.deep} strokeWidth="4.5" fill="none" strokeLinecap="round" />;
      case "lonely":
        return <path d="M96 126 q14 -8 28 0" stroke={theme.deep} strokeWidth="4.5" fill="none" strokeLinecap="round" />;
      case "sleepy":
        return <circle cx={110} cy={124} r={6} fill="none" stroke={theme.deep} strokeWidth="4" />;
    }
  };

  const body = () => {
    switch (shape) {
      case "cat":
        return (
          <g>
            <path d="M70 60 L62 30 L92 52 Z" fill={theme.primary} />
            <path d="M150 60 L158 30 L128 52 Z" fill={theme.primary} />
            <ellipse cx="110" cy="112" rx="68" ry="62" fill={theme.primary} />
          </g>
        );
      case "drop":
        return <path d="M110 44 C150 96 162 124 162 138 a52 52 0 1 1 -104 0 C58 124 70 96 110 44 Z" fill={theme.primary} />;
      case "moon":
        return (
          <g>
            <circle cx="110" cy="112" r="64" fill={theme.primary} />
            <path d="M150 70 a64 64 0 1 1 -2 86 a50 50 0 1 0 2 -86 Z" fill="#fff" opacity="0.14" />
          </g>
        );
      case "sun":
        return (
          <g>
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i / 12) * Math.PI * 2;
              return <circle key={i} cx={110 + Math.cos(angle) * 78} cy={112 + Math.sin(angle) * 78} r={7} fill={theme.glow} />;
            })}
            <circle cx="110" cy="112" r="64" fill={theme.primary} />
          </g>
        );
    }
  };

  return (
    <svg viewBox="0 0 220 200" width={size} height={size * 0.91} aria-hidden style={{ overflow: "visible" }}>
      {body()}
      <circle cx="80" cy="116" r="7" fill={theme.glow} opacity="0.7" />
      <circle cx="140" cy="116" r="7" fill={theme.glow} opacity="0.7" />
      {eye(92)}
      {eye(128)}
      {mouth()}
      {sleepy && (
        <text x="158" y="64" fontSize="20" fill={theme.deep} fontWeight="700" className="cd-zzz">
          z
        </text>
      )}
    </svg>
  );
}
