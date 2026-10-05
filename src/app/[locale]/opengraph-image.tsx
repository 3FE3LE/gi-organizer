import { ImageResponse } from 'next/og';

/**
 * The card a link to the site unfurls into, on chat apps and social feeds.
 *
 * The app's mark, its name and what it does, on the app's own ink — drawn
 * here rather than exported from a design file so it cannot fall out of step
 * with the icon, whose paths it shares (see `components/logo-mark.tsx`).
 */
export const alt = 'GI Organizer — Genshin Impact planner';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const MARK = 'M 277.8 178.2 A 110 110 0 1 0 310 256 L 232 256 M 350 146 H 420 M 385 146 V 366 M 350 366 H 420';

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const english = locale === 'en';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: 'radial-gradient(circle at 30% 20%, #2a2418 0%, #0c0f17 60%)',
          color: '#eae7de',
          fontFamily: 'sans-serif',
        }}
      >
        <svg width="140" height="140" viewBox="0 0 512 512">
          <rect width="512" height="512" rx="112" fill="#0c0f17" stroke="#3d4660" strokeWidth="6" />
          <path
            d={MARK}
            transform="translate(256 256) scale(0.8) translate(-252 -256)"
            fill="none"
            stroke="#e3c68f"
            strokeWidth="48"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div style={{ marginTop: 48, fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>
          GI Organizer
        </div>
        <div style={{ marginTop: 16, fontSize: 36, color: '#9aa1b6', maxWidth: 900 }}>
          {english
            ? 'Builds, artifacts and a daily farming plan for Genshin Impact'
            : 'Builds, artefactos y plan de farmeo diario para Genshin Impact'}
        </div>
        <div style={{ marginTop: 40, fontSize: 26, color: '#e3c68f', letterSpacing: 4 }}>
          {english ? 'CRIT VALUE · POTENTIAL · GOOD · ENKA' : 'CRIT VALUE · POTENCIAL · GOOD · ENKA'}
        </div>
      </div>
    ),
    size,
  );
}
