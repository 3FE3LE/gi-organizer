import { AssetImage } from '@/components/asset-image';
import { iconUrl } from '@/lib/data/assets';
import { elementIcon } from '@/lib/data/elements';

/**
 * An element's emblem, as the game draws it.
 *
 * Client-safe, like `AssetImage`: the seven names are known and served, so
 * there is no missing-asset list to consult on the server first. Nothing is
 * drawn for an element without one, rather than an empty square.
 */
export function ElementIcon({
  element,
  label,
  className = 'h-4 w-4',
  sizes = '16px',
}: {
  /** The game's enum: `ELEMENT_PYRO`. */
  element: string;
  /** The element's name, for anything that cannot see the emblem. */
  label?: string;
  className?: string;
  sizes?: string;
}) {
  const src = iconUrl(elementIcon(element), 'element');
  if (!src) return null;

  return (
    <AssetImage
      src={src}
      kind="element"
      alt={label ?? ''}
      className={`shrink-0 object-contain ${className}`}
      sizes={sizes}
    />
  );
}
