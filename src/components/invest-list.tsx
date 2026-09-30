import { Crown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { CharacterMorph } from '@/components/character-morph';
import { Fold, FoldGroup } from '@/components/fold';
import { GameIcon } from '@/components/game-icon';
import { HelpRow, HelpSection, HelpTip } from '@/components/help-tip';
import { PrefetchLink } from '@/components/prefetch-link';
import type { Catalog } from '@/lib/data/catalog';
import { levelLabel } from '@/lib/data/stats';
import type { Locale } from '@/lib/data/locales';
import { claimMorph } from '@/lib/morph-claim';
import { isReady, type RankedStep } from '@/lib/rules/invest';
import type { InvestPlan } from '@/lib/rules/invest-plan';

/** Under this weight a character is there for others, and their gain is potency. */
const SUPPORT_BELOW = 0.5;

/**
 * Where resin goes furthest, as a list of steps and a fold per character with
 * the whole climb — see `lib/rules/invest.ts` for how a step is valued.
 *
 * `single` is a build's own page: one character, so their face and name are
 * left out and only the first few steps are drawn.
 */
export async function InvestLists({
  plan,
  catalog,
  locale,
  single = false,
  limit = 20,
}: {
  plan: InvestPlan;
  catalog: Catalog;
  locale: Locale;
  single?: boolean;
  limit?: number;
}) {
  const t = await getTranslations('invest');
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const nameOf = (id: number) => catalog.characters.get(id)?.name ?? `#${id}`;

  // 80 and 80+ are different places, and a step that only ascends reads
  // "80 → 80+" rather than "80 → 80".
  const levels = (step: RankedStep) => ({
    from: step.fromPhase == null ? String(step.from) : levelLabel(step.from, step.fromPhase),
    to: step.toPhase == null ? String(step.to) : levelLabel(step.to, step.toPhase),
  });

  const what = (step: RankedStep) => {
    if (step.kind === 'talent') {
      const line = t(`talent.${step.talent!}`, { from: step.from, to: step.to });
      // Its price has the ascension in it, so the name says it too.
      return step.ascendFirst
        ? t('afterAscending', { line, level: levelLabel(step.ascendFirst.level, step.ascendFirst.ascension) })
        : line;
    }
    if (step.kind === 'weapon') {
      const weapon = catalog.weapons.get(plan.weaponIds[step.characterId] ?? 0);
      return t('weaponStep', { ...levels(step), name: weapon?.name ?? t('weapon') });
    }
    return step.toPhase !== step.fromPhase ? t('levelAscend', levels(step)) : t('level', levels(step));
  };

  const gainOf = (characterId: number, gain: number) =>
    t((plan.weights[characterId] ?? 0) < SUPPORT_BELOW ? 'potency' : 'damage', { value: number.format(gain * 100) });
  const priceOf = (resin: number) => (resin === 0 ? t('free') : t('resin', { count: number.format(resin) }));
  // Nothing to farm is not the same as ready: the mora can still be short.
  const moraShort = (step: RankedStep) => step.resin === 0 && !isReady(step, plan.mora);

  const steps = plan.steps.slice(0, limit);

  if (steps.length === 0 && plan.packages.length === 0) {
    return <p className="max-w-prose text-sm text-muted">{t('nothing')}</p>;
  }

  return (
    <div className="space-y-6">
      {steps.length > 0 && (
        <section className="space-y-2">
          {!single && <h3 className="font-mono text-2xs uppercase tracking-wide text-muted">{t('stepsHeading')}</h3>}
          <ol className="card divide-y divide-edge/60">
            {steps.map((step, index) => (
              <li key={`${step.characterId}-${step.kind}-${step.talent ?? ''}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
                <span className="tabular w-5 shrink-0 font-mono text-muted">{index + 1}.</span>
                {!single && <Face id={step.characterId} catalog={catalog} locale={locale} />}
                <span className="min-w-0 flex-1">
                  {!single && <span className="block truncate text-sm">{nameOf(step.characterId)}</span>}
                  <span className="block font-mono text-2xs text-muted">{what(step)}</span>
                </span>
                {step.needsCrown && (
                  <span className="flex items-center gap-1 font-mono text-2xs text-warn" title={t('crownTitle')}>
                    <Crown size={12} aria-hidden />{t('crown')}
                  </span>
                )}
                <span className="tabular font-mono text-good">{gainOf(step.characterId, step.gain)}</span>
                {moraShort(step) ? (
                  <span
                    className="tabular w-24 text-right font-mono text-warn"
                    title={t('moraShortTitle', { need: number.format(step.moraCost), have: number.format(plan.mora) })}
                  >
                    {t('moraShort')}
                  </span>
                ) : (
                  <span className={`tabular w-24 text-right font-mono ${step.resin === 0 ? 'text-good' : 'text-muted'}`}>
                    {priceOf(step.resin)}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {plan.packages.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-mono text-2xs uppercase tracking-wide text-muted">
            {single ? t('packageHeadingOne') : t('packagesHeading')}
          </h3>
          <FoldGroup className="space-y-2">
            {plan.packages.map((entry) => (
              <PackageFold
                key={entry.characterId}
                single={single}
                labels={{
                  name: nameOf(entry.characterId),
                  gain: gainOf(entry.characterId, entry.gain),
                  price: priceOf(entry.resin),
                  mora: t('mora', { count: number.format(entry.mora) }),
                  crown: entry.needsCrown ? t('crown') : null,
                  lines: plan.steps
                    .filter((step) => step.characterId === entry.characterId)
                    .map((step) => ({ key: `${step.kind}-${step.talent ?? ''}`, what: what(step), gain: gainOf(step.characterId, step.gain), price: priceOf(step.resin) })),
                }}
                face={single ? null : <Face id={entry.characterId} catalog={catalog} locale={locale} />}
              />
            ))}
          </FoldGroup>
        </section>
      )}
    </div>
  );
}

function PackageFold({
  face, labels, single,
}: {
  face: React.ReactNode;
  single: boolean;
  labels: {
    name: string; gain: string; price: string; mora: string; crown: string | null;
    lines: { key: string; what: string; gain: string; price: string }[];
  };
}) {
  return (
    <Fold
      summary={(
        <>
          {face}
          <span className="min-w-0 flex-1 truncate text-sm">{single ? labels.gain : labels.name}</span>
          {!single && <span className="tabular font-mono text-good">{labels.gain}</span>}
          <span className="tabular font-mono text-muted">{labels.price}</span>
        </>
      )}
      panelClassName="space-y-1 px-3 py-2 text-xs"
    >
      <ul className="space-y-1">
        {labels.lines.map((line) => (
          <li key={line.key} className="flex items-baseline gap-3 font-mono text-2xs">
            <span className="min-w-0 flex-1 text-muted">{line.what}</span>
            <span className="tabular text-good">{line.gain}</span>
            <span className="tabular w-24 text-right text-muted">{line.price}</span>
          </li>
        ))}
      </ul>
      <p className="font-mono text-2xs text-muted">
        {labels.mora}{labels.crown ? ` · ${labels.crown}` : ''}
      </p>
    </Fold>
  );
}

function Face({ id, catalog, locale }: { id: number; catalog: Catalog; locale: Locale }) {
  const character = catalog.characters.get(id);
  return (
    <PrefetchLink href={`/${locale}/build/${id}`} className="shrink-0 rounded-full hover:ring-2 hover:ring-accent">
      <CharacterMorph id={id} morph={claimMorph(id)}>
        <GameIcon
          filename={character?.icon}
          kind="avatar"
          alt={character?.name ?? ''}
          className="h-8 w-8 rounded-full bg-surface-2"
          sizes="32px"
        />
      </CharacterMorph>
    </PrefetchLink>
  );
}

/** How a step is valued, behind the app's `?`. */
export async function InvestHelp() {
  const t = await getTranslations('invest.help');
  const common = await getTranslations('common');

  return (
    <HelpTip label={t('open')} text={t('open')} title={t('title')} closeLabel={common('close')} align="end">
      <HelpSection>
        <HelpRow mark={<span className="text-good">+3.1%</span>}>{t('gain')}</HelpRow>
        <HelpRow mark={<span className="text-muted">250</span>}>{t('resin')}</HelpRow>
        <HelpRow mark={<span className="text-good">{t('freeMark')}</span>}>{t('free')}</HelpRow>
        <HelpRow mark={<span className="font-mono text-2xs">×1 · ×0.25</span>}>{t('weight')}</HelpRow>
        <HelpRow mark={<Crown size={12} className="text-warn" aria-hidden />}>{t('crown')}</HelpRow>
      </HelpSection>
      <HelpSection title={t('estimateTitle')}>
        <li className="text-xs leading-snug text-text">{t('estimate')}</li>
      </HelpSection>
    </HelpTip>
  );
}
