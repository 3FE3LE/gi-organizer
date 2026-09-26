'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { AssetImage } from '@/components/asset-image';
import { Hint } from '@/components/hint';
import { Slider } from '@/components/ui/slider';
import { GameText } from '@/components/game-text';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * The scaling table a combat talent carries.
 *
 * `labels` are the game's own template strings — `"Daño|{param1:P}"` — and
 * `parameters` holds one array per parameter, indexed by talent level. The two
 * are only meaningful together, which is why they travel as one object.
 */
export type AbilityScaling = {
  labels: string[];
  parameters: Record<string, number[]>;
};

export type Ability = {
  key: string;
  /** What the disc shows when the artwork is missing: `N`/`E`/`Q`, or `C3`. */
  fallback: string;
  name: string;
  description: string;
  icon: string | null;
  /** Talents only. */
  level?: number;
  bonus?: number;
  /** Constellations and passives: whether the character has it yet. */
  unlocked?: boolean;
  /** Passives only: the ascension phase that unlocks it, 0 for always. */
  unlockAscension?: number;
  scaling?: AbilityScaling;
};

/**
 * What a character can do, and what it does at each level.
 *
 * This used to be a tab — a page of prose under the panel that already drew
 * every one of these icons, so the same six constellations were on screen
 * twice, once as state and once as text. The icons are the index; the text is
 * what you ask an index for. So the discs became buttons, and the reading
 * happens in a dialog over the panel rather than in a second copy of the list
 * below it.
 *
 * The talent dialog carries a level slider. A talent's numbers are a table of
 * fifteen rows in the data and a single row on screen, and the question anyone
 * actually has — *is the next level worth the books* — is a comparison between
 * two of those rows. The slider starts at the level the character is on and
 * changes nothing: it previews the table, it does not write a target. The
 * target lives in the Objetivo tab, which is the one place that writes.
 */
export function Abilities({
  splash,
  constellations,
  talents,
  passives,
}: {
  /** The portrait, rendered on the server; the constellations sit over it. */
  splash: React.ReactNode;
  constellations: Ability[];
  talents: Ability[];
  /**
   * The passives, under the combat talents. They were in the data all along
   * and on no screen, which is how a character's heal-over-time or a damage
   * bonus off Energy Recharge stayed something only a wiki could tell you.
   */
  passives: Ability[];
}) {
  const t = useTranslations('build');
  // Which ability the dialog shows, and whether it is open, apart: closing
  // clears only the second, so the panel stays on screen while it animates out.
  const [shown, setShown] = useState<Ability | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const setOpen = (ability: Ability) => {
    setShown(ability);
    setIsOpen(true);
  };

  return (
    /*
     * The column stretches; the art stretches with it.
     *
     * The splash used to be a fixed `h-72` in a grid cell whose neighbour is
     * anything from a full attribute panel to four lines, so the portrait sat
     * in the same box whether the row around it was tall or short — and short
     * rows left a band of empty column under it. `flex-1` hands the leftover
     * height to the art instead, with `object-cover` keeping the proportions
     * and `object-top` keeping the face. The one fixed number left is the
     * portrait's floor, and it is set where the portrait is.
     */
    <div className="flex w-full flex-col">
      <div className="relative min-h-0 flex-1">
        {splash}

        {constellations.length > 0 && (
          <ol className="absolute right-2 top-3 space-y-1.5">
            {constellations.map((constellation, index) => (
              <li key={constellation.key}>
                <Hint text={`C${index + 1} · ${constellation.name}`} side="left">
                <button
                  type="button"
                  onClick={() => setOpen(constellation)}
                  aria-label={`C${index + 1} · ${constellation.name}`}
                  /* `bg-icon-bed`, not `bg-ink`: the glyph inside is white line
                     art and `--ink` is parchment in the light theme. See
                     `globals.css`. */
                  className={`flex h-8 w-8 items-center justify-center disc transition-transform hover:scale-110 ${
                    constellation.unlocked
                      ? 'ring-1 ring-accent'
                      : 'opacity-40 grayscale'
                  }`}
                >
                  <Glyph ability={constellation} size="h-5 w-5" />
                </button>
                </Hint>
              </li>
            ))}
          </ol>
        )}

        {/* The passives, down the other edge of the art as the
            constellations run down this one. Nothing to label: a passive has
            no level, only whether the character has reached it, and the dimmed
            disc already says that — the name and the phase are a hover or a
            tap away. */}
        {passives.length > 0 && (
          <ul className="absolute left-2 top-3 space-y-1.5" aria-label={t('passivesLabel')}>
            {passives.map((passive) => (
              <li key={passive.key}>
                <Hint text={passive.name} side="right">
                  <button
                    type="button"
                    onClick={() => setOpen(passive)}
                    aria-label={passive.name}
                    className={`flex h-8 w-8 items-center justify-center disc transition-transform hover:scale-110 ${
                      passive.unlocked ? '' : 'opacity-40 grayscale'
                    }`}
                  >
                    <Glyph ability={passive} size="h-5 w-5" />
                  </button>
                </Hint>
              </li>
            ))}
          </ul>
        )}
      </div>

      {talents.length > 0 && (
        <ul className="flex justify-center gap-2 px-3 pb-3">
          {talents.map((talent) => (
            <li key={talent.key}>
              <Hint text={talent.name}>
              <button
                type="button"
                onClick={() => setOpen(talent)}
                aria-label={talent.name}
                className="flex flex-col items-center gap-1"
              >
                <span className="flex h-10 w-10 items-center justify-center disc transition-transform hover:scale-110">
                  <Glyph ability={talent} size="h-6 w-6" />
                </span>
                <span className="tabular font-mono text-2xs">
                  {talent.level}
                  {(talent.bonus ?? 0) > 0 && <span className="text-accent">+{talent.bonus}</span>}
                </span>
              </button>
              </Hint>
            </li>
          ))}
        </ul>
      )}

      {/*
        * The dialog is shadcn's, over Base UI.
        *
        * What it replaced was a hand-rolled overlay: a fixed div inside this
        * column, a focus trap of our own, and `body { overflow: hidden }` to
        * freeze the page — which handed the scrollbar's width back to the
        * viewport and made the whole layout jump as the panel opened. The
        * primitive portals to the document, traps focus, restores it, and
        * compensates the scrollbar itself, which is three of our own problems
        * it takes off the page.
        *
        * `key` remounts the body per ability, so the level slider opens on the
        * talent that was clicked rather than on the last one read.
        */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {shown && (
          <DialogContent
            key={shown.key}
            showCloseButton={false}
            className="panel max-h-[85vh] max-w-lg gap-0 overflow-hidden p-0 ring-0 sm:max-w-lg"
          >
            <AbilityPanel ability={shown} closeLabel={t('abilityClose')} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function Glyph({ ability, size }: { ability: Ability; size: string }) {
  // Passive art is talent art: the same host, the same size.
  const kind = ability.key.startsWith('constellation') ? 'constellation' : 'talent';

  if (!ability.icon) {
    return <span className="font-mono text-2xs text-muted">{ability.fallback}</span>;
  }

  return (
    <AssetImage src={ability.icon} kind={kind} alt="" className={size} sizes="40px" />
  );
}

/** The dialog's body, mounted fresh per ability so its slider starts over. */
function AbilityPanel({ ability, closeLabel }: { ability: Ability; closeLabel: string }) {
  const t = useTranslations('build');

  const scaling = ability.scaling;
  const levels = scaling ? Object.values(scaling.parameters)[0]?.length ?? 0 : 0;
  // Opens on where the character actually is, so the first thing read is the
  // row they own rather than row one.
  const [level, setLevel] = useState(Math.min(Math.max(ability.level ?? 1, 1), levels || 1));

  return (
    <div className="flex max-h-[85vh] flex-col">
      <header className="flex items-start gap-3 border-b border-edge px-4 py-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center disc">
          <Glyph ability={ability} size="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1">
          <DialogTitle className="text-sm font-normal">{ability.name}</DialogTitle>
          <p className="font-mono text-2xs uppercase tracking-wide text-muted">
            {ability.unlockAscension !== undefined
              ? ability.unlockAscension === 0
                ? t('passiveInnate')
                : ability.unlocked
                  ? t('passiveUnlocked', { phase: ability.unlockAscension })
                  : t('passiveLocked', { phase: ability.unlockAscension })
              : ability.unlocked === undefined
              ? t('abilityLevelNow', { level: ability.level ?? 1 })
              : ability.unlocked
                ? ability.fallback
                : `${ability.fallback} · ${t('constellationLocked')}`}
          </p>
        </div>
        <DialogClose aria-label={closeLabel} className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
          <X size={16} aria-hidden />
        </DialogClose>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {ability.description && (
          <GameText text={ability.description} className="text-xs leading-relaxed text-muted" />
        )}

        {scaling && levels > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-3">
              <h3 className="font-mono text-2xs uppercase tracking-wide text-muted">
                {t('abilityScaling')}
              </h3>
              <label className="flex flex-1 items-center gap-2">
                <span className="sr-only">{t('abilityLevelSlider')}</span>
                <Slider
                  min={1}
                  max={levels}
                  step={1}
                  value={level}
                  onValueChange={(next) => setLevel(Number(next))}
                  className="min-w-0 flex-1"
                />
                <span className="tabular w-16 shrink-0 text-right font-mono text-2xs">
                  {t('abilityLevelShort', { level })}
                </span>
              </label>
            </div>

            <dl className="divide-y divide-edge/60 border-y border-edge/60">
              {scaling.labels.map((template) => {
                const [label, value] = splitLabel(template);

                return (
                  <div key={template} className="flex items-baseline gap-3 py-1.5">
                    <dt className="min-w-0 flex-1 text-xs text-muted">{label}</dt>
                    <dd className="tabular shrink-0 font-mono text-xs">
                      {fill(value, scaling.parameters, level)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}

/** `"Daño al pulsar|{param1:P}"` → the name and the template beside it. */
function splitLabel(template: string): [string, string] {
  const at = template.indexOf('|');
  return at === -1 ? [template, ''] : [template.slice(0, at), template.slice(at + 1)];
}

/**
 * Substitutes the parameters of one level into the game's own template.
 *
 * The formats are the game's: `I` is a whole number, `F1`/`F2` fix the
 * decimals, and a trailing `P` multiplies by a hundred and adds the sign — so
 * `F1P` is `44.4%` and `P` is `44%`. Anything unrecognised is left as it came
 * rather than guessed at, which keeps a format nobody has seen yet visible
 * instead of silently wrong.
 */
function fill(template: string, parameters: Record<string, number[]>, level: number) {
  return template.replace(/\{(param\d+):([^}]+)\}/g, (whole, name: string, format: string) => {
    const value = parameters[name]?.[level - 1];
    if (value === undefined) return whole;

    const percent = format.endsWith('P');
    const digits = Number(/^F(\d)/.exec(format)?.[1] ?? 0);
    const scaled = percent ? value * 100 : value;

    return scaled.toFixed(digits) + (percent ? '%' : '');
  });
}
