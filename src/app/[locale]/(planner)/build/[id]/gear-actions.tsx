'use client';

import { ArrowLeftRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useState } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { ActionStatus } from '@/components/action-status';
import { AssetImage } from '@/components/asset-image';
import { OwnedArtifactCardView } from '@/components/owned-artifact-card-view';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';

import { type MoveState, moveGearAction } from './actions';
import { CandidateRow, MoveButton, type SlotView } from './gear-slot';
import { PieceComparison } from './piece-stats';
import { loadSlotAction } from './slot-actions';

/**
 * Editing a piece from the piece itself.
 *
 * The candidate lists used to be a tab of their own — six slots, all of them
 * built on every render, shown in a layout that repeated what the character
 * panel above already said. The panel is where a player looks at their gear, so
 * it is where changing it belongs: hover a card and the control appears over it.
 *
 * One control, not two. There used to be "editar" and "comparar" side by side,
 * opening the same list — the second with its best row already unfolded. In
 * practice they showed the same thing, so the list now always opens that way:
 * the best candidate laid against what is worn, every other row one click from
 * the same comparison, and the equip button on each.
 *
 * Nothing about the card changes. The control sits on top of it, revealed on
 * hover or keyboard focus, and always visible below `sm` — a phone has no
 * hover, and a control that only exists on a pointer device does not exist.
 * Below `sm` it also drops its label: an icon a thumb already knows costs far
 * less width than the word spelled out next to it.
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
  const [open, setOpen] = useState(false);

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
        <Action
          icon={<ArrowLeftRight size={12} />}
          label={t('changeButton')}
          onClick={() => setOpen(true)}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <DialogContent
            showCloseButton={false}
            // Wider for artifacts, which are a grid of the box's cards; a
            // weapon list is rows and reads best narrow.
            className={`w-full gap-0 overflow-hidden rounded-xl border border-edge-strong bg-surface p-0 ring-0 ${
              slot === 'weapon' ? 'max-w-3xl sm:max-w-3xl' : 'max-w-5xl sm:max-w-5xl'
            }`}
          >
            <SlotDialog
              characterId={characterId}
              locale={locale}
              buildId={buildId}
              slot={slot}
              title={title}
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
      // mouse hovering it, and dead weight on a screen where it is already
      // always on. `aria-label` keeps the name for anyone who can't see the
      // icon either way.
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
}: {
  characterId: number;
  locale: string;
  buildId: string | null;
  slot: string;
  title: string;
}) {
  const t = useTranslations('build');
  const [view, setView] = useState<SlotView | null>(null);
  // Which candidate the pinned preview shows. Falls back to the best one, and
  // to it again when a move refetches the list and the pick is gone from it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = view?.candidates.find((candidate) => candidate.id === selectedId)
    ?? view?.candidates[0]
    ?? null;
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
            {/* An artifact is read by its icon and its main stat, the same as
                the rows below; a weapon's name is the piece itself. */}
            {view?.equipped
              ? view.kind === 'weapon'
                ? <>{view.equipped.label} <span className="text-muted">{view.equipped.detail}</span></>
                : <span className="font-mono text-xs text-muted">{view.equipped.detail}</span>
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

      {/*
        * The preview, pinned under the header and outside the scroll.
        *
        * Equipping used to be one click on a card, with the comparison a
        * second list away. Now a card only picks what to look at: the worn
        * piece and the picked one sit here side by side, the table under them
        * says what changes stat by stat, and the equip button is here — so
        * the trade is always read before it is made, however far down the
        * list the pick came from. It opens on the best candidate.
        *
        * On a phone the two cards would leave no room for the list, so only
        * the table and the button stay.
        */}
      {view?.kind === 'artifact' && selected?.stats && (
        <section
          aria-label={t('previewAria')}
          className="shrink-0 border-b border-edge bg-surface-2/60 px-3 py-3"
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,11rem)_minmax(0,1fr)]">
            <ul className="hidden sm:block">
              {view.equipped?.card ? (
                <OwnedArtifactCardView data={view.equipped.card}>
                  <p className="mt-2 border-t border-edge pt-1.5 font-mono text-2xs text-accent">
                    {t('equippedHeader')}
                  </p>
                </OwnedArtifactCardView>
              ) : (
                <li className="rounded-lg border border-dashed border-edge p-3 text-xs text-muted">
                  {t('emptySlotText')}
                </li>
              )}
            </ul>
            <ul className="hidden sm:block">
              {selected.card && <OwnedArtifactCardView data={selected.card} className="border-accent" />}
            </ul>

            <div className="flex min-w-0 flex-col gap-2">
              <PieceComparison
                equipped={view.equipped?.stats ?? null}
                candidate={selected.stats}
              />
              {selected.holder && (
                <p className="font-mono text-2xs text-accent">
                  {t('heldBy', { holder: selected.holder })}
                </p>
              )}
              <MoveButton
                action={move}
                pending={pending}
                move={{ kind: 'equip-artifact', instanceId: selected.id, toCharacterId: characterId }}
                expectedHolderId={selected.holderId}
                title={selected.holder ? t('moveHereButton') : t('equipButton')}
                className="mt-auto w-full"
              />
            </div>
          </div>
        </section>
      )}

      {/*
        * Artifacts as the box draws them, weapons as rows.
        *
        * An artifact candidate is the artifacts page's own card — the same
        * stats, roll marks and holder line — with the worn piece first, so
        * every candidate is read against it by looking left. A weapon has two
        * numbers and a passive, which a row and its unfolding comparison
        * already say better than a card would.
        */}
      <div className="min-h-24 flex-1 overflow-y-auto">
        {!view && !failed && (
          <p className="px-4 py-6 text-center text-xs text-muted">{t('searchingCandidates')}</p>
        )}
        {failed && (
          <p className="px-4 py-6 text-center text-xs text-accent">{t('failedToLoad')}</p>
        )}

        {view?.kind === 'artifact' && (
          <ul className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4">
            {view.candidates.map((candidate) => candidate.card && (
              <OwnedArtifactCardView
                key={candidate.id}
                data={candidate.card}
                className={candidate.id === selected?.id ? 'border-accent ring-1 ring-accent' : ''}
              >
                <div className="mt-2 space-y-1.5 border-t border-edge pt-1.5">
                  {candidate.fit && (
                    <p className="font-mono text-2xs text-muted">{candidate.fit}</p>
                  )}
                  <button
                    type="button"
                    aria-pressed={candidate.id === selected?.id}
                    onClick={() => setSelectedId(candidate.id)}
                    className={buttonVariants({
                      variant: candidate.id === selected?.id ? 'default' : 'outline',
                      size: 'sm',
                      className: 'w-full',
                    })}
                  >
                    {candidate.id === selected?.id ? t('comparing') : t('openCompare')}
                  </button>
                </div>
              </OwnedArtifactCardView>
            ))}
          </ul>
        )}

        {view?.kind === 'weapon' && (
          <ul>
            {view.candidates.map((candidate, index) => (
              <CandidateRow
                key={candidate.id}
                candidate={candidate}
                slot={view}
                characterId={characterId}
                action={move}
                pending={pending}
                // The argument already made: the best candidate open against
                // what is worn.
                defaultOpen={index === 0}
              />
            ))}
          </ul>
        )}

        {view?.candidates.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted">{t('noMatch')}</p>
        )}
      </div>
    </div>
  );
}
