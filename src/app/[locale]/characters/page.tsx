import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { GameIcon } from '@/components/game-icon';
import { getCatalog } from '@/lib/data/catalog';
import { elementColor } from '@/lib/data/elements';
import { isLocale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { readOwnedCharacterIds } from '@/lib/player/characters';
import { getProfileId } from '@/lib/player/db';
import { holdersWithGear } from '@/lib/player/queries';

/**
 * The roster, shown the way the game shows it: what you have first, what you do
 * not dimmed below.
 *
 * Ordered by release rather than alphabetically. A gallery sorted by name is a
 * lookup table; sorted by release it is a timeline of the account, which is how
 * anyone actually remembers who they pulled.
 */
export const dynamic = 'force-dynamic';

export default async function CharactersPage({ params }: PageProps<'/[locale]/characters'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = await getTranslations('characters');
  const catalog = await getCatalog(locale);
  const db = getDb();
  const owned = await readOwnedCharacterIds(db, await getProfileId(db));
  const gear = await holdersWithGear(db);

  const byRelease = [...catalog.characters.values()].sort(
    (a, b) =>
      Number.parseFloat(b.version) - Number.parseFloat(a.version) ||
      b.rarity - a.rarity ||
      a.name.localeCompare(b.name, locale),
  );

  const mine = byRelease.filter((character) => owned.has(character.id));
  const missing = byRelease.filter((character) => !owned.has(character.id));

  // Gear on a character with no roster row: the scan saw the equipment and not
  // its owner, which is worth surfacing here rather than only in the inventory.
  const orphaned = [...gear.keys()].filter((id) => !owned.has(id));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-lg font-medium">
          {t('title')}{' '}
          <span className="font-mono text-sm text-muted">
            {mine.length}/{catalog.characters.size}
          </span>
        </h1>
        <p className="font-mono text-xs text-muted">{t('sortHint')}</p>
      </header>

      {orphaned.length > 0 && (
        <p className="rounded border border-accent/40 bg-surface px-3 py-2 text-sm">
          <strong className="text-accent">{t('orphanedTitle')}</strong>{' '}
          {t('orphanedBody', {
            names: orphaned.map((id) => catalog.characters.get(id)?.name ?? `#${id}`).join(', '),
            count: orphaned.length,
          })}{' '}
          <Link href={`/${locale}/data`} className="underline hover:text-accent">
            {t('orphanedLink')}
          </Link>{' '}
          {t('orphanedHint')}
        </p>
      )}

      <Gallery locale={locale} characters={mine} owned gear={gear} t={t} eager />

      {missing.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            {t('missingHeading')} <span className="font-mono">{missing.length}</span>
          </h2>
          <Gallery locale={locale} characters={missing} owned={false} gear={gear} t={t} />
        </section>
      )}
    </div>
  );
}

type CharacterView = Awaited<ReturnType<typeof getCatalog>>['index']['charactersSorted'][number];

function Gallery({
  locale,
  characters,
  owned,
  gear,
  t,
  eager = false,
}: {
  locale: string;
  characters: CharacterView[];
  owned: boolean;
  gear: Map<number, number>;
  t: Awaited<ReturnType<typeof getTranslations<'characters'>>>;
  /** The first gallery holds the largest contentful paint; the second is below it. */
  eager?: boolean;
}) {
  if (characters.length === 0) {
    return <p className="text-sm text-muted">{t('empty')}</p>;
  }

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3">
      {characters.map((character, index) => {
        const pieces = gear.get(character.id) ?? 0;

        return (
          <li key={character.id}>
            <Link
              // An owned character's real page is their build; the catalog entry
              // is reference material, reachable from there.
              href={owned
                ? `/${locale}/build/${character.id}`
                : `/${locale}/characters/${character.id}`}
              className={`block rounded-lg border border-t-2 p-2 transition-colors hover:border-accent ${
                owned ? 'border-edge bg-surface' : 'border-edge/40 bg-surface/40'
              }`}
              style={{ borderTopColor: owned ? elementColor(character.elementType) : undefined }}
            >
              <GameIcon
                filename={character.icon}
                kind="avatar"
                className={`mx-auto h-16 w-16 ${owned ? '' : 'opacity-30 grayscale'}`}
                sizes="64px"
                // The first row is above the fold on every viewport; lazy-loading
                // it means the page paints its own empty grid first.
                priority={eager && index < 6}
              />
              <p className={`mt-1 truncate text-sm ${owned ? '' : 'text-muted'}`}>
                {character.name}
              </p>
              <p className="font-mono text-[0.65rem] text-muted">
                {t('versionLine', { version: character.version, rarity: character.rarity })}
                {owned && pieces > 0 && ` · ${pieces}/5`}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
