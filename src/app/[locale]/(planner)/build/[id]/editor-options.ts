import { getTranslations } from 'next-intl/server';

import { statLabel, type Catalog } from '@/lib/data/catalog';
import { elementDamageProp } from '@/lib/data/elements';
import type { CharacterView } from '@/lib/data/types';
import { CHOOSABLE_SLOTS } from '@/lib/rules/piece-score';
import { roleLabel } from '@/lib/rules/role-labels';
import { TEAM_ROLES } from '@/lib/rules/types';

/**
 * What the build editor is allowed to offer.
 *
 * Only the props a slot can actually roll as a main stat — so the form cannot
 * express a build the game could never produce. The schema cannot state any
 * of this; the catalog can.
 */

export type Option = { value: string; label: string };

const SUBSTAT_PROPS = [
  'FIGHT_PROP_CRITICAL', 'FIGHT_PROP_CRITICAL_HURT',
  'FIGHT_PROP_ATTACK_PERCENT', 'FIGHT_PROP_ATTACK',
  'FIGHT_PROP_HP_PERCENT', 'FIGHT_PROP_HP',
  'FIGHT_PROP_DEFENSE_PERCENT', 'FIGHT_PROP_DEFENSE',
  'FIGHT_PROP_ELEMENT_MASTERY', 'FIGHT_PROP_CHARGE_EFFICIENCY',
];

const ELEMENTAL = [
  'FIGHT_PROP_FIRE_ADD_HURT', 'FIGHT_PROP_WATER_ADD_HURT', 'FIGHT_PROP_ICE_ADD_HURT',
  'FIGHT_PROP_ELEC_ADD_HURT', 'FIGHT_PROP_WIND_ADD_HURT', 'FIGHT_PROP_ROCK_ADD_HURT',
  'FIGHT_PROP_GRASS_ADD_HURT', 'FIGHT_PROP_PHYSICAL_ADD_HURT',
];

const BASE_MAIN_STATS = [
  'FIGHT_PROP_HP_PERCENT', 'FIGHT_PROP_ATTACK_PERCENT', 'FIGHT_PROP_DEFENSE_PERCENT',
  'FIGHT_PROP_ELEMENT_MASTERY',
];

export type EditorOptions = Awaited<ReturnType<typeof editorOptionsFor>>;

export async function editorOptionsFor(catalog: Catalog) {
  // `statLabel`, not `propLabel`: several of these lists pair a flat stat with
  // its percent twin (ATK/ATK%, HP/HP%, DEF/DEF%), and the game names both
  // identically — a picker needs the "%" to tell them apart.
  const propOption = (prop: string): Option => ({ value: prop, label: statLabel(catalog, prop) });
  const t = await getTranslations('common.role');
  const slotLabel = await getTranslations('common.slot');

  return {
    roles: TEAM_ROLES.map((role) => ({ value: role, label: roleLabel(t, role) })),
    mainStatsBySlot: {
      sands: [...BASE_MAIN_STATS, 'FIGHT_PROP_CHARGE_EFFICIENCY'].map(propOption),
      goblet: [...BASE_MAIN_STATS, ...ELEMENTAL].map(propOption),
      circlet: [
        ...BASE_MAIN_STATS,
        'FIGHT_PROP_CRITICAL', 'FIGHT_PROP_CRITICAL_HURT', 'FIGHT_PROP_HEAL_ADD',
      ].map(propOption),
    },
    substats: SUBSTAT_PROPS.map(propOption),
    slots: CHOOSABLE_SLOTS.map((slot) => ({
      key: slot, label: slotLabel.has(slot) ? slotLabel(slot) : slot,
    })),
  };
}

/**
 * The stats a goal can be set on: the four the character screen leads with, the
 * two crit rows, recharge, healing, and this character's own element.
 */
export function goalPropsFor(character: CharacterView): string[] {
  return [
    'FIGHT_PROP_HP', 'FIGHT_PROP_ATTACK', 'FIGHT_PROP_DEFENSE',
    'FIGHT_PROP_ELEMENT_MASTERY', 'FIGHT_PROP_CHARGE_EFFICIENCY',
    'FIGHT_PROP_CRITICAL', 'FIGHT_PROP_CRITICAL_HURT', 'FIGHT_PROP_HEAL_ADD',
    elementDamageProp(character.elementType),
    'FIGHT_PROP_PHYSICAL_ADD_HURT',
  ].filter((prop): prop is string => prop !== null);
}
