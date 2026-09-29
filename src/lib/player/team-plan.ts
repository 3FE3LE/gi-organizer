import 'server-only';

import { getDb, type Db } from '@/lib/db/client';

import { setDismissed } from './characters';
import { getProfileId } from './db';
import { readTeams } from './teams';

/**
 * The plan follows the teams.
 *
 * Swapping a member left the plan farming for whoever had left and ignoring
 * whoever had arrived: the roster's in-or-out is its own switch, and nothing
 * told it the team had changed. So joining a team puts a character in the
 * plan, and leaving one takes them out — unless another team still fields
 * them, since that team still needs them built. Either can be undone from the
 * plan's roster, one face at a time.
 *
 * Called after the team itself has changed, so "another team" is read from
 * the teams as they now are.
 */
export async function followTeamIntoPlan(
  characterId: number,
  joined: boolean,
  db: Db = getDb(),
) {
  if (!joined) {
    const stillFielded = (await readTeams(db))
      .some((team) => team.slots.some((slot) => slot.characterId === characterId));
    if (stillFielded) return;
  }
  await setDismissed(db, await getProfileId(db), [characterId], !joined);
}
