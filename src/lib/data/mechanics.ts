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
  'stellar-conduct': { term: 'Stellar-Conduct' },
  'stellar-swirl': { term: 'Stellar Swirl' },
  'stellar-glimmer': { term: 'Stellar Glimmer' },
  hexerei: { term: 'Hexerei' },
  nightsoul: { term: 'Nightsoul' },
  'bond-of-life': { term: 'Bond of Life' },
  vaporize: { term: 'Vaporize' },
  melt: { term: 'Melt' },
  overloaded: { term: 'Overloaded' },
  'electro-charged': { term: 'Electro-Charged' },
  superconduct: { term: 'Superconduct' },
  swirl: { term: 'Swirl' },
  crystallize: { term: 'Crystallize' },
  bloom: { term: 'Bloom' },
  hyperbloom: { term: 'Hyperbloom' },
  burgeon: { term: 'Burgeon' },
  burning: { term: 'Burning' },
  quicken: { term: 'Quicken' },
  aggravate: { term: 'Aggravate' },
  spread: { term: 'Spread' },
  'lunar-charged': { term: 'Lunar-Charged' },
  'lunar-bloom': { term: 'Lunar-Bloom' },
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
