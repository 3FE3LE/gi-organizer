import { Cake, Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ViewTransition } from 'react';

import { ArtifactCard } from '@/components/artifact-card';
import { EffectButton } from '@/components/effect-dialog';
import { ElementIcon } from '@/components/element-icon';
import { EmptyArtifactSlot } from '@/components/empty-artifact-slot';
import { GameIcon } from '@/components/game-icon';
import { Badge } from '@/components/ui/badge';
import {
  type Catalog, enkaEntry, formatSetEffect, propLabel, setEffects,
} from '@/lib/data/catalog';
import { elementColor, elementDamageProp, elementOfDamageProp } from '@/lib/data/elements';
import type { Locale } from '@/lib/data/locales';
import { formatPropValue, isPercentProp } from '@/lib/data/props';
import { resolveIcon } from '@/lib/data/icon';
import { getCharacterDetailStrings } from '@/lib/data/registry';
import { STAT_LEVEL_KEYS, statLevelKey } from '@/lib/data/stats';
import type { ArtifactSlot, CharacterView } from '@/lib/data/types';
import type { Loadout, LoadoutPiece } from '@/lib/player/loadout';
import type { PieceFit } from '@/lib/rules/piece-score';
import { critRating, critValue } from '@/lib/rules/rolls';

import { Abilities, type Ability } from './abilities';
import { ArtifactSlotSwitcher } from './artifact-slot-switcher';
import { EquippedFit } from './equipped-fit';
import { Attributes, type AttributeLevel, type AttributeRow } from './attributes';
import { GearActions } from './gear-actions';
import { MobileCollapsible } from './mobile-collapsible';
import { SWIPE_TYPE } from './swipe-type';
import { WeaponPassive, type WeaponPassiveText } from './weapon-passive';

/**
 * The character screen: what is equipped right now and what it adds up to.
 *
 * The shape is the game's, and stays the game's — everything below it on the
 * page is the planner, and that argument only lands if the current state is
 * stated first in a form the player already recognises.
 *
 * What changed is that it is no longer read-only. Editing a piece used to be a
 * tab of its own listing all six slots; this panel is where anyone actually
 * looks at their gear, so hovering a card now reveals the two things that can
 * be done to it. The card itself is untouched: the controls sit over it.
 *
 * Numbers come from `readLoadout`, which sums the same things the game's own
 * attribute panel does. Conditional four-piece effects are absent from both.
 */

const SLOT_ORDER = ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const;

/** The attribute row a percent ascension stat is counted in. */
const ASCENDS_INTO: Record<string, string> = {
  FIGHT_PROP_HP_PERCENT: 'FIGHT_PROP_HP',
  FIGHT_PROP_ATTACK_PERCENT: 'FIGHT_PROP_ATTACK',
  FIGHT_PROP_DEFENSE_PERCENT: 'FIGHT_PROP_DEFENSE',
};


export async function CharacterPanel({
  catalog,
  character,
  loadout,
  locale,
  buildId,
  fits,
}: {
  catalog: Catalog;
  character: CharacterView;
  loadout: Loadout;
  locale: Locale;
  /** The goal the candidate lists are scored against, when one is open. */
  buildId: string | null;
  /** How each worn piece fits that goal, by instance. See `EquippedFit`. */
  fits: Map<string, PieceFit>;
}) {
  const detail = await getCharacterDetailStrings(locale, character.id);
  const entry = enkaEntry(catalog, character.id, loadout.skillDepotId);
  const accent = elementColor(character.elementType);
  const t = await getTranslations('build');
  const common = await getTranslations('common');
  const slotLabel = await getTranslations('common.slot');

  const talentLevels = [loadout.talent.auto, loadout.talent.skill, loadout.talent.burst];
  const talentBonus = loadout.talentBonus
    ? [loadout.talentBonus.auto, loadout.talentBonus.skill, loadout.talentBonus.burst]
    : [0, 0, 0];
  const talentNames = detail.talents?.combat.map((talent) => talent.name) ?? [];

  // Enka's table lags a patch or two, so the newest characters have no art. The
  // levels and names come from elsewhere and are worth showing regardless, so a
  // missing icon degrades to a labelled slot rather than removing the row.
  const talentIcons = (entry?.skillOrder ?? [])
    .slice(0, 3)
    .map((skillId) => entry?.skills[String(skillId)] ?? null);

  /*
   * The icons resolve here rather than in `Abilities`, which is a client
   * component: `resolveIcon` reads the generated missing-asset list, and that
   * list is on the server. The same reason `GameIcon` exists at all.
   */
  const talents: Ability[] = await Promise.all([0, 1, 2].map(async (index) => ({
    key: `talent-${index}`,
    fallback: ['N', 'E', 'Q'][index],
    icon: await resolveIcon(talentIcons[index] ?? null, 'talent'),
    name: talentNames[index] ?? t('talentFallback', { n: index + 1 }),
    description: detail.talents?.combat[index]?.description ?? '',
    scaling: detail.talents?.combat[index]?.attributes,
    level: talentLevels[index],
    bonus: talentBonus[index],
  })));

  const passives: Ability[] = await Promise.all(
    (detail.talents?.passive ?? []).map(async (passive, index) => {
      const phase = passive.unlockAscension ?? 0;
      return {
        key: `passive-${index}`,
        // A1 and A4 are what the community calls them; an innate passive has
        // no phase, and a dot says "always" without another word to translate.
        fallback: phase > 0 ? `A${phase}` : '·',
        icon: await resolveIcon(passive.icon ?? null, 'talent'),
        name: passive.name,
        description: passive.description,
        unlocked: loadout.ascension >= phase,
        unlockAscension: phase,
      };
    }),
  );

  const constellationIcons = entry?.constellationIcons ?? [];
  const constellations: Ability[] = await Promise.all(
    (detail.constellation?.levels ?? constellationIcons).map(async (_, index) => ({
      key: `constellation-${index}`,
      fallback: `C${index + 1}`,
      icon: await resolveIcon(constellationIcons[index] ?? null, 'constellation'),
      name: detail.constellation?.levels[index]?.name ?? `C${index + 1}`,
      description: detail.constellation?.levels[index]?.description ?? '',
      unlocked: index < loadout.constellation,
    })),
  );

  const damageProp = elementDamageProp(character.elementType);
  // Any other damage bonus the gear happens to carry — an off-element goblet is
  // a real number on the screen, and hiding it would make the total unreadable.
  const otherDamage = Object.keys(loadout.totals)
    .filter(
      (prop) =>
        prop.endsWith('_ADD_HURT') && prop !== damageProp && (loadout.totals[prop] ?? 0) > 0,
    )
    .sort();

  const weaponDefinition = loadout.weapon
    ? catalog.weapons.get(loadout.weapon.weaponId)
    : undefined;

  // The passive at every refinement, for the slider under the weapon card. It
  // opens on the copy equipped — a copy nobody has yet is not what this weapon
  // is doing. A handful of the lowest-rarity weapons carry no passive at all,
  // which is why this checks for one rather than assuming every weapon has a
  // line to show.
  const weaponPassive: WeaponPassiveText | null = weaponDefinition?.effectName
    ? { name: weaponDefinition.effectName, refinements: weaponDefinition.refinements }
    : null;

  const bySlot = new Map(loadout.pieces.map((piece) => [piece.slot, piece]));

  /*
   * The character's own namecard art, as the wash behind their splash.
   *
   * Enka serves it under the same suffix the avatar icon uses —
   * `UI_AvatarIcon_Ayaka` → `UI_NameCardPic_Ayaka_P` — so it is derived rather
   * than stored. The Traveler has no namecard, and a name no host serves comes
   * back as `null` from `resolveIcon`, so the wash simply is not drawn.
   */
  const namecardSuffix = character.icon?.startsWith('UI_AvatarIcon_')
    ? character.icon.slice('UI_AvatarIcon_'.length)
    : null;
  // The Traveler is the one character with no namecard of their own.
  const namecard = namecardSuffix && !namecardSuffix.startsWith('Player')
    ? `UI_NameCardPic_${namecardSuffix}_P`
    : null;

  /*
   * Two facts over the art: what they are called, and when they arrived.
   *
   * The line started as seven — title, nation, faction, constellation,
   * ascension stat, birthday, version — and six of those were read once and
   * never again. The faction and the constellation name say nothing anyone
   * plans around. A birthday printed as `8/10` reads as a ratio before it
   * reads as a date, and is not worth the confusion either way. The ascension
   * stat is a number, so it belongs with the numbers: it is marked in the base
   * stat row instead, where it already appears. The nation is gone from here
   * until it can be an emblem — see the note on `region` below.
   */
  const facts = [...new Set([character.region].filter(Boolean))];

  /*
   * The attribute rows, and their values at every row of the stat table.
   *
   * HP, ATK and DEF split against the game's own white number — the
   * character's base plus the weapon's ATK — and every other row against the
   * character alone: innate crit and recharge, and the ascension stat. The
   * client component only moves an index; it never sees a table.
   */
  const rowProps = [
    'FIGHT_PROP_HP', 'FIGHT_PROP_CRITICAL',
    'FIGHT_PROP_ATTACK', 'FIGHT_PROP_CRITICAL_HURT',
    'FIGHT_PROP_DEFENSE', 'FIGHT_PROP_HEAL_ADD',
    'FIGHT_PROP_ELEMENT_MASTERY', 'FIGHT_PROP_CHARGE_EFFICIENCY',
    ...(damageProp ? [damageProp] : []),
    ...otherDamage,
  ];
  const attributeRows: AttributeRow[] = rowProps.map((prop) => ({
    prop,
    label: propLabel(catalog, prop),
    percent: isPercentProp(prop),
    accent: prop === damageProp ? accent : undefined,
    element: elementOfDamageProp(prop),
    // A percent ascension lands in its flat row's total — ATK% in ATK — so
    // that is the row it marks.
    ascension: prop === (ASCENDS_INTO[character.substatType] ?? character.substatType),
  }));
  const splitBase = { FIGHT_PROP_HP: 'hp', FIGHT_PROP_ATTACK: 'attack', FIGHT_PROP_DEFENSE: 'defense' } as const;
  const attributeLevels: AttributeLevel[] = loadout.byLevel.map((entry) => ({
    key: entry.key,
    values: Object.fromEntries(rowProps.map((prop) => [prop, {
      base: prop in splitBase
        ? entry.base[splitBase[prop as keyof typeof splitBase]]
        : entry.naked[prop] ?? 0,
      total: entry.totals[prop] ?? 0,
    }])),
  }));

  return (
    <section className="panel overflow-hidden">
      {/*
        * Wider art, narrower numbers.
        *
        * The art is 2048×1024 and the column is taller than it is wide,
        * so `object-cover` scales it by height and throws away the
        * sides — at 20rem the column showed a third of the frame. Every
        * rem given to this column is a rem of character back, and the
        * attribute rows opposite were the ones stretching to fill a
        * width no two-column stat list needs.
        */}
      <div className="grid lg:grid-cols-[28rem_minmax(0,1fr)]">
        {/* `flex`, so the column the art fills has a height to fill: a grid
            cell stretches, but a percentage height inside it needs a parent
            that is laying out its children rather than one that is not. */}
        <div className="relative flex border-b border-edge lg:border-b-0 lg:border-r">
          {/* Both rails and the dialog they open live in one client component:
              a talent and a constellation open the same panel, and two roots
              cannot share the state of which one is showing. The portrait is
              still server-rendered and handed in. */}
          <Abilities
            constellations={constellations}
            talents={talents}
            passives={passives}
            splash={
            /*
             * The other half of the roster's morph: the avatar the player
             * clicked grows into this splash instead of being replaced by it.
             * See `characters/page.tsx` and `globals.css`.
             *
             * `key` is not decoration. This element is built here and rendered
             * over there, beside the constellation rail, so React sees it as
             * one entry of a list it did not create and asks that list for
             * keys. Everything `Abilities` builds itself is already marked; the
             * one element handed in from outside is not, and it is the one the
             * warning names.
             *
             * The height floor is the rail itself: six discs, their gaps and
             * the inset they hang from. Shorter crops C6; taller pushes blank
             * space into the column beside it on a character with no gear.
             */
            <ViewTransition
              key="splash"
              name={`character-${character.id}`}
              share={{ [SWIPE_TYPE]: 'none', default: 'morph' }}
              default="none"
            >
              <div className="relative h-full min-h-[15.5rem] overflow-hidden">
                {/* The element, as a wash under the art — the same gesture the
                    roster cards make, and the reason the column no longer
                    reads as a white box with a character floating in it. */}
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      `radial-gradient(110% 85% at 50% 15%, color-mix(in oklab, ${accent} 55%, transparent), transparent 72%)`,
                  }}
                />

                {/* Their namecard, blurred under everything: the character's
                    own colours and motifs, which is what makes the wash theirs
                    rather than merely their element's. */}
                {namecard && (
                  <GameIcon
                    filename={namecard}
                    kind="namecard"
                    className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 mix-blend-multiply blur-[3px] dark:mix-blend-screen dark:opacity-25"
                    sizes="(min-width: 1024px) 448px, 100vw"
                  />
                )}

                {/*
                  * `sizes` is not the column's width here.
                  *
                  * The art is 2048×1024 and `object-cover` scales it to cover
                  * the box by its *height*: a 320-wide column 470 tall draws
                  * the source at about 940 CSS pixels wide and shows the
                  * middle third of it. Asking for a 320px variant handed the
                  * browser a third of the pixels it then had to stretch, and
                  * the taller the column grew the softer it got. So the number
                  * is the width the crop actually renders at, not the width of
                  * the element.
                  */}
                <GameIcon
                  filename={character.gachaSplash}
                  kind="splash"
                  className="relative h-full w-full object-cover object-top"
                  sizes="(min-width: 1024px) 1080px, 100vw"
                  priority
                />
                {/*
                  * The bleed is a band, not a veil.
                  *
                  * This gradient exists so the art ends in the panel instead of
                  * on a hard edge, and so the flavour text under it has
                  * something to sit on. Run over the whole box it does a third
                  * job nobody asked for: it lays parchment over the character
                  * and the art goes pale and soft. It stops at 40% now, which
                  * is above the text and below anything worth looking at.
                  */}
                <div
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 top-0"
                  style={{
                    background: 'linear-gradient(to top, var(--surface) 0%, color-mix(in oklab, var(--surface) 55%, transparent) 18%, transparent 40%)',
                  }}
                />

                {/* The flavour, over the gradient the art already fades into:
                    the title in the display face, then the nation, then the
                    birthday behind a cake — a date that reads as `8/10` needs
                    something to say it is a date. The nation is text because no
                    host we use serves nation emblems; see `assets.ts`. */}
                <div className="absolute inset-x-0 bottom-0 px-3 pb-2">
                  {character.title && (
                    <p className="font-display text-base italic leading-tight text-text">
                      {character.title}
                    </p>
                  )}
                  <ul className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-2xs text-muted">
                    {facts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                    {character.birthday && (
                      <li className="flex items-center gap-1">
                        <Cake size={11} aria-hidden />
                        <span>{character.birthday}</span>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </ViewTransition>
          } />
        </div>

        <div className="min-w-0 p-4">
          <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="page-title">{character.name}</h1>
            {/* The phase, not only the level. Level 80 before the sixth
                ascension and level 80 after it are different characters — the
                base stats step at the phase, not at the level — and the plan
                costs the two differently. The panel stated one of the two. */}
            <Badge
              variant="outline"
              className="h-auto rounded-md border-edge bg-surface-2 font-mono text-xs font-normal"
            >
              {t('levelPrefix')} {loadout.level}
              <span className="text-muted">· {t('ascensionPhase', { phase: loadout.ascension })}</span>
            </Badge>
            <span
              className="element-tint font-mono text-xs"
              style={{ '--element': accent } as React.CSSProperties}
            >
              {'★'.repeat(character.rarity)}
            </span>
            <span className="font-mono text-xs uppercase text-muted">
              {/* The emblem stands for the element; its name stays for the
                  reader who cannot see it. */}
              <span className="inline-flex items-center gap-1 align-middle">
                <ElementIcon element={character.elementType} className="h-4 w-4" />
                {character.elementText}
              </span>
              {' · '}{character.weaponText}
              {/* `normal-case`: the line is uppercased and a version is not a
                  word — `V1.0` reads as a name, `v1.0` as a number. */}
              <span className="normal-case"> · {t('factVersion', { version: character.version })}</span>
            </span>
            {!loadout.known && (
              <Badge
                variant="outline"
                className="h-auto border-warn/40 font-mono text-xs font-normal text-warn"
              >
                {t('noSheetInRoster')}
              </Badge>
            )}
          </header>

          {/*
            * Who this character is, in one line.
            *
            * It used to be a catalogue page of its own, reachable only for a
            * character the account did not hold — six labelled facts, a stat
            * table and two lists of ascension costs, on the theory that someone
            * deciding whether to pull needs a different screen than someone who
            * already pulled. They do not: they need this one, minus the gear.
            * So the facts are a line, and the page they came from is gone.
            */}
          {/* The blurb only where it is doing work: on a character the player
              does not own yet, this screen is the only place it is written. */}
          {!loadout.known && character.description && (
            <p className="mb-4 max-w-prose text-sm text-muted">{character.description}</p>
          )}

          {/* Every character, owned or not: a character nobody holds is the
              same table with no gear on it, which is what their base is. */}
          <MobileCollapsible title={t('characterAttributes')}>
            <Attributes
              rows={attributeRows}
              levels={attributeLevels}
              startAt={STAT_LEVEL_KEYS.indexOf(statLevelKey(loadout.level, loadout.ascension))}
              sliderLabel={t('baseStatsSlider')}
              levelPrefix={t('levelPrefix')}
              ascensionLabel={t('factAscensionMark')}
              previewLabel={t('levelPreview')}
              locale={locale}
            />
          </MobileCollapsible>

          {loadout.known && (<>
            <h2 className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-muted">
              {t('weaponHeading')}
            </h2>
            {loadout.weapon && weaponDefinition ? (
              <div className="card-2">
              {/* The controls cover the top half only: the passive under it has
                  a slider of its own, and an overlay over it would eat the drag. */}
              <div className="group relative flex items-center gap-3 p-3">
                <div className="relative shrink-0">
                  <GameIcon
                    filename={weaponDefinition.icon}
                    kind="weapon"
                    className="h-14 w-14 field"
                    sizes="56px"
                  />
                  <Badge className="absolute -left-1 -top-1 h-auto rounded bg-ink px-1 font-mono text-2xs font-normal text-accent">
                    R{loadout.weapon.refinement}
                  </Badge>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="max-w-full truncate text-sm">{weaponDefinition.name}</span>
                    <span className="rounded border border-edge px-1 font-mono text-2xs text-muted">
                      {t('levelPrefix')} {loadout.weapon.level}
                    </span>
                    <span className="font-mono text-2xs text-accent">
                      {'★'.repeat(weaponDefinition.rarity)}
                    </span>
                  </p>
                  <p className="tabular mt-1 font-mono text-xs text-muted">
                    {propLabel(catalog, 'FIGHT_PROP_ATTACK')}{' '}
                    <span className="text-text">{Math.round(loadout.weapon.baseAttack)}</span>
                    {loadout.weapon.prop && (
                      <>
                        {' · '}
                        {propLabel(catalog, loadout.weapon.prop)}{' '}
                        <span className="text-text">
                          {formatPropValue(
                            loadout.weapon.prop,
                            loadout.weapon.value,
                            'ratio',
                            locale,
                          )}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <GearActions
                  characterId={character.id}
                  locale={locale}
                  buildId={buildId}
                  slot="weapon"
                  title={character.weaponText}
                />
              </div>
              {/* The passive, open rather than behind the name: the objective
                  used to print it a second time, with the slider, and this is
                  the one place a weapon is read now. */}
              {weaponPassive && (
                <div className="border-t border-edge px-3 py-2.5">
                  <WeaponPassive passive={weaponPassive} refinement={loadout.weapon.refinement} />
                </div>
              )}
              </div>
            ) : (
              <div className="group relative rounded-lg border border-dashed border-edge px-3 py-4">
                <p className="text-sm text-muted">{t('noWeaponEquipped')}</p>
                <GearActions
                  characterId={character.id}
                  locale={locale}
                  buildId={buildId}
                  slot="weapon"
                  title={character.weaponText}
                />
              </div>
            )}
          </>)}
        </div>
      </div>

      {/*
        * Gear only for a character the account holds.
        *
        * A character nobody owns has no weapon and no artifacts, and five
        * dashed slots offering to equip one are five controls that cannot do
        * anything. What is left on this screen for them — the abilities, the
        * base stats, the objective and its price — is the whole catalogue
        * entry, which is why that page no longer exists.
        */}
      {loadout.known && (
        <div className="border-t border-edge p-4">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
              {t('artifactsHeading')}
            </h2>
            {loadout.setCounts.map(([setId, count]) => {
              const set = catalog.artifacts.get(setId);
              const effects = setEffects(set);
              const label = (
                <>
                  {set?.name ?? `#${setId}`}{' '}
                  <span className={count >= 2 ? 'text-accent' : ''}>×{count}</span>
                </>
              );

              return (
                <EffectButton
                  key={setId}
                  title={set?.name ?? `#${setId}`}
                  lines={effects.map(formatSetEffect)}
                  hint={effects.length > 0 ? formatSetEffect(effects[0]) : ''}
                  closeLabel={common('close')}
                  className={`font-mono text-xs text-muted ${
                    effects.length > 0 ? 'underline decoration-edge-strong decoration-dotted underline-offset-2' : ''
                  }`}
                >
                  {label}
                </EffectButton>
              );
            })}
          </div>

          <ArtifactSlotSwitcher
            slots={SLOT_ORDER.map((slot) => {
              const piece = bySlot.get(slot) ?? null;
              return {
                key: slot,
                title: slotLabel.has(slot) ? slotLabel(slot) : slot,
                compact: <CompactSlotChip catalog={catalog} piece={piece} />,
                full: (
                  <ArtifactSlotCard
                    catalog={catalog}
                    slot={slot}
                    piece={piece}
                    locale={locale}
                    characterId={character.id}
                    buildId={buildId}
                    fits={fits}
                  />
                ),
              };
            })}
          />

          <ul className="hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-5">
            {SLOT_ORDER.map((slot) => (
              <ArtifactSlotCard
                key={slot}
                catalog={catalog}
                slot={slot}
                piece={bySlot.get(slot) ?? null}
                locale={locale}
                characterId={character.id}
                buildId={buildId}
                fits={fits}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** The slot's icon and level, nothing else — what the mobile row shows before
    a tap asks for the rest. */
function CompactSlotChip({ catalog, piece }: { catalog: Catalog; piece: LoadoutPiece | null }) {
  if (!piece) {
    return (
      <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-dashed border-edge text-muted">
        <Plus size={14} />
      </span>
    );
  }

  const set = catalog.artifacts.get(piece.setId);

  return (
    <span className="relative flex h-11 w-11 items-center justify-center rounded-lg field">
      <GameIcon
        filename={set?.pieces[piece.slot]?.icon}
        kind="relic"
        className="h-9 w-9"
        sizes="36px"
      />
      <span className="absolute -bottom-1 -right-1 rounded bg-ink px-1 font-mono text-2xs text-muted">
        +{piece.level}
      </span>
    </span>
  );
}

/**
 * One equipped slot, or the dashed gap where one is missing.
 *
 * The card is the shared one — the same drawing the box uses, see
 * `components/artifact-card.tsx` — so a piece cannot read one way here and
 * another way two screens over. What this page adds is the controls: they sit
 * over the card and appear on hover, which is why they are passed as children
 * rather than built into it.
 */
async function ArtifactSlotCard({
  catalog,
  slot,
  piece,
  locale,
  characterId,
  buildId,
  fits,
}: {
  catalog: Catalog;
  slot: string;
  piece: LoadoutPiece | null;
  locale: Locale;
  characterId: number;
  buildId: string | null;
  fits: Map<string, PieceFit>;
}) {
  const t = await getTranslations('build');
  const slotLabel = await getTranslations('common.slot');
  const title = slotLabel.has(slot) ? slotLabel(slot) : slot;

  const actions = (
    <GearActions
      characterId={characterId}
      locale={locale}
      buildId={buildId}
      slot={slot}
      title={title}
    />
  );

  if (!piece) {
    return (
      <EmptyArtifactSlot slot={slot as ArtifactSlot} label={title} emptyText={t('emptySlotText')}>
        {actions}
      </EmptyArtifactSlot>
    );
  }

  // The number every guide quotes. Computed here rather than stored, because a
  // loadout carries what the game reported and this is a reading of it.
  const crit = critValue(piece.substats);

  return (
    <ArtifactCard
      catalog={catalog}
      locale={locale}
      piece={{
        setId: piece.setId,
        slot: piece.slot,
        rarity: piece.rarity,
        level: piece.level,
        mainProp: piece.mainProp,
        mainValue: piece.mainValue,
        substats: piece.substats.map((substat) => ({
          prop: substat.prop,
          value: substat.value,
          rolls: substat.rolls,
        })),
        pendingSubstats: piece.unactivated,
        critValue: crit,
        critRating: critRating(crit),
      }}
      footer={fits.has(piece.instanceId) && (
        <div className="mt-2 flex items-center justify-end border-t border-edge pt-1.5">
          <EquippedFit fit={fits.get(piece.instanceId)} mainProp={piece.mainProp} catalog={catalog} />
        </div>
      )}
    >
      {actions}
    </ArtifactCard>
  );
}
