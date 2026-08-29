import type { Character } from "../types";

export function getEmotions(character: Character) {
  let energy = "Bored";
  if (character.vitals.energy < 30) energy = "Sleepy";
  else if (character.vitals.energy > 70) energy = "Energetic";

  let fed = "Peckish";
  if (character.vitals.fed < 30) fed = "Hungry";
  else if (character.vitals.fed > 70) fed = "Fed";

  let social = "Content";
  if (character.vitals.social < 30) social = "Lonely";
  else if (character.vitals.social > 70) social = "Warm";

  return `${energy}, ${fed}, ${social}`;
}
