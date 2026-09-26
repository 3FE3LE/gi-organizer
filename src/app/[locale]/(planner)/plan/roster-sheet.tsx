'use client';

import { Users, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

import { RosterOptimismProvider, usePlannedCount } from './roster-optimism';

/**
 * The roster, one tap away instead of always on screen.
 *
 * `RosterPanel` answers "who is this plan for", which is consulted rarely —
 * mostly to dismiss somebody or narrow to one face — next to the domains and
 * piles, which are read every time the page opens. A lateral sheet keeps that
 * question reachable without spending the page's width on it by default; the
 * trigger carries the one number worth seeing without opening it.
 */
export function RosterSheet(props: RosterSheetProps) {
  // The provider sits above the trigger and the panel both, so a click in the
  // panel moves the count on the trigger in the same frame.
  return (
    <RosterOptimismProvider>
      <RosterSheetInner {...props} />
    </RosterOptimismProvider>
  );
}

type RosterSheetProps = {
  total: number;
  /** Who is counted, as the server last said; see `roster-optimism.tsx`. */
  entries: readonly { characterId: number; dismissed: boolean }[];
  teamName: string | null;
  charsCount: number;
  clearCharsHref: string | null;
  children: React.ReactNode;
};

function RosterSheetInner({
  total,
  entries,
  teamName,
  charsCount,
  clearCharsHref,
  children,
}: RosterSheetProps) {
  const t = useTranslations('plan');
  const [open, setOpen] = useState(false);
  const planned = usePlannedCount(entries);

  // Nobody on the roster at all — same case `RosterPanel` itself bails on.
  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {/*
        * The sheet is shadcn's, over Base UI: it portals out of the filter bar,
        * traps and restores focus, closes on Escape and on the backdrop, and
        * compensates the scrollbar while the page behind it is frozen. All four
        * used to be ours — a hook, a key listener, a bare `<button>` for a
        * backdrop and a hand-written panel — and none of them were the point of
        * this component, which is the trigger carrying the count.
        */}
      <Sheet open={open} onOpenChange={setOpen}>
        {/* `planned/total` reads at a glance; `aria-label` names the same
            pair rather than a longer sentence that wouldn't contain the
            visible text — a mismatch a screen reader user would notice as
            the control saying something different from what it shows. */}
        <SheetTrigger
          aria-label={`${planned}/${total} ${t('charactersLabel')}`}
          // Stacked on a phone, the shape and size of a day in the strip it
          // sits beside, so all seven days still fit next to it.
          className="flex w-10 flex-col items-center gap-0.5 card px-1 py-1.5 text-2xs hover:border-accent sm:w-auto sm:flex-row sm:gap-1.5 sm:px-2.5 sm:text-xs"
        >
          <Users size={13} aria-hidden />
          <span className="tabular font-mono">
            <span className="text-accent">{planned}</span>
            <span className="text-muted">/{total}</span>
          </span>
          {teamName && <span className="hidden text-muted sm:inline">{t('onlyTeam', { team: teamName })}</span>}
        </SheetTrigger>

        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full max-w-md gap-0 border-l border-edge bg-surface p-0 sm:max-w-md"
        >
          <header className="flex items-center justify-between border-b border-edge px-3 py-2">
            <SheetTitle className="font-mono text-xs font-normal uppercase text-muted">
              {t('charactersLabel')}
            </SheetTitle>
            <SheetClose aria-label={t('closeAria')} className="text-muted hover:text-text">
              <X size={16} aria-hidden />
            </SheetClose>
          </header>
          <div className="flex-1 overflow-y-auto p-3">{children}</div>
        </SheetContent>
      </Sheet>

      {charsCount > 0 && clearCharsHref && (
        <Link href={clearCharsHref} className="text-xs text-muted underline hover:text-accent">
          {t('charFilterLink', { count: charsCount })}
        </Link>
      )}
    </div>
  );
}
