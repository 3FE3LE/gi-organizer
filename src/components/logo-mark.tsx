import { LOGO_FILLS, LOGO_SCALE, LOGO_STROKE_WIDTH, LOGO_STROKES, logoTransform } from '@/lib/logo';

/**
 * The app's icon, inline: the "GIO" mark in the accent gold on the dark ink.
 *
 * The same drawing `scripts/make-icons.mts` renders to the installed app's
 * PNGs — both read it from `lib/logo.ts` — as an SVG so the header gets it
 * sharp at any size without another request. The square stays dark in both
 * themes, as the installed icon does: it is the app's mark, not a piece of the
 * page's chrome.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden className={className}>
      <defs>
        <linearGradient id="logo-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f3dfb2" />
          <stop offset="100%" stopColor="#e3c68f" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="#0c0f17" />
      <g transform={logoTransform(LOGO_SCALE)}>
        <path
          d={LOGO_STROKES}
          fill="none"
          stroke="url(#logo-gold)"
          strokeWidth={LOGO_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d={LOGO_FILLS} fill="url(#logo-gold)" />
      </g>
    </svg>
  );
}
