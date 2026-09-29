'use client';

import { useTranslations } from 'next-intl';
import { useOptimistic, useTransition } from 'react';

import { FieldSelect } from '@/components/field-select';
import type { WorldLevel } from '@/lib/rules/resin';

import { chooseWorldLevel } from './actions';

const DEFAULT = 'default';

/**
 * The world level, as the default or one of nine.
 *
 * A menu rather than a strip: ten segments did not fit a phone, and the last
 * one wrapped onto a line of its own. Optimistic for the same reason as the
 * server: one small fact, and a control that waits on the round trip looks as
 * if the choice had missed.
 */
export function WorldLevelPicker({
  levels,
  chosen,
  automatic,
}: {
  levels: readonly WorldLevel[];
  chosen: WorldLevel | null;
  /** What "automatic" resolves to: the showcase's level, or eight. */
  automatic: WorldLevel;
}) {
  const t = useTranslations('data.settingsPage');
  const [shown, setShown] = useOptimistic(chosen);
  const [, startTransition] = useTransition();

  const pick = (value: string) => startTransition(async () => {
    const next = value === DEFAULT ? null : (Number(value) as WorldLevel);
    setShown(next);
    await chooseWorldLevel(next);
  });

  return (
    <FieldSelect
      label={t('worldLevelHeading')}
      value={shown === null ? DEFAULT : String(shown)}
      onValueChange={pick}
      groups={[{
        options: [
          { value: DEFAULT, label: t('worldLevelDefault', { level: automatic }) },
          ...levels.map((level) => ({ value: String(level), label: t('worldLevelOption', { level }) })),
        ],
      }]}
      triggerClassName="w-auto py-1.5"
    />
  );
}
