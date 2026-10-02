import { Check, CircleAlert, Dices, Gift, Repeat, X } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { CharacterMorph } from '@/components/character-morph';
import { GameIcon } from '@/components/game-icon';
import { HelpRow, HelpSection, HelpTip } from '@/components/help-tip';
import { ListRow } from '@/components/list-row';
import { PrefetchLink } from '@/components/prefetch-link';
import { StaleStock } from '@/components/stale-stock';
import { propLabel, type Catalog } from '@/lib/data/catalog';
import { isLocale, type Locale } from '@/lib/data/locales';
import { formatPropValue } from '@/lib/data/props';
import { getDb } from '@/lib/db/client';
import { claimMorph } from '@/lib/morph-claim';
import { getAccountCatalog } from '@/lib/player/traveler';
import type { DomainAdvice, SetDemand } from '@/lib/rules/artifact-farm';
import { artifactFarmPlan, type FarmCharacterView } from '@/lib/rules/artifact-farm-plan';

export const dynamic = 'force-dynamic';

/**
 * Which artifact domain to run, and for whom.
 *
 * The talent and weapon plan answers "what drops today"; artifacts have no
 * days, so the question here is which of the two sets a domain drops the plan
 * actually wears — both, one, or neither — and who is furthest from done. See
 * `lib/rules/artifact-farm.ts` for how a domain is valued.
 */
export default async function ArtifactFarmPage({ params }: PageProps<'/[locale]/plan/artifacts'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const catalog = await getAccountCatalog(locale);
  const plan = await artifactFarmPlan(catalog, getDb());
  const t = await getTranslations('artifactFarm');
  const common = await getTranslations('common');
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  const entranceName = new Map(plan.domains.map((entry) => [entry.domain.entranceId, entry.domain.entrance[locale]]));

  return (
    <div className="space-y-6">
      <StaleStock catalog={catalog} locale={locale} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{t('domainsHeading')}</h2>
        <HelpTip label={t('help.open')} text={t('help.open')} title={t('help.title')} closeLabel={common('close')} align="end">
          <HelpSection>
            <HelpRow mark={<Dices size={13} aria-hidden className="text-accent" />}>{t('help.need')}</HelpRow>
            <HelpRow mark={<span className="font-mono">½ ½</span>}>{t('help.pair')}</HelpRow>
            <HelpRow mark={<Repeat size={13} aria-hidden className="text-accent" />}>{t('help.strongbox', { through: plan.strongboxThrough })}</HelpRow>
            <HelpRow mark={<span className="font-mono">≈</span>}>
              {t('help.numbers', {
                run: number.format(plan.perSetPerRun * 2),
                set: number.format(plan.perSetPerRun),
                box: number.format(plan.strongboxPerRun),
              })}
            </HelpRow>
            <HelpRow mark={<CircleAlert size={13} aria-hidden className="text-muted" />}>{t('help.estimate')}</HelpRow>
          </HelpSection>
        </HelpTip>
      </div>

      {plan.domains.length === 0 ? (
        <p className="max-w-prose text-sm text-muted">{t('nothing')}</p>
      ) : (
        <ol className="grid items-start gap-4 lg:grid-cols-2">
          {plan.domains.map((entry, index) => (
            <DomainCard key={entry.domain.entranceId} entry={entry} rank={index + 1} strongboxUseful={plan.strongboxUseful} catalog={catalog} locale={locale} t={t} number={number} />
          ))}
        </ol>
      )}

      {plan.characters.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{t('charactersHeading')}</h2>
          <ul className="card divide-y divide-edge/60">
            {plan.characters.map((character) => (
              <CharacterRow
                key={character.characterId}
                character={character}
                domain={character.entranceId === null ? null : entranceName.get(character.entranceId) ?? null}
                catalog={catalog}
                locale={locale}
                t={t}
              />
            ))}
          </ul>
        </section>
      )}

      {plan.elsewhere.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{t('elsewhereHeading')}</h2>
          <p className="max-w-prose text-xs text-muted">{t('elsewhere')}</p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plan.elsewhere.map((set) => (
              <li key={set.setId} className="card p-3">
                <SetColumn set={set} strongboxUseful={plan.strongboxUseful} catalog={catalog} locale={locale} t={t} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<'artifactFarm'>>>;

function DomainCard({
  entry, rank, strongboxUseful, catalog, locale, t, number,
}: {
  entry: DomainAdvice; rank: number; strongboxUseful: boolean; catalog: Catalog; locale: Locale; t: T; number: Intl.NumberFormat;
}) {
  return (
    <li className="card space-y-3 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-sm">
          <span className="mr-2 font-mono text-xs text-muted">{rank}.</span>
          {entry.domain.entrance[locale]}
          <span className="ml-2 font-mono text-2xs text-muted">{entry.domain.region[locale]}</span>
        </p>
        <span title={t('perRunTitle')} className="tabular font-mono text-xs text-good">
          {t('perRun', { count: number.format(entry.usefulPerRun) })}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {entry.sets.map((set) => (
          <SetColumn key={set.setId} set={set} strongboxUseful={strongboxUseful} catalog={catalog} locale={locale} t={t} />
        ))}
      </div>
    </li>
  );
}

/** One set: its art and name, and the faces of who wants it — or where its pieces go instead. */
function SetColumn({
  set, strongboxUseful, catalog, locale, t,
}: {
  set: SetDemand; strongboxUseful: boolean; catalog: Catalog; locale: Locale; t: T;
}) {
  const definition = catalog.artifacts.get(set.setId);
  const wanted = set.characters.length > 0;

  return (
    <div className={`min-w-0 space-y-2 rounded-md border border-edge/60 p-2 ${wanted ? '' : 'opacity-70'}`}>
      <p className="flex items-center gap-2 text-xs">
        <GameIcon filename={definition?.pieces.flower?.icon} kind="relic" alt="" className="h-7 w-7 shrink-0" sizes="28px" />
        <span className="min-w-0 truncate">{definition?.name ?? `#${set.setId}`}</span>
      </p>
      {wanted ? (
        <>
          <ul className="flex flex-wrap gap-1.5">
            {set.characters.map((entry) => {
              const name = catalog.characters.get(entry.characterId)?.name ?? `#${entry.characterId}`;
              return (
                <li key={entry.characterId}>
                  <Face id={entry.characterId} catalog={catalog} locale={locale} label={name} />
                </li>
              );
            })}
          </ul>
          {/* A new set cannot be bought with leftovers: said where it is wanted,
              since that is where a player would plan on the strongbox. */}
          {!set.strongbox && <p className="font-mono text-2xs text-muted">{t('notInStrongbox')}</p>}
        </>
      ) : (
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Repeat size={12} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            <span className="text-text">{t('nobody')}</span>
            {'. '}
            {strongboxUseful ? t('toStrongbox') : t('toStrongboxWasted')}
          </span>
        </p>
      )}
    </div>
  );
}

function CharacterRow({
  character, domain, catalog, locale, t,
}: {
  character: FarmCharacterView; domain: string | null; catalog: Catalog; locale: Locale; t: T;
}) {
  const name = catalog.characters.get(character.characterId)?.name ?? `#${character.characterId}`;
  const share = Math.round(character.artifacts * 100);

  return (
    // The name and its share on one line; its sets, its goals and where to
    // farm under it, each one whole: see `ListRow`.
    <ListRow
      className="px-3 py-2 text-xs"
      lead={<Face id={character.characterId} catalog={catalog} locale={locale} label={name} />}
      title={<span className="text-sm">{name}</span>}
      value={<span className="text-2xs text-muted">{t('artifactsPart', { value: share })}</span>}
      detail={(
        <span className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
          {character.sets.map((set) => (
            <span key={set.setId} className={set.worn >= set.pieces ? 'text-good' : 'text-muted'}>
              {t('setWorn', {
                name: catalog.artifacts.get(set.setId)?.name ?? `#${set.setId}`,
                worn: set.worn,
                pieces: set.pieces,
              })}
            </span>
          ))}
          {character.goals.map((goal) => (
            <span key={goal.prop} className={`flex items-center gap-1 ${goal.status === 'close' ? 'text-warn' : 'text-bad'}`}>
              {goal.status === 'close' ? <CircleAlert size={11} aria-hidden /> : <X size={11} aria-hidden />}
              {t('goal', {
                label: propLabel(catalog, goal.prop),
                actual: formatPropValue(goal.prop, goal.actual, 'percent', locale),
                min: formatPropValue(goal.prop, goal.min, 'percent', locale),
              })}
            </span>
          ))}
          <span className={`flex basis-full items-center gap-1 ${domain ? 'text-accent' : 'text-muted'}`}>
            {domain ? <Check size={11} aria-hidden /> : <Gift size={11} aria-hidden />}
            {domain ? t('goTo', { domain }) : t('noDomain')}
          </span>
        </span>
      )}
    />
  );
}

function Face({ id, catalog, locale, label }: { id: number; catalog: Catalog; locale: Locale; label: string }) {
  const character = catalog.characters.get(id);
  return (
    <PrefetchLink href={`/${locale}/build/${id}`} title={label} className="block shrink-0 rounded-full hover:ring-2 hover:ring-accent">
      <CharacterMorph id={id} morph={claimMorph(id)}>
        <GameIcon filename={character?.icon} kind="avatar" alt={label} className="h-8 w-8 rounded-full bg-surface-2" sizes="32px" />
      </CharacterMorph>
    </PrefetchLink>
  );
}
