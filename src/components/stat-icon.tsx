import {
  Atom,
  BatteryCharging,
  Crosshair,
  Droplet,
  Flame,
  Gauge,
  Hammer,
  HeartPulse,
  Leaf,
  Mountain,
  Shield,
  Snowflake,
  Sword,
  Swords,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { ElementIcon } from '@/components/element-icon';
import { isPercentProp } from '@/lib/data/props';

/**
 * A stat, as a drawing and a percent sign.
 *
 * The game names flat HP and HP% the same thing and lets the number carry the
 * difference. On a stat line that works; in a column of five substats read at a
 * glance it does not, and the piece that rolled four times into flat ATK looked
 * exactly like the one that rolled into ATK%. So the name is replaced by a mark
 * that is the same for both — a drop is HP whichever kind — and the kind is
 * said once, by the `%` beside it.
 *
 * The full name stays in the accessibility tree: the icon is decoration, and
 * the text next to it is what a screen reader reads.
 */
const ICONS: Record<string, LucideIcon> = {
  FIGHT_PROP_HP: Droplet,
  FIGHT_PROP_HP_PERCENT: Droplet,
  FIGHT_PROP_ATTACK: Sword,
  FIGHT_PROP_ATTACK_PERCENT: Sword,
  FIGHT_PROP_BASE_ATTACK: Sword,
  FIGHT_PROP_DEFENSE: Shield,
  FIGHT_PROP_DEFENSE_PERCENT: Shield,
  FIGHT_PROP_ELEMENT_MASTERY: Atom,
  FIGHT_PROP_CHARGE_EFFICIENCY: BatteryCharging,
  FIGHT_PROP_CRITICAL: Crosshair,
  FIGHT_PROP_CRITICAL_HURT: Swords,
  FIGHT_PROP_HEAL_ADD: HeartPulse,
  // One per element, in the element's own colour: on a goblet the element is
  // the whole decision, and eight identically-drawn damage bonuses would be the
  // one row on the card that still has to be read as words.
  FIGHT_PROP_FIRE_ADD_HURT: Flame,
  FIGHT_PROP_WATER_ADD_HURT: Waves,
  FIGHT_PROP_ELEC_ADD_HURT: Zap,
  FIGHT_PROP_ICE_ADD_HURT: Snowflake,
  FIGHT_PROP_WIND_ADD_HURT: Wind,
  FIGHT_PROP_ROCK_ADD_HURT: Mountain,
  FIGHT_PROP_GRASS_ADD_HURT: Leaf,
  FIGHT_PROP_PHYSICAL_ADD_HURT: Hammer,
};

/** The element each damage bonus belongs to, for the tint. */
const ELEMENT_OF_PROP: Record<string, string> = {
  FIGHT_PROP_FIRE_ADD_HURT: 'ELEMENT_PYRO',
  FIGHT_PROP_WATER_ADD_HURT: 'ELEMENT_HYDRO',
  FIGHT_PROP_ELEC_ADD_HURT: 'ELEMENT_ELECTRO',
  FIGHT_PROP_ICE_ADD_HURT: 'ELEMENT_CRYO',
  FIGHT_PROP_WIND_ADD_HURT: 'ELEMENT_ANEMO',
  FIGHT_PROP_ROCK_ADD_HURT: 'ELEMENT_GEO',
  FIGHT_PROP_GRASS_ADD_HURT: 'ELEMENT_DENDRO',
};

export function StatIcon({
  prop,
  label,
  size = 13,
  className,
}: {
  prop: string;
  /** The stat's full name, for anything that cannot see the drawing. */
  label: string;
  size?: number;
  className?: string;
}) {
  // Read straight out of the table rather than through a helper: a function
  // that returns a component reads as one built during render, and the lint
  // rule that catches the real version of that mistake cannot tell them apart.
  const Icon = ICONS[prop] ?? Gauge;
  const element = ELEMENT_OF_PROP[prop];

  return (
    <span className={`inline-flex shrink-0 items-baseline gap-px ${className ?? ''}`}>
      {/* An elemental bonus is drawn with the game's own emblem for its
          element — the one mark every player already reads as "Pyro". The
          line icon is kept for everything the game draws no emblem for. */}
      {element ? (
        <span aria-hidden className="inline-flex self-center" style={{ width: size + 2, height: size + 2 }}>
          <ElementIcon element={element} className="h-full w-full" sizes="32px" />
        </span>
      ) : (
        <Icon size={size} aria-hidden className="translate-y-[0.1em] self-center" />
      )}
      {/* The one thing the drawing cannot say, and the only reason the pair of
          them is unambiguous. */}
      {isPercentProp(prop) && (
        <span aria-hidden className="font-mono text-[0.7em] leading-none text-muted">%</span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
