import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ViewTransition } from 'react';

import { ActiveFilters } from '@/components/active-filters';
import { CardLegend, CardMark, CardWash, CharacterPortrait, LevelTalents } from '@/components/character-card';
import { DockFold } from '@/components/dock-fold';
import { ElementIcon } from '@/components/element-icon';
import { GameIcon } from '@/components/game-icon';
import { PrefetchLink } from '@/components/prefetch-link';
import { SectionTabs } from '@/components/section-tabs';
import { StickyDock } from '@/components/sticky-dock';
import { GROUP_LABEL, Segment, Segments } from '@/components/segmented-links';
import { WeaponTypeIcon } from '@/components/weapon-type-icon';
import { CakeSlice, SlidersHorizontal } from 'lucide-react';

import { HoverLabel } from '@/components/hint';
import { Fold } from '@/components/fold';
import {
  GROUPINGS,
  type Grouping,
  daysUntil,
  groupCharacters,
  parseBirthday,
} from '@/lib/data/grouping';
import { isLocale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { readRoster, type CharacterBuild } from '@/lib/player/characters';
import { getProfileId } from '@/lib/player/db';
import { readEnkaAccount } from '@/lib/player/enka-profile';
import { readRatings } from '@/lib/rules/rating-plan';
import { currentProfileId } from '@/lib/player/profile';
import { holdersWithGear } from '@/lib/player/queries';
import { readRegion } from '@/lib/player/region';
import { gameDate, gameWeekday } from '@/lib/rules/game-day';
import { getAccountCatalog } from '@/lib/player/traveler';
import { requestTimer } from '@/lib/timing';

import {
  ELEMENTS,
  RARITIES,
  SORTS,
  WEAPONS,
  elementKey,
  isNarrowed,
  loadRosterFilters,
  rosterHref,
  toggle,
  weaponKey,
  type RosterFilters,
} from './filters';
import { narrowRoster } from './narrow';
import { cardProgress, talentBookDays, type CardProgress } from '@/lib/rules/card-progress';
import { SearchBox } from './search-box';

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

  const filters = await loadRosterFilters(searchParams);
  const { view, group: grouping } = filters;
  const base = `/${locale}/characters`;

  const timer = requestTimer('/characters');
  const t = await getTranslations('characters');
  const common = await getTranslations('common');
  const db = getDb();
  // Everything the gallery reads, at once. They were awaited in turn, and on a
  // new instance that queued a catalogue parse behind the database handshake
  // and three queries behind each other, each a round trip of ~15 ms. The
  // steps now overlap, so the timing line reads each one's own length and the
  // total is the longest of them rather than their sum.
  const profileId = await timer.step('auth', currentProfileId());
  const [catalog, rosterRows, gear, region, enka, enkaT, ratingT] = await Promise.all([
    timer.step('catalog', getAccountCatalog(locale)),
    timer.step('roster', getProfileId(db).then(() => readRoster(db, profileId))),
    timer.step('gear', holdersWithGear(db)),
    timer.step('region', readRegion(db)),
    timer.step('enka', readEnkaAccount(db)),
    getTranslations('enka'),
    getTranslations('rating'),
  ]);
  // Who the Enka showcase shows, whose progress it keeps current on its own.
  const showcase = { ids: new Set(enka.profile?.showcase ?? []), label: enkaT('inShowcase') };
  // After the catalog: a rating reads it for the weapons' rarities.
  const ratingMap = await timer.step('rating', readRatings(catalog, db));
  const ratings = new Map([...ratingMap].map(([id, rating]) => [id, {
    score: rating.score,
    title: rating.akashaTop !== null
      ? ratingT('titleAkasha', { score: rating.score, top: rating.akashaTop })
      : ratingT('title', { score: rating.score }),
  }]));
  const roster = new Map(rosterRows.map((entry) => [entry.characterId, entry]));
  const owned: ReadonlySet<number> = new Set(roster.keys());
  timer.done();

  const byRelease = catalog.index.charactersByRelease;
  const mine = byRelease.filter((character) => owned.has(character.id));
  const elementCounts = new Map<string, number>();
  for (const character of mine) {
    const key = elementKey(character.elementType);
    if (key) elementCounts.set(key, (elementCounts.get(key) ?? 0) + 1);
  }
  const shown = narrowRoster(byRelease, filters, roster, locale);
  const narrowed = isNarrowed(filters);

  // Birthdays among the characters you have, on the game server's date: the
  // gift is claimable on the day only, so today's is worth a line above the
  // gallery rather than a trip to the calendar.
  const gameToday = gameDate(new Date(), region);
  const birthdaysIn = (days: number) => mine.filter((character) => {
    const birthday = parseBirthday(character.birthday);
    return birthday !== null && daysUntil(birthday, gameToday) === days;
  });
  const birthdaysToday = birthdaysIn(0);
  const birthdaysTomorrow = birthdaysIn(1);
  const list = new Intl.ListFormat(locale, { type: 'conjunction' });

  // Where each character you have is headed, for the ring and the marks on
  // their card. "Today" is the game server's day, as in the plan.
  const weekday = gameWeekday(new Date(), region);
  const progress = new Map(rosterRows.map((entry) => [
    entry.characterId,
    cardProgress(
      entry,
      talentBookDays(
        catalog.characters.get(entry.characterId)?.talentCosts ?? {},
        (id) => catalog.materials.get(id)?.days,
      ),
      weekday,
    ),
  ]));

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
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="page-title">
          {t('title')}{' '}
          <span className="font-mono text-sm text-muted">
            {mine.length}/{byRelease.length}
          </span>
        </h1>
        {/* Not on a phone: the sort's own strip already says it, and the line
            cost a row above the gallery. */}
        {view === 'gallery' && (
          <p className="hidden font-mono text-xs text-muted sm:block">{t(`sortHints.${filters.sort}`)}</p>
        )}
      </header>

      {orphaned > 0 && (
        <p className="notice text-sm">
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
            href: rosterHref(base, filters, { view: 'gallery' }),
            label: t('viewGallery'),
            active: view === 'gallery',
          },
          {
            href: rosterHref(base, filters, { view: 'calendar' }),
            label: t('viewCalendar'),
            active: view === 'calendar',
          },
        ]}
      />

      {view === 'gallery' && (birthdaysToday.length > 0 || birthdaysTomorrow.length > 0) && (
        <BirthdayNotice
          locale={locale}
          today={birthdaysToday}
          tomorrow={birthdaysTomorrow}
          calendarHref={rosterHref(base, filters, { view: 'calendar' })}
          names={(characters) => list.format(characters.map((character) => character.name))}
          t={t}
        />
      )}

      {view === 'calendar' ? (
        <BirthdayCalendar
          locale={locale}
          characters={byRelease}
          owned={owned}
          today={gameToday}
          t={t}
        />
      ) : (
        <>
          {/* Docked under the header once the gallery scrolls past it, as the
              artifact filters are: regrouping is something done mid-list. */}
          <StickyDock>
            <RosterControls base={base} filters={filters} catalog={catalog} elementCounts={elementCounts} t={t} common={common} />
          </StickyDock>
          <div className="-mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            {narrowed ? (
              <p className="flex flex-wrap items-baseline gap-x-3 font-mono text-xs text-muted">
                {t('resultCount', { shown: shown.length, total: byRelease.length })}
                <Link
                  href={rosterHref(base, filters, { q: '', element: [], weapon: [], rarity: [] })}
                  scroll={false}
                  className="underline hover:text-accent"
                >
                  {t('clearFilters')}
                </Link>
              </p>
            ) : <span />}
            <CardLegend labels={{
              summary: t('legendSummary'),
              ring: t('legendRing'),
              talents: t('legendTalents'),
              today: t('legendToday'),
              todayText: t('booksToday'),
              planned: t('legendPlanned'),
              showcase: enkaT('legendShowcase'),
            }} />
          </div>
          {/*
            * Keyed by the view, as the plan's results are: a filter change is
            * the old gallery leaving and the new one arriving, so it
            * crossfades rather than cutting, and a portrait in both — the
            * `character-<id>` names below — glides to where it now sits
            * instead of vanishing and reappearing.
            */}
          <ViewTransition key={rosterHref(base, filters)} enter="fade-in" exit="fade-out" default="none">
          <div className="space-y-6">
          {grouping === 'owned' && mine.length === 0 && !narrowed && (
            <p className="text-sm text-muted">{t('empty')}</p>
          )}
          {narrowed && shown.length === 0 && (
            <p className="text-sm text-muted">{t('noMatch')}</p>
          )}
          {groupCharacters(shown, grouping, owned).map((group, index) => {
            const count = group.characters.filter((character) => owned.has(character.id)).length;
            // "Yours" needs no heading: it is the page's own title. Every
            // other group is one partition among several, and says which.
            const heading = grouping === 'owned' && group.key === 'owned'
              ? null
              : groupLabel(grouping, group.key, group.characters[0], t);

            /*
              * The characters you do not have, folded. They were half the page
              * at the size of the ones you do, so the first screen of the
              * gallery was a scroll away from its end. Closed by default, and
              * open whenever a search or a chip is on — a name typed is
              * somebody being looked for, owned or not.
              */
            if (grouping === 'owned' && group.key === 'missing') {
              return (
                <Fold
                  key={`${group.key}-${narrowed}`}
                  look="bare"
                  defaultOpen={narrowed}
                  triggerClassName="mb-3 text-sm font-medium uppercase tracking-wide text-muted hover:text-text"
                  summary={(
                    <>
                      {heading}{' '}
                      <span className="font-mono">{group.characters.length}</span>
                    </>
                  )}
                >
                  <Gallery
                    locale={locale}
                    characters={group.characters}
                    roster={roster}
                    progress={progress}
                    showcase={showcase}
                    ratings={ratings}
                    t={t}
                    compact
                  />
                </Fold>
              );
            }

            return (
              <section key={group.key}>
                {heading && (
                  <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-muted">
                    {grouping === 'element' && (
                      <ElementIcon element={group.characters[0].elementType} className="h-5 w-5" sizes="20px" />
                    )}
                    {heading}{' '}
                    <span className="font-mono">
                      {grouping === 'owned' ? group.characters.length : `${count}/${group.characters.length}`}
                    </span>
                  </h2>
                )}
                <Gallery
                  locale={locale}
                  characters={group.characters}
                  roster={roster}
                  progress={progress}
                  showcase={showcase}
                  ratings={ratings}
                  t={t}
                  eager={index === 0}
                />
              </section>
            );
          })}
          </div>
          </ViewTransition>
        </>
      )}
    </div>
  );
}

type CharacterView = Awaited<ReturnType<typeof getAccountCatalog>>['index']['charactersSorted'][number];
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

type Catalog = Awaited<ReturnType<typeof getAccountCatalog>>;

/**
 * Everything that narrows or reorders the gallery, in the dock.
 *
 * Laid out as the artifacts page is: the search, the grouping and a strip of
 * elements in the open — what gets changed halfway down, and what stays in
 * reach docked — and the ordering, weapon and rarity under "more filters".
 * Four rows of segments and chips side by side ran off the card on anything
 * narrower than a desktop. Docked, the disclosure folds away and what it had
 * picked stays as chips to undo, so a docked bar never hides why the gallery
 * is shorter than it looks.
 *
 * Every chip is a link built from the same parsers the page reads, so a
 * filtered roster is a URL that can be bookmarked and shared.
 */
function RosterControls({
  base, filters, catalog, elementCounts, t, common,
}: {
  base: string; filters: RosterFilters; catalog: Catalog;
  /** How many of the player's own characters each element has. */
  elementCounts: ReadonlyMap<string, number>;
  t: Messages;
  common: Awaited<ReturnType<typeof getTranslations<'common'>>>;
}) {
  // The game's own words for each element and weapon, read off a character
  // who has one — the catalog carries them per character, not as a table.
  const sample = catalog.index.charactersByRelease;
  const elementText = (key: string) =>
    sample.find((character) => elementKey(character.elementType) === key)?.elementText ?? key;
  const weaponText = (key: string) =>
    sample.find((character) => weaponKey(character.weaponType) === key)?.weaponText ?? key;
  const elementType = (key: string) => `ELEMENT_${key.toUpperCase()}`;

  const picked = [
    // The search is a filter like the others, and docked on a phone the box
    // is the one control left, so it is named here too.
    ...(filters.q ? [{ key: 'q', label: `“${filters.q}”`, to: rosterHref(base, filters, { q: '' }) }] : []),
    ...filters.element.map((key) => ({
      key: `element-${key}`,
      label: elementText(key),
      icon: <ElementIcon element={elementType(key)} className="h-3.5 w-3.5" sizes="14px" />,
      to: rosterHref(base, filters, { element: toggle(filters.element, key) }),
    })),
    ...filters.weapon.map((key) => ({
      key: `weapon-${key}`,
      label: weaponText(key),
      icon: <WeaponTypeIcon weapon={key} className="h-3.5 w-3.5" sizes="14px" />,
      to: rosterHref(base, filters, { weapon: toggle(filters.weapon, key) }),
    })),
    ...filters.rarity.map((rarity) => ({
      key: `rarity-${rarity}`,
      label: `${rarity}★`,
      to: rosterHref(base, filters, { rarity: toggle(filters.rarity, rarity) }),
    })),
  ];

  // Behind the disclosure and off their default: its badge, and whether it
  // opens on load, so a shared URL does not hide the control that made it.
  const folded = filters.weapon.length + filters.rarity.length + (filters.sort === 'release' ? 0 : 1);

  return (
    <div className="card transition-[padding] duration-200">
      <div className="flex flex-col p-3">
        {/* The same 12px above the first row as below the last, where the
            fold begins. On a phone the spacing between rows lives inside each
            fold, so a row folded away while docked leaves no gap behind;
            from `sm` up nothing folds and the row gap does it. */}
        <div className="flex flex-wrap items-end gap-x-4 sm:gap-y-2">
          {/* The search takes whatever the row leaves, so the three end at
              the card's edge instead of short of it. */}
          <div className="w-full sm:w-auto sm:min-w-64 sm:flex-1">
            <SearchBox label={t('searchLabel')} placeholder={t('searchPlaceholder')} />
          </div>
          {/* Grouping stays out here: it is changed as often as the search,
              and behind a disclosure it would be two clicks every time.
              Docked on a phone only the search stays. */}
          <DockFold when="docked-phone" className="min-w-0 pt-2 sm:pt-0">
            {/* Six groupings are wider than a phone; the strip wraps to a
                second row there rather than hiding the last ones off the
                card. */}
            <Segments label={t('groupBy')}>
              {GROUPINGS.map((grouping) => (
                <Segment
                  key={grouping}
                  to={rosterHref(base, filters, { group: grouping })}
                  active={grouping === filters.group}
                  scroll={false}
                >
                  {t(`grouping.${grouping}`)}
                </Segment>
              ))}
            </Segments>
          </DockFold>

          {/* The element, as the set is on the artifacts page: a strip of
              emblems with how many of yours each one has. In the same row as
              the search and the grouping, which on a desktop has the room for
              all three; on a phone it wraps to a line of its own. */}
          {/* Full width on a phone, so the seven cells share the card's
              width; `DockFold`'s own box is sized by its content. */}
          <div className="w-full sm:w-auto">
          <DockFold when="docked-phone" className="space-y-0.5 pt-2 sm:pt-0">
            <p className={GROUP_LABEL}>{t('filterElement')}</p>
            {/* Seven across on a phone as a grid of equal cells, so the row
                always fits the card rather than scrolling its last emblem off
                it; fixed tiles from `sm` up, where there is room. */}
            <ul className="grid grid-cols-7 gap-1 sm:flex sm:gap-1">
              {ELEMENTS.map((key) => {
                const active = filters.element.includes(key);
                const count = elementCounts.get(key) ?? 0;
                return (
                  <li key={key} className="min-w-0 sm:shrink-0">
                    <Link
                      href={rosterHref(base, filters, { element: toggle(filters.element, key) })}
                      scroll={false}
                      aria-current={active ? 'true' : undefined}
                      aria-label={`${elementText(key)} (${count})`}
                      className={`group relative flex aspect-square w-full max-w-11 items-center justify-center rounded-lg border transition-colors sm:h-9 sm:w-9 ${
                        active ? 'border-accent ring-1 ring-accent' : 'border-edge bg-surface hover:border-edge-strong'
                      } ${count === 0 && !active ? 'opacity-40 grayscale' : ''}`}
                    >
                      <ElementIcon element={elementType(key)} className="h-3/5 w-3/5 sm:h-5 sm:w-5" sizes="24px" />
                      {count > 0 && (
                        <span className="tabular absolute bottom-0 right-0 rounded-tl rounded-br-[inherit] bg-ink px-1 font-mono text-2xs leading-4 text-muted">
                          {count}
                        </span>
                      )}
                      <HoverLabel text={`${elementText(key)} · ${count}`} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </DockFold>
          </div>
        </div>


        {picked.length > 0 && (
          <DockFold when="undocked" className="pb-1.5">
            <ActiveFilters
              items={picked}
              clear={rosterHref(base, filters, { q: '', element: [], weapon: [], rarity: [] })}
              labels={{
                title: common('activeFilters'),
                clear: common('clearFilters'),
                remove: (name) => common('removeFilter', { name }),
              }}
            />
          </DockFold>
        )}
      </div>

      {/* The rest, as on the artifacts page: folded, with a count of what is
          on inside it. Folded away entirely while docked, where the summary
          above says what it holds. */}
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
            <Segments label={t('sortBy')}>
              {SORTS.map((sort) => (
                <Segment
                  key={sort}
                  to={rosterHref(base, filters, { sort })}
                  active={sort === filters.sort}
                  scroll={false}
                >
                  {t(`sort.${sort}`)}
                </Segment>
              ))}
            </Segments>
            <Segments label={t('filterWeapon')}>
              {WEAPONS.map((key) => (
                <Segment
                  key={key}
                  to={rosterHref(base, filters, { weapon: toggle(filters.weapon, key) })}
                  active={filters.weapon.includes(key)}
                  title={weaponText(key)}
                  scroll={false}
                >
                  <WeaponTypeIcon weapon={key} label={weaponText(key)} className="h-5 w-5" />
                </Segment>
              ))}
            </Segments>
            <Segments label={t('filterRarity')}>
              {RARITIES.map((rarity) => (
                <Segment
                  key={rarity}
                  to={rosterHref(base, filters, { rarity: toggle(filters.rarity, rarity) })}
                  active={filters.rarity.includes(rarity)}
                  scroll={false}
                >
                  {rarity}★
                </Segment>
              ))}
            </Segments>
          </div>
        </Fold>
      </DockFold>
    </div>
  );
}

/**
 * Today's birthdays among yours, and tomorrow's, above the gallery.
 *
 * The in-game gift arrives by mail on the day and cannot be claimed after it,
 * so the calendar tab — where this used to be the only place it was said —
 * answered the question a day late for anybody who did not think to open it.
 */
function BirthdayNotice({
  locale, today, tomorrow, calendarHref, names, t,
}: {
  locale: string;
  today: CharacterView[];
  tomorrow: CharacterView[];
  calendarHref: string;
  names: (characters: CharacterView[]) => string;
  t: Messages;
}) {
  if (today.length === 0) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted">
        <CakeSlice size={14} aria-hidden />
        {t('birthdayTomorrow', { names: names(tomorrow) })}
        {' · '}
        <Link href={calendarHref} className="underline hover:text-accent">{t('seeCalendar')}</Link>
      </p>
    );
  }

  return (
    <section className="card flex flex-wrap items-center gap-x-4 gap-y-2 border-accent/50 px-4 py-3">
      <span className="flex -space-x-2">
        {today.map((character) => (
          <Link key={character.id} href={`/${locale}/build/${character.id}`} className="group relative">
            <GameIcon
              filename={character.icon}
              kind="avatar"
              alt={character.name}
              className="h-10 w-10 rounded-full bg-surface-2 ring-2 ring-accent/60"
              sizes="40px"
            />
            <HoverLabel text={character.name} />
          </Link>
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm">
          <CakeSlice size={14} aria-hidden className="text-accent" />
          {t('birthdayNoticeToday', { names: names(today) })}
        </span>
        <span className="block text-xs text-muted">
          {t('birthdayNoticeHint')}
          {tomorrow.length > 0 && ` ${t('birthdayTomorrow', { names: names(tomorrow) })}.`}
        </span>
      </span>
      {/* The tab to it is right above on a phone, where this squeezed the text. */}
      <Link href={calendarHref} className="hidden text-xs text-muted underline hover:text-accent sm:inline">
        {t('seeCalendar')}
      </Link>
    </section>
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

  // Yours, and only then everyone else: the gift is claimable only for a
  // character you have, so a stranger's birthday next week is not "upcoming"
  // in any sense that matters ahead of your own in a month.
  const upcoming = [...dated]
    .sort((a, b) =>
      Number(owned.has(b.character.id)) - Number(owned.has(a.character.id))
      || a.until - b.until)
    .slice(0, 6)
    .sort((a, b) => a.until - b.until);

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
              <span className="font-mono text-2xs normal-case text-muted">
                {t('monthMine', {
                  mine: month.entries.filter((entry) => owned.has(entry.character.id)).length,
                  total: month.entries.length,
                })}
              </span>
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
  roster,
  progress,
  showcase,
  ratings,
  t,
  eager = false,
  compact = false,
}: {
  locale: string;
  characters: CharacterView[];
  roster: ReadonlyMap<number, CharacterBuild>;
  progress: ReadonlyMap<number, CardProgress>;
  showcase: { ids: ReadonlySet<number>; label: string };
  ratings: ReadonlyMap<number, { score: number; title: string }>;
  t: Messages;
  /** The first gallery holds the largest contentful paint; the second is below it. */
  eager?: boolean;
  /** Smaller cards, for the characters you do not have: a face and a name. */
  compact?: boolean;
}) {
  if (characters.length === 0) {
    return <p className="text-sm text-muted">{t('empty')}</p>;
  }

  if (compact) return <CompactGallery locale={locale} characters={characters} />;

  const markLabels = {
    planned: t('plannedTitle'),
    today: t('booksToday'),
    todayTitle: t('booksTodayTitle'),
  };

  return (
    // Three to a row on a phone, where two left a column of cards a screen
    // tall per six characters; the portrait still fits a third of the width.
    <ul className="rise-stagger grid grid-cols-3 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] sm:gap-4">
      {characters.map((character, index) => {
        const entry = roster.get(character.id) ?? null;
        const mine = entry !== null;
        const ahead = progress.get(character.id);

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
              className={`card card-link group relative block overflow-hidden px-1 py-2.5 sm:p-3 ${
                mine ? '' : 'opacity-70'
              }`}
            >
              <CardWash elementType={character.elementType} rarity={character.rarity} />
              <CardMark
                dismissed={Boolean(entry?.dismissedAt)}
                booksToday={Boolean(ahead?.booksToday)}
                labels={markLabels}
              />

              <div className="relative">
                <CharacterPortrait
                  elementType={character.elementType}
                  elementText={character.elementText}
                  constellation={entry?.constellation ?? null}
                  showcased={mine && showcase.ids.has(character.id) ? showcase.label : null}
                  ring={entry && ahead?.level != null
                    ? { value: ahead.level, title: t('levelTitle', { level: entry.level, target: entry.target.level ?? 90 }) }
                    : null}
                >
                  {/*
                    * The same avatar becomes the splash on the page this opens.
                    * Naming both ends is all the browser needs to move one
                    * object instead of swapping two — see `globals.css`. The
                    * badges stay outside it: they belong to this card, not to
                    * the portrait that travels.
                    */}
                  <ViewTransition name={`character-${character.id}`} share="morph" default="none">
                    <div className="w-20">
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
                </CharacterPortrait>

                <p className={`mt-2.5 truncate text-center text-sm ${mine ? '' : 'text-muted'}`}>
                  {character.name}
                </p>
                {/* Yours read as where they are — level and the three talents;
                    the ones you do not have, as when they came out. */}
                <p className="mt-0.5 truncate text-center font-mono text-2xs text-muted">
                  {entry ? (
                    <LevelTalents
                      level={entry.level}
                      talent={entry.talent}
                      met={ahead?.talentsMet ?? null}
                      labels={{ level: t('levelShort', { level: entry.level }), talents: t('talentsTitle', entry.talent) }}
                      rating={ratings.get(character.id) ?? null}
                    />
                  ) : (
                    t('versionLine', { version: character.version })
                  )}
                  <span className="sr-only">{t('rarityLabel', { rarity: character.rarity })}</span>
                </p>
              </div>
            </PrefetchLink>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The characters you do not have: a face and a name, at a size that lets the
 * fold hold them in a few rows instead of a second gallery.
 */
function CompactGallery({ locale, characters }: { locale: string; characters: CharacterView[] }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
      {characters.map((character) => (
        <li key={character.id}>
          <PrefetchLink
            href={`/${locale}/build/${character.id}`}
            className="card card-link group relative flex flex-col items-center gap-1 px-1.5 py-2 opacity-70 hover:opacity-100 focus-visible:opacity-100"
          >
            <span className="relative">
              <GameIcon
                filename={character.icon}
                kind="avatar"
                className="h-12 w-12 rounded-full border border-edge bg-surface-2 grayscale"
                sizes="48px"
              />
              <span className="absolute -left-1 -top-1 rounded-full border border-edge bg-surface p-0.5">
                <ElementIcon element={character.elementType} label={character.elementText} className="h-3 w-3" sizes="12px" />
              </span>
            </span>
            <span className="w-full truncate text-center text-2xs text-muted">{character.name}</span>
            {/* The whole name, where the line under the face truncates it. */}
            <HoverLabel text={character.name} />
          </PrefetchLink>
        </li>
      ))}
    </ul>
  );
}
