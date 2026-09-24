import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getCatalog } from '@/lib/data/catalog';

import { TRAVELER_BODIES, elementOfDepot, travelerDepot, travelerElements } from './traveler';

/*
 * Against the generated catalog, because the point is that the depot table
 * is read rather than typed out: Enka keys each Traveler form as
 * `avatarId-depotId`, and a patch that adds an element adds a key.
 */
test('an element resolves to the body\'s own skill depot, from either vocabulary', async () => {
  const catalog = await getCatalog('es');

  assert.equal(travelerDepot(catalog, TRAVELER_BODIES.male, 'ELEMENT_ANEMO'), 504);
  assert.equal(travelerDepot(catalog, TRAVELER_BODIES.male, 'Wind'), 504);
  assert.equal(travelerDepot(catalog, TRAVELER_BODIES.female, 'ELEMENT_ANEMO'), 704);
  assert.equal(travelerDepot(catalog, TRAVELER_BODIES.female, 'ELEMENT_PYRO'), 702);
  // The form the frozen store never had: an account in Cryo has to resolve.
  assert.equal(travelerDepot(catalog, TRAVELER_BODIES.male, 'ELEMENT_CRYO'), 505);
  assert.equal(travelerDepot(catalog, TRAVELER_BODIES.female, 'Ice'), 705);
  assert.equal(travelerDepot(catalog, TRAVELER_BODIES.male, 'ELEMENT_NONE'), null);
});

test('a depot reads back as its element, and the elementless one as none', async () => {
  const catalog = await getCatalog('es');

  assert.equal(elementOfDepot(catalog, TRAVELER_BODIES.male, 506), 'ELEMENT_GEO');
  assert.equal(elementOfDepot(catalog, TRAVELER_BODIES.female, 708), 'ELEMENT_DENDRO');
  assert.equal(elementOfDepot(catalog, TRAVELER_BODIES.male, 501), null);
  assert.equal(elementOfDepot(catalog, TRAVELER_BODIES.male, null), null);
});

test('both bodies offer the same elements', async () => {
  const catalog = await getCatalog('es');
  const male = travelerElements(catalog, TRAVELER_BODIES.male).sort();
  const female = travelerElements(catalog, TRAVELER_BODIES.female).sort();

  assert.deepEqual(male, female);
  assert.ok(male.includes('ELEMENT_ANEMO') && male.includes('ELEMENT_CRYO') && male.length >= 7);
});
