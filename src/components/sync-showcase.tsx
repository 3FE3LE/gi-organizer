'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { syncShowcaseAction } from '@/app/[locale]/showcase-actions';

/**
 * Reads the showcase once per visit, after the page has painted.
 *
 * Mounted in the root layout, so it runs once when the app opens and not on
 * every navigation; the server skips it when the last read is recent (see
 * `syncShowcase`). When the showcase moved a character, the page is refreshed
 * so it shows the new levels without waiting for the next click.
 */
export function SyncShowcase() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (!isSignedIn || done.current) return;
    done.current = true;

    const run = () => {
      syncShowcaseAction()
        .then((result) => {
          if (result.status === 'synced' && result.changed) router.refresh();
        })
        .catch(() => {});
    };
    const idle = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(run, { timeout: 3000 })
      : window.setTimeout(run, 1000);
    return () => {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle as number);
      else window.clearTimeout(idle as number);
    };
  }, [isSignedIn, router]);

  return null;
}
