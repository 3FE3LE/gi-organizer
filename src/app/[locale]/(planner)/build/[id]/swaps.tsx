'use client';

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { ActionStatus } from '@/components/action-status';
import { Button } from '@/components/ui/button';

import { type MoveState, moveGearAction } from './actions';

export type SwapRow = {
  instanceId: string;
  kind: 'upgrade' | 'prospect' | 'stopgap' | 'sidegrade';
  delta: number;
  potentialDelta: number;
  /** The luckiest version of the same comparison. */
  bestCaseDelta: number;
  remainingRolls: number;
  keepsSetBonus: boolean;
  holderId: number | null;
  goalChanges: { label: string; from: string; to: string }[];
};

export type SlotPanel = {
  slot: string;
  title: string;
  /** The worn piece, drawn first so every card beside it reads against it. */
  equippedId: string | null;
  swaps: SwapRow[];
};

/**
 * What one swap buys, under the card of the piece it would put on.
 *
 * The card is the box's own — the piece reads here exactly as it does on the
 * artifacts page — and this is the part that belongs to the changes tab: what
 * kind of move it is, what it adds now and later, whether it breaks the set,
 * and the button that makes it. Who is wearing it is already on the card.
 *
 * The whole trade is stated because the decision is a trade, and showing only
 * the upside would be a different, worse tool.
 */
export function SwapVerdict({ swap, characterId }: { swap: SwapRow; characterId: number }) {
  const t = useTranslations('build');
  const kindLabel = useTranslations('build.kind');
  const kindHelp = useTranslations('build.kindHelp');
  const [state, move, pending] = useActionState<MoveState, FormData>(
    moveGearAction, { status: 'idle' },
  );

  return (
    <div className="mt-2 space-y-1.5 border-t border-edge pt-1.5 font-mono text-2xs">
      <p className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span
          title={kindHelp(swap.kind)}
          className={
            swap.kind === 'upgrade'
              ? 'text-accent'
              : swap.kind === 'prospect' ? 'text-text' : 'text-muted'
          }
        >
          {kindLabel(swap.kind)}
        </span>
        <span className="tabular">
          {signed(swap.delta)} {t('deltaNowSuffix')}
        </span>
      </p>

      {/* The expectation, not the ceiling: every roll landing the build's
          first choice at the top tier is one path out of thousands, and
          pricing a piece at it made anything unfed look like a bargain. The
          ceiling stays in the tooltip. */}
      <p
        className="tabular text-right text-muted"
        title={t('bestCaseTitle', { value: signed(swap.bestCaseDelta) })}
      >
        {signed(swap.potentialDelta)} {t('expectedSuffix')}
        {swap.remainingRolls > 0 && ` (${swap.remainingRolls})`}
      </p>

      {(!swap.keepsSetBonus || swap.goalChanges.length > 0) && (
        <p className="flex flex-wrap gap-x-2">
          {!swap.keepsSetBonus && <span className="text-accent">{t('breaksSet')}</span>}
          {swap.goalChanges.map((change) => (
            <span key={change.label} className={change.to === 'met' ? 'text-accent' : 'text-text'}>
              {change.label} {change.from}<ArrowRight size={10} aria-hidden className="mx-0.5 inline" />{change.to}
            </span>
          ))}
        </p>
      )}

      <ActionStatus state={state} />

      <form action={move}>
        <input
          type="hidden"
          name="move"
          value={JSON.stringify({
            kind: 'equip-artifact',
            instanceId: swap.instanceId,
            toCharacterId: characterId,
          })}
        />
        {/* The holder the card was rendered with. A mismatch is a conflict. */}
        <input
          type="hidden"
          name="expectedHolderId"
          value={swap.holderId === null ? 'null' : String(swap.holderId)}
        />
        <Button variant="outline" size="sm" type="submit" disabled={pending} className="w-full">
          {t('equipButton')}
        </Button>
      </form>
    </div>
  );
}

const signed = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
