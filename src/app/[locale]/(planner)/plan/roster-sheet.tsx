'use client';

import { Users, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useModalFocus } from '@/components/use-modal';

/**
 * The roster, one tap away instead of always on screen.
 *
 * `RosterPanel` answers "who is this plan for", which is consulted rarely —
 * mostly to dismiss somebody or narrow to one face — next to the domains and
 * piles, which are read every time the page opens. A lateral sheet keeps that
 * question reachable without spending the page's width on it by default; the
 * trigger carries the one number worth seeing without opening it.
 */
export function RosterSheet({
  total,
  planned,
  teamName,
  charsCount,
  clearCharsHref,
  children,
}: {
  total: number;
  planned: number;
  teamName: string | null;
  charsCount: number;
  clearCharsHref: string | null;
  children: React.ReactNode;
}) {
  const t = useTranslations('plan');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Nobody on the roster at all — same case `RosterPanel` itself bails on.
  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-edge bg-surface px-3 py-1.5 text-xs hover:border-accent"
      >
        <Users size={13} aria-hidden />
        <span>
          <span className="text-accent">{planned}</span>
          <span className="text-muted"> {t('inPlanSuffix', { total })}</span>
        </span>
        {teamName && <span className="text-muted">{t('onlyTeam', { team: teamName })}</span>}
      </button>

      {charsCount > 0 && clearCharsHref && (
        <Link href={clearCharsHref} className="text-xs text-muted underline hover:text-accent">
          {t('charFilterLink', { count: charsCount })}
        </Link>
      )}

      {open && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label={t('closeAria')}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/60"
          />
          <SheetPanel label={t('sheetAriaLabel')}>
            <header className="flex items-center justify-between border-b border-edge px-3 py-2">
              <span className="font-mono text-xs uppercase text-muted">
                {t('charactersLabel')}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('closeAria')}
                className="text-muted hover:text-text"
              >
                <X size={16} aria-hidden />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-3">{children}</div>
          </SheetPanel>
        </div>
      )}
    </div>
  );
}

/**
 * The panel itself, split out so the focus hook has a node to hold.
 *
 * It only exists while the sheet is open, which is what makes mounting it the
 * moment to take focus and unmounting it the moment to give it back.
 */
function SheetPanel({ label, children }: { label: string; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useModalFocus(panel);

  return (
    <div
      ref={panel}
      role="dialog"
      tabIndex={-1}
      aria-modal="true"
      aria-label={label}
      className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-edge bg-surface shadow-xl"
    >
      {children}
    </div>
  );
}
