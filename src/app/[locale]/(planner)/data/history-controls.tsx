'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect } from 'react';

import { type HistoryState, redoAction, undoAction } from './history-actions';

/**
 * Undo and redo, with the keyboard shortcuts people already have in their
 * fingers. Planning means speculative edits, and an edit nobody can take back
 * is an edit nobody makes twice.
 */
export function HistoryControls() {
  const t = useTranslations('data.history');
  const [undoState, runUndo, undoing] = useActionState<HistoryState, FormData>(
    undoAction, { status: 'idle' },
  );
  const [redoState, runRedo, redoing] = useActionState<HistoryState, FormData>(
    redoAction, { status: 'idle' },
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Ignore anything typed into a field; only the page-level gesture counts.
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select')) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;

      event.preventDefault();
      if (event.shiftKey) runRedo(new FormData());
      else runUndo(new FormData());
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runUndo, runRedo]);

  const state = undoState.status !== 'idle' ? undoState : redoState;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form action={runUndo}>
        <button
          type="submit"
          disabled={undoing}
          className="rounded border border-edge bg-surface px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
        >
          {t('undoButton')} <span className="font-mono text-xs text-muted">⌘Z</span>
        </button>
      </form>
      <form action={runRedo}>
        <button
          type="submit"
          disabled={redoing}
          className="rounded border border-edge bg-surface px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
        >
          {t('redoButton')} <span className="font-mono text-xs text-muted">⇧⌘Z</span>
        </button>
      </form>
      {state.status !== 'idle' && (
        <span
          className={`font-mono text-xs ${
            state.status === 'ok' ? 'text-muted' : 'text-accent'
          }`}
        >
          {state.message}
        </span>
      )}
    </div>
  );
}
