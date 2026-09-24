import type { MetadataRoute } from 'next';

/**
 * What makes the site installable: a name, an icon and a window of its own.
 *
 * Installed, the app opens standalone — no address bar, no tabs — from an icon
 * on the home screen or the dock, which is the whole of what a "downloaded"
 * app gives a tool like this one. There is no service worker and no offline
 * mode on purpose: every screen reads the player's own database on the server,
 * so a cached copy would be a stale one, and browsers no longer require a
 * worker to offer the install.
 *
 * The colours are the dark theme's ink, which is also what the icon is drawn
 * on, so the splash a phone shows while the app starts is the icon's own
 * background rather than a white flash.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'GI Organizer',
    short_name: 'GI Organizer',
    description: 'Builds, artefactos y plan de farmeo para tu cuenta de Genshin Impact.',
    // Straight into the app: the installed icon is for someone who already
    // uses it, not for the landing page a visitor reads first.
    start_url: '/es/characters',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0c0f17',
    theme_color: '#0c0f17',
    categories: ['games', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
