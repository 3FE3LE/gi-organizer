import { z } from 'zod';

import { CHOOSABLE_SLOTS } from '@/lib/rules/piece-score';
import { TEAM_ROLES } from '@/lib/rules/types';

/**
 * The shape of the two build forms, stated once.
 *
 * One schema, two consumers: the client resolves the form against it and the
 * server action parses the payload with it. That is the whole point — the
 * hand-written parser it replaces clamped silently, so a value the form could
 * never produce still became a plausible row in the database instead of an
 * error anybody saw.
 *
 * The **input** side is deliberately what a DOM control holds: a `<select>`
 * gives a string, and an empty string means "not chosen". The **output** side
 * is what the database wants. The transform between them lives here, so the
 * form never has to know and the action never has to guess.
 *
 * Nothing here imports `server-only` or touches the database. Whatever needs
 * the catalog — does this weapon exist, is this set real — stays in the action,
 * which is the only side that can ask.
 */

/** Levels where the game lets a character sit both before and after ascending. */
export const BREAKPOINTS = new Set([20, 40, 50, 60, 70, 80]);

/**
 * How many stat goals a form starts with, and how many it will hold.
 *
 * One. Three empty rows was the old default, on the theory that three is what
 * a plan usually is, but a goal nobody has written yet read as three blanks
 * waiting to be filled — an empty row reads as work left undone. One row says
 * where a threshold goes; the rest are one button away.
 */
export const DEFAULT_GOAL_ROWS = 1;
export const MAX_GOAL_ROWS = 8;

/** Four substats, in priority order, is the whole weighting the scorer reads. */
export const SUBSTAT_POSITIONS = [1, 2, 3, 4] as const;

const level = z.number().int().min(1).max(90);
const talentLevel = z.number().int().min(1).max(10);

const talents = z.object({
  auto: talentLevel,
  skill: talentLevel,
  burst: talentLevel,
});

/** A `<select>` of catalog ids: a string in, an id or nothing out. */
const selectedId = z
  .string()
  .transform((value) => (value === '' ? null : Number(value)))
  .refine(
    (value) => value === null || (Number.isInteger(value) && value > 0),
    { message: 'invalid_id' },
  );

/**
 * A goal row is either empty or complete.
 *
 * A prop with no threshold is not a save that failed, it is a row the player
 * started and left. `statedGoals` drops it rather than reporting an error on a
 * field nobody meant to fill.
 */
const goalRow = z.object({
  prop: z.string(),
  min: z.string(),
});

export const progressSchema = z.object({
  characterId: z.number().int().positive(),
  /** The goal being edited. Empty starts the character's first one. */
  buildId: z.string(),
  /**
   * What this goal is for. Its identity, since a goal has no name: a character
   * has one goal per role, and a team slot finds it by that role.
   */
  role: z.union([z.literal(''), z.enum(TEAM_ROLES as [string, ...string[]])]),
  /** Priority order. The position *is* the weight the scorer reads. */
  substats: z.array(z.string()).max(SUBSTAT_POSITIONS.length),

  /*
   * Where the character is today is not here on purpose.
   *
   * Level, ascension, constellation and talents are facts about the account,
   * and the account's record of itself is the GOOD export. Typing them again
   * created a second answer that drifted from the first and won until the next
   * import overwrote it. The form owns the goal; the import owns the state.
   */
  targetLevel: level,
  targetAscended: z.boolean(),
  targetTalents: talents,

  weaponId: selectedId,
  weaponRefinement: z.number().int().min(1).max(5),

  /** One set is a four-piece, two are a 2+2. */
  setIds: z.array(selectedId).max(2),
  /**
   * Keyed by slot, but partial: a slot with no main stat chosen is not an
   * error. `statedMainStats` narrows it to the three slots a player can choose,
   * so an unknown key cannot reach the database.
   */
  mainStats: z.record(z.string(), z.string()),
  goals: z.array(goalRow).max(MAX_GOAL_ROWS),
});

export type ProgressFormValues = z.input<typeof progressSchema>;
export type ProgressPayload = z.output<typeof progressSchema>;

/**
 * The rows that are actually goals, with the threshold as a number.
 *
 * Shared so the client's verdict badges and the server's write agree on which
 * rows count. They did not before, and a row that shows a verdict but is never
 * saved is the worst of both.
 */
export function statedGoals(goals: ProgressPayload['goals']) {
  return goals.flatMap((goal) => {
    const min = Number(goal.min);
    return goal.prop && Number.isFinite(min) && min > 0 ? [{ prop: goal.prop, min }] : [];
  });
}

/** Only the slots whose main stat a player gets to choose, and only if chosen. */
export function statedMainStats(mainStats: Record<string, string>) {
  const chosen: Record<string, string> = {};
  for (const slot of CHOOSABLE_SLOTS) {
    const prop = mainStats[slot];
    if (prop) chosen[slot] = prop;
  }
  return chosen;
}

/** The sets actually chosen, deduped — picking one set twice is one set. */
export function statedSetIds(setIds: ProgressPayload['setIds']) {
  return [...new Set(setIds.filter((id): id is number => id !== null))];
}

/** "Fill this goal from its role", with the role the player currently sees. */
export const templateSchema = z.object({
  characterId: z.number().int().positive(),
  buildId: z.string().min(1),
  role: z.union([z.literal(''), z.enum(TEAM_ROLES as [string, ...string[]])]),
});

/** The priority as the engine reads it: chosen, in order, without repeats. */
export function statedSubstats(substats: string[]) {
  return substats
    .filter(Boolean)
    .filter((prop, index, all) => all.indexOf(prop) === index);
}

/** A rejected payload, worded for the player rather than for a log. */
export function firstIssue(error: z.ZodError, t: (key: string) => string): string {
  const issue = error.issues[0];
  if (!issue) return t('invalidData');
  const message = issue.message === 'invalid_id' ? t('invalidId') : issue.message;
  return `${issue.path.join('.') || t('formLabel')}: ${message}`;
}
