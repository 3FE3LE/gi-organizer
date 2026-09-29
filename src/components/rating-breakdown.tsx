import { getTranslations } from 'next-intl/server';

import { HelpRow, HelpSection, HelpTip } from '@/components/help-tip';
import { getRatingConfig } from '@/lib/data/registry';
import type { CharacterRating } from '@/lib/rules/rating-plan';

/**
 * A character's rating, part by part: each bar is how much of its own weight
 * the part has earned, and the Akasha line says where it came from or why it
 * is missing. See `lib/rules/rating.ts` for what each part measures.
 */
export async function RatingBreakdown({ rating }: { rating: CharacterRating }) {
  const t = await getTranslations('rating');
  const common = await getTranslations('common');
  const config = await getRatingConfig();

  const rows: { key: 'level' | 'talents' | 'weapon' | 'artifacts'; weight: number; share: number }[] = [
    { key: 'level', weight: config.weights.level, share: rating.parts.level },
    { key: 'talents', weight: config.weights.talents, share: rating.parts.talents },
    { key: 'weapon', weight: config.weights.weapon, share: rating.parts.weapon },
    { key: 'artifacts', weight: config.weights.artifacts, share: rating.parts.artifacts },
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-baseline gap-2 text-sm font-medium uppercase tracking-wide text-muted">
          {t('heading')}
          <span className={`tabular font-mono text-lg normal-case ${rating.score >= 80 ? 'text-good' : 'text-text'}`}>
            {rating.score}
            <span className="text-xs text-muted">/100</span>
          </span>
        </h2>
        <HelpTip label={t('help.open')} text={t('help.open')} title={t('help.title')} closeLabel={common('close')} align="end">
          <HelpSection>
            <HelpRow mark={<span className="font-mono text-2xs">90</span>}>{t('help.own')}</HelpRow>
            <HelpRow mark={<span className="font-mono text-2xs">10</span>}>{t('help.akasha')}</HelpRow>
            <HelpRow mark={<span className="font-mono text-2xs">—</span>}>{t('help.missing')}</HelpRow>
          </HelpSection>
        </HelpTip>
      </div>

      <ul className="card divide-y divide-edge/60">
        {rows.map((row) => (
          <Row key={row.key} label={t(`part.${row.key}`)} weight={row.weight} share={row.share} />
        ))}
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
          <span className="w-28 shrink-0">{t('part.akasha')}</span>
          {rating.parts.akasha !== null && rating.akashaTop !== null ? (
            <>
              <Bar share={rating.parts.akasha} />
              <span className="tabular font-mono text-2xs text-muted">
                {rating.akashaUrl
                  ? <a href={rating.akashaUrl} target="_blank" rel="noreferrer" className="underline hover:text-accent">{t('top', { top: rating.akashaTop })}</a>
                  : t('top', { top: rating.akashaTop })}
              </span>
            </>
          ) : (
            <span className="flex-1 font-mono text-2xs text-muted">{t('noRanking')}</span>
          )}
        </li>
      </ul>
    </section>
  );
}

function Row({ label, weight, share }: { label: string; weight: number; share: number }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-xs">
      <span className="w-28 shrink-0">{label}</span>
      <Bar share={share} />
      <span className="tabular w-16 shrink-0 text-right font-mono text-2xs text-muted">
        {Math.round(share * weight)}/{weight}
      </span>
    </li>
  );
}

function Bar({ share }: { share: number }) {
  return (
    <span aria-hidden className="block h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-surface-2">
      <span
        className={`block h-full rounded-full ${share >= 1 ? 'bg-good' : 'bg-accent'}`}
        style={{ width: `${Math.round(share * 100)}%` }}
      />
    </span>
  );
}
