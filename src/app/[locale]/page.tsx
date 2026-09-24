import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  ArrowRight, CalendarDays, Gem, ListChecks, Repeat2, Swords, Upload,
} from 'lucide-react';

import { LogoMark } from '@/components/logo-mark';
import { buttonVariants } from '@/components/ui/button';
import { isLocale } from '@/lib/data/locales';

/**
 * The one public page, and the one a search engine can read.
 *
 * Everything else is one player's account behind a sign-in, which is exactly
 * what should never be indexed. So this is what the site is to anybody who
 * has not signed in: what the planner does, in the words people search with —
 * crit value, artifact potential, farming plan, GOOD import — and a way in.
 *
 * It renders without the database and without a session, so it is built once
 * per locale at deploy time and served from the edge cache.
 */

/** The interface ships Spanish and English; the other catalog locales read Spanish. */
const INDEXED = ['es', 'en'] as const;

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale === 'en' ? 'en' : 'es', namespace: 'landing' });
  const indexed = (INDEXED as readonly string[]).includes(locale);

  return {
    title: { absolute: t('metaTitle') },
    description: t('metaDescription'),
    keywords: [
      'Genshin Impact', 'artefactos', 'artifacts', 'crit value', 'CV', 'build',
      'planificador', 'planner', 'farmeo', 'farming', 'GOOD', 'Enka', 'Inventory Kamera',
    ],
    // The Japanese and Chinese routes serve the Spanish interface, so they
    // point at it rather than competing with it as duplicates.
    alternates: {
      canonical: indexed ? `/${locale}` : '/es',
      languages: { es: '/es', en: '/en', 'x-default': '/es' },
    },
    robots: indexed ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: 'website',
      url: `/${locale}`,
      siteName: 'GI Organizer',
      title: t('metaTitle'),
      description: t('metaDescription'),
      locale: locale === 'en' ? 'en_US' : 'es_ES',
      alternateLocale: locale === 'en' ? ['es_ES'] : ['en_US'],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('metaTitle'),
      description: t('metaDescription'),
    },
  };
}

const FEATURES = [
  { key: 'artifacts', icon: Gem },
  { key: 'builds', icon: ListChecks },
  { key: 'changes', icon: Repeat2 },
  { key: 'plan', icon: CalendarDays },
  { key: 'teams', icon: Swords },
  { key: 'import', icon: Upload },
] as const;

const STEPS = ['import', 'goal', 'follow'] as const;
const FAQ = ['free', 'import', 'potential', 'cv'] as const;

export default async function Landing({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getTranslations({ locale: locale === 'en' ? 'en' : 'es', namespace: 'landing' });
  const app = `/${locale}/characters`;

  /*
   * What the page is, for the engines that read structure rather than prose:
   * a free web application in the games category, and the questions below as
   * an FAQ. Both are the page's own text, not a second copy that could drift.
   */
  const structured = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'GI Organizer',
      applicationCategory: 'GameApplication',
      operatingSystem: 'Web',
      description: t('metaDescription'),
      inLanguage: locale === 'en' ? 'en' : 'es',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map((key) => ({
        '@type': 'Question',
        name: t(`faq.${key}.q`),
        acceptedAnswer: { '@type': 'Answer', text: t(`faq.${key}.a`) },
      })),
    },
  ];

  return (
    <div className="space-y-20 pb-8">
      <script
        type="application/ld+json"
        // Escaped so no string in the copy can close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }}
      />

      <section className="relative mx-auto max-w-3xl pt-6 text-center sm:pt-12">
        <LogoMark className="mx-auto h-16 w-16 rounded-2xl shadow-[var(--shadow-accent)] ring-1 ring-edge-strong" />
        <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-accent">{t('eyebrow')}</p>
        <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          {t('title')}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
          {t('lead')}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href={app} className={buttonVariants({ size: 'lg', className: 'gap-2' })}>
            {t('ctaOpen')} <ArrowRight size={16} aria-hidden />
          </Link>
          <a href="#como-funciona" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            {t('ctaHow')}
          </a>
        </div>
      </section>

      <section aria-labelledby="features" className="space-y-6">
        <h2 id="features" className="text-center text-2xl font-semibold tracking-tight">
          {t('featuresHeading')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ key, icon: Icon }) => (
            <li key={key} className="card p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Icon size={18} aria-hidden />
              </span>
              <h3 className="mt-4 font-medium">{t(`features.${key}.title`)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(`features.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="como-funciona" aria-labelledby="steps" className="scroll-mt-24 space-y-6">
        <h2 id="steps" className="text-center text-2xl font-semibold tracking-tight">
          {t('stepsHeading')}
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((key, index) => (
            <li key={key} className="card-2 p-5">
              <span className="font-mono text-sm text-accent">0{index + 1}</span>
              <h3 className="mt-2 font-medium">{t(`steps.${key}.title`)}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t(`steps.${key}.body`)}</p>
            </li>
          ))}
        </ol>
        <div className="text-center">
          <Link href={app} className={buttonVariants({ className: 'gap-2' })}>
            {t('ctaOpen')} <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </section>

      <section aria-labelledby="faq" className="mx-auto max-w-3xl space-y-4">
        <h2 id="faq" className="text-center text-2xl font-semibold tracking-tight">{t('faqHeading')}</h2>
        <div className="divide-y divide-edge card">
          {FAQ.map((key) => (
            <details key={key} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {t(`faq.${key}.q`)}
                <span aria-hidden className="text-muted transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{t(`faq.${key}.a`)}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="mx-auto max-w-2xl text-center text-xs text-muted">{t('disclaimer')}</p>
    </div>
  );
}
