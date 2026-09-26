import 'server-only';

import { revalidatePath } from 'next/cache';

/**
 * After a write, every screen shows it — not only the one the write came from.
 *
 * `refresh()` re-renders the page the action was called from and nothing
 * else. The other sections were still in the browser's router cache — the nav
 * prefetches them — so including somebody back into the plan left the roster
 * drawing them as out of it until a hard reload. Player data is never cached
 * on the server, so this invalidates nothing there; what it buys is the
 * purge of that client cache, as `revalidatePath('/', 'layout')` is
 * documented to do, along with the same re-render of the current page.
 *
 * Only callable from a Server Action, like the two functions it stands for.
 */
export function refreshEverywhere() {
  revalidatePath('/', 'layout');
}
