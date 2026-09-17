import Link from 'next/link';
import { notFound } from 'next/navigation';

import { GameIcon } from '@/components/game-icon';
import { getCatalog, propLabel } from '@/lib/data/catalog';
import { isLocale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { accountAgenda, accountCascade } from '@/lib/rules/assemble';
import { chainsOf } from '@/lib/rules/cascade';
import { summarizeAgenda, type AgendaItem, type Cost } from '@/lib/rules/agenda';

export const dynamic = 'force-dynamic';

const SLOT_TITLES: Record<string, string> = {
  flower: 'flor', plume: 'pluma', sands: 'arena', goblet: 'cáliz', circlet: 'diadema',
};

const COST_LABEL: Record<Cost, string> = {
  free: 'sin coste',
  displaces: 'se lo quitas a alguien',
  'needs-levelling': 'hay que subirlo',
  'breaks-set': 'rompe el set',
  'needs-farming': 'hay que farmear',
};

/**
 * What to do next, for the whole account.
 *
 * The ordering is the product: anything that closes a goal first whatever it
 * costs, then holes, then gains, then what needs farming. A build that misses
 * its threshold is not working, and a marginal swap on one that already works
 * is not the next thing to do.
 */
export default async function AgendaPage({ params }: PageProps<'/[locale]/plan/upgrades'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const catalog = await getCatalog(locale);
  const db = getDb();
  const [items, cascade] = await Promise.all([
    accountAgenda(catalog, db),
    accountCascade(catalog, db),
  ]);
  const summary = summarizeAgenda(items);
  const chains = chainsOf(cascade);

  const describe = (item: AgendaItem) => {
    const slot = item.slot ? SLOT_TITLES[item.slot] ?? item.slot : null;

    switch (item.kind) {
      case 'fill-empty-slot':
        return `${slot} vacía`;
      case 'fix-goal':
        return `cambiar ${slot} cierra ${item.fixesGoals.map((prop) => propLabel(catalog, prop)).join(', ')}`;
      case 'equip-upgrade':
        return `mejor ${slot} disponible`;
      case 'level-prospect':
        return `subir un prospecto de ${slot} (${item.data.rolls} rolls)`;
      case 'complete-set':
        return `faltan piezas de ${catalog.artifacts.get(Number(item.data.setId))?.name ?? item.data.setId}` +
          ` — ${item.data.have}/${item.data.need}`;
      case 'acquire-weapon':
        return `no tienes ${catalog.weapons.get(Number(item.data.weaponId))?.name ?? item.data.weaponId}`;
      case 'goal-unreachable':
        return `${propLabel(catalog, String(item.data.prop))} ${item.data.actual}/${item.data.min}` +
          ' — nada en tu cuenta lo arregla';
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="font-mono text-xs text-muted">
          {summary.total} pendientes · {summary.actionableNow} hacibles ya ·{' '}
          {summary.fixesGoals} cierran una meta
        </p>
      </header>

      {cascade.moves.length > 0 && (
        <section>
          <div className="mb-2 flex flex-wrap items-baseline gap-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Cadena de mejoras
            </h2>
            <span className="font-mono text-xs text-muted">
              {cascade.moves.length} movimiento{cascade.moves.length === 1 ? '' : 's'} ·
              {' '}+{cascade.netGain.toFixed(1)} en total
              {cascade.truncated && ' · hay más'}
            </span>
          </div>
          <p className="mb-3 max-w-prose text-sm text-muted">
            Aplicados en este orden. Cada movimiento libera una pieza, y algunos solo
            son posibles gracias al anterior.
          </p>

          <ol className="space-y-1">
            {chains.map((chain, index) => (
              <li key={chain[0].instanceId} className="rounded border border-edge bg-surface">
                {chain.map((move, step) => (
                  <p
                    key={move.instanceId}
                    className={`flex flex-wrap items-center gap-x-3 px-3 py-1.5 text-xs ${
                      step > 0 ? 'border-t border-edge/40' : ''
                    }`}
                  >
                    <span className="tabular w-8 shrink-0 font-mono text-muted">
                      {step > 0 ? '↳' : `${index + 1}.`}
                    </span>
                    <span className="w-20 shrink-0 font-mono text-muted">
                      {SLOT_TITLES[move.slot] ?? move.slot}
                    </span>
                    <span className="min-w-0 flex-1">
                      {move.fromCharacterId === null
                        ? 'una pieza libre'
                        : `la de ${catalog.characters.get(move.fromCharacterId)?.name ?? move.fromCharacterId}`}
                      {' → '}
                      <span className="text-accent">
                        {catalog.characters.get(move.toCharacterId)?.name ?? move.toCharacterId}
                      </span>
                      {move.fromCharacterId !== null && !move.fromPlanned && (
                        <span className="text-muted"> (sin build)</span>
                      )}
                    </span>
                    <span className="tabular font-mono text-muted">
                      +{move.gain.toFixed(1)}
                      {move.cost > 0 && ` −${move.cost.toFixed(1)}`}
                    </span>
                    {move.breaksSetFor && (
                      <span className="font-mono text-warn">rompe el set</span>
                    )}
                  </p>
                ))}
              </li>
            ))}
          </ol>

          <ul className="mt-2 flex flex-wrap gap-x-4 font-mono text-[0.65rem] text-muted">
            {cascade.byBuild
              .filter((entry) => entry.after !== entry.before)
              .map((entry) => (
                <li key={entry.buildId}>
                  {catalog.characters.get(entry.characterId)?.name ?? entry.characterId}{' '}
                  <span className="tabular">
                    {entry.before.toFixed(1)} → <span className="text-good">{entry.after.toFixed(1)}</span>
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {items.length === 0 ? (
        <p className="max-w-prose text-sm text-muted">
          Nada que hacer todavía. La cola se llena cuando un slot de equipo declara un rol
          y ese personaje tiene una build con ese rol —{' '}
          <Link href={`/${locale}/teams`} className="underline hover:text-accent">
            empieza por ahí
          </Link>
          .
        </p>
      ) : (
        <ol className="space-y-1">
          {items.map((item) => {
            const character = catalog.characters.get(item.characterId);

            return (
              <li key={item.id}>
                <Link
                  href={`/${locale}/build/${item.characterId}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-edge bg-surface px-3 py-2 text-xs hover:border-accent"
                >
                  <GameIcon
                    filename={character?.icon}
                    kind="avatar"
                    className="h-7 w-7"
                    sizes="28px"
                  />
                  <span className="w-32 shrink-0 truncate">{character?.name ?? item.characterId}</span>
                  <span className="w-28 shrink-0 truncate font-mono text-muted">
                    {item.buildName}
                  </span>
                  <span className="min-w-0 flex-1">{describe(item)}</span>

                  {item.fixesGoals.length > 0 && (
                    <span className="font-mono text-accent">meta</span>
                  )}
                  {item.delta > 0 && item.kind !== 'goal-unreachable' && (
                    <span className="font-mono text-muted">+{item.delta.toFixed(1)}</span>
                  )}
                  <span
                    className={`w-40 shrink-0 text-right font-mono ${
                      item.cost === 'free' ? 'text-text' : 'text-muted'
                    }`}
                  >
                    {COST_LABEL[item.cost]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
