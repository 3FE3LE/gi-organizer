import { AssetImage } from '@/components/asset-image';
import { iconUrl } from '@/lib/data/assets';
import { WEAPON_TYPE_ICONS } from '@/lib/data/weapon-types';

/**
 * A weapon type, as the wish screen draws it.
 *
 * Client-safe, like `ElementIcon`: five known names, nothing to look up on
 * the server. The glyph is white on clear, so `glyph-light` darkens it on a
 * light page.
 */
export function WeaponTypeIcon({
  weapon,
  label,
  className = 'h-5 w-5',
  sizes = '20px',
}: {
  /** `sword`, `claymore`, `polearm`, `catalyst` or `bow`. */
  weapon: string;
  label?: string;
  className?: string;
  sizes?: string;
}) {
  const src = iconUrl(WEAPON_TYPE_ICONS[weapon], 'weaponType');
  if (!src) return null;

  return <AssetImage src={src} kind="weaponType" alt={label ?? ''} className={`glyph-light ${className}`} sizes={sizes} />;
}
