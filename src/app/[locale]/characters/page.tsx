import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ViewTransition } from 'react';

import { GameIcon } from '@/components/game-icon';
import { PrefetchLink } from '@/components/prefetch-link';
import { SectionTabs } from '@/components/section-tabs';
import { getCatalog } from '@/lib/data/catalog';
import { elementColor } from '@/lib/data/elements';
import {
  GROUPINGS,
  type Grouping,
  daysUntil,
  groupCharacters,
  isGrouping,
  parseBirthday,
} from '@/lib/data/grouping';
import { isLocale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { readOwnedCharacterIds } from '@/lib/player/characters';
import { getProfileId } from '@/lib/player/db';
import { holdersWithGear } from '@/lib/player/queries';
import { readRegion } from '@/lib/player/region';
import { gameDate } from '@/lib/rules/game-day';

/**
 * The roster, shown the way the game shows it: what you have first, what you do
 * not dimmed below.
 *
 * Ordered by release rather than alphabetically. A gallery sorted by name is a
 * lookup table; sorted by release it is a timeline of the account, which is how
 * anyone actually remembers who they pulled.
 *
 * Two views over the same list, both in the URL so a bookmark lands where it
 * says: the gallery, grouped by whichever partition the question needs
 * (`?group=`), and a calendar of birthdays (`?view=calendar`).
 */
export const dynamic = 'force-dynamic';

export default async function CharactersPage({
  params,
  searchParams,
}: PageProps<'/[locale]/characters'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const query = await searchParams;
  const view = query.view === 'calendar' ? 'calendar' : 'gallery';
  const grouping: Grouping = isGrouping(query.group) ? query.group : 'owned';

  const t = await getTranslations('characters');
  const catalog = await getCatalog(locale);
  const db = getDb();
  const owned = await readOwnedCharacterIds(db, await getProfileId(db));
  const gear = await holdersWithGear(db);

  const byRelease = catalog.index.charactersByRelease;
  const mine = byRelease.filter((character) => owned.has(character.id));

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
        {view === 'gallery' && <p className="font-mono text-xs text-muted">{t('sortHint')}</p>}
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

      <SectionTabs
        tabs={[
          {
            href: `/${locale}/characters${grouping === 'owned' ? '' : `?group=${grouping}`}`,
            label: t('viewGallery'),
            active: view === 'gallery',
          },
          {
            href: `/${locale}/characters?view=calendar`,
            label: t('viewCalendar'),
            active: view === 'calendar',
          },
        ]}
      />

      {view === 'calendar' ? (
        <BirthdayCalendar
          locale={locale}
          characters={byRelease}
          owned={owned}
          today={gameDate(new Date(), await readRegion(db))}
          t={t}
        />
      ) : (
        <>
          <GroupPicker locale={locale} current={grouping} t={t} />
          {grouping === 'owned' && mine.length === 0 && (
            <p className="text-sm text-muted">{t('empty')}</p>
          )}
          {groupCharacters(byRelease, grouping, owned).map((group, index) => {
            const count = group.characters.filter((character) => owned.has(character.id)).length;
            // "Yours" needs no heading: it is the page's own title. Every
            // other group is one partition among several, and says which.
            const heading = grouping === 'owned' && group.key === 'owned'
              ? null
              : groupLabel(grouping, group.key, group.characters[0], t);

            return (
              <section key={group.key}>
                {heading && (
                  <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
                    {heading}{' '}
                    <span className="font-mono">
                      {grouping === 'owned' ? group.characters.length : `${count}/${group.characters.length}`}
                    </span>
                  </h2>
                )}
                <Gallery
                  locale={locale}
                  characters={group.characters}
                  owned={owned}
                  gear={gear}
                  t={t}
                  eager={index === 0}
                />
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

type CharacterView = Awaited<ReturnType<typeof getCatalog>>['index']['charactersSorted'][number];
type Messages = Awaited<ReturnType<typeof getTranslations<'characters'>>>;

function groupLabel(grouping: Grouping, key: string, sample: CharacterView, t: Messages) {
  switch (grouping) {
    case 'owned': return t('missingHeading');
    case 'nation': return t(`nation.${key}` as 'nation.other');
    case 'element': return sample.elementText || t('nation.other');
    case 'weapon': return sample.weaponText || key;
    case 'version': return t('versionGroup', { version: key });
    case 'rarity': return `${key}★`;
  }
}

/** The partitions, as links: each one is a URL, and the current one says so. */
function GroupPicker({ locale, current, t }: { locale: string; current: Grouping; t: Messages }) {
  return (
    <nav aria-label={t('groupBy')} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 font-mono text-2xs uppercase tracking-wide text-muted">{t('groupBy')}</span>
      {GROUPINGS.map((grouping) => (
        <Link
          key={grouping}
          href={`/${locale}/characters${grouping === 'owned' ? '' : `?group=${grouping}`}`}
          aria-current={grouping === current ? 'page' : undefined}
          scroll={false}
          className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
            grouping === current
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-edge text-muted hover:border-accent/50 hover:text-text'
          }`}
        >
          {t(`grouping.${grouping}`)}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Birthdays, a month to a card.
 *
 * The game marks a character's birthday with a mail and a gift, and only on
 * the day itself — so what the player needs is "who is next", said first, and
 * the year under it to look ahead in. "Today" is the game server's date, not
 * the machine's: the mail arrives on the server's day.
 */
function BirthdayCalendar({
  locale,
  characters,
  owned,
  today,
  t,
}: {
  locale: string;
  characters: CharacterView[];
  owned: ReadonlySet<number>;
  today: { month: number; day: number };
  t: Messages;
}) {
  const dated = characters
    .map((character) => ({ character, birthday: parseBirthday(character.birthday) }))
    .filter((entry): entry is { character: CharacterView; birthday: { month: number; day: number } } =>
      entry.birthday !== null)
    .map((entry) => ({ ...entry, until: daysUntil(entry.birthday, today) }));

  // Yours first: the gift is claimable only for a character you have.
  const upcoming = [...dated]
    .sort((a, b) =>
      a.until - b.until
      || Number(owned.has(b.character.id)) - Number(owned.has(a.character.id)))
    .slice(0, 6);

  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
  const months = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    name: monthName.format(new Date(Date.UTC(2024, index, 1))),
    entries: dated
      .filter((entry) => entry.birthday.month === index + 1)
      .sort((a, b) => a.birthday.day - b.birthday.day || a.character.name.localeCompare(b.character.name, locale)),
  }));

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">{t('upcomingHeading')}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {upcoming.map(({ character, birthday, until }) => (
            <li key={character.id}>
              <PrefetchLink
                href={`/${locale}/build/${character.id}`}
                className={`card card-link flex flex-col items-center gap-1.5 p-3 text-center ${
                  until === 0 ? 'border-accent' : ''
                } ${owned.has(character.id) ? '' : 'opacity-60'}`}
              >
                <GameIcon
                  filename={character.icon}
                  kind="avatar"
                  className={`h-14 w-14 rounded-full border border-edge bg-surface-2 ${
                    owned.has(character.id) ? '' : 'grayscale'
                  }`}
                  sizes="56px"
                />
                <span className="w-full truncate text-sm">{character.name}</span>
                <span className={`font-mono text-2xs ${until === 0 ? 'text-accent' : 'text-muted'}`}>
                  {until === 0
                    ? t('birthdayToday')
                    : t('birthdayIn', { days: until, date: `${birthday.day}/${birthday.month}` })}
                </span>
              </PrefetchLink>
            </li>
          ))}
        </ul>
      </section>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((month) => (
          <li
            key={month.month}
            className={`card p-3 ${month.month === today.month ? 'border-accent' : ''}`}
          >
            <h3 className="mb-2 flex items-baseline justify-between text-sm capitalize">
              <span className={month.month === today.month ? 'text-accent' : ''}>{month.name}</span>
              <span className="font-mono text-2xs text-muted">{month.entries.length}</span>
            </h3>
            <ul className="space-y-1">
              {month.entries.map(({ character, birthday }) => {
                const isToday = birthday.month === today.month && birthday.day === today.day;
                const mine = owned.has(character.id);

                return (
                  <li key={character.id}>
                    <Link
                      href={`/${locale}/build/${character.id}`}
                      className={`flex items-center gap-2 rounded px-1 py-0.5 text-xs transition-colors hover:bg-ink/50 ${
                        isToday ? 'bg-accent/10 text-accent' : mine ? '' : 'text-muted'
                      }`}
                    >
                      <span className="tabular w-5 shrink-0 text-right font-mono text-2xs text-muted">
                        {birthday.day}
                      </span>
                      <GameIcon
                        filename={character.icon}
                        kind="avatar"
                        className={`h-6 w-6 shrink-0 rounded-full bg-surface-2 ${mine ? '' : 'opacity-60 grayscale'}`}
                        sizes="24px"
                      />
                      <span className="min-w-0 flex-1 truncate">{character.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

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
  owned: ReadonlySet<number>;
  gear: Map<number, number>;
  t: Messages;
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
        const mine = owned.has(character.id);
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
              eager={mine}
              className={`card card-link group relative block overflow-hidden p-3 ${
                mine ? '' : 'opacity-70'
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
                        mine ? '' : 'grayscale'
                      }`}
                      sizes="80px"
                      // The first row is above the fold on every viewport; lazy-loading
                      // it means the page paints its own empty grid first.
                      priority={eager && index < 6}
                    />
                  </div>
                </ViewTransition>

                <p className={`mt-2.5 truncate text-center text-sm ${mine ? '' : 'text-muted'}`}>
                  {character.name}
                </p>
                <p className="mt-0.5 text-center font-mono text-2xs text-muted">
                  {t('versionLine', { version: character.version, rarity: character.rarity })}
                  {mine && pieces > 0 && ` · ${pieces}/5`}
                </p>
              </div>
            </PrefetchLink>
          </li>
        );
      })}
    </ul>
  );
}
