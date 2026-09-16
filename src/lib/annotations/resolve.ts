import type {
  AnnotationFile,
  AnnotationOverrides,
  ResolvedAnnotations,
} from './types';

/**
 * Merges the curated seed with the user's overrides.
 *
 * Pure, so the rules engine can be tested without a filesystem.
 */
export function resolveAnnotations(
  file: AnnotationFile,
  overrides: AnnotationOverrides,
  currentGameVersion: string,
): ResolvedAnnotations {
  const sets = merge(file.sets, overrides.sets);
  const characters = merge(file.characters, overrides.characters);
  const weapons = merge(file.weapons, overrides.weapons);

  // Per entry, not per file. A patch bump should produce a work queue, not
  // invalidate 63 sets at once.
  const stale: ResolvedAnnotations['stale'] = [];
  const current = Number.parseFloat(currentGameVersion);

  for (const [kind, map] of [
    ['set', sets], ['character', characters], ['weapon', weapons],
  ] as const) {
    for (const [id, entry] of map) {
      if (Number.parseFloat(entry.reviewedInVersion) < current) {
        stale.push({ kind, id, reviewedInVersion: entry.reviewedInVersion });
      }
    }
  }

  return { gameVersion: file.gameVersion, mechanics: file.mechanics, sets, characters, weapons, stale };
}

function merge<T>(
  seed: Record<string, T>,
  overrides: Record<string, T | null> | undefined,
): Map<number, T> {
  const merged = new Map<number, T>();

  for (const [id, entry] of Object.entries(seed)) merged.set(Number(id), entry);

  for (const [id, entry] of Object.entries(overrides ?? {})) {
    // `null` is a tombstone, which is how a user disables a seed entry without
    // the next seed refresh bringing it back.
    if (entry === null) merged.delete(Number(id));
    else merged.set(Number(id), entry);
  }

  return merged;
}
