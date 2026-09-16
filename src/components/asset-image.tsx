import Image from 'next/image';

import { type AssetKind, assetSize } from '@/lib/data/assets';

/**
 * Renders a game asset from a URL already resolved by the server.
 *
 * Client-safe, unlike `GameIcon`: knowing which asset names no host serves
 * means reading generated data, which is a server concern. So the server hands
 * down a URL or `null`, and this only draws it.
 */
export function AssetImage({
  src,
  kind,
  alt = '',
  className,
  sizes,
  priority,
}: {
  src: string | null;
  kind: AssetKind;
  alt?: string;
  className?: string;
  sizes?: string;
  /** For the one image above the fold, which is the page's LCP. */
  priority?: boolean;
}) {
  if (!src) {
    return <span aria-hidden className={`inline-block rounded bg-surface-2 ${className ?? ''}`} />;
  }

  const { width, height } = assetSize(kind);

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      priority={priority}
      className={className}
    />
  );
}
