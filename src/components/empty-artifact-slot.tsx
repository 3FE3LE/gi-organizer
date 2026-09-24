import { SlotIcon } from '@/components/slot-icon';
import type { ArtifactSlot } from '@/lib/data/types';

/**
 * A slot with nothing in it, the size of a slot with something in it.
 *
 * It used to be a one-line dashed strip, a quarter of a card's height, so a
 * row with one empty slot had a hole in its bottom edge and a character with
 * no gear was five slivers where five cards go. It holds a card's height now —
 * the plain card's, or the box card's with its footer — with the slot drawn in
 * the middle, so the grid keeps its shape whatever is equipped.
 */
export function EmptyArtifactSlot({
  slot,
  label,
  emptyText,
  withFooter = false,
  className,
  children,
}: {
  slot: ArtifactSlot;
  label: string;
  emptyText: string;
  /** The box's card, which carries a holder line: a little taller. */
  withFooter?: boolean;
  className?: string;
  /** Controls drawn over it, such as the panel's equip menu. */
  children?: React.ReactNode;
}) {
  return (
    <li
      className={`group relative flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-edge p-3 text-xs text-muted ${
        withFooter ? 'min-h-[214px]' : 'min-h-[175px]'
      } ${className ?? ''}`}
    >
      <SlotIcon slot={slot} label={label} size={22} className="opacity-70" />
      <span>{label} · {emptyText}</span>
      {children}
    </li>
  );
}
