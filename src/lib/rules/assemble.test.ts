import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { getCatalog } from '@/lib/data/catalog';
import { createMemoryDb } from '@/lib/db/client';
import { upsertCharacter } from '@/lib/player/characters';
import { getProfileId } from '@/lib/player/db';
import {
  TRAVELER_BODIES, setTravelerBody, travelerDepot, travelerElements,
} from '@/lib/player/traveler';

import { getBuildPriorities, suggestionsFor } from './assemble';
import type { BuildPriority } from './suggest';

const { entries } = JSON.parse(readFileSync('src/generated/data/builds.json', 'utf8')) as {
  entries: (BuildPriority & { travelerElement: string | null })[];
};
const listed = entries.filter((entry) => entry.travelerElement);

async function accountWith(characterId: number, skillDepotId: number | null) {
  const db = createMemoryDb();
  const profileId = await getProfileId(db);
  await upsertCharacter(db, profileId, {
    characterId, travelerElement: null, skillDepotId, level: 90, ascension: 6, constellation: 0,
    talent: { auto: 1, skill: 8, burst: 8 }, talentBonus: null,
  }, { source: 'good', observedAt: '2026-11-22T00:00:00.000Z' });
  return db;
}

test('either body reads the build of the element it is in', async () => {
  const catalog = await getCatalog('es');

  for (const body of Object.values(TRAVELER_BODIES)) {
    for (const entry of listed) {
      const db = await accountWith(body, travelerDepot(catalog, body, entry.travelerElement!));
      const build = (await getBuildPriorities(catalog, db)).get(body);

      assert.deepEqual(build, { ...entry, characterId: body }, `${body} in ${entry.travelerElement}`);
    }
  }
});

test('every element upstream lists is one the Traveler can take', async () => {
  const elements = travelerElements(await getCatalog('es'), TRAVELER_BODIES.male);
  for (const entry of listed) assert.ok(elements.includes(entry.travelerElement!), entry.travelerElement!);
});

test('with no element stated the Traveler reads Anemo, as their skills do', async () => {
  const catalog = await getCatalog('es');
  const anemo = listed.find((entry) => entry.travelerElement === 'ELEMENT_ANEMO');

  // Nobody on the roster, no depot, and the elementless first depot.
  for (const db of [
    createMemoryDb(),
    await accountWith(TRAVELER_BODIES.male, null),
    await accountWith(TRAVELER_BODIES.female, 701),
  ]) {
    const build = (await getBuildPriorities(catalog, db)).get(TRAVELER_BODIES.male);
    assert.deepEqual(build?.mainStats, anemo?.mainStats);
  }
});

test('with both bodies on the roster, the one the account named decides', async () => {
  const catalog = await getCatalog('es');
  const { male, female } = TRAVELER_BODIES;
  const db = await accountWith(male, travelerDepot(catalog, male, 'ELEMENT_PYRO'));
  const profileId = await getProfileId(db);
  await upsertCharacter(db, profileId, {
    characterId: female, travelerElement: null, skillDepotId: travelerDepot(catalog, female, 'ELEMENT_HYDRO'),
    level: 90, ascension: 6, constellation: 0, talent: { auto: 1, skill: 8, burst: 8 }, talentBonus: null,
  }, { source: 'good', observedAt: '2026-11-22T00:00:00.000Z' });
  await setTravelerBody(db, profileId, 'female');

  const build = (await getBuildPriorities(catalog, db)).get(female);
  assert.ok(build?.mainStats[1].includes('FIGHT_PROP_WATER_ADD_HURT'));
});

test('two accounts read at once each keep their own element', async () => {
  const catalog = await getCatalog('es');
  const id = TRAVELER_BODIES.male;
  const [pyro, geo] = await Promise.all(['ELEMENT_PYRO', 'ELEMENT_GEO'].map(async (element) =>
    getBuildPriorities(catalog, await accountWith(id, travelerDepot(catalog, id, element)))));

  assert.ok(pyro.get(id)?.mainStats[1].includes('FIGHT_PROP_FIRE_ADD_HURT'));
  assert.ok(geo.get(id)?.mainStats[1].includes('FIGHT_PROP_ROCK_ADD_HURT'));
});

test('the suggestions reach Lumine in her element', async () => {
  const catalog = await getCatalog('es');
  const id = TRAVELER_BODIES.female;
  const db = await accountWith(id, travelerDepot(catalog, id, 'ELEMENT_GEO'));

  const { stats } = await suggestionsFor(id, catalog, db);
  assert.ok(stats.mainStatsBySlot.get('goblet')?.includes('FIGHT_PROP_ROCK_ADD_HURT'));
});
