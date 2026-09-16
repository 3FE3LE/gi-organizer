import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CharacterSheet } from '@/components/character-sheet';
import { getCatalog, propLabel } from '@/lib/data/catalog';
import { isLocale } from '@/lib/data/locales';
import { MECHANICS } from '@/lib/data/mechanics';
import { roleLabel } from '@/lib/rules/role-labels';

import { BuildPicker } from './build-picker';
import { CharacterPanel } from './character-panel';
import { loadBuildContext, type BuildContext } from './context';
import { objectiveViewFor } from './objective-view';
import { TABS, loadBuildParams, serializeBuildParams, type Tab } from './params';
import { ProgressPanel } from './progress-form';
import { SlotSwaps } from './swaps';
import { swapPanelsFor } from './swaps-view';

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

  const catalog = await getCatalog(locale);
  const characterId = Number(id);
  const character = catalog.characters.get(characterId);
  if (!character) notFound();

  const { build: requestedBuild, tab } = await loadBuildParams(searchParams);

  const context = await loadBuildContext({
    locale, catalog, characterId, character, requestedBuild,
  });
  const { loadout, suggestions } = context;
  const activeBuild = suggestions.build;

  const basePath = `/${locale}/build/${characterId}`;
  const tabHref = (next: Tab) =>
    serializeBuildParams(basePath, { build: activeBuild?.id ?? null, tab: next });

  return (
    <div className="space-y-6">
      {/* What is equipped now, on every tab: the tabs argue about it. */}
      {loadout && (
        <CharacterPanel
          catalog={catalog}
          character={character}
          loadout={loadout}
          locale={locale}
          buildId={activeBuild?.id ?? null}
        />
      )}

      <BuildPicker
        characterId={characterId}
        builds={suggestions.builds.map((build) => ({
          id: build.id,
          label: roleLabel(build.role),
          objective: build.objective
            ? MECHANICS[build.objective as keyof typeof MECHANICS]?.label ?? build.objective
            : null,
        }))}
        activeId={activeBuild?.id ?? null}
        basePath={basePath}
        tab={tab}
      />

      <nav className="flex flex-wrap gap-x-1 border-b border-edge">
        {TABS.map((entry) => (
          <Link
            key={entry.key}
            href={tabHref(entry.key)}
            aria-current={entry.key === tab ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              entry.key === tab
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      {tab === 'objetivo' && <ObjectiveTab context={context} />}
      {tab === 'cambios' && <ChangesTab context={context} />}
      {tab === 'ficha' && (
        <CharacterSheet catalog={catalog} character={character} locale={locale} />
      )}
    </div>
  );
}

async function ObjectiveTab({ context }: { context: BuildContext }) {
  const { character, locale } = context;
  const view = await objectiveViewFor(context);

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-sm text-muted">
        Dónde está {character.name} hoy y a dónde quieres llevarlo.
      </p>

      <ProgressPanel
        progressKey={view.progressKey}
        locale={locale}
        values={view.values}
        options={view.options}
      />
    </div>
  );
}

async function ChangesTab({ context }: { context: BuildContext }) {
  const { catalog, characterId, locale, suggestions } = context;
  const objectiveHref = serializeBuildParams(
    `/${locale}/build/${characterId}`,
    { build: suggestions.build?.id ?? null, tab: 'objetivo' },
  );

  if (!suggestions.build) {
    return (
      <p className="max-w-prose text-sm text-muted">
        Esta pestaña compara lo que lleva puesto contra lo que podría llevar, y para eso
        hace falta saber para qué. {catalog.characters.get(characterId)?.name ?? 'Este personaje'}{' '}
        no tiene ningún objetivo todavía, así que no hay nada contra lo que medir.{' '}
        <Link href={objectiveHref} className="underline hover:text-accent">
          Crea uno en Objetivo
        </Link>{' '}
        — con el set, las main stats y los umbrales que quieras alcanzar.
      </p>
    );
  }

  const panels = await swapPanelsFor(context);
  const swaps = panels.reduce((total, panel) => total + panel.swaps.length, 0);

  return (
    <section className="space-y-6">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Qué cambiar</h2>
        <span className="font-mono text-xs text-muted">
          objetivo · {roleLabel(suggestions.build.role)}
        </span>
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
          Nada de lo que tienes mejora lo que lleva puesto. Lo que queda es farmear: mira{' '}
          <Link href={`/${locale}/plan`} className="underline hover:text-accent">
            qué dominios tocan hoy
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-2">
          {panels.map((panel) => (
            <SlotSwaps key={panel.slot} panel={panel} characterId={characterId} />
          ))}
        </div>
      )}
    </section>
  );
}
