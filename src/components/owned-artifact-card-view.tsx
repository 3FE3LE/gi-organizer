import { useTranslations } from 'next-intl';

import { ArtifactCardView, type ArtifactCardData } from '@/components/artifact-card-view';
import type { Scaler } from '@/lib/rules/worth';

/**
 * A piece of the box as the artifacts page draws it: the shared card, and
 * under it who wears it, how its rolls landed and what it is for.
 *
 * Drawn from data, like `ArtifactCardView`, so the gear dialog — which loads
 * its candidates after the page — shows a piece exactly as the box does. The
 * data comes from `ownedArtifactCardData` in the artifacts route.
 */
export type OwnedArtifactCardData = {
  card: ArtifactCardData;
  /** Who is wearing it, or null when nobody is. */
  holder: string | null;
  rolls: number;
  /** 0–1, or null when the piece has not rolled. */
  efficiency: number | null;
  serves: Scaler | null;
  wastedCount: number;
  /** The total the wasted count is out of. */
  worthCount: number;
};

export function OwnedArtifactCardView({
  data,
  className,
  children,
}: {
  data: OwnedArtifactCardData;
  /** Extra classes for the card, such as a selection ring. */
  className?: string;
  /** What another page adds under the card — a verdict, an equip button. */
  children?: React.ReactNode;
}) {
  const t = useTranslations('artifacts');
  const scalerLabel = useTranslations('common.scaler');

  return (
    <ArtifactCardView
      card={data.card}
      className={`transition-colors hover:border-edge-strong ${className ?? ''}`}
      footer={
        <>
          <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 border-t border-edge pt-1.5 font-mono text-2xs">
            <span className={data.holder ? 'text-muted' : 'text-good'}>{data.holder ?? t('free')}</span>
            <span className="tabular text-muted">
              {data.rolls} {t('rollsCount', { count: data.rolls })}
              {data.efficiency !== null && ` · ${Math.round(data.efficiency * 100)}%`}
            </span>
          </p>

          {/* What the piece is for, and what it lost getting there. The first is
              why a mastery piece can rank high without a mastery build on
              screen; the second is the one thing a tier average cannot say. */}
          {(data.serves !== null || data.wastedCount > 0) && (
            <p className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 font-mono text-2xs text-muted">
              <span>
                {data.serves !== null && t('servesPrefix', { scaler: scalerLabel(data.serves) })}
              </span>
              {data.wastedCount > 0 && (
                <span>
                  <span className="text-bad">{data.wastedCount}</span>
                  {` ${t('wastedRolls', { count: data.worthCount })}`}
                </span>
              )}
            </p>
          )}
        </>
      }
    >
      {children}
    </ArtifactCardView>
  );
}
