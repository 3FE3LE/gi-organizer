import { ArrowRight, Check, Dices, Flower2, PackageOpen, Sparkles, Star, UserRound, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { HelpRow, HelpSection, HelpTip } from '@/components/help-tip';
import { StatIcon } from '@/components/stat-icon';

/**
 * The key to an artifact card, behind a `?`.
 *
 * The card says everything in marks — a set's flower, a crit value in one of
 * three colours, bars for how a substat rolled, a greyed line, a die — and
 * every one of them was learnt by building it. Each row here is the mark as
 * the card draws it, beside what it means, so the legend is read against the
 * card rather than instead of it.
 *
 * `fit` adds the marks a build draws in the footer (how the piece fits that
 * build), which only appear where there is a build to fit.
 */
export function ArtifactLegend({ fit = false }: { fit?: boolean }) {
  const t = useTranslations('legend.artifact');
  const common = useTranslations('common');

  return (
    <HelpTip label={t('open')} title={t('title')} closeLabel={common('close')}>
      <HelpSection title={t('head')}>
        <HelpRow mark={<span className="rounded bg-ink px-1 text-muted">+20</span>}>{t('level')}</HelpRow>
        <HelpRow mark={<span className="text-accent">★★★★★</span>}>{t('rarity')}</HelpRow>
        <HelpRow mark={<span className="text-good">CV 35.0</span>}>
          {t('cv')}{' '}
          <span className="text-muted">{t('cvLow')}</span>{' · '}
          <span className="text-good">{t('cvGood')}</span>{' · '}
          <span className="text-accent">{t('cvGreat')}</span>
        </HelpRow>
        <HelpRow mark={<span className="text-accent"><ArrowRight size={10} className="inline" aria-hidden />7.8</span>}>
          {t('cvAtFour')}
        </HelpRow>
        <HelpRow mark={<Sparkles size={11} className="text-accent" aria-hidden />}>{t('perfect')}</HelpRow>
        <HelpRow mark={<Flower2 size={16} className="text-accent" aria-hidden />}>{t('set')}</HelpRow>
      </HelpSection>

      <HelpSection title={t('stats')}>
        <HelpRow mark={<StatIcon prop="FIGHT_PROP_HP_PERCENT" label={t('percentExample')} />}>{t('percent')}</HelpRow>
        <HelpRow mark={<StatIcon prop="FIGHT_PROP_HP" label={t('flatExample')} />}>{t('flat')}</HelpRow>
        <HelpRow mark={<span className="text-good">×2 <span className="tracking-tighter">▰▰▰▱</span></span>}>{t('rolls')}</HelpRow>
        <HelpRow mark={<span className="opacity-45">×3 <span className="tracking-tighter">▰▰▱▱</span></span>}>{t('dead')}</HelpRow>
        <HelpRow mark={<span className="rounded border border-dashed border-edge-strong px-1 leading-4 text-muted">+4</span>}>
          {t('pending')}
        </HelpRow>
      </HelpSection>

      <HelpSection title={t('foot')}>
        <HelpRow mark={<span className="flex h-5 w-5 items-center justify-center rounded-full border border-edge bg-surface-2 text-muted" aria-hidden><UserRound size={12} /></span>}>{t('holder')}</HelpRow>
        <HelpRow mark={<PackageOpen size={14} className="text-good" aria-hidden />}>{t('free')}</HelpRow>
        <HelpRow mark={<span className="flex items-center gap-0.5 text-muted"><StatIcon prop="FIGHT_PROP_CRITICAL" label="" /><Star size={10} className="fill-accent text-accent" aria-hidden /></span>}>
          {t('serves')}
        </HelpRow>
        {fit && (
          <>
            <HelpRow mark={<span className="flex items-center gap-0.5 text-accent"><StatIcon prop="FIGHT_PROP_ATTACK_PERCENT" label="" /><Star size={10} className="fill-current" aria-hidden /></span>}>
              {t('mainTop')}
            </HelpRow>
            <HelpRow mark={<span className="flex items-center gap-0.5 text-good"><StatIcon prop="FIGHT_PROP_ATTACK_PERCENT" label="" /><Check size={11} aria-hidden /></span>}>
              {t('mainAlt')}
            </HelpRow>
            <HelpRow mark={<span className="flex items-center gap-0.5 text-bad"><StatIcon prop="FIGHT_PROP_ATTACK_PERCENT" label="" /><X size={11} aria-hidden /></span>}>
              {t('mainOff')}
            </HelpRow>
            <HelpRow mark={<span className="flex items-center gap-1"><Dices size={13} className="text-accent" aria-hidden />2.6</span>}>
              {t('useful')}
            </HelpRow>
          </>
        )}
      </HelpSection>
    </HelpTip>
  );
}
