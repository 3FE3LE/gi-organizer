import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { GameIcon } from '@/components/game-icon';
import { getCatalog, propLabel } from '@/lib/data/catalog';
import { isLocale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { accountAgenda, accountCascade } from '@/lib/rules/assemble';
import { chainsOf } from '@/lib/rules/cascade';
import { summarizeAgenda, type AgendaItem } from '@/lib/rules/agenda';

export const dynamic = 'force-dynamic';

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
  const t = await getTranslations('plan.upgrades');
  const slotLabel = await getTranslations('common.slot');
  const costLabel = await getTranslations('common.cost');

  const describe = (item: AgendaItem) => {
    const slot = item.slot ? (slotLabel.has(item.slot) ? slotLabel(item.slot) : item.slot) : '';

    switch (item.kind) {
      case 'fill-empty-slot':
        return t('emptySlot', { slot });
      case 'fix-goal':
        return t('fixGoal', {
          slot,
          goals: item.fixesGoals.map((prop) => propLabel(catalog, prop)).join(', '),
        });
      case 'equip-upgrade':
        return t('equipUpgrade', { slot });
      case 'level-prospect':
        return t('levelProspect', { slot, rolls: String(item.data.rolls) });
      case 'complete-set':
        return t('completeSet', {
          set: catalog.artifacts.get(Number(item.data.setId))?.name ?? String(item.data.setId),
          have: String(item.data.have),
          need: String(item.data.need),
        });
      case 'acquire-weapon':
        return t('acquireWeapon', {
          weapon: catalog.weapons.get(Number(item.data.weaponId))?.name ?? String(item.data.weaponId),
        });
      case 'goal-unreachable':
        return t('goalUnreachable', {
          prop: propLabel(catalog, String(item.data.prop)),
          actual: String(item.data.actual),
          min: String(item.data.min),
        });
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="font-mono text-xs text-muted">
          {t('pendingSummary', {
            total: summary.total, actionable: summary.actionableNow, fixes: summary.fixesGoals,
          })}
        </p>
      </header>

      {cascade.moves.length > 0 && (
        <section>
          <div className="mb-2 flex flex-wrap items-baseline gap-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              {t('chainHeading')}
            </h2>
            <span className="font-mono text-xs text-muted">
              {t('movementsCount', {
                count: cascade.moves.length,
                gain: cascade.netGain.toFixed(1),
                more: cascade.truncated ? t('moreSuffix') : '',
              })}
            </span>
          </div>
          <p className="mb-3 max-w-prose text-sm text-muted">
            {t('chainExplainer')}
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
                      {slotLabel.has(move.slot) ? slotLabel(move.slot) : move.slot}
                    </span>
                    <span className="min-w-0 flex-1">
                      {move.fromCharacterId === null
                        ? t('freePiece')
                        : t('fromCharacter', {
                            name: catalog.characters.get(move.fromCharacterId)?.name
                              ?? move.fromCharacterId,
                          })}
                      {' → '}
                      <span className="text-accent">
                        {catalog.characters.get(move.toCharacterId)?.name ?? move.toCharacterId}
                      </span>
                      {move.fromCharacterId !== null && !move.fromPlanned && (
                        <span className="text-muted">{t('noBuildSuffix')}</span>
                      )}
                    </span>
                    <span className="tabular font-mono text-muted">
                      +{move.gain.toFixed(1)}
                      {move.cost > 0 && ` −${move.cost.toFixed(1)}`}
                    </span>
                    {move.breaksSetFor && (
                      <span className="font-mono text-warn">{t('breaksSet')}</span>
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
          {t('empty')}{' '}
          <Link href={`/${locale}/teams`} className="underline hover:text-accent">
            {t('startHereLink')}
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
                    <span className="font-mono text-accent">{t('goalTag')}</span>
                  )}
                  {item.delta > 0 && item.kind !== 'goal-unreachable' && (
                    <span className="font-mono text-muted">+{item.delta.toFixed(1)}</span>
                  )}
                  <span
                    className={`w-40 shrink-0 text-right font-mono ${
                      item.cost === 'free' ? 'text-text' : 'text-muted'
                    }`}
                  >
                    {costLabel(item.cost)}
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
