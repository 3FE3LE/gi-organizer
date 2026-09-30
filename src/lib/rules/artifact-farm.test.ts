import assert from 'node:assert/strict';
import { test } from 'node:test';

import { adviseArtifactFarm, inStrongbox, type ArtifactDomain } from './artifact-farm';

const names = { es: '', en: '', ja: '', 'zh-Hans': '' };
const domain = (entranceId: number, a: number, b: number): ArtifactDomain => ({
  entranceId, unlockRank: 45, setIds: [a, b], entrance: names, region: names,
});
const config = { fiveStarPerRun: 1.07, strongboxCost: 3, strongboxThrough: '4.0' };
/** Every set in these tests is an old one the strongbox offers, unless named. */
const old = () => null;

test('a domain whose two sets are both wanted outranks one whose pair nobody wears', () => {
  const advice = adviseArtifactFarm([
    { characterId: 1, artifacts: 0.4, setIds: [101] },
    { characterId: 2, artifacts: 0.4, setIds: [201] },
    { characterId: 3, artifacts: 0.4, setIds: [202] },
  ], [domain(1, 101, 102), domain(2, 201, 202)], config, old);

  assert.deepEqual(advice.domains.map((entry) => entry.domain.entranceId), [2, 1]);
  assert.equal(advice.domains[0].usefulPerRun, 1.07);
  // Half the run is the wanted set, the other half a third of a piece through the strongbox.
  assert.ok(Math.abs(advice.domains[1].usefulPerRun - (0.535 + 0.535 / 3)) < 1e-9);
});

test('farming a set\'s own domain always beats the strongbox alone', () => {
  const advice = adviseArtifactFarm([{ characterId: 1, artifacts: 0, setIds: [101] }], [domain(1, 101, 102)], config, old);
  assert.ok(advice.domains[0].usefulPerRun > advice.strongboxPerRun);
});

test('a character with finished artifacts asks for nothing', () => {
  const advice = adviseArtifactFarm([{ characterId: 1, artifacts: 1, setIds: [101] }], [domain(1, 101, 102)], config, old);
  assert.equal(advice.domains.length, 0);
});

test('a 2+2 splits its need, and a set no domain drops is listed apart', () => {
  const advice = adviseArtifactFarm(
    [{ characterId: 1, artifacts: 0.5, setIds: [101, 900] }],
    [domain(1, 101, 102)],
    config,
    old,
  );
  assert.equal(advice.domains[0].sets[0].characters[0].need, 0.25);
  assert.deepEqual(advice.elsewhere.map((set) => set.setId), [900]);
});

test('the strongbox offers sets up to its version, and leftovers only count when the plan wears one of those', () => {
  assert.equal(inStrongbox('4.0', '4.0'), true);
  assert.equal(inStrongbox('5.0', '4.0'), false);
  assert.equal(inStrongbox('4.10', '4.9'), false);
  assert.equal(inStrongbox(null, '4.0'), true);

  // Only a new set wanted: the other half of its domain has nothing to become.
  const newOnly = adviseArtifactFarm(
    [{ characterId: 1, artifacts: 0, setIds: [101] }],
    [domain(1, 101, 102)],
    config,
    (setId) => (setId === 101 ? '5.0' : null),
  );
  assert.equal(newOnly.strongboxUseful, false);
  assert.equal(newOnly.domains[0].usefulPerRun, 0.535);
  assert.equal(newOnly.domains[0].sets[0].strongbox, false);
});
