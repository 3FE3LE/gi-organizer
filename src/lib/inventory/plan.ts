import {
  artifactFingerprint,
  artifactIdentity,
  upgradeCost,
  weaponFingerprint,
} from './fingerprint';
import type {
  ImportIssue,
  ImportSource,
  NormalizedArtifact,
  NormalizedCharacter,
  NormalizedImport,
  NormalizedWeapon,
} from './model';

/**
 * Turns an import into a reviewable plan. Pure — it decides nothing and writes
 * nothing, so the user sees what will happen before it does.
 *
 * The premise the whole tool rests on is that the inventory is true. A silent
 * duplicate breaks that premise more thoroughly than a missing piece, so every
 * ambiguity here becomes a conflict for a person to settle rather than a guess.
 */

export type OwnedArtifact = NormalizedArtifact & {
  id: string;
  source: ImportSource;
  seenAt: string;
};

export type OwnedWeapon = NormalizedWeapon & {
  id: string;
  source: ImportSource;
  seenAt: string;
};

export type Inventory = {
  artifacts: OwnedArtifact[];
  weapons: OwnedWeapon[];
};

export type ArtifactVerdict =
  /** Byte-identical to a piece already owned. Nothing to write. */
  | { kind: 'unchanged'; incoming: NormalizedArtifact; ownedId: string }
  /** The same physical piece, levelled. Keeps its id and its assignment. */
  | { kind: 'upgraded'; incoming: NormalizedArtifact; ownedId: string }
  /** Nothing it could be. A new piece. */
  | { kind: 'added'; incoming: NormalizedArtifact }
  /** More than one candidate. The user decides; nothing is written meanwhile. */
  | { kind: 'ambiguous'; incoming: NormalizedArtifact; candidateIds: string[] };

export type WeaponVerdict =
  | { kind: 'unchanged'; fingerprint: string; count: number }
  | { kind: 'added'; incoming: NormalizedWeapon; count: number }
  | { kind: 'absent'; fingerprint: string; ownedIds: string[] };

export type ImportPlan = {
  coverage: 'full' | 'partial';
  observedAt: string;
  origin: string;
  source: ImportSource;
  artifacts: {
    verdicts: ArtifactVerdict[];
    /** Owned pieces the file did not mention. Only meaningful when `full`. */
    absentIds: string[];
  };
  weapons: {
    verdicts: WeaponVerdict[];
    /**
     * The file's weapons verbatim. Reconciliation is by count, so a copy that
     * simply changed hands produces no verdict at all — re-deriving holders
     * needs the list, not the diff.
     */
    incoming: NormalizedWeapon[];
  };
  characters: NormalizedCharacter[];
  issues: ImportIssue[];
  /**
   * Per section, set when a `full` import looks like a partial scan of it — a
   * run that failed halfway, or one taken with a filter left on in the game's
   * inventory, would otherwise propose deleting most of a collection. A
   * suspect section is read as partial: nothing in it is pruned or unequipped.
   */
  suspect: { artifacts: Suspicion | null; weapons: Suspicion | null };
};

/** Numbers rather than a sentence, so the review screen can say it in the user's language. */
export type Suspicion =
  /** Fewer items worn in the file than on the account. */
  | { kind: 'worn'; seenWorn: number; ownedWorn: number }
  /** More of the account missing than a cleanup removes. */
  | { kind: 'absent'; absent: number; ownedCount: number };

export type PlanOptions = {
  /**
   * Below this share of the account's worn items still worn in the file, the
   * section is marked suspect.
   */
  wornThreshold?: number;
  /** Above this share of owned items missing from the file, likewise. */
  absentThreshold?: number;
};

export function planImport(
  inventory: Inventory,
  incoming: NormalizedImport,
  options: PlanOptions = {},
): ImportPlan {
  const artifacts = planArtifacts(inventory.artifacts, incoming.artifacts);
  const weapons = planWeapons(inventory.weapons, incoming.weapons, incoming.coverage);

  // Judged whatever was asked for, so the preview can warn before the choice
  // is made rather than the apply quietly overruling it afterwards.
  const judge = (owned: Held[], seen: Held[], absent: number) =>
    incoming.coverage === 'full' ? suspicion(owned, seen, absent, options) : null;

  const weaponsAbsent = weapons.reduce(
    (total, verdict) => total + (verdict.kind === 'absent' ? verdict.ownedIds.length : 0), 0);

  return {
    coverage: incoming.coverage,
    observedAt: incoming.observedAt,
    origin: incoming.origin,
    source: incoming.source,
    artifacts: {
      verdicts: artifacts.verdicts,
      // A partial source saw eight characters; its silence is not evidence.
      absentIds: incoming.coverage === 'full' ? artifacts.absentIds : [],
    },
    weapons: { verdicts: weapons, incoming: incoming.weapons },
    characters: incoming.characters,
    issues: incoming.issues,
    suspect: {
      artifacts: judge(inventory.artifacts, incoming.artifacts, artifacts.absentIds.length),
      weapons: judge(inventory.weapons, incoming.weapons, weaponsAbsent),
    },
  };
}

type Held = { equippedTo: number | null };

/**
 * A scan that failed midway looks exactly like a collection that was sold. The
 * difference is that one of them is recoverable and the other is not.
 *
 * What tells them apart is what is worn. A cleanup feeds or sells spare pieces
 * and leaves the characters dressed; a filter left on in the game's inventory
 * — only locked pieces, only +0 — hides what they wear along with the rest.
 * The share missing alone cannot tell: a real cleanup had removed 41% of a
 * collection, and a guard on that share kept every one of those pieces.
 */
function suspicion(
  owned: Held[],
  seen: Held[],
  absent: number,
  options: PlanOptions,
): Suspicion | null {
  const wornThreshold = options.wornThreshold ?? 0.8;
  const absentThreshold = options.absentThreshold ?? 0.8;

  const ownedWorn = owned.filter((item) => item.equippedTo !== null).length;
  const seenWorn = seen.filter((item) => item.equippedTo !== null).length;

  if (ownedWorn > 0 && seenWorn < ownedWorn * wornThreshold) {
    return { kind: 'worn', seenWorn, ownedWorn };
  }
  if (owned.length > 0 && absent / owned.length > absentThreshold) {
    return { kind: 'absent', absent, ownedCount: owned.length };
  }
  return null;
}

function planArtifacts(owned: OwnedArtifact[], incoming: NormalizedArtifact[]) {
  const byFingerprint = new Map<string, OwnedArtifact[]>();
  const byIdentity = new Map<string, OwnedArtifact[]>();

  for (const piece of owned) {
    push(byFingerprint, artifactFingerprint(piece), piece);
    push(byIdentity, artifactIdentity(piece), piece);
  }

  /**
   * Matched pieces are consumed. Two identical flowers in the file against one
   * owned flower must produce one `unchanged` and one `added` — without
   * consumption the second silently vanishes into the first.
   */
  const claimed = new Set<string>();
  const verdicts: ArtifactVerdict[] = [];

  // Exact matches first, across the whole file, so an unchanged piece can never
  // be consumed by a levelling match that a later exact match then needs.
  const unresolved: NormalizedArtifact[] = [];

  for (const piece of incoming) {
    const exact = (byFingerprint.get(artifactFingerprint(piece)) ?? [])
      .find((candidate) => !claimed.has(candidate.id));

    if (exact) {
      claimed.add(exact.id);
      verdicts.push({ kind: 'unchanged', incoming: piece, ownedId: exact.id });
    } else {
      unresolved.push(piece);
    }
  }

  for (const piece of unresolved) {
    const candidates = (byIdentity.get(artifactIdentity(piece)) ?? [])
      .flatMap((candidate) => {
        if (claimed.has(candidate.id)) return [];
        const cost = upgradeCost(piece, candidate);
        return cost === null ? [] : [{ candidate, cost }];
      });

    if (candidates.length === 0) {
      verdicts.push({ kind: 'added', incoming: piece });
      continue;
    }

    // Across a wide level gap the roll budget admits unrelated pieces too, so
    // fitting is not enough — the real match is the one that needs the fewest
    // unexplained rolls. Only a tie at that minimum is genuinely ambiguous.
    const cheapest = Math.min(...candidates.map((entry) => entry.cost));
    const best = candidates.filter((entry) => entry.cost === cheapest);

    if (best.length === 1) {
      claimed.add(best[0].candidate.id);
      verdicts.push({ kind: 'upgraded', incoming: piece, ownedId: best[0].candidate.id });
    } else {
      verdicts.push({
        kind: 'ambiguous',
        incoming: piece,
        candidateIds: best.map((entry) => entry.candidate.id),
      });
    }
  }

  const absentIds = owned.filter((piece) => !claimed.has(piece.id)).map((piece) => piece.id);

  return { verdicts, absentIds };
}

/**
 * Weapons reconcile by count. Two copies of one weapon at one refinement are
 * indistinguishable in principle, so an upgrade heuristic would be a guess
 * dressed as a match.
 */
function planWeapons(
  owned: OwnedWeapon[],
  incoming: NormalizedWeapon[],
  coverage: 'full' | 'partial',
): WeaponVerdict[] {
  const ownedByFingerprint = new Map<string, OwnedWeapon[]>();
  for (const weapon of owned) push(ownedByFingerprint, weaponFingerprint(weapon), weapon);

  const incomingByFingerprint = new Map<string, NormalizedWeapon[]>();
  for (const weapon of incoming) push(incomingByFingerprint, weaponFingerprint(weapon), weapon);

  const verdicts: WeaponVerdict[] = [];

  for (const [fingerprint, group] of incomingByFingerprint) {
    const have = ownedByFingerprint.get(fingerprint) ?? [];
    const keep = Math.min(have.length, group.length);

    if (keep > 0) verdicts.push({ kind: 'unchanged', fingerprint, count: keep });
    if (group.length > keep) {
      verdicts.push({ kind: 'added', incoming: group[0], count: group.length - keep });
    }
  }

  if (coverage === 'full') {
    for (const [fingerprint, group] of ownedByFingerprint) {
      const seen = incomingByFingerprint.get(fingerprint)?.length ?? 0;
      if (seen < group.length) {
        verdicts.push({
          kind: 'absent',
          fingerprint,
          ownedIds: group.slice(seen).map((weapon) => weapon.id),
        });
      }
    }
  }

  return verdicts;
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

/** Counts for the review screen. */
export function summarizePlan(plan: ImportPlan) {
  const counts = { unchanged: 0, upgraded: 0, added: 0, ambiguous: 0 };
  for (const verdict of plan.artifacts.verdicts) counts[verdict.kind] += 1;

  return {
    artifacts: { ...counts, absent: plan.artifacts.absentIds.length },
    weapons: plan.weapons.verdicts.reduce(
      (totals, verdict) => {
        if (verdict.kind === 'unchanged') totals.unchanged += verdict.count;
        else if (verdict.kind === 'added') totals.added += verdict.count;
        else totals.absent += verdict.ownedIds.length;
        return totals;
      },
      { unchanged: 0, added: 0, absent: 0 },
    ),
    characters: plan.characters.length,
    issues: plan.issues.length,
  };
}
