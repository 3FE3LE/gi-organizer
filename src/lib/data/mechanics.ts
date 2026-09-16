/**
 * Mechanics a team can be built around.
 *
 * Membership is derived, not curated, because the criterion is a fact rather
 * than a judgement: an entity's own effect text either names the mechanic or it
 * does not. That is the opposite of set stackability, where the text is
 * systematically silent and hand-curation is the only honest option.
 *
 * What it means is narrower than it looks. A tag says the entity *interacts*
 * with the mechanic, not that it is good at it — every Anemo character mentions
 * Swirl. It is a filter, not a ranking, and the curated layer refines it.
 */
export const MECHANICS = {
  'stellar-conduct': { term: 'Stellar-Conduct', label: 'Conducción Estelar' },
  'stellar-swirl': { term: 'Stellar Swirl', label: 'Remolino Estelar' },
  'stellar-glimmer': { term: 'Stellar Glimmer', label: 'Destello Estelar' },
  hexerei: { term: 'Hexerei', label: 'Hexerei' },
  nightsoul: { term: 'Nightsoul', label: 'Nocturnia' },
  'bond-of-life': { term: 'Bond of Life', label: 'Vínculo Vital' },
  vaporize: { term: 'Vaporize', label: 'Vaporización' },
  melt: { term: 'Melt', label: 'Derretido' },
  overloaded: { term: 'Overloaded', label: 'Sobrecarga' },
  'electro-charged': { term: 'Electro-Charged', label: 'Electrocargado' },
  superconduct: { term: 'Superconduct', label: 'Superconductor' },
  swirl: { term: 'Swirl', label: 'Remolino' },
  crystallize: { term: 'Crystallize', label: 'Cristalización' },
  bloom: { term: 'Bloom', label: 'Floración' },
  hyperbloom: { term: 'Hyperbloom', label: 'Hiperfloración' },
  burgeon: { term: 'Burgeon', label: 'Exuberancia' },
  burning: { term: 'Burning', label: 'Combustión' },
  quicken: { term: 'Quicken', label: 'Intensificación' },
  aggravate: { term: 'Aggravate', label: 'Agravamiento' },
  spread: { term: 'Spread', label: 'Densidad' },
  'lunar-charged': { term: 'Lunar-Charged', label: 'Lunicargado' },
  'lunar-bloom': { term: 'Lunar-Bloom', label: 'Lunifloración' },
} as const;

export type MechanicId = keyof typeof MECHANICS;

export const MECHANIC_IDS = Object.keys(MECHANICS) as MechanicId[];

/**
 * Longer terms first, so `Stellar Swirl` is not also counted as plain `Swirl`.
 * A specialised mechanic is not an instance of the general one.
 */
export const MECHANICS_BY_SPECIFICITY = MECHANIC_IDS
  .slice()
  .sort((a, b) => MECHANICS[b].term.length - MECHANICS[a].term.length);

export type MechanicIndex = {
  characters: Record<string, MechanicId[]>;
  artifactSets: Record<string, MechanicId[]>;
  weapons: Record<string, MechanicId[]>;
};

/** Tags for one blob of English text. */
export function tagsIn(text: string): MechanicId[] {
  const found: MechanicId[] = [];
  let remaining = text;

  for (const id of MECHANICS_BY_SPECIFICITY) {
    const { term } = MECHANICS[id];
    if (!remaining.includes(term)) continue;
    found.push(id);
    // Remove it so a broader term cannot claim the same words.
    remaining = remaining.split(term).join(' ');
  }

  return found.sort();
}
