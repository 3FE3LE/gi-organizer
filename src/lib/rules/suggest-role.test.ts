import assert from 'node:assert/strict';
import { test } from 'node:test';

import { suggestRoles } from './suggest-role';

test('the player\'s own goal wins over the community', () => {
  assert.deepEqual(
    suggestRoles({ ownRoles: [null, 'battery'], communityRole: 'Main DPS', kitText: '' }),
    ['battery'],
  );
});

test('the community role maps onto the enum', () => {
  assert.deepEqual(suggestRoles({ ownRoles: [], communityRole: 'Main DPS', kitText: '' }), ['main-dps']);
  assert.deepEqual(suggestRoles({ ownRoles: [], communityRole: 'Sub DPS', kitText: '' }), ['sub-dps']);
});

test('a support is narrowed by what the kit says it does', () => {
  const role = (kitText: string) => suggestRoles({ ownRoles: [], communityRole: 'Support', kitText });

  assert.deepEqual(role('restores HP to nearby active characters'), ['healer']);
  assert.deepEqual(role('creates a shield that absorbs DMG'), ['shielder']);
  assert.deepEqual(role('increases the ATK of party members'), ['buffer']);
});

test('no source, no guess', () => {
  assert.deepEqual(suggestRoles({ ownRoles: [], communityRole: null, kitText: 'heals' }), []);
});
