/**
 * Stands in for `next/navigation` under `pnpm test` and the browser-suite seed.
 *
 * A server action that redirects is still an action worth exercising: the test
 * wants the write, not the navigation. `redirect` therefore throws the way the
 * real one does — control never returns from it — so a caller that treats the
 * line after it as reachable fails here too.
 */
export function redirect(url) {
  const error = new Error(`NEXT_REDIRECT: ${url}`);
  error.digest = `NEXT_REDIRECT;replace;${url};307;`;
  throw error;
}

export function notFound() {
  throw new Error('NEXT_NOT_FOUND');
}
