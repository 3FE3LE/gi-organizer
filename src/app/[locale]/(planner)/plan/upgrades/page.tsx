import { ArrowRight, CornerDownRight, Plus, X } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { GameIcon } from '@/components/game-icon';
import { HoverLabel } from '@/components/hint';
import { SlotIcon } from '@/components/slot-icon';
import { propLabel, type Catalog } from '@/lib/data/catalog';
import { isLocale, type Locale } from '@/lib/data/locales';
import type { ArtifactSlot } from '@/lib/data/types';
import { getDb } from '@/lib/db/client';
import { readArtifacts, type OwnedArtifact } from '@/lib/player/artifacts';
import { isDraft, readTeams } from '@/lib/player/teams';
import { accountAgenda, accountCascade } from '@/lib/rules/assemble';
import { chainsOf } from '@/lib/rules/cascade';
import { inTeam, summarizeAgenda, type AgendaItem, type Cost } from '@/lib/rules/agenda';
import { getAccountCatalog } from '@/lib/player/traveler';

import { loadScope } from '../filters';

export const dynamic = 'force-dynamic';

/**
 * What each cost reads as, at a glance.
 *
 * Green is "do it now", amber is "do it, knowing what it takes from somebody",
 * and the two that need work first stay quiet — the queue is sorted so those
 * sink anyway, and colouring them would compete with the ones that do not.
 */
const COST_TONE: Record<Cost, string> = {
  free: 'border-good/40 text-good',
  displaces: 'border-warn/40 text-warn',
  'breaks-set': 'border-warn/40 text-warn',
  'needs-levelling': 'border-edge text-muted',
  'needs-farming': 'border-edge text-muted',
};

/**
 * What to do next, for the whole account.
 *
 * The ordering is the product: anything that closes a goal first whatever it
 * costs, then holes, then gains, then what needs farming. A build that misses
 * its threshold is not working, and a marginal swap on one that already works
 * is not the next thing to do.
 *
 * Each step is drawn with what it moves — the character, the slot, the piece
 * itself and who wears it today — because the sentence alone ("mejor arena
 * disponible") left the player to go and find which sands, on whom.
 */
export default async function AgendaPage({
  params, searchParams,
}: PageProps<'/[locale]/plan/upgrades'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { team: teamId } = await loadScope(searchParams);

  const catalog = await getAccountCatalog(locale);
  const db = getDb();
  const [allItems, cascade, artifacts, teams] = await Promise.all([
    accountAgenda(catalog, db),
    accountCascade(catalog, db),
    readArtifacts(db),
    readTeams(db),
  ]);
  const t = await getTranslations('plan.upgrades');
  const reserveLabel = (await getTranslations('teams'))('reserveTeam');

  // Narrowed to a team when the plan's day card sent one along, so the queue
  // opens on the number that card showed. The chain is kept whole wherever it
  // touches a member: its moves depend on one another, and half of one is not
  // a plan anybody can follow.
  const team = teams.find((entry) => entry.id === teamId) ?? null;
  const members = new Set(team?.slots.map((slot) => slot.characterId) ?? []);
  const items = inTeam(allItems, team);
  const chains = chainsOf(cascade).filter((chain) => !team || chain.some((move) =>
    members.has(move.toCharacterId)
    || (move.fromCharacterId !== null && members.has(move.fromCharacterId))));
  const moves = chains.flat();
  const netGain = moves.reduce((total, move) => total + move.net, 0);
  const byBuild = cascade.byBuild.filter((entry) => !team || members.has(entry.characterId));

  const pieces = new Map(artifacts.map((piece) => [piece.instanceId, piece]));
  const summary = summarizeAgenda(items);
  const slotLabel = await getTranslations('common.slot');
  const costLabel = await getTranslations('common.cost');
  const slotName = (slot: string) => (slotLabel.has(slot) ? slotLabel(slot) : slot);

  const describe = (item: AgendaItem) => {
    const slot = item.slot ? slotName(item.slot) : '';

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

  const nameOf = (id: number) => catalog.characters.get(id)?.name ?? String(id);

  return (
    <div className="space-y-6">
      {team && (
        <Link
          href={`/${locale}/plan/upgrades`}
          data-active
          aria-label={`${t('teamScope', { team: isDraft(team) ? reserveLabel : team.name })} · ${t('teamScopeClear')}`}
          className="chip group relative gap-1"
        >
          {t('teamScope', { team: isDraft(team) ? reserveLabel : team.name })}
          <X size={12} aria-hidden />
          {/* A link, so the CSS label rather than a tooltip — see
              `components/hint.tsx`. */}
          <HoverLabel text={t('teamScopeClear')} />
        </Link>
      )}

      {/* Three numbers worth reading before the list: how long it is, how
          much of it can be done tonight, and how much of it actually fixes a
          build rather than polishing one. */}
      <dl className="grid grid-cols-3 gap-2 sm:max-w-lg">
        {([
          [t('pendingTile'), summary.total, 'text-text'],
          [t('actionableTile'), summary.actionableNow, 'text-good'],
          [t('goalsTile'), summary.fixesGoals, 'text-accent'],
        ] as const).map(([label, value, tone]) => (
          <div key={label} className="tile">
            <dt className="font-mono text-2xs uppercase tracking-wide text-muted">{label}</dt>
            <dd className={`tabular mt-2 font-mono text-2xl leading-none ${value === 0 ? 'text-muted' : tone}`}>{value}</dd>
          </div>
        ))}
      </dl>

      {moves.length > 0 && (
        <section className="space-y-3">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                {t('chainHeading')}
              </h2>
              <span className="font-mono text-xs text-muted">
                {t('movementsCount', {
                  count: moves.length,
                  gain: (team ? netGain : cascade.netGain).toFixed(1),
                  more: cascade.truncated ? t('moreSuffix') : '',
                })}
              </span>
            </div>
            <p className="mt-1 max-w-prose text-xs text-muted">{t('chainExplainer')}</p>
          </div>

          <ol className="space-y-2">
            {chains.map((chain, index) => (
              <li key={chain[0].instanceId} className="card overflow-hidden">
                {chain.map((move, step) => (
                  <div
                    key={move.instanceId}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 ${
                      step > 0 ? 'border-t border-edge/60' : ''
                    }`}
                  >
                    <span className="tabular w-5 shrink-0 font-mono text-xs text-muted">
                      {step > 0 ? <CornerDownRight size={12} aria-hidden /> : `${index + 1}.`}
                    </span>
                    <PieceIcon piece={pieces.get(move.instanceId)} slot={move.slot} slotText={slotName(move.slot)} catalog={catalog} />

                    {/* Who gives it up, and who gets it — faces, since that is
                        how the roster is recognised everywhere else. */}
                    <span className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                      {move.fromCharacterId === null ? (
                        <span className="text-muted">{t('freePiece')}</span>
                      ) : (
                        <Avatar
                          id={move.fromCharacterId}
                          catalog={catalog}
                          locale={locale}
                          dim={!move.fromPlanned}
                          title={move.fromPlanned
                            ? nameOf(move.fromCharacterId)
                            : `${nameOf(move.fromCharacterId)}${t('noBuildSuffix')}`}
                        />
                      )}
                      <ArrowRight size={14} aria-hidden className="shrink-0 text-muted" />
                      <Avatar id={move.toCharacterId} catalog={catalog} locale={locale} />
                      {/* The face says who on a phone; the name only where it has room. */}
                      <span className="hidden min-w-0 truncate text-sm sm:inline">{nameOf(move.toCharacterId)}</span>
                    </span>

                    <span className="ml-auto flex items-center gap-1.5 font-mono text-xs">
                      {move.breaksSetFor && (
                        <span className="pill border-warn/40 text-warn">
                          {t('breaksSet')}
                        </span>
                      )}
                      <span className="tabular text-good">+{move.gain.toFixed(1)}</span>
                      {move.cost > 0 && (
                        <span className="tabular text-muted">−{move.cost.toFixed(1)}</span>
                      )}
                    </span>
                  </div>
                ))}
              </li>
            ))}
          </ol>

          {/* Where the chain leaves each build, once it has all run. */}
          <ul className="flex flex-wrap gap-2">
            {byBuild
              .filter((entry) => entry.after !== entry.before)
              .map((entry) => (
                <li key={entry.buildId} className="card-2 flex items-center gap-2 py-1 pl-1 pr-2.5">
                  <Avatar id={entry.characterId} catalog={catalog} locale={locale} size="sm" />
                  <span className="tabular font-mono text-2xs text-muted">
                    {entry.before.toFixed(1)}<ArrowRight size={10} aria-hidden className="mx-0.5 inline" /><span className="text-good">{entry.after.toFixed(1)}</span>
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
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            {t('queueHeading')}
          </h2>
          <ol className="space-y-2">
            {items.map((item, index) => {
              const character = catalog.characters.get(item.characterId);
              const piece = typeof item.data.candidate === 'string'
                ? pieces.get(item.data.candidate)
                : undefined;
              const holder = piece?.holderId != null && piece.holderId !== item.characterId
                ? piece.holderId
                : null;

              return (
                <li key={item.id}>
                  <Link
                    href={`/${locale}/build/${item.characterId}`}
                    className="card card-link flex items-center gap-3 px-3 py-2.5"
                  >
                    <span className="tabular hidden w-5 shrink-0 font-mono text-xs text-muted sm:block">
                      {index + 1}
                    </span>
                    <GameIcon
                      filename={character?.icon}
                      kind="avatar"
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full bg-surface-2"
                      sizes="40px"
                    />

                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-sm">{character?.name ?? item.characterId}</span>
                        <span className="truncate font-mono text-2xs text-muted">{item.buildName}</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        {item.slot && (
                          <SlotIcon slot={item.slot} label={slotName(item.slot)} className="shrink-0" />
                        )}
                        <span className="min-w-0">{describe(item)}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 font-mono text-2xs">
                        <span className={`pill ${COST_TONE[item.cost]}`}>
                          {costLabel(item.cost)}
                        </span>
                        {item.fixesGoals.length > 0 && (
                          <span className="pill border-accent/40 text-accent">
                            {t('goalTag')}
                          </span>
                        )}
                        {item.delta > 0 && item.kind !== 'goal-unreachable' && (
                          <span className="tabular text-good">+{item.delta.toFixed(1)}</span>
                        )}
                      </span>
                    </span>

                    {/* The piece this step puts on, and — when it has to be
                        taken off somebody — whose it is now. */}
                    {(piece || item.kind === 'fill-empty-slot') && (
                      <span className="relative shrink-0">
                        <PieceIcon
                          piece={piece}
                          slot={item.slot}
                          slotText={item.slot ? slotName(item.slot) : ''}
                          catalog={catalog}
                        />
                        {holder !== null && (
                          <span
                            title={t('wornBy', { name: nameOf(holder) })}
                            className="absolute -left-2 -top-2"
                          >
                            <GameIcon
                              filename={catalog.characters.get(holder)?.icon}
                              kind="avatar"
                              alt={t('wornBy', { name: nameOf(holder) })}
                              className="h-5 w-5 rounded-full bg-surface-2 ring-2 ring-surface"
                              sizes="20px"
                            />
                          </span>
                        )}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

/** A face, linked to its build. Dimmed for somebody the plan has no build for. */
function Avatar({
  id, catalog, locale, dim = false, size = 'md', title,
}: {
  id: number; catalog: Catalog; locale: Locale; dim?: boolean; size?: 'sm' | 'md'; title?: string;
}) {
  const character = catalog.characters.get(id);
  const box = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  const name = title ?? character?.name;

  return (
    // The name is the CSS label, since a face is a link — see
    // `components/hint.tsx`. To the right rather than above: the chains are
    // cards that clip their overflow, and a label above the first row was cut
    // off by the card's top edge. The dimming is on the face, not the link,
    // so the label reads at full strength.
    <Link
      href={`/${locale}/build/${id}`}
      className="group relative shrink-0 rounded-full hover:ring-2 hover:ring-accent"
    >
      <GameIcon
        filename={character?.icon}
        kind="avatar"
        alt={name ?? ''}
        className={`${box} rounded-full bg-surface-2${dim ? ' opacity-60' : ''}`}
        sizes={size === 'sm' ? '24px' : '32px'}
      />
      {name && <HoverLabel text={name} side="right" />}
    </Link>
  );
}

/**
 * The piece itself, as the build page draws an equipped slot: its art on the
 * field, the level in the corner. With no piece, the dashed slot it would go
 * in.
 */
function PieceIcon({
  piece, slot, slotText, catalog,
}: {
  piece: OwnedArtifact | undefined; slot: ArtifactSlot | null; slotText: string; catalog: Catalog;
}) {
  if (!piece) {
    return (
      <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-dashed border-edge text-muted">
        {slot ? <SlotIcon slot={slot} label={slotText} size={14} /> : <Plus size={14} aria-hidden />}
      </span>
    );
  }

  const set = catalog.artifacts.get(piece.setId);

  return (
    <span title={set?.name} className="field relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
      <GameIcon
        filename={set?.pieces[piece.slot]?.icon}
        kind="relic"
        alt={set?.name ?? ''}
        className="h-9 w-9"
        sizes="36px"
      />
      <span className="absolute -bottom-1 -right-1 rounded bg-ink px-1 font-mono text-2xs text-muted">
        +{piece.level}
      </span>
    </span>
  );
}
