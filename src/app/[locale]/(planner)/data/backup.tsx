'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { ActionStatus } from '@/components/action-status';

/**
 * Backup and exit.
 *
 * Restoring replaces everything, so it asks first. Two clicks is the right
 * amount of friction for an operation whose entire purpose is to discard the
 * current state.
 */
export function Backup() {
  const t = useTranslations('data.backup');
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
        setMessage(body.message ?? body.error ?? t('restoreFailed'));
        return;
      }

      const { restored } = body as { restored: Record<string, number> };
      setConfirming(false);
      setMessage(t('restoredMessage', {
        artifacts: restored.artifacts,
        weapons: restored.weapons,
        roster: restored.roster,
        teams: restored.teams,
      }));
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
          className={buttonVariants({ variant: 'outline' })}
        >
          {t('downloadFull')}
        </a>
        <a
          href="/api/export/good"
          download
          className={buttonVariants({ variant: 'outline' })}
        >
          {t('exportGood')}
        </a>
        <span className="font-mono text-xs text-muted">
          {t('exportHint')}
        </span>
      </div>

      {confirming ? (
        <form action={restore} className="notice space-y-2 p-3">
          <p className="text-sm">
            <strong className="text-accent">{t('confirmTitle')}</strong> {t('confirmBody')}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="file"
              accept=".json,application/json"
              required
              className="min-w-0 max-w-full text-sm file:mr-3 file:rounded-md file:border file:border-edge file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-text"
            />
            <Button
              variant="default"
              type="submit"
              disabled={busy}
            >
              {busy ? t('restoring') : t('replaceAll')}
            </Button>
            <Button variant="ghost" type="button" onClick={() => setConfirming(false)}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" type="button" onClick={() => setConfirming(true)}>
          {t('restoreFromBackup')}
        </Button>
      )}

      <ActionStatus
        state={{ status: message ? (failed ? 'error' : 'ok') : 'idle', message: message ?? undefined }}
        className="font-mono text-xs"
      />
    </div>
  );
}
