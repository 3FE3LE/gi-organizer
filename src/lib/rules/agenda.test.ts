import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildAgenda, inTeam, summarizeAgenda, type AgendaInput } from './agenda';
import type { Swap } from './compare';
import type { GoalVerdict } from './stats';

const CR = 'FIGHT_PROP_CRITICAL';
const ER = 'FIGHT_PROP_CHARGE_EFFICIENCY';
const CRIMSON = 15006;

function swap(o: Partial<Swap> & { instanceId: string }): Swap {
  const { instanceId, ...rest } = o;
  return {
    candidate: {
      instanceId, setId: CRIMSON, slot: 'circlet', rarity: 5, level: 20,
      mainProp: 'FIGHT_PROP_CRITICAL_HURT', substats: [],
    },
    score: { score: 0, mainStatWanted: true, matched: [], wastedRolls: 0 },
    potential: { min: 0, expected: 0, max: 0, remainingRolls: 0 },
    delta: 1,
    potentialDelta: 1,
    bestCaseDelta: 1,
    kind: 'upgrade',
    keepsSetBonus: true,
    goalChanges: [],
    ...rest,
  };
}

function goal(prop: string, status: GoalVerdict['status']): GoalVerdict {
  return { prop, min: 100, actual: status === 'met' ? 100 : 50, margin: -0.5, status };
}

function input(o: Partial<AgendaInput['builds'][number]> = {}, holders = new Map()): AgendaInput {
  return {
    holderOf: holders,
    builds: [{
      buildId: 'b1', buildName: 'Prueba', characterId: 1,
      goals: [], setPlan: [], weaponId: null, weaponAvailable: true,
      equippedSets: new Map(),
      slots: [],
      ...o,
    }],
  };
}

test('an empty slot outranks a marginal swap elsewhere', () => {
  const items = buildAgenda(input({
    slots: [
      { slot: 'goblet', empty: false, swaps: [swap({ instanceId: 'a', delta: 3 })] },
      { slot: 'circlet', empty: true, swaps: [swap({ instanceId: 'b', delta: 1 })] },
    ],
  }));

  assert.equal(items[0].kind, 'fill-empty-slot');
  assert.equal(items[0].slot, 'circlet');
});

test('closing a goal comes first, whatever it costs', () => {
  const items = buildAgenda(input({
    goals: [goal(ER, 'short')],
    slots: [
      // A big, free, ordinary upgrade.
      { slot: 'goblet', empty: false, swaps: [swap({ instanceId: 'big', delta: 9 })] },
      // A small one that costs a displacement and closes the goal.
      {
        slot: 'sands', empty: false,
        swaps: [swap({
          instanceId: 'fixer', delta: 0.6,
          goalChanges: [{ prop: ER, from: 'short', to: 'met' }],
        })],
      },
    ],
  }, new Map([['fixer', 99]])));

  assert.equal(items[0].kind, 'fix-goal');
  assert.deepEqual(items[0].fixesGoals, [ER]);
  assert.equal(items[0].cost, 'displaces');
  assert.equal(items[1].kind, 'equip-upgrade');
});

test('a swap that would break a goal already met is never proposed', () => {
  const items = buildAgenda(input({
    goals: [goal(ER, 'met')],
    slots: [{
      slot: 'sands', empty: false,
      swaps: [swap({
        instanceId: 'loses', delta: 5,
        goalChanges: [{ prop: ER, from: 'met', to: 'short' }],
      })],
    }],
  }));

  assert.equal(items.filter((item) => item.slot === 'sands').length, 0);
});

test('cost breaks a tie between equal gains', () => {
  const items = buildAgenda(input({
    slots: [
      { slot: 'goblet', empty: false, swaps: [swap({ instanceId: 'taken', delta: 2 })] },
      { slot: 'sands', empty: false, swaps: [swap({ instanceId: 'spare', delta: 2 })] },
    ],
  }, new Map([['taken', 42], ['spare', null]])));

  assert.equal(items[0].data.candidate, 'spare');
  assert.equal(items[0].cost, 'free');
  assert.equal(items[1].cost, 'displaces');
});

test('a marginal upgrade is not worth listing', () => {
  const items = buildAgenda(input({
    slots: [{ slot: 'goblet', empty: false, swaps: [swap({ instanceId: 'tiny', delta: 0.2 })] }],
  }));

  assert.deepEqual(items, []);
});

test('a prospect is listed only when the payoff is real', () => {
  const small = buildAgenda(input({
    slots: [{
      slot: 'goblet', empty: false,
      swaps: [swap({ instanceId: 'p', kind: 'prospect', delta: -1, potentialDelta: 0.4 })],
    }],
  }));
  assert.deepEqual(small, []);

  const worth = buildAgenda(input({
    slots: [{
      slot: 'goblet', empty: false,
      swaps: [swap({
        instanceId: 'p', kind: 'prospect', delta: -1, potentialDelta: 4,
        potential: { min: 0, expected: 4, max: 4, remainingRolls: 5 },
      })],
    }],
  }));
  assert.equal(worth[0].kind, 'level-prospect');
  assert.equal(worth[0].cost, 'needs-levelling');
  assert.equal(worth[0].data.rolls, 5);
});

test('an unfinished set plan is a farming item, not a swap', () => {
  const items = buildAgenda(input({
    setPlan: [{ setIds: [CRIMSON], pieces: 4 }],
    equippedSets: new Map([[CRIMSON, 2]]),
  }));

  const set = items.find((item) => item.kind === 'complete-set');
  assert.ok(set);
  assert.equal(set.cost, 'needs-farming');
  assert.deepEqual([set.data.have, set.data.need], [2, 4]);
});

test('a goal nothing can fix is stated rather than omitted', () => {
  const items = buildAgenda(input({
    goals: [goal(CR, 'short')],
    slots: [{ slot: 'goblet', empty: false, swaps: [] }],
  }));

  const stuck = items.find((item) => item.kind === 'goal-unreachable');
  assert.ok(stuck, 'silence would read as "nothing to do here"');
  assert.equal(stuck.data.prop, CR);
});

test('a goal something can fix is not also reported as stuck', () => {
  const items = buildAgenda(input({
    goals: [goal(ER, 'short')],
    slots: [{
      slot: 'sands', empty: false,
      swaps: [swap({ instanceId: 'f', goalChanges: [{ prop: ER, from: 'short', to: 'met' }] })],
    }],
  }));

  assert.equal(items.filter((item) => item.kind === 'goal-unreachable').length, 0);
});

test('a planned weapon nobody owns is an acquisition', () => {
  const items = buildAgenda(input({ weaponId: 11501, weaponAvailable: false }));
  const weapon = items.find((item) => item.kind === 'acquire-weapon');

  assert.ok(weapon);
  assert.equal(weapon.data.weaponId, 11501);
});

test('the summary separates what can be done now from what cannot', () => {
  const items = buildAgenda(input({
    setPlan: [{ setIds: [CRIMSON], pieces: 4 }],
    equippedSets: new Map(),
    slots: [
      { slot: 'goblet', empty: false, swaps: [swap({ instanceId: 'free', delta: 3 })] },
      { slot: 'sands', empty: false, swaps: [swap({ instanceId: 'taken', delta: 3 })] },
    ],
  }, new Map([['free', null], ['taken', 7]])));

  const summary = summarizeAgenda(items);
  assert.equal(summary.actionableNow, 2);
  assert.equal(summary.byCost['needs-farming'], 1);
});

test('a team narrows the steps to its members, and no team keeps them all', () => {
  const items = [{ characterId: 1 }, { characterId: 2 }, { characterId: 3 }];
  const team = { slots: [{ characterId: 3 }, { characterId: 1 }] };

  assert.deepEqual(inTeam(items, team).map((item) => item.characterId), [1, 3]);
  assert.equal(inTeam(items, null).length, 3);
});

/* ------------------------------------------------ taking vs. spare --- */

test('a spare piece is named over a slightly better one somebody is wearing', () => {
  // The comparison ranks the worn one first — it scores higher — and taking
  // the first of that list is what made every step a theft.
  const items = buildAgenda(input({
    slots: [{
      slot: 'goblet', empty: false,
      swaps: [
        swap({ instanceId: 'theirs', delta: 3.5 }),
        swap({ instanceId: 'spare', delta: 3 }),
      ],
    }],
  }, new Map([['theirs', 42], ['spare', null]])));

  assert.equal(items[0].data.candidate, 'spare');
  assert.equal(items[0].cost, 'free');
});

test('a worn piece is named when it clearly beats every spare, after its wearer is paid', () => {
  const items = buildAgenda({
    ...input({
      slots: [{
        slot: 'goblet', empty: false,
        swaps: [
          swap({ instanceId: 'theirs', delta: 6 }),
          swap({ instanceId: 'spare', delta: 2 }),
        ],
      }],
    }, new Map([['theirs', 42], ['spare', null]])),
    takeCost: new Map([['theirs', 1]]),
  });

  assert.equal(items[0].data.candidate, 'theirs');
  assert.equal(items[0].cost, 'displaces');
});

test('a piece that would cost its wearer more than it gains, or their set, is never named', () => {
  const holders = new Map([['dear', 42], ['bound', 43]]);
  const items = buildAgenda({
    ...input({
      slots: [
        { slot: 'goblet', empty: false, swaps: [swap({ instanceId: 'dear', delta: 3 })] },
        { slot: 'sands', empty: false, swaps: [swap({ instanceId: 'bound', delta: 9 })] },
      ],
    }, holders),
    // Their spare is far worse; and the other holds a four-piece together.
    takeCost: new Map<string, number | null>([['dear', 4], ['bound', null]]),
  });

  assert.deepEqual(items, []);
});

/* ------------------------------------------------------- the sets --- */

test('a worn slot is never changed for a piece the set plan has no room for', () => {
  // The Gilded Dreams circlet on Yanfei: better rolls, wrong set, in a slot
  // the four-piece needs.
  const items = buildAgenda(input({
    goals: [goal(ER, 'short')],
    slots: [{
      slot: 'circlet', empty: false,
      swaps: [swap({
        instanceId: 'gilded', delta: 5, keepsSetBonus: false,
        goalChanges: [{ prop: ER, from: 'short', to: 'met' }],
      })],
    }],
  }));

  assert.equal(items.filter((item) => item.slot === 'circlet').length, 0);
  // And the goal is not claimed as fixable by a piece the queue will not name.
  assert.ok(items.some((item) => item.kind === 'goal-unreachable'));
});

test('a hole takes a piece of the plan first, and an off-set one only when nothing fits', () => {
  const planned = buildAgenda(input({
    slots: [{
      slot: 'circlet', empty: true,
      swaps: [
        swap({ instanceId: 'gilded', delta: 9, keepsSetBonus: false }),
        swap({ instanceId: 'crimson', delta: 4 }),
      ],
    }],
  }));
  assert.equal(planned[0].data.candidate, 'crimson');

  const onlyOffSet = buildAgenda(input({
    slots: [{
      slot: 'circlet', empty: true,
      swaps: [swap({ instanceId: 'gilded', delta: 9, keepsSetBonus: false })],
    }],
  }));
  assert.equal(onlyOffSet[0].data.candidate, 'gilded');
  assert.equal(onlyOffSet[0].cost, 'breaks-set');
});
