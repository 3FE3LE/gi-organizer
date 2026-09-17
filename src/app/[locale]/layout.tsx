import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { UserButton, ClerkProvider } from '@clerk/nextjs';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { SyncLocaleCookie } from '@/components/sync-locale-cookie';
import { clientMessages } from '@/i18n/client-messages';
import { LOCALE_CODES, isLocale } from '@/lib/data/locales';
import { getMeta } from '@/lib/data/registry';

import '../globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

/**
 * The browser chrome's own colour, so the address bar on a phone matches the
 * page instead of framing a dark tool in white.
 */
export const viewport: Viewport = {
  themeColor: '#10131c',
  colorScheme: 'dark',
};

/**
 * `metadataBase` is what turns a relative Open Graph image or canonical path
 * into the absolute URL a crawler needs. Vercel states the deployment's own
 * host; locally there is none, and the fallback keeps the value defined rather
 * than leaving Next to warn on every build.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  const description = t('metaDescription');

  return {
    metadataBase: new URL(siteUrl),
    title: 'GI Organizer',
    description,
    openGraph: {
      type: 'website',
      siteName: 'GI Organizer',
      title: 'GI Organizer',
      description,
    },
  };
}

export function generateStaticParams() {
  return LOCALE_CODES.map((locale) => ({ locale }));
}

/**
 * The root layout, one level down from where it usually lives.
 *
 * `[locale]` has to be the outermost segment for `next/root-params` to treat
 * it as a root parameter — see `src/i18n/request.ts` — so `<html>`/`<body>`
 * live here instead of a separate `app/layout.tsx` above it. Nothing else in
 * this app renders outside `[locale]` except the API routes, which never go
 * through a layout at all.
 */
export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const meta = await getMeta();
  // The interface's own locale — Spanish or English, see `src/i18n/request.ts`
  // — which can differ from the route's `locale` above for a Japanese or
  // Chinese catalog reader.
  const uiLocale = await getLocale();
  // Only what a client component reads — see `clientMessages`.
  const messages = clientMessages(await getMessages());
  const t = await getTranslations('nav');
  const tUi = await getTranslations('ui');

  return (
    <html
      lang={uiLocale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Five nav links, a language picker and an account button sit between
            the top of the page and the content on every route. Tabbing through
            them once per navigation is what a skip link exists to spare. It is
            off-screen until focused. */}
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:border focus:border-accent focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-accent"
        >
          {tUi('skipToContent')}
        </a>
        <SyncLocaleCookie locale={uiLocale} />
        <NextIntlClientProvider locale={uiLocale} messages={messages}>
          <ClerkProvider>
            {/* The filter controls that are inputs rather than links read and
                write the query string through nuqs, which needs the router
                adapter. */}
            <NuqsAdapter>
              <header className="border-b border-edge">
                {/* Wraps rather than pushing the page wider than the viewport:
                    seven links do not fit on a phone, and a header that
                    overflows drags every page under it out of alignment too. */}
                <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
                  <Link
                    href={`/${locale}/characters`}
                    className="font-mono text-sm tracking-tight"
                  >
                    <span className="text-accent">GI</span> Organizer
                  </Link>
                  <nav
                    aria-label={t('primaryNavAria')}
                    className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted"
                  >
                    <Link
                      href={`/${locale}/characters`}
                      className="whitespace-nowrap hover:text-text"
                    >
                      {t('characters')}
                    </Link>
                    <Link href={`/${locale}/teams`} className="whitespace-nowrap hover:text-text">
                      {t('teams')}
                    </Link>
                    <Link
                      href={`/${locale}/artifacts`}
                      className="whitespace-nowrap hover:text-text"
                    >
                      {t('artifacts')}
                    </Link>
                    <Link href={`/${locale}/plan`} className="whitespace-nowrap hover:text-text">
                      {t('plan')}
                    </Link>
                    <Link href={`/${locale}/data`} className="whitespace-nowrap hover:text-text">
                      {t('data')}
                    </Link>
                  </nav>
                  <div className="ml-auto flex items-center gap-3">
                    <LocaleSwitcher current={locale} />
                    <UserButton />
                  </div>
                </div>
              </header>

              <main id="content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
                {children}
              </main>

              <footer className="border-t border-edge px-4 py-4 font-mono text-xs text-muted sm:px-6">
                <div className="mx-auto max-w-6xl">
                  {t('footer', {
                    version: meta.gameVersion,
                    genshinDbVersion: meta.genshinDbVersion,
                    date: meta.generatedAt.slice(0, 10),
                  })}
                </div>
              </footer>
            </NuqsAdapter>
          </ClerkProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
