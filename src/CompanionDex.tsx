import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, TouchEvent } from "react";
import { CompanionBackground } from "./companion-dex/components/CompanionBackground";
import { CompanionControls } from "./companion-dex/components/CompanionControls";
import { StatsPanel } from "./companion-dex/components/StatsPanel";
import { AUTO_THEME_FROM_IMAGE, EMPTY_THEME } from "./companion-dex/data";
import { useLaylaCompanions } from "./companion-dex/hooks/useLaylaCompanions";
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
  const { companions: laylaCompanions, error, hasMore, isLoading, loadMore } = useLaylaCompanions();
  const backgroundRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const companions = laylaCompanions;

  const themeOf = useCallback((character: Character) => derivedThemes[character.id] ?? character.theme, [derivedThemes]);
  const activeIndex = companions.length > 0 ? Math.min(active, companions.length - 1) : 0;
  const character = companions[activeIndex] ?? null;
  const theme = character ? themeOf(character) : EMPTY_THEME;

  const go = useCallback((index: number) => {
    const nextIndex = Math.max(0, index);

    if (nextIndex < companions.length) {
      setActive(nextIndex);
      return;
    }

    if (nextIndex === companions.length && hasMore) {
      void loadMore().then((loadedCount) => {
        if (loadedCount > 0) {
          setActive(nextIndex);
        }
      });
    }
  }, [companions.length, hasMore, loadMore]);

  useEffect(() => {
    if (!AUTO_THEME_FROM_IMAGE) return;

    companions.forEach((companion) => {
      if (!companion.image) return;

      extractThemeFromUrl(companion.image, (derivedTheme) => {
        setDerivedThemes((themes) => ({ ...themes, [companion.id]: derivedTheme }));
      });
    });
  }, [companions]);

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
  }, [activeIndex, applyParallax]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(activeIndex + 1);
      if (event.key === "ArrowLeft") go(activeIndex - 1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, go]);

  const onTouchStart = (event: TouchEvent) => {
    if ((event.target as Element).closest(".cd-panel")) {
      touch.current = null;
      return;
    }

    touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (!touch.current) return;

    const dx = event.changedTouches[0].clientX - touch.current.x;
    const dy = event.changedTouches[0].clientY - touch.current.y;

    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      go(dx < 0 ? activeIndex + 1 : activeIndex - 1);
    }

    touch.current = null;
  };

  if (!character) {
    return (
      <div className="companion-dex" style={companionDexVars(theme)}>
        <div className="cd-scroll">
          <div className="cd-top">
            <div className="cd-brand">
              <span style={{ width: 12, height: 12, borderRadius: 4, background: "var(--primary)", transition: "background .6s" }} />
              CompanionDex
            </div>
          </div>
          <div
            style={{
              minHeight: "100vh",
              display: "grid",
              placeItems: "center",
              padding: 24,
              color: "var(--ink-1)",
              textAlign: "center",
            }}
          >
            {error ?? (isLoading ? "Loading Layla characters..." : "No Layla characters found.")}
          </div>
        </div>
      </div>
    );
  }

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
        <CompanionControls active={activeIndex} companions={companions} hasMore={hasMore} isLoadingMore={isLoading} themeOf={themeOf} onSelect={go} />
        <div className="cd-spacer" />
        <div className="cd-panel">
          {error ? (
            <div style={{ padding: "0 24px 18px", color: "var(--ink-1)", fontSize: 13, textAlign: "center" }}>{error}</div>
          ) : null}
          <StatsPanel character={character} theme={theme} imageFailed={imageFailed} />
        </div>
      </div>
    </div>
  );
}
