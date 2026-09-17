'use client';

import { RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * What a failed render looks like instead of a blank page.
 *
 * Every planner route reads a database over the network, so a failure here is
 * ordinary — a dropped connection, a cold server — and almost always fixed by
 * asking again. `retry` re-fetches and re-renders this boundary's children,
 * which is exactly that; `reset` would only clear the error state and re-render
 * the same stale result.
 *
 * The digest is printed because a Server Component's real message never
 * reaches the browser in production: it is the only handle the server log can
 * be matched on.
 */
export default function PlannerError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations('ui');

  return (
    <div role="alert" className="max-w-prose space-y-3">
      <h1 className="text-lg font-medium">{t('errorTitle')}</h1>
      <p className="text-sm text-muted">{t('errorBody')}</p>

      <button
        type="button"
        onClick={() => retry()}
        className="inline-flex items-center gap-2 rounded border border-accent px-3 py-1.5 text-sm text-accent transition-colors hover:bg-surface-2"
      >
        <RotateCw size={14} aria-hidden />
        {t('retry')}
      </button>

      {error.digest && (
        <p className="font-mono text-xs text-muted">{t('errorDigest', { digest: error.digest })}</p>
      )}
    </div>
  );
}
