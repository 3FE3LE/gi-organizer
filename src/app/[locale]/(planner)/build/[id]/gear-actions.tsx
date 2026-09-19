'use client';

import { ArrowLeftRight, Pencil, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useState } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { ActionStatus } from '@/components/action-status';
import { AssetImage } from '@/components/asset-image';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';

import { type MoveState, moveGearAction } from './actions';
import { CandidateRow, MoveButton, type SlotView } from './gear-slot';
import { loadSlotAction } from './slot-actions';

/**
 * Editing a piece from the piece itself.
 *
 * The candidate lists used to be a tab of their own — six slots, all of them
 * built on every render, shown in a layout that repeated what the character
 * panel above already said. The panel is where a player looks at their gear, so
 * it is where changing it belongs: hover a card and the two things you can do
 * to it appear over it.
 *
 * Nothing about the card changes. The controls sit on top of it, revealed on
 * hover or keyboard focus, and always visible below `sm` — a phone has no
 * hover, and a control that only exists on a pointer device does not exist.
 * Below `sm` they also drop their labels: two icons a thumb already knows
 * cost far less width than "editar" and "comparar" spelled out next to them.
 *
 * The list itself is fetched when the dialog opens. Scoring every owned piece
 * of a shape against the build is real work, and it is work for one slot at a
 * time, not for six on the off chance.
 */
export function GearActions({
  characterId,
  locale,
  buildId,
  slot,
  title,
}: {
  characterId: number;
  locale: string;
  /** Which goal the candidates are scored against. */
  buildId: string | null;
  /** An artifact slot key, or `weapon`. */
  slot: string;
  title: string;
}) {
  const t = useTranslations('build');
  const [mode, setMode] = useState<'edit' | 'compare' | null>(null);

  return (
    <>
      <div
        className={`pointer-events-none absolute inset-0 rounded-lg bg-ink/70 opacity-0 transition-opacity
          group-hover:opacity-100 group-focus-within:opacity-100 max-sm:hidden`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 flex justify-center gap-1 p-1.5 opacity-0 transition-opacity
          group-hover:opacity-100 group-focus-within:opacity-100 max-sm:static max-sm:mt-1.5 max-sm:justify-end max-sm:opacity-100`}
      >
        <Action icon={<Pencil size={12} />} label={t('editButton')} onClick={() => setMode('edit')} />
        <Action
          icon={<ArrowLeftRight size={12} />}
          label={t('compareButton')}
          onClick={() => setMode('compare')}
        />
      </div>

      {/* One dialog, two ways in: "editar" opens the list, "comparar" opens it
          with the best candidate already unfolded against what is worn. */}
      <Dialog open={mode !== null} onOpenChange={(next) => { if (!next) setMode(null); }}>
        {mode && (
          <DialogContent
            showCloseButton={false}
            className="w-full max-w-3xl gap-0 overflow-hidden rounded-xl border border-edge-strong bg-surface p-0 ring-0 sm:max-w-3xl"
          >
            <SlotDialog
              characterId={characterId}
              locale={locale}
              buildId={buildId}
              slot={slot}
              title={title}
              compare={mode === 'compare'}
            />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function Action({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      // Icon only below `sm`: the label is what makes this readable with a
      // mouse hovering it, and dead weight on a screen where these are
      // already always on. `aria-label` keeps the name for anyone who
      // can't see the icon either way.
      className="pointer-events-auto flex items-center gap-1.5 field/90 px-2 py-1 text-2xs text-muted shadow-sm transition-colors hover:border-accent hover:text-accent max-sm:px-1.5"
    >
      {icon}
      <span className="max-sm:hidden">{label}</span>
    </button>
  );
}

/**
 * One slot's candidates, over the page.
 *
 * Each row states who currently holds the piece, which is the whole
 * displacement preview — no second confirmation needed for the common case.
 * The compare-and-set on submit covers the rest: if the holder changed between
 * the render and the click, the action comes back with a conflict instead of
 * stomping whatever moved.
 */
function SlotDialog({
  characterId,
  locale,
  buildId,
  slot,
  title,
  compare,
}: {
  characterId: number;
  locale: string;
  buildId: string | null;
  slot: string;
  title: string;
  compare: boolean;
}) {
  const t = useTranslations('build');
  const [view, setView] = useState<SlotView | null>(null);
  const [failed, setFailed] = useState(false);

  const [state, move, pending] = useActionState<MoveState, FormData>(
    moveGearAction, { status: 'idle' },
  );

  // Loaded here rather than passed down: the panel that opens this renders on
  // every tab, and none of them should pay for a list nobody asked to see.
  useEffect(() => {
    let live = true;
    loadSlotAction({ characterId, locale, buildId, slot })
      .then((result) => { if (live) setView(result); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
    // `state` is in the list so a successful move refetches: the row that just
    // moved is stale the moment the write lands.
  }, [characterId, locale, buildId, slot, state]);

  return (
    <div className="flex max-h-[85vh] flex-col">
      <header className="flex items-center gap-3 border-b border-edge px-4 py-3">
        {view?.equipped && (
          <AssetImage
            src={view.equipped.icon}
            kind={view.kind === 'weapon' ? 'weapon' : 'relic'}
            className="h-8 w-8 shrink-0"
            sizes="32px"
          />
        )}
        <div className="min-w-0 flex-1">
          <DialogTitle className="font-mono text-xs font-normal uppercase tracking-wide text-accent">
            {title}
          </DialogTitle>
          <p className="truncate text-sm">
            {view?.equipped
              ? <>{view.equipped.label} <span className="text-muted">{view.equipped.detail}</span></>
              : <span className="text-muted">{t('emptySlotText')}</span>}
          </p>
        </div>

        {view?.equipped && (
          <MoveButton
            action={move}
            pending={pending}
            move={
              view.kind === 'weapon'
                ? { kind: 'unequip-weapon', instanceId: view.equipped.id }
                : { kind: 'unequip-artifact', instanceId: view.equipped.id }
            }
            expectedHolderId={characterId}
            title={t('removeButton')}
          />
        )}

        <DialogClose aria-label={t('closeAria')} className={buttonVariants({ variant: 'ghost', size: 'icon-sm', className: 'shrink-0' })}>
          <X size={16} />
        </DialogClose>
      </header>

      <ActionStatus state={state} className="border-b border-edge px-4 py-1.5 font-mono text-xs" />

      {view && (
        <p className="border-b border-edge px-4 py-1.5 text-xs text-muted">
          {t('candidatesCount', { count: view.candidates.length })}
          {view.hiddenInUse > 0 && (
            <span className="font-mono text-2xs">
              {' · '}{t('hiddenInUse', { count: view.hiddenInUse })}
            </span>
          )}
        </p>
      )}

      <ul className="min-h-24 flex-1 overflow-y-auto">
        {!view && !failed && (
          <li className="px-4 py-6 text-center text-xs text-muted">{t('searchingCandidates')}</li>
        )}
        {failed && (
          <li className="px-4 py-6 text-center text-xs text-accent">
            {t('failedToLoad')}
          </li>
        )}
        {view?.candidates.map((candidate, index) => (
          <CandidateRow
            key={candidate.id}
            candidate={candidate}
            slot={view}
            characterId={characterId}
            action={move}
            pending={pending}
            // "Compare" is the same list with the argument already made: the
            // best candidate open against what is worn.
            defaultOpen={compare && index === 0}
          />
        ))}
        {view?.candidates.length === 0 && (
          <li className="px-4 py-6 text-center text-xs text-muted">{t('noMatch')}</li>
        )}
      </ul>
    </div>
  );
}
