'use client';

import Link from 'next/link';
import { Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';

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
          <span className="text-muted"> de {total} en el plan</span>
        </span>
        {teamName && <span className="text-muted">· solo {teamName}</span>}
      </button>

      {charsCount > 0 && clearCharsHref && (
        <Link href={clearCharsHref} className="text-xs text-muted underline hover:text-accent">
          filtro de personaje ({charsCount}) · quitar
        </Link>
      )}

      {open && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/60"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Personajes"
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-edge bg-surface shadow-xl"
          >
            <header className="flex items-center justify-between border-b border-edge px-3 py-2">
              <span className="font-mono text-xs uppercase text-muted">personajes</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="text-muted hover:text-text"
              >
                <X size={16} aria-hidden />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-3">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}
