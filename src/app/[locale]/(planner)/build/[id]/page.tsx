import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ViewTransition } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { GameIcon } from '@/components/game-icon';
import { HoverLabel } from '@/components/hint';
import { SectionTabs } from '@/components/section-tabs';
import { propLabel } from '@/lib/data/catalog';
import { isLocale } from '@/lib/data/locales';
import { readArtifacts, type OwnedArtifact } from '@/lib/player/artifacts';
import { roleLabel } from '@/lib/rules/role-labels';
import { getAccountCatalog } from '@/lib/player/traveler';

import { OwnedArtifactCard } from '../../artifacts/artifact-card';

import { BuildPicker } from './build-picker';
import { CharacterPanel } from './character-panel';
import { loadBuildContext, type BuildContext } from './context';
import { upgradeCostFor } from './cost-view';
import { neighboursOf, type Neighbour as NeighbourEntry } from './neighbours';
import { SwipeNavigate } from './swipe-navigate';
import { objectiveViewFor } from './objective-view';
import { TABS, loadBuildParams, serializeBuildParams, type Tab } from './params';
import { ProgressPanel } from './progress-form';
import { SwapVerdict, type SlotPanel } from './swaps';
import { swapPanelsFor } from './swaps-view';
import { UpgradeCostPanel } from './upgrade-cost';

/** Reads the player's gear, so it can never be a build artifact. */
export const dynamic = 'force-dynamic';

/**
 * One character, in four views of the same data.
 *
 * The page's whole job is to decide which of them the URL is asking for and
 * hand it what it needs. Everything a tab shows is built by its own module —
 * `objective-view`, `gear-view`, `swaps-view` — so a change to how a swap reads
 * cannot reach into how a candidate is scored, and the expensive views are only
 * ever built for the tab that is open.
 */
export default async function BuildPage({
  params,
  searchParams,
}: PageProps<'/[locale]/build/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();

  const catalog = await getAccountCatalog(locale);
  const characterId = Number(id);
  const character = catalog.characters.get(characterId);
  if (!character) notFound();

  const { build: requestedBuild, tab: requestedTab } = await loadBuildParams(searchParams);

  const context = await loadBuildContext({
    locale, catalog, characterId, character, requestedBuild,
  });
  const { loadout, suggestions } = context;
  const activeBuild = suggestions.build;
  const { previous, next } = await neighboursOf(characterId, catalog, context.db);
  const t = await getTranslations('build');

  /*
   * A character nobody owns gets the same page, minus what needs owning.
   *
   * Cambios ranks the pieces in the bag against the ones equipped, and for a
   * character the account has never held there is nothing on either side of
   * that comparison. Objetivo still works — planning what to farm before the
   * banner arrives is a real thing to do — so the strip collapses to it rather
   * than the page refusing to open.
   */
  const owned = loadout?.known ?? false;
  const tabs = owned ? TABS : TABS.filter((entry) => entry.key === 'objective');
  const tab = owned ? requestedTab : 'objective';
  const roleLabelT = await getTranslations('common.role');
  const mechanicLabelT = await getTranslations('common.mechanic');

  const basePath = `/${locale}/build/${characterId}`;
  const tabHref = (next: Tab) =>
    serializeBuildParams(basePath, { build: activeBuild?.id ?? null, tab: next });

  return (
    <div className="space-y-6">
      {/* The panel carries the page's `h1`. Without a loadout there is no
          panel, and the page would have no heading at all. */}
      {!loadout && <h1 className="page-title">{character.name}</h1>}

      {/*
        * What is equipped now, on every tab: the tabs argue about it.
        *
        * The two arrows beside it walk the roster in release order, which is
        * the order the gallery this page opens from is in. Reviewing a roster
        * is a sequence — this one, then the next one — and going back to the
        * gallery between every character turns one pass over twenty builds
        * into forty navigations.
        */}
      {loadout && (
        <div className="relative">
          <SwipeNavigate
            previousHref={previous
              ? serializeBuildParams(`/${locale}/build/${previous.id}`, { build: null, tab })
              : null}
            nextHref={next
              ? serializeBuildParams(`/${locale}/build/${next.id}`, { build: null, tab })
              : null}
          >
          <CharacterPanel
            catalog={catalog}
            character={character}
            loadout={loadout}
            locale={locale}
            buildId={activeBuild?.id ?? null}
          />
          </SwipeNavigate>

          {previous && (
            <Neighbour
              character={previous}
              href={serializeBuildParams(`/${locale}/build/${previous.id}`, { build: null, tab })}
              side="left"
              label={t('previousCharacter', { name: previous.name })}
            />
          )}
          {next && (
            <Neighbour
              character={next}
              href={serializeBuildParams(`/${locale}/build/${next.id}`, { build: null, tab })}
              side="right"
              label={t('nextCharacter', { name: next.name })}
            />
          )}
        </div>
      )}

      <BuildPicker
        characterId={characterId}
        builds={suggestions.builds.map((build) => ({
          id: build.id,
          label: roleLabel(roleLabelT, build.role),
          objective: build.objective
            ? (mechanicLabelT.has(build.objective) ? mechanicLabelT(build.objective) : build.objective)
            : null,
        }))}
        activeId={activeBuild?.id ?? null}
        basePath={basePath}
        tab={tab}
      />

      {/* One route with a `tab` parameter, so the strip is told which tab is
          current rather than reading it off the path. */}
      {tabs.length > 1 && (
        <SectionTabs
          tabs={tabs.map((entry) => ({
            href: tabHref(entry.key),
            label: entry.label,
            active: entry.key === tab,
          }))}
        />
      )}

      {/*
        * The tabs are one route with a parameter, so switching them is not
        * going anywhere: the panel above stays put and only this crossfades.
        * `key` is what makes React treat the two tabs as an exit/enter pair
        * rather than an update in place.
        */}
      <ViewTransition key={tab} name="build-tab" share="auto" enter="auto" default="none">
        <div>
          {tab === 'objective' && <ObjectiveTab context={context} />}
          {tab === 'changes' && <ChangesTab context={context} />}
        </div>
      </ViewTransition>
    </div>
  );
}

async function ObjectiveTab({ context }: { context: BuildContext }) {
  const { character, locale } = context;
  const [view, cost] = await Promise.all([objectiveViewFor(context), upgradeCostFor(context)]);
  const t = await getTranslations('build');

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <p className="max-w-prose text-sm text-muted">
          {t('objectiveIntro', { name: character.name })}
        </p>

        <ProgressPanel
          progressKey={view.progressKey}
          locale={locale}
          values={view.values}
          options={view.options}
        />
      </div>

      {/* Under the form that sets the target, because it is that target's
          price. Editing the level above and reading the cost below is one
          question, and it was previously asked on two screens. */}
      <UpgradeCostPanel cost={cost} locale={locale} />
    </div>
  );
}

async function ChangesTab({ context }: { context: BuildContext }) {
  const { catalog, characterId, locale, suggestions } = context;
  const t = await getTranslations('build');
  const roleLabelT = await getTranslations('common.role');
  const objectiveHref = serializeBuildParams(
    `/${locale}/build/${characterId}`,
    { build: suggestions.build?.id ?? null, tab: 'objective' },
  );

  /*
   * No wall when the player has not authored a goal.
   *
   * This tab used to refuse to render without `suggestions.build`, while the
   * Objetivo tab beside it opened on a filled-in form — the worn gear for the
   * stats and `ASSUMED_TARGET` for the level — and the plan costed that same
   * assumption out in books and mora. Three views, two definitions of "has an
   * objective", and the two that disagreed sat one click apart.
   *
   * The refusal was not even protecting anything: `suggestionsFor` already
   * falls back to `buildStatsFor(priorities)`, the curated priority list, and
   * `compareEverySlot` runs on that fallback whether or not a build row
   * exists. The ranking was computed and then thrown away. So it is shown, and
   * a line says what it was measured against — which is the honest difference
   * between a goal the player wrote and one the app assumed.
   */
  const [panels, box] = await Promise.all([swapPanelsFor(context), readArtifacts(context.db)]);
  const byId = new Map(box.map((piece) => [piece.instanceId, piece]));
  const swaps = panels.reduce((total, panel) => total + panel.swaps.length, 0);

  return (
    <section className="space-y-6">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          {t('changesHeading')}
        </h2>
        {suggestions.build ? (
          <span className="font-mono text-xs text-muted">
            {t('objectiveRole', { role: roleLabel(roleLabelT, suggestions.build.role) })}
          </span>
        ) : (
          <span className="font-mono text-xs text-muted">
            {t('changesAssumed')}{' '}
            <Link href={objectiveHref} className="underline hover:text-accent">
              {t('changesAssumedLink')}
            </Link>
          </span>
        )}
        {suggestions.goals.map((goal) => (
          <span
            key={goal.prop}
            className={`font-mono text-xs ${
              goal.status === 'met'
                ? 'text-muted'
                : goal.status === 'close'
                  ? 'text-text'
                  : 'text-accent'
            }`}
          >
            {propLabel(catalog, goal.prop)} {Math.round(goal.actual)}/{goal.min}{' '}
            {goal.status === 'met' ? '✓' : goal.status === 'close' ? '~' : '✗'}
          </span>
        ))}
      </div>

      {swaps === 0 ? (
        <p className="max-w-prose text-sm text-muted">
          {t('noSwapsMessage')}{' '}
          <Link href={`/${locale}/plan`} className="underline hover:text-accent">
            {t('whatRotatesLink')}
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-4">
          {panels.map((panel) => (
            <SlotChanges
              key={panel.slot}
              panel={panel}
              byId={byId}
              characterId={characterId}
              catalog={catalog}
              locale={locale}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One slot of the changes tab: the piece worn, then every piece that beats it.
 *
 * Drawn with the box's own card, so a piece reads here exactly as it does on
 * the artifacts page — the same stats, roll marks and holder line — and the
 * worn one sits first in the row, so each candidate is read against it by
 * looking left. What this tab adds goes under each card: the verdict and the
 * button that acts on it.
 */
async function SlotChanges({
  panel,
  byId,
  characterId,
  catalog,
  locale,
}: {
  panel: SlotPanel;
  byId: Map<string, OwnedArtifact>;
  characterId: number;
  catalog: BuildContext['catalog'];
  locale: string;
}) {
  const t = await getTranslations('build');
  const equipped = panel.equippedId ? byId.get(panel.equippedId) : undefined;

  return (
    <section>
      <h3 className="mb-2 font-mono text-2xs uppercase tracking-wide text-muted">{panel.title}</h3>

      <ul className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {equipped ? (
          <OwnedArtifactCard piece={equipped} scaler={null} catalog={catalog} locale={locale}>
            <p className="mt-2 border-t border-edge pt-1.5 font-mono text-2xs text-accent">
              {t('equippedHeader')}
            </p>
          </OwnedArtifactCard>
        ) : (
          <li className="self-start rounded-lg border border-dashed border-edge p-3 text-xs text-muted">
            {t('emptySlotText')}
          </li>
        )}

        {panel.swaps.map((swap) => {
          const piece = byId.get(swap.instanceId);
          if (!piece) return null;

          return (
            <OwnedArtifactCard
              key={swap.instanceId}
              piece={piece}
              scaler={null}
              catalog={catalog}
              locale={locale}
            >
              <SwapVerdict swap={swap} characterId={characterId} />
            </OwnedArtifactCard>
          );
        })}
      </ul>

      {panel.swaps.length === 0 && (
        <p className="mt-2 text-xs text-muted">{t('noSwapsForSlot')}</p>
      )}
    </section>
  );
}

/**
 * One step along the roster, as a disc over the panel's edge.
 *
 * It carries the other character's portrait rather than a bare chevron: on a
 * page whose whole subject is one character, "who is next" is a face, and a
 * face is also what makes the arrow obviously about the roster rather than
 * about the browser's history.
 */
function Neighbour({
  character,
  href,
  side,
  label,
}: {
  character: NeighbourEntry;
  href: string;
  side: 'left' | 'right';
  label: string;
}) {
  return (
    <Link
      href={href}
      /* Two links, and they are the ones this page exists to be walked with:
         worth the eager prefetch that makes the portrait morph rather than
         blink. See `components/prefetch-link.tsx` for why it has to be asked
         for. */
      prefetch
      aria-label={label}
      className={`group absolute top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-full border border-edge bg-surface/90 p-1 shadow-[var(--shadow-raised)] transition-colors hover:border-accent lg:flex ${
        side === 'left' ? '-left-5' : '-right-5'
      }`}
    >
      {side === 'left' && <ChevronLeft size={14} aria-hidden className="text-muted" />}
      {/* The same naming the roster cards use, so the disc grows into the
          splash of the page it opens instead of the two swapping. One step
          along the roster then reads as one object moving, exactly as a step in
          from the gallery does. */}
      <ViewTransition name={`character-${character.id}`} share="morph" default="none">
        <GameIcon
          filename={character.icon}
          kind="avatar"
          className="h-8 w-8 rounded-full"
          sizes="32px"
        />
      </ViewTransition>
      {side === 'right' && <ChevronRight size={14} aria-hidden className="text-muted" />}
      <HoverLabel text={label} side={side === 'left' ? 'right' : 'left'} />
    </Link>
  );
}
