import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MoonStar,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import {
  LaylaAbortError,
  LaylaBridgeUnavailableError,
  LaylaError,
  type LaylaCharacter,
} from "@layla-network/sdk";
import { layla } from "./stats-panel/laylaClient";
import {
  dreamAutomationSettings,
  loadPanelSettings,
  queueSaveSettings,
  withDreamAutomationSettings,
  type CompanionDexSettings,
  type DreamFrequency,
} from "./stats-panel/settings";

type DreamCharacter = {
  id: string;
  name: string;
  detail: string;
  image?: string;
  imageUnavailable?: boolean;
};

const FREQUENCIES: { id: DreamFrequency; title: string; detail: string }[] = [
  { id: "nightly", title: "Every night", detail: "A fresh dream each day" },
  { id: "three-days", title: "Every 3 days", detail: "A gentle, balanced rhythm" },
  { id: "weekly", title: "Once a week", detail: "More time between dreams" },
];

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const CHARACTER_PAGE_SIZE = 10;

function shortCharacterDetail(character: LaylaCharacter) {
  const description = character.data.data.description?.trim().replace(/\s+/g, " ");
  if (!description) return "Ready to dream";
  return description.length > 62 ? `${description.slice(0, 61).trim()}…` : description;
}

function toDreamCharacter(character: LaylaCharacter): DreamCharacter {
  return {
    id: character.id,
    name: character.data.data.name?.trim() || "Layla Character",
    detail: shortCharacterDetail(character),
  };
}

function characterListErrorMessage(error: unknown) {
  if (error instanceof LaylaBridgeUnavailableError) {
    return "Open this mini-app inside Layla to load your characters.";
  }
  if (error instanceof LaylaError) return error.message;
  return "Unable to load your Layla characters.";
}

function saveErrorMessage(error: unknown) {
  if (error instanceof LaylaBridgeUnavailableError) {
    return "Open this mini-app inside Layla to save your dream settings.";
  }
  if (error instanceof LaylaError) return error.message;
  return "Unable to save your dream settings.";
}

export function DreamSettingsModal() {
  const [isOpen, setIsOpen] = useState(true);
  const [pages, setPages] = useState<Record<number, DreamCharacter[]>>({});
  const [page, setPage] = useState(0);
  const [lastPage, setLastPage] = useState<number | null>(null);
  const [isLoadingCharacters, setIsLoadingCharacters] = useState(false);
  const [characterError, setCharacterError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [enabledCharacters, setEnabledCharacters] = useState<Set<string>>(
    () => new Set(),
  );
  const [frequency, setFrequency] = useState<DreamFrequency>("three-days");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pagesRef = useRef<Record<number, DreamCharacter[]>>({});
  const imageRequestsRef = useRef<Set<string>>(new Set());
  const settingsRef = useRef<CompanionDexSettings>({});
  const settingsLoadRef = useRef<Promise<void> | null>(null);
  const settingsAbortRef = useRef<AbortController | null>(null);
  const hasStoredSelectionRef = useRef(false);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => () => settingsAbortRef.current?.abort(), []);

  // Stored settings are read once and shared by every page fetch, so a saved
  // selection always lands before the "first two characters" default runs.
  const ensureSettingsLoaded = () => {
    if (!settingsLoadRef.current) {
      // Its own controller: the read outlives whichever page fetch started it.
      const controller = new AbortController();
      settingsAbortRef.current = controller;
      settingsLoadRef.current = (async () => {
        try {
          const loaded = await loadPanelSettings(controller.signal);
          settingsRef.current = loaded;
          const dream = dreamAutomationSettings(loaded);
          if (dream?.frequency) setFrequency(dream.frequency);
          if (Array.isArray(dream?.characterIds)) {
            hasStoredSelectionRef.current = true;
            setEnabledCharacters(new Set(dream.characterIds));
          }
        } catch {
          // Keep defaults if stored settings can't be read.
        }
      })();
    }
    return settingsLoadRef.current;
  };

  const patchCharacter = (
    pageIndex: number,
    characterId: string,
    patch: Partial<DreamCharacter>,
  ) => {
    setPages((current) => {
      const rows = current[pageIndex];
      if (!rows) return current;
      return {
        ...current,
        [pageIndex]: rows.map((character) =>
          character.id === characterId ? { ...character, ...patch } : character,
        ),
      };
    });
  };

  useEffect(() => {
    if (!isOpen) return;

    const listController = new AbortController();
    const imageController = new AbortController();
    const hydrationFrames = new Set<number>();
    const imageRequests = imageRequestsRef.current;

    const hydrateImagesAfterPaint = (rows: DreamCharacter[]) => {
      const frame = requestAnimationFrame(() => {
        hydrationFrames.delete(frame);

        rows.forEach((character) => {
          if (
            character.image ||
            character.imageUnavailable ||
            imageRequests.has(character.id)
          ) {
            return;
          }

          imageRequests.add(character.id);
          void layla.characters
            .getImage(character.id, { signal: imageController.signal })
            .then((image) => {
              if (imageController.signal.aborted) return;
              patchCharacter(page, character.id, {
                image: image ?? undefined,
                imageUnavailable: image === null,
              });
            })
            .catch((error: unknown) => {
              if (error instanceof LaylaAbortError) return;
              patchCharacter(page, character.id, { imageUnavailable: true });
            })
            .finally(() => imageRequests.delete(character.id));
        });
      });

      hydrationFrames.add(frame);
    };

    const cached = pagesRef.current[page];
    hydrateImagesAfterPaint(cached ?? []);

    setIsLoadingCharacters(cached === undefined);
    setCharacterError(null);

    void (async () => {
      if (cached !== undefined) return;

      await ensureSettingsLoaded();
      if (listController.signal.aborted) return;

      // One extra row tells us whether a next page exists without a count API.
      const fetched = await layla.characters.list(
        page * CHARACTER_PAGE_SIZE,
        CHARACTER_PAGE_SIZE + 1,
        { signal: listController.signal },
      );
      if (listController.signal.aborted) return;

      setLastPage((current) =>
        fetched.length <= CHARACTER_PAGE_SIZE
          ? page
          : current === page
            ? null
            : current,
      );

      const rows = fetched.slice(0, CHARACTER_PAGE_SIZE).map(toDreamCharacter);
      setPages((current) => ({ ...current, [page]: rows }));
      setEnabledCharacters((current) => {
        if (current.size > 0 || page > 0 || hasStoredSelectionRef.current) {
          return current;
        }
        return new Set(rows.slice(0, 2).map((character) => character.id));
      });
      hydrateImagesAfterPaint(rows);
    })()
      .catch((error: unknown) => {
        if (error instanceof LaylaAbortError) return;
        setCharacterError(characterListErrorMessage(error));
      })
      .finally(() => {
        if (!listController.signal.aborted) setIsLoadingCharacters(false);
      });

    return () => {
      listController.abort();
      imageController.abort();
      hydrationFrames.forEach((frame) => cancelAnimationFrame(frame));
      imageRequests.clear();
    };
  }, [isOpen, page, loadAttempt]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => dialogRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === first || activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [isOpen]);

  const toggleCharacter = (characterId: string) => {
    setSaveError(null);
    setEnabledCharacters((current) => {
      const next = new Set(current);
      if (next.has(characterId)) next.delete(characterId);
      else next.add(characterId);
      return next;
    });
  };

  const handleSave = () => {
    const nextSettings = withDreamAutomationSettings(settingsRef.current, {
      frequency,
      characterIds: Array.from(enabledCharacters),
    });

    settingsRef.current = nextSettings;
    hasStoredSelectionRef.current = true;
    setIsSaving(true);
    setSaveError(null);

    void queueSaveSettings(nextSettings)
      .then(() => setIsOpen(false))
      .catch((error: unknown) => setSaveError(saveErrorMessage(error)))
      .finally(() => setIsSaving(false));
  };

  const retryLoad = () => {
    setPages({});
    setLastPage(null);
    setLoadAttempt((attempt) => attempt + 1);
  };

  const pageCharacters = pages[page] ?? [];
  const hasPreviousPage = page > 0;
  const hasNextPage = lastPage === null ? pageCharacters.length > 0 : page < lastPage;
  const showPagination = hasPreviousPage || hasNextPage;
  const selectedFrequency = FREQUENCIES.find((option) => option.id === frequency);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="cd-global-settings-button"
        aria-label="Open dream settings"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <Settings size={20} aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          className="cd-settings-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
              <div
                ref={dialogRef}
                className="cd-settings-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dream-settings-title"
                tabIndex={-1}
              >
                <header className="cd-settings-header">
                  <div className="cd-settings-title-icon" aria-hidden="true">
                    <MoonStar size={22} />
                  </div>
                  <div>
                    <p className="cd-settings-eyebrow">Dream settings</p>
                    <h2 id="dream-settings-title">Dream while you’re away</h2>
                    <p>
                      Choose who can dream automatically and how often their inner world
                      gets time to wander.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="cd-settings-close"
                    aria-label="Close dream settings"
                    onClick={() => setIsOpen(false)}
                  >
                    <X size={20} aria-hidden="true" />
                  </button>
                </header>

                <div className="cd-settings-content">
                  <section aria-labelledby="auto-dreamers-title">
                    <div className="cd-settings-section-heading">
                      <div>
                        <h3 id="auto-dreamers-title">Automatic dreamers</h3>
                        <p>Select the characters who can dream on their own.</p>
                      </div>
                      <span>
                        {isLoadingCharacters && pageCharacters.length === 0
                          ? "Loading…"
                          : `${enabledCharacters.size} selected`}
                      </span>
                    </div>

                    <div className="cd-settings-character-list">
                      {isLoadingCharacters && pageCharacters.length === 0
                        ? Array.from({ length: 4 }, (_, index) => (
                            <div
                              key={index}
                              className="cd-settings-character cd-settings-character-skeleton"
                              aria-hidden="true"
                            >
                              <span className="cd-settings-avatar-skeleton" />
                              <span className="cd-settings-copy-skeleton">
                                <span />
                                <span />
                              </span>
                            </div>
                          ))
                        : null}

                      {pageCharacters.map((character) => {
                        const isEnabled = enabledCharacters.has(character.id);

                        return (
                          <button
                            key={character.id}
                            type="button"
                            className="cd-settings-character"
                            role="switch"
                            aria-checked={isEnabled}
                            onClick={() => toggleCharacter(character.id)}
                          >
                            <span
                              className={`cd-settings-character-avatar${
                                !character.image && !character.imageUnavailable
                                  ? " is-loading"
                                  : ""
                              }`}
                              aria-hidden="true"
                            >
                              {character.image ? (
                                <img
                                  src={character.image}
                                  alt=""
                                  onError={() =>
                                    patchCharacter(page, character.id, {
                                      image: undefined,
                                      imageUnavailable: true,
                                    })
                                  }
                                />
                              ) : (
                                <span>{character.name.slice(0, 1).toUpperCase()}</span>
                              )}
                            </span>
                            <span className="cd-settings-character-copy">
                              <strong>{character.name}</strong>
                              <small>{character.detail}</small>
                            </span>
                            <span
                              className={`cd-settings-switch${isEnabled ? " is-on" : ""}`}
                              aria-hidden="true"
                            >
                              <span>{isEnabled ? <Check size={12} /> : null}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {showPagination && !characterError ? (
                      <nav className="cd-settings-pagination" aria-label="Character pages">
                        <button
                          type="button"
                          aria-label="Previous page of characters"
                          disabled={!hasPreviousPage || isLoadingCharacters}
                          onClick={() => setPage((current) => Math.max(0, current - 1))}
                        >
                          <ChevronLeft size={16} aria-hidden="true" />
                          <span>Back</span>
                        </button>
                        <span aria-live="polite">
                          {lastPage === null
                            ? `Page ${page + 1}`
                            : `Page ${page + 1} of ${lastPage + 1}`}
                        </span>
                        <button
                          type="button"
                          aria-label="Next page of characters"
                          disabled={!hasNextPage || isLoadingCharacters}
                          onClick={() => setPage((current) => current + 1)}
                        >
                          <span>Next</span>
                          <ChevronRight size={16} aria-hidden="true" />
                        </button>
                      </nav>
                    ) : null}

                    {characterError ? (
                      <div className="cd-settings-character-status" role="alert">
                        <span>{characterError}</span>
                        <button type="button" onClick={retryLoad}>
                          Try again
                        </button>
                      </div>
                    ) : null}

                    {!isLoadingCharacters &&
                    !characterError &&
                    pageCharacters.length === 0 ? (
                      <p className="cd-settings-character-empty">
                        No Layla characters found.
                      </p>
                    ) : null}
                  </section>

                  <section aria-labelledby="dream-frequency-title">
                    <div className="cd-settings-section-heading">
                      <div>
                        <h3 id="dream-frequency-title">Dream frequency</h3>
                        <p>One rhythm applies to every selected character.</p>
                      </div>
                    </div>

                    <div className="cd-settings-frequency-grid" role="radiogroup">
                      {FREQUENCIES.map((option) => {
                        const isSelected = frequency === option.id;

                        return (
                          <button
                            key={option.id}
                            type="button"
                            className={`cd-settings-frequency${isSelected ? " is-selected" : ""}`}
                            role="radio"
                            aria-checked={isSelected}
                            onClick={() => {
                              setSaveError(null);
                              setFrequency(option.id);
                            }}
                          >
                            <Clock3 size={17} aria-hidden="true" />
                            <strong>{option.title}</strong>
                            <small>{option.detail}</small>
                            <span className="cd-settings-radio" aria-hidden="true">
                              {isSelected ? <span /> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>

                <footer className="cd-settings-footer">
                  <div className="cd-settings-summary">
                    <Sparkles size={16} aria-hidden="true" />
                    <span>
                      {saveError
                        ? saveError
                        : enabledCharacters.size === 0
                          ? "No characters will dream automatically"
                          : `${enabledCharacters.size} character${enabledCharacters.size === 1 ? "" : "s"} · ${selectedFrequency?.title.toLowerCase()}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="cd-settings-save"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving…" : "Save preferences"}
                  </button>
                </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
