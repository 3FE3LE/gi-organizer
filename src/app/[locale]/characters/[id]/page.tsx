import { Target } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CharacterSheet } from '@/components/character-sheet';
import { GameIcon } from '@/components/game-icon';
import { getCatalog } from '@/lib/data/catalog';
import { elementColor } from '@/lib/data/elements';
import { isLocale } from '@/lib/data/locales';
import { getCoreCharacters } from '@/lib/data/registry';

export async function generateStaticParams() {
  const core = await getCoreCharacters();
  return Object.keys(core).map((id) => ({ id }));
}

export default async function CharacterPage({ params }: PageProps<'/[locale]/characters/[id]'>) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();

  const catalog = await getCatalog(locale);
  const character = catalog.characters.get(Number(id));
  if (!character) notFound();

  const t = await getTranslations('characters.detail');
  const accent = elementColor(character.elementType);

  return (
    <article className="space-y-10">
      <header className="flex flex-wrap items-start gap-6">
        <GameIcon
          filename={character.gachaSplash}
          kind="splash"
          className="h-40 w-40 rounded-lg border border-edge object-cover object-top"
          sizes="160px"
        />
        <div className="min-w-64 flex-1">
          <p className="font-mono text-xs uppercase tracking-wide" style={{ color: accent }}>
            {character.elementText} · {character.weaponText} · {character.rarity}★
          </p>
          <h1 className="mt-1 text-2xl font-medium">{character.name}</h1>
          {character.title && <p className="text-muted">{character.title}</p>}
          <p className="mt-3 max-w-prose text-sm text-muted">{character.description}</p>

          {/* This page is the catalogue's entry and knows nothing about the
              account — it is generated for all four hundred and eighty-five of
              them — so the link is unconditional. The planner is where a goal
              lives, and it says so itself when the character is not owned. */}
          <Link
            href={`/${locale}/build/${character.id}`}
            className="mt-4 inline-flex items-center gap-2 rounded border border-accent px-3 py-1.5 text-sm text-accent transition-colors hover:bg-surface-2"
          >
            <Target size={14} />
            {t('objectiveOf', { name: character.name })}
          </Link>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs sm:grid-cols-3">
            <Fact label={t('region')} value={character.region || '—'} />
            <Fact label={t('affiliation')} value={character.affiliation || '—'} />
            <Fact label={t('constellation')} value={character.constellation} />
            <Fact label={t('ascension')} value={character.substatText} />
            <Fact label={t('birthday')} value={character.birthday || '—'} />
            <Fact label={t('version')} value={character.version} />
          </dl>
        </div>
      </header>

      <CharacterSheet catalog={catalog} character={character} locale={locale} />
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.65rem] uppercase text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
