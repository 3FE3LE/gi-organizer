import type { Diagnostic, DiagnosticCode } from '../types';

/**
 * Turns a diagnostic into a sentence.
 *
 * The engine emits codes and ids and never a phrase, so this is the only file
 * that knows any language — and a diagnostic can be stored, sent or compared
 * without dragging a locale along.
 */

export type Naming = {
  character: (id: number) => string;
  weapon: (id: number) => string;
  artifactSet: (id: number) => string;
  element: (type: string) => string;
  slot: (slot: string) => string;
};

type Data = Diagnostic['data'];

const list = (values: unknown, name: (id: number) => string) =>
  (Array.isArray(values) ? values : []).map((id) => name(Number(id))).join(', ');

export const MESSAGES: Record<DiagnosticCode, (data: Data, naming: Naming) => string> = {
  'weapon.overallocated': (data, naming) =>
    `${naming.weapon(Number(data.weaponId))} R${data.refinement}: tienes ${data.owned} ` +
    `y la asignaste a ${data.demanded} (${list(data.holders, naming.character)})`,

  'weapon.not-owned': (data, naming) =>
    `${naming.weapon(Number(data.weaponId))} R${data.refinement} no está en tu inventario ` +
    `(${list(data.holders, naming.character)})`,

  'gear.incomplete': (data, naming) =>
    `${naming.character(Number(data.characterId))} le faltan piezas: ` +
    `${(Array.isArray(data.missing) ? data.missing : []).map((slot) => naming.slot(String(slot))).join(', ')}`,

  'deployment.character-reused': (data, naming) =>
    `${naming.character(Number(data.characterId))} está en dos equipos del mismo despliegue`,

  'deployment.element-not-allowed': (data, naming) =>
    `${naming.character(Number(data.characterId))} es ${naming.element(String(data.element))}, ` +
    'que no entra en esta temporada',

  'aura.duplicated': (data, naming) => {
    const who = list(data.characters, naming.character);
    const setId = Number(String(data.auraId).replace('set:', ''));
    const partition = data.partition ? ` para ${naming.element(String(data.partition))}` : '';
    return `${naming.artifactSet(setId)} no acumula${partition}: lo llevan ${who}`;
  },

  'aura.unprovable': (data, naming) => {
    const who = list(data.characters, naming.character);
    const setId = Number(String(data.auraId).replace('set:', ''));
    return `${naming.artifactSet(setId)}: sin declarar el elemento, no se puede saber si ` +
      `${who} se pisan`;
  },

  'role.missing': (data) =>
    `al equipo le falta ${data.roles} (tiene ${data.have}, necesita ${data.need})`,

  'role.excess': (data) =>
    `demasiados ${data.roles}: ${data.have} para un máximo de ${data.allowed}`,

  'role.unset': (data, naming) =>
    `${naming.character(Number(data.characterId))} no tiene rol declarado en este equipo`,

  'tag.over-limit': (data) =>
    `${data.have} con la etiqueta "${data.tag}", máximo ${data.allowed}`,

  'tag.under-limit': (data) =>
    `${data.have} con la etiqueta "${data.tag}", necesitas ${data.need}`,
};

export function describe(diagnostic: Diagnostic, naming: Naming) {
  return MESSAGES[diagnostic.code](diagnostic.data, naming);
}
