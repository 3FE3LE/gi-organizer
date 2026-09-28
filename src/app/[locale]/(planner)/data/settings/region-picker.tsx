'use client';

import { useTranslations } from 'next-intl';
import { useOptimistic, useTransition } from 'react';

import { SegmentButton, SegmentStrip } from '@/components/segmented-links';
import type { GameRegion } from '@/lib/rules/game-day';

import { chooseRegion } from './actions';

/**
 * The server, as a choice of four: detected, or one of the three by hand.
 *
 * Optimistic, because the answer is a single cookie-sized fact and waiting on
 * the round trip made the strip look as if the tap had missed.
 */
export function RegionPicker({
  regions,
  chosen,
}: {
  regions: readonly GameRegion[];
  chosen: GameRegion | null;
}) {
  const t = useTranslations('data.settingsPage');
  const region = useTranslations('common.region');
  const [shown, setShown] = useOptimistic(chosen);
  const [, startTransition] = useTransition();

  const pick = (next: GameRegion | null) => startTransition(async () => {
    setShown(next);
    await chooseRegion(next);
  });

  return (
    <SegmentStrip label={t('serverHeading')}>
      <SegmentButton active={shown === null} onClick={() => pick(null)}>
        {t('serverAuto')}
      </SegmentButton>
      {regions.map((entry) => (
        <SegmentButton key={entry} active={shown === entry} onClick={() => pick(entry)}>
          {region(entry)}
        </SegmentButton>
      ))}
    </SegmentStrip>
  );
}
