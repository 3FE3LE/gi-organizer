'use client';

import { useState, useTransition } from 'react';

/**
 * Backup and exit.
 *
 * Restoring replaces everything, so it asks first. Two clicks is the right
 * amount of friction for an operation whose entire purpose is to discard the
 * current state.
 */
export function Backup() {
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function restore(form: FormData) {
    setMessage(null);
    setFailed(false);

    start(async () => {
      const response = await fetch('/api/import/native', { method: 'POST', body: form });
      const body = await response.json();

      if (!response.ok) {
        setFailed(true);
        setMessage(body.message ?? body.error ?? 'no se pudo restaurar');
        return;
      }

      const { restored } = body as { restored: Record<string, number> };
      setConfirming(false);
      setMessage(
        `restaurado: ${restored.artifacts} artefactos · ${restored.weapons} armas · ` +
        `${restored.roster} personajes · ${restored.teams} equipos`,
      );
      // The page is server-rendered from the database; a reload is the honest
      // way to show a state that just changed underneath it entirely.
      location.reload();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/api/export"
          download
          className="rounded border border-edge bg-surface px-3 py-1.5 text-sm hover:border-accent"
        >
          Descargar copia completa
        </a>
        <a
          href="/api/export/good"
          download
          className="rounded border border-edge bg-surface px-3 py-1.5 text-sm hover:border-accent"
        >
          Exportar a GOOD
        </a>
        <span className="font-mono text-xs text-muted">
          la copia restaura todo; GOOD lo lee Genshin Optimizer
        </span>
      </div>

      {confirming ? (
        <form action={restore} className="space-y-2 rounded border border-accent/40 bg-surface p-3">
          <p className="text-sm">
            <strong className="text-accent">Restaurar reemplaza todo</strong> — inventario,
            roster, equipos, reglas y objetivos. Lo que haya ahora se pierde.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="file"
              accept=".json,application/json"
              required
              className="text-sm file:mr-3 file:rounded file:border file:border-edge file:bg-ink file:px-3 file:py-1.5 file:text-sm file:text-text"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded border border-accent px-3 py-1.5 text-sm text-accent disabled:opacity-50"
            >
              {busy ? 'Restaurando…' : 'Reemplazar todo'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-sm text-muted hover:text-text"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded border border-edge bg-surface px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-text"
        >
          Restaurar desde una copia…
        </button>
      )}

      {message && (
        <p className={`font-mono text-xs ${failed ? 'text-accent' : 'text-muted'}`}>{message}</p>
      )}
    </div>
  );
}
