import type { TalentBoosts } from './types';

/**
 * The levels a character's constellation adds to each combat talent: 3 to
 * Venti's burst from his third, 3 to his skill from his fifth.
 *
 * Read off the catalog and the constellation, both of which every source of a
 * roster knows, rather than off Enka's `proudSkillExtraLevelMap`, which only a
 * showcase import carries: a character entered by hand or from a GOOD file
 * had the same constellation and no bonus at all.
 *
 * The bonus is the game's to apply, not the player's to buy: talent levels
 * stay what the books paid for, and this is drawn beside them and counted
 * wherever a talent's scaling is read.
 */
export function talentBonusAt(boosts: TalentBoosts | undefined, constellation: number) {
  const at = (key: keyof TalentBoosts) => {
    const boost = boosts?.[key];
    return boost && constellation >= boost.constellation ? boost.levels : 0;
  };
  return { auto: at('auto'), skill: at('skill'), burst: at('burst') };
}

/** A talent line's hover text, with the bonus said when there is one. */
export function boostedTitle(
  title: string,
  bonus: { auto: number; skill: number; burst: number },
  withBonus: (title: string) => string,
) {
  return bonus.auto + bonus.skill + bonus.burst > 0 ? withBonus(title) : title;
}
