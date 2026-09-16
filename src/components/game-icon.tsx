import type { AssetKind } from '@/lib/data/assets';
import { resolveIcon } from '@/lib/data/icon';

import { AssetImage } from './asset-image';

/**
 * Renders a game asset by its internal filename.
 *
 * Intrinsic dimensions come from the asset kind rather than the render size, so
 * the image optimizer works from the real source resolution. Names known to be
 * absent from their host are drawn as a placeholder rather than requested — the
 * gap is recorded at check time, so this costs no client JS and no failed
 * request.
 */
export async function GameIcon({
  filename,
  kind,
  alt = '',
  className,
  sizes,
  priority,
}: {
  filename: string | null | undefined;
  kind: AssetKind;
  alt?: string;
  className?: string;
  sizes?: string;
  /** For the one image above the fold, which is the page's LCP. */
  priority?: boolean;
}) {
  const src = await resolveIcon(filename, kind);

  return (
    <AssetImage
      src={src}
      kind={kind}
      alt={alt}
      className={className}
      sizes={sizes}
      priority={priority}
    />
  );
}
