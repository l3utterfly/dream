// Per-character dream behaviour, kept separate from the prompt templates in
// dream-prompts.ts so both the panel and the background task can read it.

export interface CharacterDreamOptions {
  // Negative on purpose: an absent (or false) flag keeps the original
  // behaviour where a dream may pick up an old conversation. Only an explicit
  // true pins every dream to the out-of-the-blue path, so settings written
  // before this option existed keep working untouched.
  doNotContinueConversations?: boolean;
}

export interface CharacterDreamOptionsSource {
  characters?: Record<
    string,
    {
      dreamOptions?: CharacterDreamOptions;
    }
  >;
}

export function dreamOptionsForCharacter(
  settings: CharacterDreamOptionsSource,
  characterId: string,
): CharacterDreamOptions | undefined {
  return settings.characters?.[characterId]?.dreamOptions;
}

export function allowsContinuingConversations(
  options: CharacterDreamOptions | undefined,
) {
  return options?.doNotContinueConversations !== true;
}

export function characterAllowsContinuingConversations(
  settings: CharacterDreamOptionsSource,
  characterId: string,
) {
  return allowsContinuingConversations(
    dreamOptionsForCharacter(settings, characterId),
  );
}
