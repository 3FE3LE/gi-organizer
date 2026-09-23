import assert from 'node:assert/strict';
import { test } from 'node:test';

import { daysUntil, groupCharacters, nationOf, parseBirthday } from './grouping';

test('the nation comes off the association id', () => {
  assert.equal(nationOf('ASSOC_MONDSTADT'), 'mondstadt');
  assert.equal(nationOf('ASSOC_FATUI'), 'snezhnaya');
  assert.equal(nationOf('ASSOC_SNEZHNAYA_STAR'), 'snezhnaya');
  assert.equal(nationOf('ASSOC_NODKRAI_ZIBAI'), 'nodkrai');
  assert.equal(nationOf('ASSOC_MAINACTOR'), 'other');
  assert.equal(nationOf('ASSOC_OMNI_SCOURGE'), 'other');
});

const character = (id: number, patch: Partial<Parameters<typeof groupCharacters>[0][number]>) => ({
  id,
  elementType: 'ELEMENT_PYRO',
  associationType: 'ASSOC_LIYUE',
  weaponType: 'WEAPON_BOW',
  rarity: 4,
  version: '1.0',
  ...patch,
});

test('within a group, what the player owns comes first', () => {
  const groups = groupCharacters(
    [character(1, {}), character(2, {}), character(3, { elementType: 'ELEMENT_HYDRO' })],
    'element',
    new Set([2]),
  );

  assert.deepEqual(groups.map((group) => group.key), ['ELEMENT_PYRO', 'ELEMENT_HYDRO']);
  assert.deepEqual(groups[0].characters.map((c) => c.id), [2, 1]);
});

test('versions read newest first', () => {
  const groups = groupCharacters(
    [character(1, { version: '4.6' }), character(2, { version: '7.1' }), character(3, { version: '1.0' })],
    'version',
    new Set(),
  );

  assert.deepEqual(groups.map((group) => group.key), ['7.1', '4.6', '1.0']);
});

test('birthdays parse, and the countdown wraps the year', () => {
  assert.deepEqual(parseBirthday('9/28'), { month: 9, day: 28 });
  assert.equal(parseBirthday(null), null);
  assert.equal(parseBirthday('13/1'), null);

  assert.equal(daysUntil({ month: 9, day: 28 }, { month: 9, day: 28 }), 0);
  assert.equal(daysUntil({ month: 9, day: 29 }, { month: 9, day: 28 }), 1);
  assert.equal(daysUntil({ month: 9, day: 27 }, { month: 9, day: 28 }), 365);
});
