import { PackageOpen } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { GameIcon } from '@/components/game-icon';
import { HoverLabel } from '@/components/hint';
import { WeaponPassive } from '@/components/weapon-passive';
import { WeaponTypeIcon } from '@/components/weapon-type-icon';
import { propLabel, type Catalog } from '@/lib/data/catalog';
import { formatPropValue } from '@/lib/data/props';
import { STAT_LEVEL_KEYS } from '@/lib/data/stats';
import type { WeaponView } from '@/lib/data/types';
import { weaponKey } from '@/lib/data/weapon-types';
import type { GearWeapon } from '@/lib/player/queries';

import { WeaponDetailTrigger } from './weapon-detail';

/** Copies drawn on a card before the rest fold into a count. */
const SHOWN_COPIES = 6;

/**
 * One weapon: what it is at its cap, the copies the account holds of it, and
 * its passive with the refinement slider.
 *
 * The stats are the weapon's at its last level rather than any one copy's,
 * because they are a fact about the weapon and the same line has to read for
 * one nobody owns. What differs between copies — refinement, level, who wields
 * it — is the row of chips under it, each linking to the wielder's build.
 *
 * The passive is folded to its name and slider; see `PassiveGroup`.
 *
 * Without copies it is a weapon the account does not hold: drawn dimmed, its
 * passive opening at R1.
 */
export async function WeaponCard({
  weapon,
  copies = [],
  catalog,
  locale,
}: {
  weapon: WeaponView;
  copies?: GearWeapon[];
  catalog: Catalog;
  locale: string;
}) {
  const t = await getTranslations('weapons');
  const owned = copies.length > 0;

  // The table's last row: level 90 for most, 70 for the one- and two-stars.
  const top = STAT_LEVEL_KEYS.findLast((key) => weapon.stats[key]);
  const stats = top ? weapon.stats[top] : null;
  const type = weaponKey(weapon.weaponType);
  const passive = weapon.effectName
    ? { name: weapon.effectName, refinements: weapon.refinementsRaw ?? weapon.refinements }
    : null;
  const refinement = owned ? Math.max(...copies.map((copy) => copy.refinement)) : 1;

  return (
    // Not clipped, so an opened passive can hang below it over the next row;
    // lifted above that row while it does, and squared off where they meet.
    <li className={`group/card relative isolate flex min-w-0 flex-col card-glass has-data-passive-open:z-20 has-data-passive-open:rounded-b-none has-data-passive-open:opacity-100 ${
      owned ? '' : 'opacity-70 hover:opacity-100'
    }`}>
      {/* The rarity, rising from the bottom edge as it does on the other
          cards, clipped to the card's corners by a box of its own. */}
      {weapon.rarity >= 4 && (
        <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
          <span
            className="absolute inset-x-0 bottom-0 h-2/5 opacity-20 transition-opacity duration-300 group-hover/card:opacity-30"
            style={{
              background: `linear-gradient(to top, var(${weapon.rarity >= 5 ? '--rarity-5' : '--rarity-4'}), transparent)`,
            }}
          />
        </span>
      )}

      {/* The icon and name open the weapon at full size; see `weapon-detail.tsx`. */}
      <WeaponDetailTrigger
        weaponId={weapon.id}
        locale={locale}
        name={weapon.name}
        refinement={refinement}
        className="group/open m-1.5 flex items-center gap-3 p-1.5 transition-colors hover:bg-surface-2/50"
      >
        <GameIcon
          filename={weapon.icon}
          kind="weapon"
          alt=""
          className={`h-14 w-14 shrink-0 field ${owned ? '' : 'grayscale'}`}
          sizes="56px"
        />
        <span className="block min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {type && <WeaponTypeIcon weapon={type} label={weapon.weaponText} className="h-4 w-4 shrink-0" sizes="16px" />}
            <span className="min-w-0 truncate text-sm group-hover/open:text-accent" title={weapon.name}>{weapon.name}</span>
          </span>
          <span className="flex items-baseline gap-2 font-mono text-2xs">
            <span className="text-accent" aria-label={`${weapon.rarity}★`}>{'★'.repeat(weapon.rarity)}</span>
            {top && <span className="text-muted">{t('atMax', { level: Number.parseInt(top, 10) })}</span>}
          </span>
          {/* A line each, value to the right: on one line a long substat
              name pushed its own value off a phone-width card. */}
          {stats && (
            <span className="tabular mt-0.5 block font-mono text-2xs text-muted">
              <span className="flex justify-between gap-2">
                <span className="truncate">{propLabel(catalog, 'FIGHT_PROP_ATTACK')}</span>
                <span className="text-text">{Math.round(stats.attack ?? 0)}</span>
              </span>
              {weapon.mainStatType && (
                <span className="flex justify-between gap-2">
                  <span className="truncate">{propLabel(catalog, weapon.mainStatType)}</span>
                  <span className="shrink-0 text-text">
                    {formatPropValue(weapon.mainStatType, stats.specialized ?? 0, 'ratio', locale)}
                  </span>
                </span>
              )}
            </span>
          )}
        </span>
      </WeaponDetailTrigger>

      {owned && (
        <ul className="flex flex-wrap gap-1.5 px-3 pb-2.5">
          {copies.slice(0, SHOWN_COPIES).map((copy) => (
            <li key={copy.id}>
              <CopyChip copy={copy} catalog={catalog} locale={locale} t={t} />
            </li>
          ))}
          {copies.length > SHOWN_COPIES && (
            <li className="flex h-7 items-center rounded-full border border-edge px-2 font-mono text-2xs text-muted">
              +{copies.length - SHOWN_COPIES}
            </li>
          )}
        </ul>
      )}

      {passive && (
        // At the foot, so every card in a row ends its passive on one line.
        <div className="mt-auto border-t border-edge px-3 py-2.5">
          <WeaponPassive passive={passive} refinement={refinement} />
        </div>
      )}
    </li>
  );
}

type Messages = Awaited<ReturnType<typeof getTranslations<'weapons'>>>;

/** One copy: who wields it — their face, or the bag — at what refinement and level. */
async function CopyChip({
  copy, catalog, locale, t,
}: {
  copy: GearWeapon;
  catalog: Catalog;
  locale: string;
  t: Messages;
}) {
  const chip = 'group relative flex h-7 items-center gap-1 rounded-full border pr-2 font-mono text-2xs tabular';
  const line = `R${copy.refinement} · ${copy.level}`;

  if (copy.equippedTo === null) {
    const label = t('inBag', { refinement: copy.refinement, level: copy.level });
    return (
      <span className={`${chip} border-edge pl-1.5 text-muted`} aria-label={label}>
        <PackageOpen size={14} aria-hidden />
        {line}
        <HoverLabel text={label} />
      </span>
    );
  }

  const holder = catalog.characters.get(copy.equippedTo);
  const name = holder?.name ?? `#${copy.equippedTo}`;
  const label = t('wornBy', { name, refinement: copy.refinement, level: copy.level });

  return (
    <Link
      href={`/${locale}/build/${copy.equippedTo}`}
      aria-label={label}
      className={`${chip} border-accent/40 bg-accent/5 pl-0.5 text-text transition-colors hover:border-accent`}
    >
      <GameIcon
        filename={holder?.icon}
        kind="avatar"
        className="h-6 w-6 rounded-full bg-surface-2"
        sizes="24px"
      />
      {line}
      <HoverLabel text={label} />
    </Link>
  );
}
