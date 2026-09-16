'use client';

import { useState } from 'react';

import { AssetImage } from '@/components/asset-image';
import type { Move } from '@/lib/player/move';

import { PieceComparison, type PieceStats } from './piece-stats';

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
  /** "Comparar" opens the best candidate against what is worn, straight away. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <li className="border-b border-edge/40 last:border-b-0">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <AssetImage
          src={candidate.icon}
          kind={slot.kind === 'weapon' ? 'weapon' : 'relic'}
          className="h-6 w-6"
          sizes="24px"
        />
        <span className="min-w-0 flex-1 truncate text-xs">{candidate.label}</span>
        <span className="font-mono text-[0.65rem] text-muted">{candidate.detail}</span>
        {candidate.fit && (
          <span className="font-mono text-[0.65rem] text-muted">{candidate.fit}</span>
        )}
        {candidate.holder && (
          <span className="font-mono text-[0.65rem] text-accent">en {candidate.holder}</span>
        )}
        {candidate.stats && (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            className="shrink-0 rounded border border-edge px-2 py-0.5 font-mono text-[0.65rem] text-muted hover:border-accent hover:text-text"
          >
            {open ? 'cerrar' : 'comparar'}
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
          title={candidate.holder ? 'Mover aquí' : 'Equipar'}
        />
      </div>

      {open && candidate.stats && (
        <div className="mx-3 mb-2 rounded border border-edge/60 bg-ink/40 px-2 py-1">
          <PieceComparison
            equipped={slot.equipped?.stats ?? null}
            candidate={candidate.stats}
          />
        </div>
      )}
    </li>
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
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 rounded border border-edge px-2 py-0.5 text-[0.65rem] hover:border-accent disabled:opacity-50"
      >
        {title}
      </button>
    </form>
  );
}
