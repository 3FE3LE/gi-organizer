import 'server-only';

/**
 * Where a request's server time goes, written to the function log.
 *
 * Launching the installed app took three to four seconds, and the request log
 * says when each request started but not what it spent. This splits a page's
 * render into its awaited steps and prints them as one line — readable with
 * `vercel logs --query timing` — alongside whether the instance was cold, which
 * is the one cost no step can see.
 *
 * Nothing here changes what the page does; it only watches. Cheap enough to
 * leave on: one clock read per step and one line per request.
 */

/** When this instance loaded the module, for telling a cold start apart. */
const bootedAt = Date.now();
let served = 0;

export function requestTimer(route: string) {
  const started = performance.now();
  const steps: Record<string, number> = {};
  served += 1;
  const cold = served === 1;

  return {
    /** Awaits `work` and records how long it took under `name`. */
    async step<T>(name: string, work: Promise<T> | (() => Promise<T>)): Promise<T> {
      const from = performance.now();
      try {
        return await (typeof work === 'function' ? work() : work);
      } finally {
        steps[name] = Math.round(performance.now() - from);
      }
    },
    /** Prints the line. Call once, when the data is in and rendering begins. */
    done() {
      console.log(`[timing] ${JSON.stringify({
        route,
        totalMs: Math.round(performance.now() - started),
        steps,
        cold,
        instanceAgeMs: Date.now() - bootedAt,
        uptimeS: Math.round(process.uptime()),
      })}`);
    },
  };
}
