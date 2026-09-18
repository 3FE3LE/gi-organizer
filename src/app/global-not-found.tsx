import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { DEFAULT_LOCALE } from '@/lib/data/locales';

import './globals.css';

/**
 * The 404 for a URL that matched no route at all.
 *
 * `[locale]/not-found.tsx` cannot serve that case: the root layout is a
 * dynamic segment, so a URL that never resolved one has no layout to render
 * inside. This file renders its own document instead — which is also why it
 * repeats the fonts and the stylesheet the layout would have brought.
 *
 * There is no locale to answer in either, so it answers in the default one.
 */
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'GI Organizer',
};

export default function GlobalNotFound() {
  return (
    <html
      lang={DEFAULT_LOCALE}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-prose space-y-3">
          <h1 className="text-lg font-medium">Esa página no existe</h1>
          <p className="text-sm text-muted">
            El enlace apunta a algo que este sitio no tiene.
          </p>
          <a
            href={`/${DEFAULT_LOCALE}/characters`}
            className="btn btn-primary"
          >
            Ir al roster
          </a>
        </div>
      </body>
    </html>
  );
}
