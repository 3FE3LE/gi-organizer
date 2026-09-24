'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { AssetImage } from '@/components/asset-image';
import type { Move } from '@/lib/player/move';

import { PieceComparison, type PieceStats } from './piece-stats';
import { WeaponPassive, type WeaponPassiveText } from './weapon-passive';

export type CandidateView = {
  id: string;
  label: string;
  detail: string;
  /** Why this piece ranks where it does against the build. */
  fit: string | null;
  score: number;
  /** Already resolved by the server, which is the only side that knows which
   *  asset names no host serves. */
  icon: string | null;
  /** Who holds it now — shown before the click, so the trade is never a surprise. */
  holder: string | null;
  holderId: number | null;
  /** The full spread, for the row that opens into a comparison. */
  stats: PieceStats | null;
  /** Weapons only: the copy's refinement and the passive it scales. */
  refinement: number | null;
  passive: WeaponPassiveText | null;
};

export type SlotView = {
  key: string;
  title: string;
  kind: 'artifact' | 'weapon';
  equipped: CandidateView | null;
  candidates: CandidateView[];
  /** Worn by someone else and off the set plan, so left out of the list. */
  hiddenInUse: number;
};

/**
 * One candidate, with its spread a click away.
 *
 * The comparison is mounted on demand rather than rendered closed: a slot can
 * list a hundred pieces, and a table each would be most of the page's weight
 * for something the player opens two or three of.
 */
export function CandidateRow({
  candidate,
  slot,
  characterId,
  action,
  pending,
  defaultOpen = false,
}: {
  candidate: CandidateView;
  slot: SlotView;
  characterId: number;
  action: (form: FormData) => void;
  pending: boolean;
  /** The best candidate opens against what is worn, straight away. */
  defaultOpen?: boolean;
}) {
  const t = useTranslations('build');
  const [open, setOpen] = useState(defaultOpen);

  return (
    <li className="border-b border-edge/40 last:border-b-0">
      {/* Wraps rather than clips: a piece worth taking can carry a fit note
          *and* a holder badge, and the two together outrun a phone's width
          next to the icon, label and buttons that share this row. */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5">
        {/* An artifact's set name is left to the icon, which already draws the
            set: written out, it was the widest thing in the row and pushed the
            buttons out of the dialog. A weapon's name is the piece itself. */}
        <span className="shrink-0">
          <AssetImage
            src={candidate.icon}
            kind={slot.kind === 'weapon' ? 'weapon' : 'relic'}
            alt={slot.kind === 'weapon' ? '' : candidate.label}
            className="h-6 w-6"
            sizes="24px"
          />
        </span>
        {slot.kind === 'weapon' && (
          <span className="min-w-0 flex-1 truncate text-xs">{candidate.label}</span>
        )}
        <span
          className={`font-mono text-2xs text-muted ${
            slot.kind === 'weapon' ? 'shrink-0' : 'min-w-0 flex-1 truncate'
          }`}
        >
          {candidate.detail}
        </span>
        {candidate.fit && (
          <span className="shrink-0 font-mono text-2xs text-muted">{candidate.fit}</span>
        )}
        {candidate.holder && (
          <span className="shrink-0 font-mono text-2xs text-accent">
            {t('heldBy', { holder: candidate.holder })}
          </span>
        )}
        {(candidate.stats || candidate.passive) && (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'shrink-0 font-mono' })}
          >
            {open ? t('closeCompare') : t('openCompare')}
          </button>
        )}
        <MoveButton
          action={action}
          pending={pending}
          move={
            slot.kind === 'weapon'
              ? { kind: 'equip-weapon', instanceId: candidate.id, toCharacterId: characterId }
              : { kind: 'equip-artifact', instanceId: candidate.id, toCharacterId: characterId }
          }
          expectedHolderId={candidate.holderId}
          title={candidate.holder ? t('moveHereButton') : t('equipButton')}
        />
      </div>

      {open && (candidate.stats || candidate.passive) && (
        <div className="mx-3 mb-2 space-y-3 rounded border border-edge/60 bg-ink/40 px-2 py-2">
          {candidate.stats && (
            <PieceComparison
              equipped={slot.equipped?.stats ?? null}
              candidate={candidate.stats}
            />
          )}
          {/* A weapon is its passive as much as its numbers, and two passives
              are the comparison the table above cannot make. Each opens on its
              own copy's refinement. */}
          {slot.kind === 'weapon' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {slot.equipped?.passive && (
                <PassiveColumn
                  heading={t('equippedHeader')}
                  passive={slot.equipped.passive}
                  refinement={slot.equipped.refinement ?? 1}
                />
              )}
              {candidate.passive && (
                <PassiveColumn
                  heading={t('defaultCandidateLabel')}
                  passive={candidate.passive}
                  refinement={candidate.refinement ?? 1}
                />
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function PassiveColumn({
  heading,
  passive,
  refinement,
}: {
  heading: string;
  passive: WeaponPassiveText;
  refinement: number;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-mono text-2xs text-muted">{heading}</p>
      <WeaponPassive passive={passive} refinement={refinement} />
    </div>
  );
}

export function MoveButton({
  action,
  pending,
  move,
  expectedHolderId,
  title,
}: {
  action: (form: FormData) => void;
  pending: boolean;
  move: Move;
  expectedHolderId: number | null;
  title: string;
}) {
  return (
    <form action={action} className="contents">
      <input type="hidden" name="move" value={JSON.stringify(move)} />
      {/* The holder the row was rendered with. A mismatch is a conflict. */}
      <input
        type="hidden"
        name="expectedHolderId"
        value={expectedHolderId === null ? 'null' : String(expectedHolderId)}
      />
      <Button
        variant="outline"
        size="sm"
        type="submit"
        disabled={pending}
        className="shrink-0"
      >
        {title}
      </Button>
    </form>
  );
}
