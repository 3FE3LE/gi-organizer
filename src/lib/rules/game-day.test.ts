import assert from 'node:assert/strict';
import { test } from 'node:test';

import { gameWeekStrip, gameWeekday, nextGameReset, regionForTimeZone } from './game-day';

test('a night in GMT-5 is still the same day it is on the America server', () => {
  // Wednesday 21:00 in GMT-5, which the machine's UTC clock already calls
  // Thursday. The bug this exists to stop.
  const now = new Date('2026-09-17T02:00:00Z');

  assert.equal(gameWeekday(now, 'america'), 'Wednesday');
});

test('the day turns at four in the morning, not at midnight', () => {
  // 03:59 and 04:01 on the America server, the same Thursday by the calendar.
  assert.equal(gameWeekday(new Date('2026-09-17T08:59:00Z'), 'america'), 'Wednesday');
  assert.equal(gameWeekday(new Date('2026-09-17T09:01:00Z'), 'america'), 'Thursday');
});

test('the same instant is different days on different servers', () => {
  const now = new Date('2026-09-17T02:00:00Z');

  assert.equal(gameWeekday(now, 'america'), 'Wednesday');
  assert.equal(gameWeekday(now, 'europe'), 'Wednesday');
  assert.equal(gameWeekday(now, 'asia'), 'Thursday');
});

test('the strip is centred on the game day and carries its dates', () => {
  const strip = gameWeekStrip(new Date('2026-09-17T02:00:00Z'), 'america');

  assert.equal(strip.length, 7);
  assert.deepEqual(strip[3], { day: 'Wednesday', date: 16 });
  assert.deepEqual(strip[0], { day: 'Sunday', date: 13 });
  assert.deepEqual(strip[6], { day: 'Saturday', date: 19 });
});

test('the strip crosses a month end without losing a day', () => {
  const strip = gameWeekStrip(new Date('2026-10-01T12:00:00Z'), 'america');

  assert.deepEqual(strip.map((entry) => entry.date), [28, 29, 30, 1, 2, 3, 4]);
});

test('the next reset is four in the morning on the server, whatever the machine calls it', () => {
  // Wednesday 21:00 in GMT-5: the reset is Thursday 04:00 there, 09:00 UTC.
  const now = new Date('2026-09-17T02:00:00Z');

  assert.equal(nextGameReset(now, 'america').toISOString(), '2026-09-17T09:00:00.000Z');
  assert.equal(nextGameReset(now, 'asia').toISOString(), '2026-09-17T20:00:00.000Z');
});

test('a minute after the reset, the next one is a day away', () => {
  const now = new Date('2026-09-17T09:01:00Z');

  assert.equal(nextGameReset(now, 'america').toISOString(), '2026-09-18T09:00:00.000Z');
});

test('a timezone lands on the server whose clock it sits nearest', () => {
  const now = new Date('2026-09-17T12:00:00Z');

  assert.equal(regionForTimeZone('America/Mexico_City', now), 'america');
  assert.equal(regionForTimeZone('America/Sao_Paulo', now), 'america');
  assert.equal(regionForTimeZone('Pacific/Honolulu', now), 'america');
  assert.equal(regionForTimeZone('Europe/Madrid', now), 'europe');
  assert.equal(regionForTimeZone('Asia/Dubai', now), 'europe');
  assert.equal(regionForTimeZone('UTC', now), 'europe');
  assert.equal(regionForTimeZone('Asia/Kolkata', now), 'asia');
  assert.equal(regionForTimeZone('Asia/Tokyo', now), 'asia');
  assert.equal(regionForTimeZone('Australia/Sydney', now), 'asia');
});

test('a timezone the runtime does not know is no guess at all', () => {
  assert.equal(regionForTimeZone('Mars/Olympus_Mons'), null);
});
