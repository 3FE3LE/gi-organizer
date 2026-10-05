/**
 * The app's icon, inline: "GI" in the accent gold on the dark ink.
 *
 * The same drawing `scripts/make-icons.mts` renders to the installed app's
 * PNGs — the paths are copied from there, keep the two in step — as an SVG so
 * the header gets it sharp at any size without another request. The square
 * stays dark in both themes, as the installed icon does: it is the app's mark,
 * not a piece of the page's chrome.
 */
const MARK = 'M 277.8 178.2 A 110 110 0 1 0 310 256 L 232 256 M 350 146 H 420 M 385 146 V 366 M 350 366 H 420';

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
      <path
        d={MARK}
        transform="translate(256 256) scale(0.8) translate(-252 -256)"
        fill="none"
        stroke="url(#logo-gold)"
        strokeWidth="48"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
