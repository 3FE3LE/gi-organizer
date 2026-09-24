import { Crown, Feather, Flower2, Hourglass, Wine } from 'lucide-react';

import type { ArtifactSlot } from '@/lib/data/types';

/**
 * The five artifact slots as drawings — flower, plume, sands, goblet,
 * circlet — shared so a slot reads the same on a card as on the filter that
 * picks it.
 */
export const SLOT_ICONS: Record<ArtifactSlot, typeof Flower2> = {
  flower: Flower2,
  plume: Feather,
  sands: Hourglass,
  goblet: Wine,
  circlet: Crown,
};

export function SlotIcon({
  slot,
  label,
  size = 13,
  className,
}: {
  slot: ArtifactSlot;
  /** The slot's name, for anything that cannot see the drawing. */
  label: string;
  size?: number;
  className?: string;
}) {
  const Icon = SLOT_ICONS[slot];

  return (
    <span title={label} className={`inline-flex items-center ${className ?? ''}`}>
      <Icon size={size} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
