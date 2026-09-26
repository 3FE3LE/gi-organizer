import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DomainPlan, Schedule } from '@/lib/rules/materials';

import { nextOf, rotationsOf } from './rotations';

const domain = (name: string, kind: DomainPlan['kind'], days: DomainPlan['days'], short: number) => ({
  domain: name,
  label: name,
  kind,
  days,
  short,
  needs: [{ materialId: 1, needed: short, owned: 0, short, by: [{ characterId: short, buildName: '', count: short, reason: 'talent' as const }] }],
});

test('days that open the same domains fold into one rotation', () => {
  const schedule: Schedule = {
    anytime: [],
    domains: [
      domain('Books A', 'talent', ['Monday', 'Thursday', 'Sunday'], 30),
      domain('Ore A', 'weapon', ['Monday', 'Thursday', 'Sunday'], 5),
      domain('Books B', 'talent', ['Tuesday', 'Friday', 'Sunday'], 12),
    ],
  };

  const rotations = rotationsOf(schedule);
  const monday = rotations.find((entry) => entry.days.includes('Monday'));
  const tuesday = rotations.find((entry) => entry.days.includes('Tuesday'));

  assert.deepEqual(monday, { days: ['Monday', 'Thursday'], talent: 30, weapon: 5, waiting: 2 });
  assert.deepEqual(tuesday, { days: ['Tuesday', 'Friday'], talent: 12, weapon: 0, waiting: 1 });
  // Wednesday and Saturday open nothing needed, and still read as their pair.
  assert.ok(rotations.some((entry) => entry.days.join() === 'Wednesday,Saturday'));
  assert.ok(rotations.every((entry) => !entry.days.includes('Sunday')));
});

test('two rotations that open nothing needed stay two', () => {
  const rotations = rotationsOf({ anytime: [], domains: [] });

  assert.deepEqual(rotations.map((entry) => entry.days), [
    ['Monday', 'Thursday'], ['Tuesday', 'Friday'], ['Wednesday', 'Saturday'],
  ]);
});

test('a rotation opens on today when today is one of its days, else on the next', () => {
  assert.equal(nextOf(['Monday', 'Thursday'], 'Thursday'), 'Thursday');
  assert.equal(nextOf(['Monday', 'Thursday'], 'Friday'), 'Monday');
  assert.equal(nextOf(['Wednesday', 'Saturday'], 'Sunday'), 'Wednesday');
});
