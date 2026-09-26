import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cardProgress, talentBookDays } from './progress';

const entry = {
  level: 80,
  talent: { auto: 1, skill: 8, burst: 9 },
  target: { level: null, talents: null },
  dismissedAt: null,
};

test('with no target written, the ring and the books read against the cap', () => {
  const progress = cardProgress(entry, new Set(['Monday', 'Thursday', 'Sunday']), 'Thursday');

  assert.equal(progress.level, 80 / 90);
  assert.equal(progress.talentsShort, true);
  assert.equal(progress.booksToday, true);
});

test('a written target is what the ring fills toward, and it stops at full', () => {
  const done = cardProgress(
    { ...entry, target: { level: 70, talents: { auto: 1, skill: 8, burst: 8 } } },
    new Set(['Thursday']),
    'Thursday',
  );

  assert.equal(done.level, 1);
  assert.equal(done.talentsShort, false);
  // Nothing short, so no reason to farm today.
  assert.equal(done.booksToday, false);
});

test('somebody out of the plan has no ring and no day', () => {
  const out = cardProgress({ ...entry, dismissedAt: '2026-01-01' }, new Set(['Thursday']), 'Thursday');

  assert.deepEqual(out, { level: null, talentsShort: false, talentsMet: null, booksToday: false });
});

test('book days are gathered from every phase of the talent costs', () => {
  const days = talentBookDays(
    { '2': [{ id: 1 }, { id: 9 }], '6': [{ id: 2 }] },
    (id) => ({ 1: ['Monday', 'Thursday', 'Sunday'], 2: ['Monday', 'Thursday', 'Sunday'] } as Record<number, string[]>)[id],
  );

  assert.deepEqual([...days].sort(), ['Monday', 'Sunday', 'Thursday']);
});

test('each talent is judged on its own, so an attack left at its target reads as done', () => {
  const progress = cardProgress(
    { ...entry, talent: { auto: 1, skill: 6, burst: 9 }, target: { level: 90, talents: { auto: 1, skill: 9, burst: 9 } } },
    new Set(),
    'Thursday',
  );

  assert.deepEqual(progress.talentsMet, { auto: true, skill: false, burst: true });
  assert.equal(progress.talentsShort, true);
});

test('with no target written, an attack left at 1 is not what is missing', () => {
  const progress = cardProgress({ ...entry, talent: { auto: 1, skill: 9, burst: 9 } }, new Set(['Thursday']), 'Thursday');

  assert.deepEqual(progress.talentsMet, { auto: true, skill: true, burst: true });
  assert.equal(progress.booksToday, false);
});
