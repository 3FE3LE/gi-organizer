'use client';

import { useTranslations } from 'next-intl';
import { useOptimistic, useTransition } from 'react';

import { SegmentButton, SegmentStrip } from '@/components/segmented-links';
import type { WorldLevel } from '@/lib/rules/resin';

import { chooseWorldLevel } from './actions';

/**
 * The world level, as the default or one of nine. Optimistic for the same
 * reason as the server: one small fact, and a strip that waits on the round
 * trip looks as if the tap had missed.
 */
export function WorldLevelPicker({
  levels,
  chosen,
}: {
  levels: readonly WorldLevel[];
  chosen: WorldLevel | null;
}) {
  const t = useTranslations('data.settingsPage');
  const [shown, setShown] = useOptimistic(chosen);
  const [, startTransition] = useTransition();

  const pick = (next: WorldLevel | null) => startTransition(async () => {
    setShown(next);
    await chooseWorldLevel(next);
  });

  return (
    <SegmentStrip label={t('worldLevelHeading')}>
      <SegmentButton active={shown === null} onClick={() => pick(null)}>
        {t('worldLevelDefault')}
      </SegmentButton>
      {levels.map((level) => (
        <SegmentButton key={level} active={shown === level} onClick={() => pick(level)}>
          <span className="tabular">{level}</span>
        </SegmentButton>
      ))}
    </SegmentStrip>
  );
}
