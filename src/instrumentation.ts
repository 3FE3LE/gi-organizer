/**
 * Opens the database while a new instance is still loading.
 *
 * A new instance's first query paid the connection's handshake, 60 to 320 ms
 * measured, on the request that woke it — the launch of the app, as often as
 * not. Started here it overlaps with everything else a cold start does before
 * the page asks for its first row: loading the route's code, reading the
 * session. Not awaited: `register` must finish before the server takes
 * requests, and waiting on the network here would only move the delay.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { getDb } = await import('@/lib/db/client');
  getDb().prepare('SELECT 1').get().catch(() => {
    // The first real query opens it again and reports the error there.
  });
}
