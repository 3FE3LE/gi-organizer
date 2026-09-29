import { ArrowRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { GameIcon } from '@/components/game-icon';
import type { Catalog } from '@/lib/data/catalog';
import type { Locale } from '@/lib/data/locales';
import type { Ready } from '@/lib/rules/ready';

/**
 * What the bag pays for, as three lists: characters up their levels and
 * phases, talents up their levels, weapons up to their last level.
 *
 * The plan's tab draws all of them; a build draws the one character's. Every
 * row is worked out on the whole bag on its own — see `lib/rules/affordable.ts`
 * — and the note above the lists says so, because a player who does the first
 * row has less for the second.
 */
export async function ReadyLists({
  ready,
  catalog,
  locale,
  /** A build shows one character, so it leaves their name and face out. */
  single = false,
}: {
  ready: Ready;
  catalog: Catalog;
  locale: Locale;
  single?: boolean;
}) {
  const t = await getTranslations('ready');
  const nameOf = (id: number) => catalog.characters.get(id)?.name ?? `#${id}`;

  const talentLine = (talents: { auto: number; skill: number; burst: number }) =>
    `${talents.auto}·${talents.skill}·${talents.burst}`;

  const sections = [
    ready.characters.length > 0 && (
      <Section key="characters" title={t('charactersHeading')}>
        {ready.characters.map((reach) => (
          <Row
            key={reach.characterId}
            face={single ? null : <Face id={reach.characterId} catalog={catalog} locale={locale} />}
            name={single ? null : nameOf(reach.characterId)}
            from={t('levelPhase', { level: reach.from.level, phase: reach.from.ascension })}
            to={t('levelPhase', { level: reach.to.level, phase: reach.to.ascension })}
            badge={reach.fates > 0 ? t('fates', { count: reach.fates }) : null}
          />
        ))}
      </Section>
    ),
    ready.talents.length > 0 && (
      <Section key="talents" title={t('talentsHeading')}>
        {ready.talents.map((reach) => (
          <Row
            key={reach.characterId}
            face={single ? null : <Face id={reach.characterId} catalog={catalog} locale={locale} />}
            name={single ? null : nameOf(reach.characterId)}
            from={talentLine(reach.from)}
            to={talentLine(reach.to)}
            badge={t('talentLevels', { count: reach.levels })}
          />
        ))}
      </Section>
    ),
    ready.weapons.length > 0 && (
      <Section key="weapons" title={t('weaponsHeading')}>
        {ready.weapons.map((reach) => {
          const weapon = catalog.weapons.get(reach.weaponId);
          return (
            <Row
              key={reach.instanceId}
              face={
                <GameIcon
                  filename={weapon?.icon}
                  kind="weapon"
                  alt=""
                  className="h-8 w-8 shrink-0 rounded bg-surface-2"
                  sizes="32px"
                />
              }
              name={single || reach.holderId === null
                ? weapon?.name ?? `#${reach.weaponId}`
                : t('weaponOf', { weapon: weapon?.name ?? `#${reach.weaponId}`, name: nameOf(reach.holderId) })}
              from={t('levelPhase', { level: reach.from.level, phase: reach.from.ascension })}
              to={t('levelPhase', { level: reach.to.level, phase: reach.to.ascension })}
              badge={reach.maxed ? t('maxed') : null}
            />
          );
        })}
      </Section>
    ),
  ].filter(Boolean);

  if (sections.length === 0) {
    const number = new Intl.NumberFormat(locale);
    // Nearly always the mora: every book fed and every level bought charges
    // it, so a bag short of it levels nothing whatever else it holds.
    const moraBlocks = ready.cheapestStep !== null && ready.mora < ready.cheapestStep;
    return (
      <p className="max-w-prose text-sm text-muted">
        {moraBlocks
          ? t('moraBlocks', { mora: number.format(ready.mora), step: number.format(ready.cheapestStep!) })
          : t('nothing')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-xs text-muted">{t('separately')}</p>
      {sections}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-mono text-2xs uppercase tracking-wide text-muted">{title}</h3>
      <ul className="card divide-y divide-edge/60">{children}</ul>
    </section>
  );
}

function Row({
  face, name, from, to, badge,
}: {
  face: React.ReactNode;
  name: string | null;
  from: string;
  to: string;
  badge: string | null;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
      {face}
      {name && <span className="min-w-0 flex-1 truncate text-sm">{name}</span>}
      <span className={`tabular flex items-center gap-1.5 font-mono ${name ? '' : 'flex-1'}`}>
        <span className="text-muted">{from}</span>
        <ArrowRight size={12} aria-hidden className="text-muted" />
        <span className="text-good">{to}</span>
      </span>
      {badge && (
        <span className="rounded-full border border-accent/50 px-1.5 font-mono text-2xs leading-4 text-accent">
          {badge}
        </span>
      )}
    </li>
  );
}

function Face({ id, catalog, locale }: { id: number; catalog: Catalog; locale: Locale }) {
  const character = catalog.characters.get(id);
  return (
    <Link href={`/${locale}/build/${id}`} className="shrink-0 rounded-full hover:ring-2 hover:ring-accent">
      <GameIcon
        filename={character?.icon}
        kind="avatar"
        alt={character?.name ?? ''}
        className="h-8 w-8 rounded-full bg-surface-2"
        sizes="32px"
      />
    </Link>
  );
}

/** The three figures the plan's tab leads with. */
export async function ReadyTiles({ ready }: { ready: Ready }) {
  const t = await getTranslations('ready');
  const tiles: [string, number, string][] = [
    [t('tileFates'), ready.fates, 'text-accent'],
    [t('tileTalents'), ready.talents.reduce((sum, reach) => sum + reach.levels, 0), 'text-good'],
    [t('tileWeapons'), ready.weapons.filter((reach) => reach.maxed).length, 'text-good'],
  ];

  return (
    <dl className="grid grid-cols-3 gap-2 sm:max-w-lg">
      {tiles.map(([label, value, tone]) => (
        // The figure sits on the tile's floor, so three of them read on one
        // line however many lines each label wraps to on a phone.
        <div key={label} className="tile flex flex-col">
          <dt className="font-mono text-2xs uppercase tracking-wide text-muted">{label}</dt>
          <dd className={`tabular mt-auto pt-2 font-mono text-2xl leading-none ${value === 0 ? 'text-muted' : tone}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** How many rows there are, for the day card's link. */
export function readyCount(ready: Ready) {
  return ready.characters.length + ready.talents.length + ready.weapons.length;
}
