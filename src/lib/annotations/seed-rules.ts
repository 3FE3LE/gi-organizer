import type { Rule } from '@/lib/rules/types';

import type { ResolvedAnnotations } from './types';

/**
 * Generates the non-stacking rules from the curated annotations, so the curator
 * edits stackability in one place and the rules follow.
 *
 * A user disables a seed rule rather than deleting it, which keeps a seed
 * refresh idempotent.
 */
export function seedRules(annotations: ResolvedAnnotations, disabled: Set<string>): Rule[] {
  const rules: Rule[] = [];

  for (const [setId, annotation] of annotations.sets) {
    if (annotation.stacking !== 'non-stacking' && annotation.stacking !== 'partitioned') {
      continue;
    }

    const id = `seed:non-stacking:${setId}`;

    rules.push({
      kind: 'non-stacking',
      id,
      enabled: !disabled.has(id),
      source: 'seed',
      auraId: `set:${setId}`,
      // 4-piece, because that is the tier every non-stacking set effect sits on.
      providers: [{ type: 'artifact-set', setId, pieces: 4 }],
      partition: annotation.partitionField
        ? { by: 'declaration', field: annotation.partitionField }
        : { by: 'none' },
      maxProviders: 1,
      scope: 'team',
      severity: 'error',
      // Undeclared cannot be condemned, only flagged.
      unprovableSeverity: 'warning',
      label: annotation.note ?? `Set ${setId} does not stack`,
      note: annotation.note,
    });
  }

  return rules.sort((a, b) => a.id.localeCompare(b.id));
}
