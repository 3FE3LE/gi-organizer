import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pieceQuality } from '@/lib/rules/rolls';

import { critPotential } from './artifacts';

const potential = (substats: [string, number][]) =>
  critPotential(pieceQuality({ rarity: 5, substats: substats.map(([prop, value]) => ({ prop, value })) }));

/*
 * The case the reading exists for: a raw piece that opened on a top crit
 * rate roll has more to offer than a finished one whose crit rate took two
 * low rolls to reach 5.4.
 */
test('a top opening crit roll outranks two low ones', () => {
  const raw = potential([['FIGHT_PROP_CRITICAL', 3.9], ['FIGHT_PROP_HP', 299]]);
  const finished = potential([['FIGHT_PROP_CRITICAL', 5.4], ['FIGHT_PROP_HP', 800]]);

  assert.ok(Math.abs(raw - 1) < 0.01, String(raw));
  assert.ok(Math.abs(finished - 0.69) < 0.02, String(finished));
  assert.ok(raw > finished);
});

test('both crit lines at the top tier is the ceiling, and no crit is zero', () => {
  assert.ok(Math.abs(potential([['FIGHT_PROP_CRITICAL', 3.9], ['FIGHT_PROP_CRITICAL_HURT', 7.8]]) - 2) < 0.01);
  assert.equal(potential([['FIGHT_PROP_HP', 299], ['FIGHT_PROP_ATTACK_PERCENT', 5.8]]), 0);
});

test('a crit circlet reads its one crit line on the same 2.0 scale', () => {
  const quality = pieceQuality({
    rarity: 5,
    substats: [
      { prop: 'FIGHT_PROP_CRITICAL_HURT', value: 7.8 },
      { prop: 'FIGHT_PROP_HP', value: 299 },
    ],
  });

  assert.ok(Math.abs(critPotential(quality) - 1) < 0.01);
  assert.ok(Math.abs(critPotential(quality, 'FIGHT_PROP_CRITICAL') - 2) < 0.01);
  assert.ok(Math.abs(critPotential(quality, 'FIGHT_PROP_ATTACK_PERCENT') - 1) < 0.01);
});
