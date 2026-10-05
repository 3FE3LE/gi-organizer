import { PackageOpen, SlidersHorizontal, UserCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { toggle } from '@/app/[locale]/characters/filters';
import { ActiveFilters } from '@/components/active-filters';
import { DockFold } from '@/components/dock-fold';
import { Fold } from '@/components/fold';
import { HoverLabel } from '@/components/hint';
import { SearchBox } from '@/components/search-box';
import { GROUP_LABEL, Segment, Segments } from '@/components/segmented-links';
import { StickyDock } from '@/components/sticky-dock';
import { PassiveGroup } from '@/components/weapon-passive';
import { WeaponTypeIcon } from '@/components/weapon-type-icon';
import type { Catalog } from '@/lib/data/catalog';
import { isLocale } from '@/lib/data/locales';
import { weaponKey } from '@/lib/data/weapon-types';
import { getDb } from '@/lib/db/client';
import { readWeapons } from '@/lib/player/queries';
import { getAccountCatalog } from '@/lib/player/traveler';

import {
  CLEARED,
  HELD,
  RARITIES,
  SORTS,
  WEAPONS,
  isNarrowed,
  loadWeaponFilters,
  weaponsHref,
  type WeaponFilters,
} from './filters';
import { narrowWeapons } from './narrow';
import { WeaponCard } from './weapon-card';

export const dynamic = 'force-dynamic';

const HELD_ICONS: Record<(typeof HELD)[number], typeof PackageOpen> = {
  free: PackageOpen,
  worn: UserCheck,
};

// Stretched to the row: with the passives folded every card is nearly the
// same height, and the passive line sits at the foot of each.
const GRID = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4';

/**
 * The weapons, the way the roster shows characters: what you have first, and
 * what you do not folded below it — here so its passive can be read before
 * spending a wish or a billet on it.
 *
 * One card per weapon, with every copy on it and who wields each, so "what is
 * Bennett holding" and "do I have a spare Favonius" are both a glance.
 */
export default async function WeaponsPage({
  params, searchParams,
}: PageProps<'/[locale]/equipment/weapons'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const filters = await loadWeaponFilters(searchParams);
  const base = `/${locale}/equipment/weapons`;
  const db = getDb();
  const [t, common, catalog, copies] = await Promise.all([
    getTranslations('weapons'),
    getTranslations('common'),
    getAccountCatalog(locale),
    readWeapons(db),
  ]);

  // Copies of a weapon the catalogue no longer knows have nothing to draw.
  const known = copies.filter((copy) => catalog.weapons.has(copy.weaponId));
  const { owned, missing, ownedTotal } = narrowWeapons(catalog.index.weaponsSorted, known, filters, locale);
  const narrowed = isNarrowed(filters);

  // How many of the player's own weapons each type has, for the strip.
  const typeCounts = new Map<string, number>();
  for (const id of new Set(known.map((copy) => copy.weaponId))) {
    const key = weaponKey(catalog.weapons.get(id)!.weaponType);
    if (key) typeCounts.set(key, (typeCounts.get(key) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <p className="font-mono text-xs text-muted">
        {owned.length === ownedTotal
          ? t('countAll', { count: ownedTotal, copies: known.length })
          : t('countFiltered', { shown: owned.length, total: ownedTotal })}
      </p>

      <StickyDock>
        <WeaponControls base={base} filters={filters} catalog={catalog} typeCounts={typeCounts} t={t} common={common} />
      </StickyDock>

      {ownedTotal === 0 && !narrowed && <p className="text-sm text-muted">{t('empty')}</p>}
      {narrowed && owned.length === 0 && missing.length === 0 && (
        <p className="max-w-prose text-sm text-muted">
          {t('noMatch')}{' '}
          <Link href={weaponsHref(base, filters, CLEARED)} scroll={false} className="underline hover:text-accent">
            {t('clearAllLink')}
          </Link>.
        </p>
      )}

      {/* One passive open at a time, across both lists. */}
      <PassiveGroup>
      {owned.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            {t('restHeading')} <span className="font-mono">{owned.length}</span>
          </h2>
          <ul className={GRID}>
            {owned.map((entry) => (
              <WeaponCard
                key={entry.weapon.id}
                weapon={entry.weapon}
                copies={entry.copies}
                catalog={catalog}
                locale={locale}
              />
            ))}
          </ul>
        </section>
      )}

      {/* The ones you do not have, folded as the roster folds its own: closed
          by default, open whenever a search or a chip is on — a name typed is
          a weapon being looked for, owned or not. */}
      {missing.length > 0 && (
        <Fold
          key={String(narrowed)}
          look="bare"
          defaultOpen={narrowed}
          triggerClassName="mb-3 text-sm font-medium uppercase tracking-wide text-muted hover:text-text"
          summary={(
            <>
              {t('missingHeading')}{' '}
              <span className="font-mono">{missing.length}</span>
            </>
          )}
        >
          <ul className={GRID}>
            {missing.map((weapon) => (
              <WeaponCard key={weapon.id} weapon={weapon} catalog={catalog} locale={locale} />
            ))}
          </ul>
        </Fold>
      )}
      </PassiveGroup>
    </div>
  );
}

type Messages = Awaited<ReturnType<typeof getTranslations<'weapons'>>>;

/**
 * Everything that narrows or reorders the weapons, in the dock.
 *
 * Laid out as the roster's controls are. The weapon type leads as a strip of
 * the game's own glyphs, with how many of yours each holds, and stays in the
 * bar when it docks, on a phone too: it is the cut nearly every visit makes.
 * The search sits beside it, and rarity, who holds a copy and the ordering
 * fold away under "more filters".
 */
function WeaponControls({
  base, filters, catalog, typeCounts, t, common,
}: {
  base: string;
  filters: WeaponFilters;
  catalog: Catalog;
  typeCounts: ReadonlyMap<string, number>;
  t: Messages;
  common: Awaited<ReturnType<typeof getTranslations<'common'>>>;
}) {
  // The game's own word for each type, read off a weapon that has it.
  const typeText = (key: string) =>
    catalog.index.weaponsSorted.find((weapon) => weaponKey(weapon.weaponType) === key)?.weaponText ?? key;
  const heldLabel = (held: (typeof HELD)[number]) => common(`held.${held}`);

  const picked = [
    ...(filters.q ? [{ key: 'q', label: `“${filters.q}”`, to: weaponsHref(base, filters, { q: '' }) }] : []),
    ...filters.type.map((key) => ({
      key: `type-${key}`,
      label: typeText(key),
      icon: <WeaponTypeIcon weapon={key} className="h-3.5 w-3.5" sizes="14px" />,
      to: weaponsHref(base, filters, { type: toggle(filters.type, key) }),
    })),
    ...filters.rarity.map((rarity) => ({
      key: `rarity-${rarity}`,
      label: `${rarity}★`,
      to: weaponsHref(base, filters, { rarity: toggle(filters.rarity, rarity) }),
    })),
    ...(filters.held ? [{
      key: 'held',
      label: heldLabel(filters.held),
      to: weaponsHref(base, filters, { held: null }),
    }] : []),
  ];

  // Behind the disclosure and off their default: its badge, and whether it
  // opens on load, so a shared URL does not hide the control that made it.
  const folded = filters.rarity.length + (filters.held ? 1 : 0) + (filters.sort === 'rarity' ? 0 : 1);

  return (
    <div className="card transition-[padding] duration-200">
      <div className="flex flex-col p-3">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          {/* The type strip: five cells sharing the card's width on a phone,
              fixed tiles from `sm` up. Never folded, docked or not. */}
          <div className="w-full space-y-0.5 sm:w-auto">
            <p className={GROUP_LABEL}>{t('typeLabel')}</p>
            <ul className="grid grid-cols-5 gap-1 sm:flex">
              {WEAPONS.map((key) => {
                const active = filters.type.includes(key);
                const count = typeCounts.get(key) ?? 0;
                return (
                  <li key={key} className="min-w-0 sm:shrink-0">
                    <Link
                      href={weaponsHref(base, filters, { type: toggle(filters.type, key) })}
                      scroll={false}
                      aria-current={active ? 'true' : undefined}
                      aria-label={`${typeText(key)} (${count})`}
                      className={`group relative flex h-11 w-full items-center justify-center rounded-lg border transition-colors sm:h-9 sm:w-11 ${
                        active ? 'border-accent ring-1 ring-accent' : 'border-edge bg-surface hover:border-edge-strong'
                      } ${count === 0 && !active ? 'opacity-40' : ''}`}
                    >
                      <WeaponTypeIcon weapon={key} className="h-6 w-6 sm:h-5 sm:w-5" sizes="24px" />
                      {count > 0 && (
                        <span className="tabular absolute bottom-0 right-0 rounded-tl rounded-br-[inherit] bg-ink px-1 font-mono text-2xs leading-4 text-muted">
                          {count}
                        </span>
                      )}
                      <HoverLabel text={`${typeText(key)} · ${count}`} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* The search takes whatever the row leaves. Docked on a phone it
              gives way, and the strip is the bar. */}
          <div className="w-full sm:w-auto sm:min-w-64 sm:flex-1">
            <DockFold when="docked-phone">
              <SearchBox label={t('searchLabel')} placeholder={t('searchPlaceholder')} />
            </DockFold>
          </div>
        </div>

        {picked.length > 0 && (
          <DockFold when="undocked" className="pt-2">
            <ActiveFilters
              items={picked}
              clear={weaponsHref(base, filters, CLEARED)}
              labels={{
                title: common('activeFilters'),
                clear: common('clearFilters'),
                remove: (name) => common('removeFilter', { name }),
              }}
            />
          </DockFold>
        )}
      </div>

      <DockFold when="docked">
        <Fold
          key={String(folded > 0)}
          look="row"
          defaultOpen={folded > 0}
          mark="end"
          triggerClassName="text-text"
          summary={(
            <>
              <SlidersHorizontal size={14} aria-hidden className="text-muted" />
              <span className="font-medium">{t('moreFilters')}</span>
              {folded > 0 && (
                <span className="tabular rounded-full bg-accent px-1.5 font-mono text-2xs leading-4 text-on-accent">
                  {folded}
                </span>
              )}
            </>
          )}
        >
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 px-3 py-2.5">
            <Segments label={t('rarityLabel')}>
              {RARITIES.map((rarity) => (
                <Segment
                  key={rarity}
                  to={weaponsHref(base, filters, { rarity: toggle(filters.rarity, rarity) })}
                  active={filters.rarity.includes(rarity)}
                  scroll={false}
                >
                  {rarity}★
                </Segment>
              ))}
            </Segments>

            <Segments label={t('whoLabel')}>
              <Segment to={weaponsHref(base, filters, { held: null })} active={!filters.held} scroll={false}>
                {t('allHolders')}
              </Segment>
              {HELD.map((held) => {
                const Icon = HELD_ICONS[held];
                return (
                  <Segment
                    key={held}
                    to={weaponsHref(base, filters, { held })}
                    active={filters.held === held}
                    title={heldLabel(held)}
                    scroll={false}
                  >
                    <Icon size={15} aria-hidden />
                    <span className="sr-only">{heldLabel(held)}</span>
                  </Segment>
                );
              })}
            </Segments>

            <Segments label={t('sortLabel')}>
              {SORTS.map((sort) => (
                <Segment
                  key={sort}
                  to={weaponsHref(base, filters, { sort })}
                  active={filters.sort === sort}
                  scroll={false}
                >
                  {t(`sort.${sort}`)}
                </Segment>
              ))}
            </Segments>
          </div>
        </Fold>
      </DockFold>
    </div>
  );
}
