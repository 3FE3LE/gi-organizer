import 'server-only';

import { type AssetKind, iconUrl } from './assets';
import { getMissingAssets } from './registry';

/**
 * The URL for an asset name, or `null` when no host serves it.
 *
 * Server-side by necessity: knowing which names are missing means reading
 * generated data. It lives here rather than beside the `GameIcon` component
 * because a Server Component has to resolve icons on behalf of the client
 * components it renders — a client cannot read the missing list, and an async
 * component cannot be rendered from one. Keeping it out of a `.tsx` file also
 * means the view modules that call it can be exercised outside a bundler.
 */
export async function resolveIcon(
  filename: string | null | undefined,
  kind: AssetKind,
) {
  if (!filename) return null;

  const missing = await getMissingAssets();
  if (missing.has(filename)) return null;

  return iconUrl(filename, kind);
}
