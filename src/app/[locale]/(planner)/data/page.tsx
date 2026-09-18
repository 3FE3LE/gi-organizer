import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { GameIcon } from '@/components/game-icon';
import { getCatalog } from '@/lib/data/catalog';
import { isLocale, type Locale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { readRoster } from '@/lib/player/characters';
import { getProfileId, readInventory } from '@/lib/player/db';


/**
 * Reading SQLite touches no request API, so Next would happily prerender this
 * page and bake the counts into the build. The player's inventory is the one
 * thing on this site that must never be a build artifact.
 */
export const dynamic = 'force-dynamic';

/**
 * What the player owns, and what the inventory cannot explain.
 *
 * The second part is the one that earns its place: a scan reads gear and the
 * character screen separately, so it can report a piece equipped on someone it
 * never recorded. Left unsaid, that gear looks assigned to nobody.
 */
export default async function InventoryPage({ params }: PageProps<'/[locale]/data'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getTranslations('data.inventoryPage');

  const catalog = await getCatalog(locale);
  const db = getDb();
  const profileId = await getProfileId(db);
  const inventory = await readInventory(db, profileId);
  const roster = await readRoster(db, profileId);

  const rostered = new Set(roster.map((entry) => entry.characterId));
  const holders = new Set(
    [...inventory.artifacts, ...inventory.weapons]
      .map((item) => item.equippedTo)
      .filter((id): id is number => id !== null),
  );
  const unrostered = [...holders].filter((id) => !rostered.has(id));

  const assignedArtifacts = inventory.artifacts.filter((piece) => piece.equippedTo !== null);
  const assignedWeapons = inventory.weapons.filter((weapon) => weapon.equippedTo !== null);

  // The scarcity view: a weapon owned in one copy cannot serve two characters,
  // and the count is the only thing that says so.
  const stock = new Map<string, { weaponId: number; refinement: number; total: number; assigned: number }>();
  for (const weapon of inventory.weapons) {
    const key = `${weapon.weaponId}|${weapon.refinement}`;
    const entry = stock.get(key) ?? {
      weaponId: weapon.weaponId, refinement: weapon.refinement, total: 0, assigned: 0,
    };
    entry.total += 1;
    if (weapon.equippedTo !== null) entry.assigned += 1;
    stock.set(key, entry);
  }

  const duplicated = [...stock.values()]
    .filter((entry) => entry.total > 1)
    .sort((a, b) => b.total - a.total);

  const name = (id: number) => catalog.characters.get(id)?.name ?? `#${id}`;

  return (
    <div className="space-y-10">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat locale={locale} label={t('artifactsStat')} value={inventory.artifacts.length}
          note={t('artifactsEquippedNote', { count: assignedArtifacts.length })} />
        <Stat locale={locale} label={t('weaponsStat')} value={inventory.weapons.length}
          note={t('weaponsEquippedNote', { count: assignedWeapons.length })} />
        <Stat locale={locale} label={t('rosterStat')} value={roster.length} note={t('rosterNote')} />
        <Stat locale={locale} label={t('unassignedStat')}
          value={inventory.artifacts.length - assignedArtifacts.length}
          note={t('unassignedNote')} />
      </dl>

      {unrostered.length > 0 && (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            {t('unrosteredTitle')}
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            {t('unrosteredHint')}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {unrostered.map((id) => (
              <li
                key={id}
                className="flex items-center gap-2 rounded border border-accent/40 bg-surface px-3 py-1.5 text-sm"
              >
                <GameIcon
                  filename={catalog.characters.get(id)?.icon}
                  kind="avatar"
                  className="h-6 w-6"
                  sizes="24px"
                />
                {name(id)}
                <span className="font-mono text-xs text-muted">
                  {t('itemsCount', {
                    count: [...inventory.artifacts, ...inventory.weapons]
                      .filter((item) => item.equippedTo === id).length,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {duplicated.length > 0 && (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            {t('duplicatedWeaponsTitle')}
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            {t('duplicatedWeaponsHint')}
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {duplicated.map((entry) => {
              const weapon = catalog.weapons.get(entry.weaponId);
              return (
                <li
                  key={`${entry.weaponId}-${entry.refinement}`}
                  className="flex items-center gap-3 card px-3 py-2"
                >
                  <GameIcon filename={weapon?.icon} kind="weapon" className="h-8 w-8" sizes="32px" />
                  <span className="flex-1 truncate text-sm">{weapon?.name ?? `#${entry.weaponId}`}</span>
                  <span className="font-mono text-xs text-muted">
                    R{entry.refinement} · {entry.assigned}/{entry.total} {t('inUseNote')}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

    </div>
  );
}

function Stat({
  label, value, note, locale,
}: { label: string; value: number; note: string; locale: Locale }) {
  return (
    <div className="tile">
      <dt className="font-mono text-2xs uppercase tracking-[0.12em] text-muted">{label}</dt>
      {/* The player's locale, not the server's: every other number on the site
          is grouped with `locale` and this one was grouped with whatever the
          machine defaults to. */}
      <dd className="mt-2 font-mono text-3xl leading-none tabular">{value.toLocaleString(locale)}</dd>
      <dd className="mt-2 font-mono text-2xs text-muted">{note}</dd>
    </div>
  );
}
