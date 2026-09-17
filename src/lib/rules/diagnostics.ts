import type { getTranslations } from 'next-intl/server';

import type { Diagnostic, DiagnosticCode } from './types';

/**
 * Turns a diagnostic into a sentence.
 *
 * The engine emits codes and ids and never a phrase, so this is the only file
 * that knows what a diagnostic reads like — and a diagnostic can be stored,
 * sent or compared without dragging a locale along. The sentence itself lives
 * in the `diagnostics` message namespace; this only resolves ids to names and
 * hands the result to `t`.
 */

export type Naming = {
  character: (id: number) => string;
  weapon: (id: number) => string;
  artifactSet: (id: number) => string;
  element: (type: string) => string;
  slot: (slot: string) => string;
};

type Data = Diagnostic['data'];
type T = Awaited<ReturnType<typeof getTranslations>>;

const list = (values: unknown, name: (id: number) => string) =>
  (Array.isArray(values) ? values : []).map((id) => name(Number(id))).join(', ');

/** Message keys cannot carry the dots a `DiagnosticCode` does. */
const KEYS: Record<DiagnosticCode, string> = {
  'weapon.overallocated': 'weaponOverallocated',
  'weapon.not-owned': 'weaponNotOwned',
  'gear.incomplete': 'gearIncomplete',
  'deployment.character-reused': 'deploymentCharacterReused',
  'deployment.element-not-allowed': 'deploymentElementNotAllowed',
  'aura.duplicated': 'auraDuplicated',
  'aura.unprovable': 'auraUnprovable',
  'role.missing': 'roleMissing',
  'role.excess': 'roleExcess',
  'role.unset': 'roleUnset',
  'tag.over-limit': 'tagOverLimit',
  'tag.under-limit': 'tagUnderLimit',
};

const PARAMS: Record<
  DiagnosticCode, (data: Data, naming: Naming) => Record<string, string | number>
> = {
  'weapon.overallocated': (data, naming) => ({
    weapon: naming.weapon(Number(data.weaponId)),
    refinement: String(data.refinement),
    owned: String(data.owned),
    demanded: String(data.demanded),
    holders: list(data.holders, naming.character),
  }),
  'weapon.not-owned': (data, naming) => ({
    weapon: naming.weapon(Number(data.weaponId)),
    refinement: String(data.refinement),
    holders: list(data.holders, naming.character),
  }),
  'gear.incomplete': (data, naming) => ({
    character: naming.character(Number(data.characterId)),
    missing: (Array.isArray(data.missing) ? data.missing : [])
      .map((slot) => naming.slot(String(slot))).join(', '),
  }),
  'deployment.character-reused': (data, naming) => ({
    character: naming.character(Number(data.characterId)),
  }),
  'deployment.element-not-allowed': (data, naming) => ({
    character: naming.character(Number(data.characterId)),
    element: naming.element(String(data.element)),
  }),
  'aura.duplicated': (data, naming) => ({
    set: naming.artifactSet(Number(String(data.auraId).replace('set:', ''))),
    who: list(data.characters, naming.character),
    hasPartition: data.partition ? 'yes' : 'no',
    element: data.partition ? naming.element(String(data.partition)) : '',
  }),
  'aura.unprovable': (data, naming) => ({
    set: naming.artifactSet(Number(String(data.auraId).replace('set:', ''))),
    who: list(data.characters, naming.character),
  }),
  'role.missing': (data) => ({
    roles: String(data.roles), have: String(data.have), need: String(data.need),
  }),
  'role.excess': (data) => ({
    roles: String(data.roles), have: String(data.have), allowed: String(data.allowed),
  }),
  'role.unset': (data, naming) => ({ character: naming.character(Number(data.characterId)) }),
  'tag.over-limit': (data) => ({
    have: String(data.have), tag: String(data.tag), allowed: String(data.allowed),
  }),
  'tag.under-limit': (data) => ({
    have: String(data.have), tag: String(data.tag), need: String(data.need),
  }),
};

export function describe(diagnostic: Diagnostic, naming: Naming, t: T) {
  return t(KEYS[diagnostic.code], PARAMS[diagnostic.code](diagnostic.data, naming));
}
