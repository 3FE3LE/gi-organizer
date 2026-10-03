import { ImageResponse } from 'next/og';

import { LOGO_FILLS, LOGO_SCALE, LOGO_STROKE_WIDTH, LOGO_STROKES, logoTransform } from '@/lib/logo';

/**
 * The card a link to the site unfurls into, on chat apps and social feeds.
 *
 * The app's mark, its name and what it does, on the app's own ink — drawn
 * here rather than exported from a design file so it cannot fall out of step
 * with the icon, whose paths it shares (see `lib/logo.ts`).
 */
export const alt = 'GI Organizer — Genshin Impact planner';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

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
          <g transform={logoTransform(LOGO_SCALE)}>
            <path
              d={LOGO_STROKES}
              fill="none"
              stroke="#e3c68f"
              strokeWidth={LOGO_STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d={LOGO_FILLS} fill="#e3c68f" />
          </g>
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
