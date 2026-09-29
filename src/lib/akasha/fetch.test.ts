import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseCalculations } from './fetch';

test('the best board per character is kept, from text or numbers', () => {
  const standings = parseCalculations({
    data: [
      { characterId: 10000046, calculations: {
        fit: { calculationId: '1', ranking: '~1,200', outOf: 10000, variant: null },
        best: { calculationId: '2', ranking: 300, outOf: '5000', variant: { name: '110er' } },
      } },
      { characterId: 10000022, calculations: { fit: { calculationId: '3', ranking: 0, outOf: 10 } } },
    ],
  });

  assert.deepEqual(standings[10000046], { ranking: 300, outOf: 5000, calculationId: '2', variant: '110er' });
  assert.equal(standings[10000022], undefined, 'no usable ranking, no standing');
});

test('an answer that is not the expected shape is no ranking', () => {
  assert.deepEqual(parseCalculations({ error: 'blocked' }), {});
  assert.deepEqual(parseCalculations(null), {});
});
