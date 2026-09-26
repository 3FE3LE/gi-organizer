'use server';

import { isLocale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { readTeams } from '@/lib/player/teams';
import { getAccountCatalog } from '@/lib/player/traveler';
import { inTeam, summarizeAgenda } from '@/lib/rules/agenda';
import { accountAgenda } from '@/lib/rules/assemble';
import { requestTimer } from '@/lib/timing';

/**
 * How many gear moves need no farming, for the day card's chip.
 *
 * An action the browser calls once the plan is on screen, rather than part of
 * the page's render: the queue behind this number reads every build's
 * suggestions, which is many times the work of the plan itself, and rendered
 * with the page it held the response open and competed with the plan for the
 * database on the page signing in lands on.
 */
export async function countReadyUpgrades(locale: string, teamId: string | null) {
  if (!isLocale(locale)) return 0;

  const timer = requestTimer('/plan:upgrades-count');
  const db = getDb();
  const [catalog, teams] = await Promise.all([
    timer.step('catalog', getAccountCatalog(locale)),
    timer.step('teams', readTeams(db)),
  ]);
  const items = await timer.step('agenda', accountAgenda(catalog, db));
  timer.done();

  const team = teams.find((entry) => entry.id === teamId) ?? null;
  return summarizeAgenda(inTeam(items, team)).actionableNow;
}
