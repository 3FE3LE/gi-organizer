import { PackageOpen, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ArtifactCardView, type ArtifactCardData } from '@/components/artifact-card-view';
import { AssetImage } from '@/components/asset-image';
import { StatIcon } from '@/components/stat-icon';
import { SCALER_PROPS, type Scaler } from '@/lib/rules/worth';

/**
 * A piece of the box as the artifacts page draws it: the shared card, and
 * under it whose it is and what it is for.
 *
 * The footer used to be two lines of text — the holder's name, "9 rolls ·
 * 88%", "para ATQ%", "4 de 9 rolls perdidos" — and it was the part of the card
 * nobody read. Two facts are worth a glance: who is wearing it, which is a
 * face, and which scaler it serves, which is that stat's icon with a star.
 * The roll count and efficiency say little a player can act on, and the
 * wasted rolls are already on the card: the dead substats are dimmed.
 *
 * Drawn from data, like `ArtifactCardView`, so the gear dialog — which loads
 * its candidates after the page — shows a piece exactly as the box does. The
 * data comes from `ownedArtifactCardData` in the artifacts route.
 */
export type OwnedArtifactCardData = {
  card: ArtifactCardData;
  /** Who is wearing it, or null when nobody is. */
  holder: { name: string; icon: string | null } | null;
  /** The scaler the piece is priced on, when it carries one. */
  serves: Scaler | null;
};

export function OwnedArtifactCardView({
  data,
  className,
  footerExtra,
  hideSlot = false,
  children,
}: {
  data: OwnedArtifactCardData;
  /** See `ArtifactCardView`: for a list that is one slot already. */
  hideSlot?: boolean;
  /** Extra classes for the card, such as a selection ring. */
  className?: string;
  /**
   * More marks for the footer's own row — the gear dialog's fit — so a page
   * that adds a verdict adds it beside the holder rather than a row under it.
   */
  footerExtra?: React.ReactNode;
  /** What another page adds under the card — a verdict, an equip button. */
  children?: React.ReactNode;
}) {
  const t = useTranslations('artifacts');
  const scalerLabel = useTranslations('common.scaler');

  return (
    <ArtifactCardView
      card={data.card}
      hideSlot={hideSlot}
      className={`transition-colors hover:border-edge-strong ${className ?? ''}`}
      footer={
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-edge pt-1.5">
          {data.holder ? (
            <span title={data.holder.name} className="flex min-w-0 items-center gap-1.5">
              <AssetImage
                src={data.holder.icon}
                kind="avatar"
                alt=""
                className="h-6 w-6 shrink-0 rounded-full border border-edge bg-surface-2"
                sizes="24px"
              />
              <span className="sr-only">{data.holder.name}</span>
            </span>
          ) : (
            <span title={t('free')} className="flex h-6 items-center text-good">
              <PackageOpen size={15} aria-hidden />
              <span className="sr-only">{t('free')}</span>
            </span>
          )}

          <span className="flex min-w-0 items-center gap-2">
          {footerExtra}
          {data.serves && (
            <span
              title={t('servesPrefix', { scaler: scalerLabel(data.serves) })}
              className="flex items-center gap-0.5 text-muted"
            >
              <StatIcon prop={SCALER_PROPS[data.serves]} label={t('servesPrefix', { scaler: scalerLabel(data.serves) })} />
              <Star size={10} aria-hidden className="fill-accent text-accent" />
            </span>
          )}
          </span>
        </div>
      }
    >
      {children}
    </ArtifactCardView>
  );
}
