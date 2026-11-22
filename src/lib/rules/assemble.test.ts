import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getBuildPriorities } from './assemble';

test('a new element upstream does not replace the Traveler build', async () => {
  const build = (await getBuildPriorities()).get(10000005);

  // The goblet, the second of the three slots the list states.
  assert.ok(build?.mainStats[1].includes('FIGHT_PROP_FIRE_ADD_HURT'));
});
