/**
 * GOOD identifies everything by a PascalCase English name — `GladiatorsFinale`,
 * `SkywardBlade`, `HuTao` — while this catalog is keyed by the game's numeric
 * ids. This is the derivation that bridges them.
 *
 * The rule is not invented here. Genshin Optimizer generates its keys from the
 * English TextMap and Inventory Kamera arrives at the same strings by a
 * different route (`ToTitleCase` then stripping `[\W]`), which is why the two
 * toolchains interoperate at all. Deriving rather than vendoring a list means a
 * new patch needs no hand-editing.
 *
 * Shared by `scripts/build-data.mts`, which emits the map, and by
 * `scripts/check-good-keys.mts`, which cross-checks it against Genshin
 * Optimizer's published keys.
 */

/**
 * Deleted outright, not treated as a separator: "Amos' Bow" is `AmosBow`, one
 * token, and "Ultimate Overlord's Mega Magic Sword" keeps `Overlords` whole.
 * Splitting on these would produce `AmosBow` too, but would break
 * `KeyOfKhajNisut` and every possessive that is followed by a letter.
 */
const DELETED = /['’‘"“”.,:;!?()]/g;

/**
 * Derives the GOOD key for an English name.
 *
 * There is no stop-word list — `of`, `the` and `no` are capitalized like any
 * other token, which is why the result is `NightOfTheSkysUnveiling` and
 * `TamayurateiNoOhanashi`.
 */
export function goodKey(englishName: string): string {
  return englishName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(DELETED, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((token) => token[0].toUpperCase() + token.slice(1))
    .join('');
}

/**
 * The lenient form, used only as an import fallback. A file whose key differs
 * from ours by casing or punctuation alone still resolves, with a warning. The
 * build asserts this space is collision-free, so the fallback can never resolve
 * to the wrong entity.
 */
export function normalizeGoodKey(key: string): string {
  return key.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export type KeyMap = Record<string, number>;

export type KeyMapResult = {
  map: KeyMap;
  /** Keys claimed by more than one id. Recorded as data, never guessed at. */
  excluded: Record<string, number[]>;
};

/**
 * Builds a name-key map, routing every ambiguous key into `excluded` rather
 * than letting one id win silently.
 *
 * `overrides` maps an id to a key, or to `null` to omit it — the Traveler is
 * keyed by element in GOOD and by gender here, so it has no derivable key.
 */
export function buildKeyMap(
  entries: { id: number; name: string }[],
  overrides: Record<number, string | null> = {},
): KeyMapResult {
  const claims = new Map<string, number[]>();

  for (const { id, name } of entries) {
    const override = overrides[id];
    if (override === null) continue;

    const key = override ?? goodKey(name);
    if (!key) continue;

    const claimants = claims.get(key);
    if (claimants) claimants.push(id);
    else claims.set(key, [id]);
  }

  const map: KeyMap = {};
  const excluded: Record<string, number[]> = {};

  for (const [key, ids] of [...claims].sort(([a], [b]) => a.localeCompare(b))) {
    if (ids.length === 1) map[key] = ids[0];
    else excluded[key] = ids.sort((a, b) => a - b);
  }

  return { map, excluded };
}

/**
 * Fails the build when two distinct keys collapse to the same lenient form.
 * Without this the import fallback would be ambiguous, and an ambiguous
 * fallback silently equips the wrong set.
 */
export function assertNoLenientCollision(label: string, map: KeyMap) {
  const seen = new Map<string, string>();

  for (const key of Object.keys(map)) {
    const normalized = normalizeGoodKey(key);
    const previous = seen.get(normalized);
    if (previous) {
      throw new Error(
        `good keys: ${label} "${key}" and "${previous}" both normalize to ` +
        `"${normalized}"; the lenient import fallback would be ambiguous`,
      );
    }
    seen.set(normalized, key);
  }
}
