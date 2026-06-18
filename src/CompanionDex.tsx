import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, TouchEvent } from "react";
import { CompanionBackground } from "./companion-dex/components/CompanionBackground";
import { CompanionControls } from "./companion-dex/components/CompanionControls";
import { StatsPanel } from "./companion-dex/components/StatsPanel";
import { AUTO_THEME_FROM_IMAGE, COMPANIONS } from "./companion-dex/data";
import type { Character, Theme } from "./companion-dex/types";
import { extractThemeFromUrl } from "./companion-dex/utils/themeFromImage";
import "./companion-dex/CompanionDex.css";

const companionDexVars = (theme: Theme) =>
  ({
    "--primary": theme.primary,
    "--deep": theme.primary,
    "--glow": theme.glow,
    "--page": "#1c1c1c",
    "--track": "#333333",
    "--chip": "#383838",
    "--hair": "#343434",
    "--text": "#ffffff",
    "--ink-1": "#cfcfd4",
    "--ink-2": "#888888",
    "--muted": "#888888",
    "--display": "'Fredoka', ui-rounded, system-ui, sans-serif",
    "--mono": "ui-monospace, 'SF Mono', Menlo, monospace",
  }) as CSSProperties;

export default function CompanionDex() {
  const [active, setActive] = useState(0);
  const [derivedThemes, setDerivedThemes] = useState<Record<string, Theme>>({});
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const backgroundRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const themeOf = useCallback((character: Character) => derivedThemes[character.id] ?? character.theme, [derivedThemes]);
  const character = COMPANIONS[active];
  const theme = themeOf(character);

  const go = useCallback((index: number) => {
    setActive(Math.max(0, Math.min(COMPANIONS.length - 1, index)));
  }, []);

  useEffect(() => {
    if (!AUTO_THEME_FROM_IMAGE) return;

    COMPANIONS.forEach((companion) => {
      if (!companion.image) return;

      extractThemeFromUrl(companion.image, (derivedTheme) => {
        setDerivedThemes((themes) => ({ ...themes, [companion.id]: derivedTheme }));
      });
    });
  }, []);

  const applyParallax = useCallback(() => {
    const el = backgroundRef.current?.querySelector<HTMLElement>(".cd-bg-media");
    if (!el) return;

    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const shift = Math.min(y * 0.22, window.innerHeight * 0.28);
    el.style.transform = `translateY(${-shift}px)`;
  }, []);

  useEffect(() => {
    let ticking = false;
    const onWindowScroll = () => {
      if (ticking) return;

      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        applyParallax();
      });
    };

    window.addEventListener("scroll", onWindowScroll, { passive: true });
    return () => window.removeEventListener("scroll", onWindowScroll);
  }, [applyParallax]);

  useEffect(() => {
    applyParallax();
  }, [active, applyParallax]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(active + 1);
      if (event.key === "ArrowLeft") go(active - 1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, go]);

  const onTouchStart = (event: TouchEvent) => {
    touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (!touch.current) return;

    const dx = event.changedTouches[0].clientX - touch.current.x;
    const dy = event.changedTouches[0].clientY - touch.current.y;

    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      go(dx < 0 ? active + 1 : active - 1);
    }

    touch.current = null;
  };

  const imageFailed = !!failedImages[character.id];

  return (
    <div className="companion-dex" style={companionDexVars(theme)} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <CompanionBackground
        character={character}
        theme={theme}
        imageFailed={imageFailed}
        backgroundRef={backgroundRef}
        onImageError={() => setFailedImages((failures) => ({ ...failures, [character.id]: true }))}
      />

      <div className="cd-scroll">
        <CompanionControls active={active} companions={COMPANIONS} themeOf={themeOf} onSelect={go} />
        <div className="cd-spacer" />
        <div className="cd-panel">
          <StatsPanel character={character} theme={theme} imageFailed={imageFailed} />
        </div>
      </div>
    </div>
  );
}
