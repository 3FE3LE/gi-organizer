import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import type { Locale } from '@/lib/data/locales';
import type { Schedule, Weekday } from '@/lib/rules/materials';

import { href, type Filters } from './filters';
import { nextOf, rotationsOf } from './rotations';

/**
 * The backlog, folded into the week: which rotation carries the most of it.
 *
 * The list under this is thirty-odd domains long, and what it cannot answer
 * at a glance is which evening is worth logging in for. Three rows, one per
 * pair of days, each a bar of what is still missing.
 *
 * Talent and weapon materials are two columns rather than two colours in one
 * bar: they are separate runs with separate counts, and a column tells them
 * apart by where it is, not by a hue somebody has to match to a legend. Each
 * column is scaled to its own largest row, since a book and a weapon chunk
 * are not the same unit and a shared axis would flatten the smaller one.
 *
 * A row is a link to that rotation's next day, so the answer is also the way
 * there.
 */
export async function WeekMap({
  schedule, base, filters, locale, today,
}: {
  schedule: Schedule; base: string; filters: Filters; locale: Locale; today: Weekday;
}) {
  const t = await getTranslations('plan');
  const reasonLabel = await getTranslations('common.reason');
  const weekdayShort = await getTranslations('common.weekdayShort');
  const weekdayLabel = await getTranslations('common.weekday');

  const rotations = rotationsOf(schedule);
  const top = {
    talent: Math.max(1, ...rotations.map((entry) => entry.talent)),
    weapon: Math.max(1, ...rotations.map((entry) => entry.weapon)),
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{t('weekHeading')}</h2>
        <p className="mt-1 max-w-prose text-xs text-muted">{t('weekHint')}</p>
      </div>

      <div className="card grid grid-cols-[auto_1fr_1fr] gap-x-4 px-3 py-2 sm:gap-x-6">
        <span aria-hidden />
        {(['talent', 'weapon'] as const).map((kind) => (
          <span key={kind} className="pb-1 font-mono text-2xs uppercase text-muted">
            {reasonLabel(kind)}
          </span>
        ))}

        {rotations.map((rotation) => {
          const isToday = rotation.days.includes(today);
          const days = rotation.days.map((day) => weekdayShort(day)).join(' · ');

          return (
            <Link
              key={rotation.days.join()}
              href={href(base, filters, { range: 'day', day: nextOf(rotation.days, today) })}
              aria-label={t('weekRowAria', {
                days: rotation.days.map((day) => weekdayLabel(day)).join(' · '),
                talent: rotation.talent.toLocaleString(locale),
                weapon: rotation.weapon.toLocaleString(locale),
              })}
              className="col-span-3 -mx-3 grid grid-cols-subgrid items-center rounded-lg px-3 py-2 hover:bg-surface-2/60"
            >
              <span className="flex flex-col">
                <span className="font-mono text-xs uppercase">
                  {days}
                  {isToday && <span className="ml-1.5 text-accent">· {t('todayTag')}</span>}
                </span>
                <span className="font-mono text-2xs text-muted">
                  {t('waitingCount', { count: rotation.waiting })}
                </span>
              </span>
              {(['talent', 'weapon'] as const).map((kind) => (
                <Bar key={kind} value={rotation[kind]} top={top[kind]} locale={locale} />
              ))}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** One magnitude: the number, and a bar under it scaled to its column. */
function Bar({ value, top, locale }: { value: number; top: number; locale: Locale }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className={`tabular font-mono text-xs ${value === 0 ? 'text-muted' : ''}`}>
        {value.toLocaleString(locale)}
      </span>
      <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-surface-2">
        {value > 0 && (
          <span
            className="block h-full rounded-full bg-accent"
            style={{ width: `${Math.max(2, Math.round((value / top) * 100))}%` }}
          />
        )}
      </span>
    </span>
  );
}
