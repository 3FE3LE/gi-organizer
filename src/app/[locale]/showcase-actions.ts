'use server';

import { refreshEverywhere } from '@/lib/refresh';
import { syncShowcase, type SyncResult } from '@/lib/player/showcase-sync';

/**
 * The showcase read the app does on opening, and the profile's "update now".
 * Never throws: an unreachable Enka or a signed-out visitor is a sync that did
 * not happen, not an error on whatever page is open.
 */
export async function syncShowcaseAction(force = false): Promise<SyncResult> {
  try {
    const result = await syncShowcase({ force });
    if (result.status === 'synced' && result.changed) refreshEverywhere();
    return result;
  } catch {
    return { status: 'failed', code: 'unavailable' };
  }
}
