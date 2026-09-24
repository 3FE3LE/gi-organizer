import { Check, Dices, Star, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatIcon } from '@/components/stat-icon';
import type { PieceFit } from '@/lib/rules/piece-score';

/**
 * How a piece fits the build, as marks rather than a sentence.
 *
 * "main stat ok · 2.6 rolls útiles" was read once and skimmed forever after.
 * The main stat is its icon with a mark — a star for the build's first choice,
 * a tick for one it accepts further down its list, a cross for one it does
 * not ask for — and the useful rolls are a die with the count, the number a
 * swap is decided on. The sentence stays for hover and screen readers.
 *
 * Drawn on the candidates and on what the character already wears, so the
 * piece on and the piece offered are judged by the same marks.
 */
export function FitIcons({
  fit,
  mainProp,
  mainLabel,
}: {
  fit: PieceFit;
  mainProp: string;
  mainLabel: string;
}) {
  const t = useTranslations('build');
  const rolls = t('usefulRolls', { score: fit.usefulRolls.toFixed(1) });
  const top = fit.mainStatRank === 0;
  const verdict = fit.mainStatWanted === false
    ? t('mainStatOff')
    : top ? t('mainStatTop') : t('mainStatAlt');

  return (
    <span className="flex items-center gap-2 font-mono text-2xs">
      {fit.mainStatWanted !== null && (
        <span
          title={`${mainLabel} · ${verdict}`}
          className={`flex items-center gap-0.5 ${
            fit.mainStatWanted === false ? 'text-bad' : top ? 'text-accent' : 'text-good'
          }`}
        >
          <StatIcon prop={mainProp} label={mainLabel} />
          {fit.mainStatWanted === false
            ? <X size={11} aria-hidden />
            : top
              ? <Star size={10} aria-hidden className="fill-current" />
              : <Check size={11} aria-hidden />}
          <span className="sr-only">{verdict}</span>
        </span>
      )}
      <span title={rolls} className="tabular flex items-center gap-1 text-text">
        <Dices size={13} aria-hidden className="text-accent" />
        {fit.usefulRolls.toFixed(1)}
        <span className="sr-only">{rolls}</span>
      </span>
    </span>
  );
}
