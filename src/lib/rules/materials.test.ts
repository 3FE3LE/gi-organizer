import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  charactersIn,
  computeDemand,
  domainsByKind,
  domainsOn,
  scheduleNeeds,
  type DemandSource,
  type MaterialSchedule,
  type Need,
} from './materials';

const MORA = 202;
const BOOK = 104301;
const HORN = 112138;
const GEM = 104101;

function source(overrides: Partial<DemandSource> = {}): DemandSource {
  return {
    characterId: 1,
    buildName: 'Prueba',
    current: { level: 80, ascension: 5, talents: { auto: 6, skill: 6, burst: 6 } },
    target: { level: 90, ascension: 6, talents: { auto: 9, skill: 9, burst: 9 } },
    ascensionCosts: {
      ascend5: [{ id: MORA, count: 100_000 }, { id: GEM, count: 3 }],
      ascend6: [{ id: MORA, count: 120_000 }, { id: HORN, count: 20 }],
    },
    talentCosts: {
      lvl6: [{ id: BOOK, count: 3 }],
      lvl7: [{ id: BOOK, count: 4 }],
      lvl8: [{ id: BOOK, count: 6 }],
      lvl9: [{ id: BOOK, count: 9 }],
    },
    weapon: null,
    ...overrides,
  };
}

test('only the phases between here and there are charged', () => {
  const needs = computeDemand([source()], new Map());
  const byId = new Map(needs.map((need) => [need.materialId, need]));

  // Ascension 5 is already done, so only 6 counts.
  assert.equal(byId.get(MORA)?.needed, 120_000);
  assert.equal(byId.get(HORN)?.needed, 20);
  assert.equal(byId.get(GEM), undefined, 'a phase already passed costs nothing');
});

test('talent levels are cumulative across all three talents', () => {
  const needs = computeDemand([source()], new Map());
  const book = needs.find((need) => need.materialId === BOOK);

  // 6→9 on each of three talents: (4 + 6 + 9) × 3.
  assert.equal(book?.needed, (4 + 6 + 9) * 3);
});

test('a build already at its target needs nothing', () => {
  const done = source({
    current: { level: 90, ascension: 6, talents: { auto: 9, skill: 9, burst: 9 } },
  });

  assert.deepEqual(computeDemand([done], new Map()), []);
});

test('what the bag already covers is not reported', () => {
  const needs = computeDemand([source()], new Map([[HORN, 25], [MORA, 999_999]]));

  assert.equal(needs.find((need) => need.materialId === HORN), undefined);
  assert.equal(needs.find((need) => need.materialId === MORA), undefined);
  assert.ok(needs.some((need) => need.materialId === BOOK), 'and the rest still is');
});

test('a partial stock reports only the gap', () => {
  const [need] = computeDemand([source()], new Map([[HORN, 12]]))
    .filter((entry) => entry.materialId === HORN);

  assert.equal(need.needed, 20);
  assert.equal(need.owned, 12);
  assert.equal(need.short, 8);
});

test('demand from several builds is pooled and stays attributable', () => {
  const needs = computeDemand(
    [source(), source({ characterId: 2, buildName: 'Otra' })],
    new Map(),
  );
  const book = needs.find((need) => need.materialId === BOOK);

  assert.equal(book?.needed, (4 + 6 + 9) * 3 * 2);
  // One row per character and reason, not one per cost line.
  assert.equal(book?.by.length, 2);
  assert.deepEqual(book?.by.map((entry) => entry.count), [(4 + 6 + 9) * 3, (4 + 6 + 9) * 3]);
  assert.deepEqual(book?.by.map((entry) => entry.buildName), ['Prueba', 'Otra']);
});

test('a planned weapon adds its own ascension cost', () => {
  const needs = computeDemand([source({
    weapon: {
      weaponId: 11501, ascension: 4, target: 6,
      costs: {
        ascend5: [{ id: HORN, count: 9 }],
        ascend6: [{ id: HORN, count: 12 }],
      },
    },
  })], new Map());

  const horn = needs.find((need) => need.materialId === HORN);
  assert.equal(horn?.needed, 20 + 9 + 12);
  assert.ok(horn?.by.some((entry) => entry.reason === 'weapon'));
});

/* -------------------------------------------------------- schedule --- */

const need = (materialId: number, short: number): Need => ({
  materialId, needed: short, owned: 0, short, by: [],
});

const metadata = new Map([
  [BOOK, { domain: 'Domain of Mastery: Frosted Altar', days: ['Monday', 'Thursday', 'Sunday'] }],
  [HORN, { domain: null, days: [] }],
  [MORA, { domain: null, days: [] }],
]);

test('day-gated needs group by domain, the rest are anytime', () => {
  const schedule = scheduleNeeds([need(BOOK, 57), need(HORN, 8), need(MORA, 5)], metadata);

  assert.equal(schedule.domains.length, 1);
  assert.equal(schedule.domains[0].domain, 'Domain of Mastery: Frosted Altar');
  assert.equal(schedule.domains[0].short, 57);
  // A boss drop and mora are a question of quantity, not of schedule.
  assert.equal(schedule.anytime.length, 2);
});

test('a domain only shows on the days it actually rotates', () => {
  const schedule = scheduleNeeds([need(BOOK, 57)], metadata);

  assert.equal(domainsOn(schedule, 'Monday').length, 1);
  assert.equal(domainsOn(schedule, 'Tuesday').length, 0);
  assert.equal(domainsOn(schedule, 'Sunday').length, 1);
});

test('a material with no metadata falls to anytime rather than vanishing', () => {
  const schedule = scheduleNeeds([need(999999, 3)], new Map());
  assert.equal(schedule.anytime.length, 1);
});

test('the same character twice is not twice the levelling cost', () => {
  // Two builds for one character is the normal case — a support target and a
  // sub-dps target — and you still only ascend them once. Counting per build
  // doubles every mora figure on the page.
  const once = computeDemand([source()], new Map());
  const twice = computeDemand([source(), source({ buildName: 'Otra' })], new Map());

  assert.notDeepEqual(
    once.map((need) => need.needed),
    twice.map((need) => need.needed),
    'computeDemand itself pools by source, so the caller must dedupe',
  );
});

test('a talent already past the target is not charged', () => {
  const ahead = source({
    current: { level: 90, ascension: 6, talents: { auto: 10, skill: 6, burst: 6 } },
    target: { level: 90, ascension: 6, talents: { auto: 9, skill: 9, burst: 9 } },
  });

  const book = computeDemand([ahead], new Map())
    .find((need) => need.materialId === BOOK);

  // Only skill and burst move, 6 to 9 each.
  assert.equal(book?.needed, (4 + 6 + 9) * 2);
});

/* ---------------------------------------------------- the day's two runs --- */

const FORGE = 114001;

const dayMetadata = new Map<number, MaterialSchedule>([
  [BOOK, {
    domain: 'Domain of Mastery: Frosted Altar',
    days: ['Monday', 'Thursday', 'Sunday'],
    domainName: 'Dominio de la maestría: Altar de la Escarcha',
  }],
  [FORGE, {
    domain: 'Domain of Forgery: City of Reflections',
    days: ['Monday', 'Thursday', 'Sunday'],
    domainName: 'Dominio de la forja: Ciudad de los reflejos',
  }],
]);

const attributed = (
  materialId: number,
  short: number,
  by: Need['by'],
): Need => ({ materialId, needed: short, owned: 0, short, by });

const row = (
  characterId: number,
  reason: Need['by'][number]['reason'],
  count: number,
  assumed?: boolean,
): Need['by'][number] => ({ characterId, buildName: 'x', count, reason, assumed });

test('a domain is talent or weapon by what its materials are wanted for', () => {
  const schedule = scheduleNeeds(
    [
      attributed(BOOK, 9, [row(1, 'talent', 9)]),
      attributed(FORGE, 4, [row(2, 'weapon', 4)]),
    ],
    dayMetadata,
  );

  const { talent, weapon } = domainsByKind(schedule, 'Monday');

  assert.deepEqual(talent.map((plan) => plan.domain), ['Domain of Mastery: Frosted Altar']);
  assert.deepEqual(weapon.map((plan) => plan.domain), ['Domain of Forgery: City of Reflections']);
});

test('the day splits, and a day nothing rotates on is empty on both sides', () => {
  const schedule = scheduleNeeds(
    [attributed(BOOK, 9, [row(1, 'talent', 9)])],
    dayMetadata,
  );

  assert.equal(domainsByKind(schedule, 'Tuesday').talent.length, 0);
  assert.equal(domainsByKind(schedule, 'Tuesday').weapon.length, 0);
});

test('a domain carries the localized name and falls back to the key', () => {
  const schedule = scheduleNeeds(
    [attributed(BOOK, 9, [row(1, 'talent', 9)]), attributed(999, 1, [row(1, 'talent', 1)])],
    new Map([
      ...dayMetadata,
      [999, { domain: 'Untranslated Domain', days: ['Monday'] }],
    ]),
  );

  const labels = new Map(schedule.domains.map((plan) => [plan.domain, plan.label]));
  assert.equal(
    labels.get('Domain of Mastery: Frosted Altar'),
    'Dominio de la maestría: Altar de la Escarcha',
  );
  assert.equal(labels.get('Untranslated Domain'), 'Untranslated Domain');
});

test('who is waiting on a domain is deduped and ordered by how much', () => {
  const schedule = scheduleNeeds(
    [
      attributed(BOOK, 12, [row(1, 'talent', 3), row(2, 'talent', 9)]),
      attributed(104302, 5, [row(1, 'talent', 5)]),
    ],
    new Map([
      ...dayMetadata,
      [104302, { domain: 'Domain of Mastery: Frosted Altar', days: ['Monday'] }],
    ]),
  );

  assert.deepEqual(charactersIn(schedule.domains), [
    { characterId: 2, count: 9 },
    { characterId: 1, count: 8 },
  ]);
});

test('an assumed target is marked on every row it produced', () => {
  const [need] = computeDemand([source({ assumed: true })], new Map())
    .filter((entry) => entry.materialId === BOOK);

  assert.ok(need.by.every((entry) => entry.assumed));
});
