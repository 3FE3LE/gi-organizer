import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Geist, Geist_Mono } from 'next/font/google';
import { UserButton, ClerkProvider } from '@clerk/nextjs';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

import { TooltipProvider } from '@/components/ui/tooltip';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { LogoMark } from '@/components/logo-mark';
import { MainNav, type NavItem } from '@/components/main-nav';
import { SyncLocaleCookie } from '@/components/sync-locale-cookie';
import { ThemeScript } from '@/components/theme-script';
import { BackToTop } from '@/components/back-to-top';
import { ThemeToggle } from '@/components/theme-toggle';
import { clientMessages } from '@/i18n/client-messages';
import { LOCALE_CODES, isLocale } from '@/lib/data/locales';
import { getMeta } from '@/lib/data/registry';
import { siteUrl } from '@/lib/site';

import '../globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

/**
 * One face for flavour, and only that.
 *
 * The interface is Geist end to end because everything in it is a number, a
 * label or a control. A character's title is the one string on the app that is
 * neither: it is the game's own words about who they are. A garalde italic says
 * that in a way a weight change cannot, and it costs one extra font file
 * because it is used in exactly one place.
 */
const display = Cormorant_Garamond({
  variable: '--font-display-face',
  subsets: ['latin'],
  weight: ['500', '600'],
  style: ['italic', 'normal'],
});

/**
 * The browser chrome's own colour, so the address bar on a phone matches the
 * page instead of framing a dark tool in white.
 */
export const viewport: Viewport = {
  // One per scheme, so the browser chrome follows the theme the page resolved
  // rather than framing a light page in a dark bar.
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0c0f17' },
    { media: '(prefers-color-scheme: light)', color: '#f1eee6' },
  ],
  colorScheme: 'dark light',
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  const description = t('metaDescription');

  return {
    metadataBase: new URL(siteUrl),
    // `metadataBase` is what turns a relative Open Graph image or canonical
    // path into the absolute URL a crawler needs; see `lib/site.ts`.
    title: { default: 'GI Organizer', template: '%s · GI Organizer' },
    applicationName: 'GI Organizer',
    // Every page under here is one player's account unless it says otherwise:
    // only the landing (`[locale]/page.tsx`) opts back in to being indexed.
    robots: { index: false, follow: false },
    description,
    // The manifest is `app/manifest.ts`. iOS reads neither it nor its icons
    // for the home screen, so the touch icon and the standalone flag are
    // stated here for Safari, which is the one browser that still needs them.
    icons: {
      // Stated rather than left to the `app/icon` convention: the root layout
      // is this one, under `[locale]`, and a file at the top of `app` is not
      // in its segment, so Next would never link it.
      icon: [{ url: '/icons/favicon-64.png', sizes: '64x64', type: 'image/png' }],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    appleWebApp: {
      capable: true,
      title: 'GI Organizer',
      statusBarStyle: 'default',
    },
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

  // Listed once and rendered twice — the header row on a wide screen, the
  // bottom bar on a phone. See `components/main-nav.tsx`.
  //
  // The plan leads: it is where signing in lands, because "what do I do
  // tonight" is the question every visit starts with, and the roster is where
  // the answer sends you next.
  const sections: NavItem[] = [
    { id: 'plan', href: `/${locale}/plan`, label: t('plan') },
    { id: 'characters', href: `/${locale}/characters`, label: t('characters') },
    { id: 'teams', href: `/${locale}/teams`, label: t('teams') },
    { id: 'artifacts', href: `/${locale}/artifacts`, label: t('artifacts') },
    { id: 'data', href: `/${locale}/data`, label: t('data') },
  ];

  return (
    <html
      lang={uiLocale}
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
      /* `ThemeScript` puts `data-theme` on this element before React hydrates,
         which is the whole point of it — the server cannot know the stored
         choice without reading a cookie and giving up prerendering. So the
         mismatch here is the design, not a bug, and React is told to stop
         reporting it. It suppresses one level deep: everything inside still
         warns normally. */
      suppressHydrationWarning
    >
      <body className="section-nav-offset flex min-h-full flex-col">
        <ThemeScript />
        {/* One provider for every hint on the page: it is what lets a second
            tooltip open instantly once the first one has, instead of each one
            waiting out its own delay. */}
        <TooltipProvider delay={200}>

        {/* Five nav links, a language picker, a theme switch and an account
            button sit between the top of the page and the content on every
            route — in reading order, even on a phone, where the nav is drawn
            at the bottom of the screen. Tabbing through them once per
            navigation is what a skip link exists to spare. It is off-screen
            until focused. */}
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:border focus:border-accent focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-accent"
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
              {/*
                * Sticky and translucent, so the sections stay reachable from
                * the bottom of a long backlog instead of costing a scroll to
                * the top. `viewTransitionName` holds it still while the page
                * under it animates — see `globals.css`; a header that slides
                * with the content removes the one fixed point the eye has.
                */}
              <header
                style={{ viewTransitionName: 'site-header' }}
                className="glass sticky top-0 z-40 border-b"
              >
                {/* One row on a phone — the title and the three controls fit
                    in it, because the sections moved to the bottom bar. It
                    still wraps rather than pushing the page wider than the
                    viewport: a header that overflows drags every page under it
                    out of alignment too. */}
                <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 sm:px-6 sm:py-3">
                  <Link
                    href={`/${locale}/plan`}
                    className="flex items-center gap-2 rounded-lg font-mono text-sm tracking-tight"
                  >
                    {/* The installed app's icon stands in for "GI": the mark
                        and the name, as the home screen shows them. */}
                    <LogoMark className="h-6 w-6 shrink-0 rounded-[5px] ring-1 ring-edge-strong" />
                    <span>
                      <span className="sr-only">GI </span>Organizer
                    </span>
                  </Link>

                  <MainNav variant="header" label={t('primaryNavAria')} items={sections} />

                  <div className="ml-auto flex items-center gap-2">
                    <LocaleSwitcher current={locale} />
                    <ThemeToggle />
                    <UserButton />
                  </div>
                </div>
              </header>

              {/* Outside the header on purpose: the header is a containing
                  block for fixed descendants, so a bar nested in it would pin
                  itself to the header's bottom edge instead of the screen's.
                  Here in reading order, drawn at the bottom of the phone. */}
              <MainNav variant="bar" label={t('primaryNavAria')} items={sections} />

              <main
                id="content"
                // Focusable from script only, so the skip link and the
                // back-to-top button can land focus here.
                tabIndex={-1}
                className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none sm:px-6 sm:py-10 lg:py-12"
              >
                {children}
              </main>

              <BackToTop />

              <footer className="mt-8 border-t border-edge px-4 py-6 font-mono text-2xs text-muted sm:px-6">
                <div className="mx-auto max-w-7xl">
                  {t('footer', {
                    version: meta.gameVersion,
                    date: meta.generatedAt.slice(0, 10),
                  })}
                </div>
              </footer>
            </NuqsAdapter>
          </ClerkProvider>
        </NextIntlClientProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
