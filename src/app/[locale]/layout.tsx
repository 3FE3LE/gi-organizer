import Link from 'next/link';
import { notFound } from 'next/navigation';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { LOCALE_CODES, isLocale } from '@/lib/data/locales';
import { getMeta } from '@/lib/data/registry';

export function generateStaticParams() {
  return LOCALE_CODES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const meta = await getMeta();

  return (
    <>
      <header className="border-b border-edge">
        {/* Wraps rather than pushing the page wider than the viewport: seven
            links do not fit on a phone, and a header that overflows drags every
            page under it out of alignment too. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
          <Link href={`/${locale}/characters`} className="font-mono text-sm tracking-tight">
            <span className="text-accent">GI</span> Organizer
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <Link href={`/${locale}/characters`} className="whitespace-nowrap hover:text-text">
              Personajes
            </Link>
            <Link href={`/${locale}/teams`} className="whitespace-nowrap hover:text-text">
              Equipos
            </Link>
            <Link href={`/${locale}/artefactos`} className="whitespace-nowrap hover:text-text">
              Artefactos
            </Link>
            <Link href={`/${locale}/plan`} className="whitespace-nowrap hover:text-text">
              Plan
            </Link>
            <Link href={`/${locale}/datos`} className="whitespace-nowrap hover:text-text">
              Datos
            </Link>
          </nav>
          <div className="ml-auto">
            <LocaleSwitcher current={locale} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>

      <footer className="border-t border-edge px-4 py-4 font-mono text-xs text-muted sm:px-6">
        <div className="mx-auto max-w-6xl">
          Datos v{meta.gameVersion} · genshin-db {meta.genshinDbVersion} · generado{' '}
          {meta.generatedAt.slice(0, 10)}
        </div>
      </footer>
    </>
  );
}
