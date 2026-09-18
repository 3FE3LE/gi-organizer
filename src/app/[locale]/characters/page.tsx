import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ViewTransition } from 'react';

import { GameIcon } from '@/components/game-icon';
import { PrefetchLink } from '@/components/prefetch-link';
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

  const byRelease = catalog.index.charactersByRelease;
  const mine = byRelease.filter((character) => owned.has(character.id));
  const missing = byRelease.filter((character) => !owned.has(character.id));

  /*
   * Gear on a character with no roster row: the scan saw the equipment and not
   * its owner.
   *
   * Counted here and named on `/data`. This is the page where the gap is
   * noticed — a face that should be in the gallery and is not — and `/data` is
   * where it is closed, because the fix is a re-scan or an import and both live
   * there. Listing the names in both places meant the same finding computed
   * twice from two different reads, free to disagree; and this is the first
   * screen of the app, where a line of names is a wall before the roster.
   */
  const orphaned = [...gear.keys()].filter((id) => !owned.has(id)).length;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="page-title">
          {t('title')}{' '}
          <span className="font-mono text-sm text-muted">
            {mine.length}/{catalog.characters.size}
          </span>
        </h1>
        <p className="font-mono text-xs text-muted">{t('sortHint')}</p>
      </header>

      {orphaned > 0 && (
        <p className="rounded border border-accent/40 bg-surface px-3 py-2 text-sm">
          <strong className="text-accent">{t('orphanedTitle')}</strong>{' '}
          {t('orphanedBody', { count: orphaned })}{' '}
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
    <ul className="rise-stagger grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 sm:gap-4">
      {characters.map((character, index) => {
        const pieces = gear.get(character.id) ?? 0;
        const element = elementColor(character.elementType);

        return (
          <li key={character.id} style={{ '--index': index } as React.CSSProperties}>
            <PrefetchLink
              // One page per character, owned or not. There used to be two —
              // the build for yours, a catalogue entry for everyone else's —
              // and the catalogue one was a stat table and two lists of costs
              // that the build page now says in a row and seven lines.
              href={`/${locale}/build/${character.id}`}
              /* The roster the player owns is the one they walk card by card,
                 and it is bounded by what they have pulled. The catalogue
                 below it is a hundred and twenty pages nobody asked for, so
                 those warm on hover instead. */
              eager={owned}
              className={`card card-link group relative block overflow-hidden p-3 ${
                owned ? '' : 'opacity-70'
              }`}
            >
              {/* The element, as a wash behind the portrait rather than a
                  stripe on top of it: the same information, and it survives
                  being looked at for an hour. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-25 transition-opacity duration-300 group-hover:opacity-45"
                style={{ background: `radial-gradient(60% 100% at 50% 0%, ${element}, transparent 70%)` }}
              />

              <div className="relative">
                {/*
                  * The same avatar becomes the splash on the page this opens.
                  * Naming both ends is all the browser needs to move one
                  * object instead of swapping two — see `globals.css`.
                  */}
                <ViewTransition name={`character-${character.id}`} share="morph" default="none">
                  <div className="mx-auto w-20">
                    <GameIcon
                      filename={character.icon}
                      kind="avatar"
                      className={`h-20 w-20 rounded-full border border-edge bg-surface-2 ${
                        owned ? '' : 'grayscale'
                      }`}
                      sizes="80px"
                      // The first row is above the fold on every viewport; lazy-loading
                      // it means the page paints its own empty grid first.
                      priority={eager && index < 6}
                    />
                  </div>
                </ViewTransition>

                <p className={`mt-2.5 truncate text-center text-sm ${owned ? '' : 'text-muted'}`}>
                  {character.name}
                </p>
                <p className="mt-0.5 text-center font-mono text-2xs text-muted">
                  {t('versionLine', { version: character.version, rarity: character.rarity })}
                  {owned && pieces > 0 && ` · ${pieces}/5`}
                </p>
              </div>
            </PrefetchLink>
          </li>
        );
      })}
    </ul>
  );
}
