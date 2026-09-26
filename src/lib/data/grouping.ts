/**
 * The ways the roster can be grouped, and the grouping itself.
 *
 * Owned-or-not was the gallery's only shape. It answers "what do I have", but
 * the questions a player brings to a roster are as often "who do I have from
 * Natlan", "which of my Hydro characters", "what did 6.x give me" — each a
 * different partition of the same list. Keys are language-neutral, so a group
 * does not reshuffle when the language changes; the page supplies the labels.
 */

export const GROUPINGS = ['owned', 'element', 'nation', 'version', 'weapon', 'rarity'] as const;
export type Grouping = (typeof GROUPINGS)[number];

export function isGrouping(value: unknown): value is Grouping {
  return typeof value === 'string' && (GROUPINGS as readonly string[]).includes(value);
}

/**
 * The seven nations, in the order the story visits them, plus Nod-Krai and a
 * bucket for everyone who belongs to none.
 */
export const NATIONS = [
  'mondstadt', 'liyue', 'inazuma', 'sumeru', 'fontaine', 'natlan', 'nodkrai', 'snezhnaya', 'other',
] as const;
export type Nation = (typeof NATIONS)[number];

/**
 * The nation behind the game's association id.
 *
 * Read from the id rather than a localized region name, which the catalog
 * does not carry: the association is the field that is always there. The Fatui are Snezhnayan, and a suffixed id
 * (`ASSOC_SNEZHNAYA_STAR`, `ASSOC_NODKRAI_ZIBAI`) belongs to its prefix.
 */
export function nationOf(associationType: string): Nation {
  const id = associationType.replace(/^ASSOC_/, '').toLowerCase();
  if (id === 'fatui') return 'snezhnaya';
  return NATIONS.find((nation) => nation !== 'other' && id.startsWith(nation)) ?? 'other';
}

const ELEMENT_ORDER = [
  'ELEMENT_PYRO', 'ELEMENT_HYDRO', 'ELEMENT_ANEMO', 'ELEMENT_ELECTRO',
  'ELEMENT_DENDRO', 'ELEMENT_CRYO', 'ELEMENT_GEO', 'ELEMENT_NONE',
];

const WEAPON_ORDER = [
  'WEAPON_SWORD_ONE_HAND', 'WEAPON_CLAYMORE', 'WEAPON_POLE', 'WEAPON_CATALYST', 'WEAPON_BOW',
];

export type Groupable = {
  id: number;
  elementType: string;
  associationType: string;
  weaponType: string;
  rarity: number;
  version: string;
};

export type Group<T> = { key: string; characters: T[] };

/**
 * Partitions `characters`, keeping their order inside each group.
 *
 * The owned grouping is the only one where ownership is the partition; in
 * every other, what the player has comes first within its group, so the
 * gallery keeps reading as "yours, then the rest" at every heading.
 */
export function groupCharacters<T extends Groupable>(
  characters: T[],
  by: Grouping,
  owned: ReadonlySet<number>,
): Group<T>[] {
  const key = (character: T): string => {
    switch (by) {
      case 'owned': return owned.has(character.id) ? 'owned' : 'missing';
      case 'element': return character.elementType;
      case 'nation': return nationOf(character.associationType);
      // `7.1`, not `7`: a patch is what a player remembers pulling in.
      case 'version': return character.version;
      case 'weapon': return character.weaponType;
      case 'rarity': return String(character.rarity);
    }
  };

  const groups = new Map<string, T[]>();
  for (const character of characters) {
    const k = key(character);
    groups.set(k, [...(groups.get(k) ?? []), character]);
  }

  const rank = (k: string): number => {
    switch (by) {
      case 'owned': return k === 'owned' ? 0 : 1;
      case 'element': return indexOr(ELEMENT_ORDER, k);
      case 'nation': return indexOr(NATIONS as readonly string[], k);
      // Newest first, as the gallery has always read.
      case 'version': return -Number.parseFloat(k);
      case 'weapon': return indexOr(WEAPON_ORDER, k);
      case 'rarity': return -Number(k);
    }
  };

  return [...groups]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([k, members]) => ({
      key: k,
      characters: by === 'owned'
        ? members
        : [...members.filter((c) => owned.has(c.id)), ...members.filter((c) => !owned.has(c.id))],
    }));
}

function indexOr(order: readonly string[], key: string) {
  const at = order.indexOf(key);
  return at === -1 ? order.length : at;
}

/** `"9/28"` → `{ month: 9, day: 28 }`, or `null` for the few with none. */
export function parseBirthday(birthday: string | null): { month: number; day: number } | null {
  const match = birthday ? /^(\d{1,2})\/(\d{1,2})$/.exec(birthday) : null;
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { month, day } : null;
}

/**
 * Days from `today` to the next occurrence of a birthday, 0 for today.
 *
 * Counted on a fixed leap year, so a 29 February birthday is always somewhere
 * in the calendar rather than skipped three years out of four.
 */
export function daysUntil(
  birthday: { month: number; day: number },
  today: { month: number; day: number },
): number {
  const ordinal = ({ month, day }: { month: number; day: number }) =>
    Date.UTC(2024, month - 1, day) / 86_400_000;
  const diff = ordinal(birthday) - ordinal(today);
  return diff >= 0 ? diff : diff + 366;
}
