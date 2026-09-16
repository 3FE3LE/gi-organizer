'use client';

import { useActionState, useState } from 'react';

import { AssetImage } from '@/components/asset-image';

import { type MoveState, moveGearAction } from './actions';
import { PieceComparison, type PieceStats } from './piece-stats';

export type SwapRow = {
  instanceId: string;
  setName: string;
  icon: string | null;
  level: number;
  mainStat: string;
  substats: string[];
  kind: 'upgrade' | 'prospect' | 'stopgap' | 'sidegrade';
  delta: number;
  potentialDelta: number;
  /** The luckiest version of the same comparison. */
  bestCaseDelta: number;
  remainingRolls: number;
  keepsSetBonus: boolean;
  holder: string | null;
  holderId: number | null;
  goalChanges: { label: string; from: string; to: string }[];
  /** The full spread, so the row can be opened rather than trusted. */
  stats: PieceStats;
};

export type SlotPanel = {
  slot: string;
  title: string;
  equipped: {
    setName: string;
    icon: string | null;
    level: number;
    mainStat: string;
    stats: PieceStats;
  } | null;
  swaps: SwapRow[];
};

const KIND_LABEL: Record<SwapRow['kind'], string> = {
  upgrade: 'mejora',
  prospect: 'prospecto',
  stopgap: 'parche',
  sidegrade: 'lateral',
};

const KIND_HELP: Record<SwapRow['kind'], string> = {
  upgrade: 'mejor ahora y sigue siéndolo',
  prospect: 'peor ahora, mejor al subirlo',
  stopgap: 'mejor ahora, peor cuando subas lo que llevas',
  sidegrade: 'sin cambio real',
};

/**
 * What to change in one slot, and what changing it buys.
 *
 * Each row states the trade in full — now, later, set bonus, who loses it —
 * because the decision the player is making is a trade and showing only the
 * upside would be a different, worse tool.
 */
export function SlotSwaps({ panel, characterId }: { panel: SlotPanel; characterId: number }) {
  const [state, move, pending] = useActionState<MoveState, FormData>(
    moveGearAction, { status: 'idle' },
  );

  return (
    <section className="rounded border border-edge bg-surface">
      <header className="flex flex-wrap items-center gap-3 border-b border-edge px-3 py-2">
        <span className="w-16 text-xs uppercase text-muted">{panel.title}</span>
        {panel.equipped ? (
          <>
            <AssetImage src={panel.equipped.icon} kind="relic" className="h-7 w-7" sizes="28px" />
            <span className="flex-1 truncate text-sm">{panel.equipped.setName}</span>
            <span className="font-mono text-xs text-muted">
              +{panel.equipped.level} · {panel.equipped.mainStat}
            </span>
          </>
        ) : (
          <span className="flex-1 text-sm text-muted">vacío</span>
        )}
      </header>

      {state.status !== 'idle' && (
        <p
          className={`border-b border-edge px-3 py-1.5 font-mono text-xs ${
            state.status === 'ok' ? 'text-muted' : 'text-accent'
          }`}
        >
          {state.message}
        </p>
      )}

      {panel.swaps.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted">
          Nada en tu cuenta mejora este slot para esta build.
        </p>
      ) : (
        <ul>
          {panel.swaps.map((swap) => (
            <SwapItem
              key={swap.instanceId}
              swap={swap}
              equipped={panel.equipped?.stats ?? null}
              characterId={characterId}
              action={move}
              pending={pending}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** One swap, with the spread behind it mounted only when asked for. */
function SwapItem({
  swap,
  equipped,
  characterId,
  action,
  pending,
}: {
  swap: SwapRow;
  equipped: PieceStats | null;
  characterId: number;
  action: (form: FormData) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="border-b border-edge/40 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
              <span
                title={KIND_HELP[swap.kind]}
                className={`w-20 shrink-0 font-mono text-[0.65rem] ${
                  swap.kind === 'upgrade'
                    ? 'text-accent'
                    : swap.kind === 'prospect'
                      ? 'text-text'
                      : 'text-muted'
                }`}
              >
                {KIND_LABEL[swap.kind]}
              </span>

              <AssetImage src={swap.icon} kind="relic" className="h-6 w-6" sizes="24px" />

              <span className="min-w-40 flex-1 truncate text-xs">
                {swap.setName}{' '}
                <span className="font-mono text-muted">+{swap.level} · {swap.mainStat}</span>
              </span>

              <span className="font-mono text-[0.65rem] text-muted">
                {swap.substats.join(' · ')}
              </span>

              <span className="w-24 shrink-0 text-right font-mono text-[0.65rem]">
                {swap.delta >= 0 ? '+' : ''}{swap.delta.toFixed(1)} ahora
              </span>
              {/* The expectation, not the ceiling: every roll landing the
                  build's first choice at the top tier is one path out of
                  thousands, and pricing a piece at it made anything unfed look
                  like a bargain. The ceiling stays in the tooltip. */}
              <span
                className="w-28 shrink-0 text-right font-mono text-[0.65rem] text-muted"
                title={`En el mejor de los casos: ${swap.bestCaseDelta >= 0 ? '+' : ''}${
                  swap.bestCaseDelta.toFixed(1)}`}
              >
                {swap.potentialDelta >= 0 ? '+' : ''}{swap.potentialDelta.toFixed(1)} esperado
                {swap.remainingRolls > 0 && ` (${swap.remainingRolls})`}
              </span>

              {!swap.keepsSetBonus && (
                <span className="font-mono text-[0.65rem] text-accent">rompe el set</span>
              )}
              {swap.holder && (
                <span className="font-mono text-[0.65rem] text-muted">
                  se lo quitas a {swap.holder}
                </span>
              )}
              {swap.goalChanges.map((change) => (
                <span
                  key={change.label}
                  className={`font-mono text-[0.65rem] ${
                    change.to === 'met' ? 'text-accent' : 'text-text'
                  }`}
                >
                  {change.label} {change.from}→{change.to}
                </span>
              ))}

              <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                aria-expanded={open}
                className="shrink-0 rounded border border-edge px-2 py-0.5 font-mono text-[0.65rem] text-muted hover:border-accent hover:text-text"
              >
                {open ? 'cerrar' : 'comparar'}
              </button>

              <form action={action} className="contents">
                <input
                  type="hidden"
                  name="move"
                  value={JSON.stringify({
                    kind: 'equip-artifact',
                    instanceId: swap.instanceId,
                    toCharacterId: characterId,
                  })}
                />
                <input
                  type="hidden"
                  name="expectedHolderId"
                  value={swap.holderId === null ? 'null' : String(swap.holderId)}
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="shrink-0 rounded border border-edge px-2 py-0.5 text-[0.65rem] hover:border-accent disabled:opacity-50"
                >
                  Equipar
                </button>
              </form>
      </div>

      {open && (
        <div className="mx-3 mb-2 rounded border border-edge/60 bg-ink/40 px-2 py-1">
          <PieceComparison equipped={equipped} candidate={swap.stats} />
        </div>
      )}
    </li>
  );
}
