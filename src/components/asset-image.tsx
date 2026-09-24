'use client';

import Image from 'next/image';
import { useState } from 'react';

import { type AssetKind, assetSize } from '@/lib/data/assets';

/**
 * Renders a game asset from a URL already resolved by the server.
 *
 * Client-safe, unlike `GameIcon`: knowing which asset names no host serves
 * means reading generated data, which is a server concern. So the server hands
 * down a URL or `null`, and this only draws it.
 *
 * That list is measured when the data is built, and a host can drop a file
 * after it: a patch renames an asset, a mirror goes down. So a load that fails
 * at runtime falls back to the same placeholder a known-missing name gets,
 * rather than the browser's broken-image glyph in the middle of a card.
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
  // Keyed by the URL it failed on, so a new `src` gets its own attempt.
  const [failed, setFailed] = useState<string | null>(null);

  if (!src || failed === src) {
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
      onError={() => setFailed(src)}
    />
  );
}
