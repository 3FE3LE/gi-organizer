import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getGoodCrosswalk } from '@/lib/data/registry';

import { createKeyResolver } from './keys';

/* Inventory Kamera 1.4.5 writes the Manekins under names the key list lacks. */
test('Kamera\'s Manekin names resolve to the Manekins', async () => {
  const resolver = createKeyResolver(await getGoodCrosswalk());

  assert.deepEqual(resolver.location('Manequin1'), { kind: 'exact', id: 10000117 });
  assert.deepEqual(resolver.location('Manequin2'), { kind: 'exact', id: 10000118 });
  assert.deepEqual(resolver.character('Manekin'), { kind: 'exact', id: 10000117 });
});
