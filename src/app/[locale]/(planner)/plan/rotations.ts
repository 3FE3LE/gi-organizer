import {
  WEEKDAYS,
  charactersIn,
  domainsByKind,
  domainsOn,
  type Schedule,
  type Weekday,
} from '@/lib/rules/materials';

/**
 * The week, as the domains actually rotate it.
 *
 * Every domain opens on two weekdays three days apart — Monday and Thursday,
 * Tuesday and Friday, Wednesday and Saturday — and on Sunday with all the
 * rest. So a week of demand is three answers, not seven: a seven-column map
 * would draw each one twice and Sunday as the sum of the lot.
 *
 * The pairs are three days apart, so they are the weekdays that agree modulo
 * three. Grouping by the domains each day opens reads the same on paper, and
 * merges two rotations into one the day neither opens anything needed.
 */
export type Rotation = {
  days: Weekday[];
  talent: number;
  weapon: number;
  /** Everyone waiting on at least one of its domains. */
  waiting: number;
};

export function rotationsOf(schedule: Schedule): Rotation[] {
  const pairs = new Map<number, Weekday[]>();

  WEEKDAYS.forEach((day, index) => {
    if (day === 'Sunday') return;
    pairs.set(index % 3, [...(pairs.get(index % 3) ?? []), day]);
  });

  // Monday's pair first, the order the week is read in.
  return [1, 2, 0].map((key) => pairs.get(key)!).map((days) => {
    const { talent, weapon } = domainsByKind(schedule, days[0]);
    const sum = (plans: typeof talent) => plans.reduce((total, plan) => total + plan.short, 0);

    return {
      days,
      talent: sum(talent),
      weapon: sum(weapon),
      waiting: charactersIn(domainsOn(schedule, days[0])).length,
    };
  });
}

/**
 * Which of a rotation's days to open: today when it is one of them, otherwise
 * whichever comes round first.
 */
export function nextOf(days: Weekday[], today: Weekday): Weekday {
  const from = WEEKDAYS.indexOf(today);
  const ahead = (day: Weekday) => (WEEKDAYS.indexOf(day) - from + 7) % 7;
  return [...days].sort((a, b) => ahead(a) - ahead(b))[0];
}
