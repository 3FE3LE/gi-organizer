import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { UserButton, ClerkProvider } from '@clerk/nextjs';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { SyncLocaleCookie } from '@/components/sync-locale-cookie';
import { LOCALE_CODES, isLocale } from '@/lib/data/locales';
import { getMeta } from '@/lib/data/registry';

import '../globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: 'GI Organizer', description: t('metaDescription') };
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
  const messages = await getMessages();
  const t = await getTranslations('nav');

  return (
    <html
      lang={uiLocale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
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
                  <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
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

              <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
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
