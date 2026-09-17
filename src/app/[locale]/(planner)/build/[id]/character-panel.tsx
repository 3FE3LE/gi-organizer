import { getTranslations } from 'next-intl/server';

import { GameIcon } from '@/components/game-icon';
import { type Catalog, enkaEntry, propLabel } from '@/lib/data/catalog';
import { elementColor, elementDamageProp } from '@/lib/data/elements';
import type { Locale } from '@/lib/data/locales';
import { formatPropValue, isPercentProp } from '@/lib/data/props';
import { getCharacterDetailStrings } from '@/lib/data/registry';
import type { CharacterView } from '@/lib/data/types';
import type { Loadout, LoadoutPiece } from '@/lib/player/loadout';
import { critRating, critValue } from '@/lib/rules/rolls';

import { GearActions } from './gear-actions';

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

/** Loud only where it earns it. */
const CRIT_TONE: Record<ReturnType<typeof critRating>, string> = {
  ninguno: 'text-muted',
  bajo: 'text-muted',
  normal: 'text-text',
  bueno: 'text-good',
  'muy bueno': 'text-good',
  excelente: 'text-accent',
};

export async function CharacterPanel({
  catalog,
  character,
  loadout,
  locale,
  buildId,
}: {
  catalog: Catalog;
  character: CharacterView;
  loadout: Loadout;
  locale: Locale;
  /** The goal the candidate lists are scored against, when one is open. */
  buildId: string | null;
}) {
  const detail = await getCharacterDetailStrings(locale, character.id);
  const entry = enkaEntry(catalog, character.id, loadout.skillDepotId);
  const accent = elementColor(character.elementType);
  const t = await getTranslations('build');

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

  const talents = [0, 1, 2].map((index) => ({
    icon: talentIcons[index] ?? null,
    name: talentNames[index] ?? t('talentFallback', { n: index + 1 }),
    level: talentLevels[index],
    bonus: talentBonus[index],
  }));

  const constellationIcons = entry?.constellationIcons ?? [];
  const constellations = (detail.constellation?.levels ?? constellationIcons).map(
    (_, index) => ({
      icon: constellationIcons[index] ?? null,
      name: detail.constellation?.levels[index]?.name ?? `C${index + 1}`,
      unlocked: index < loadout.constellation,
    }),
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

  const value = (prop: string) => loadout.totals[prop] ?? 0;

  const weaponDefinition = loadout.weapon
    ? catalog.weapons.get(loadout.weapon.weaponId)
    : undefined;

  const bySlot = new Map(loadout.pieces.map((piece) => [piece.slot, piece]));

  return (
    <section className="overflow-hidden rounded-xl border border-edge bg-surface">
      <div className="grid lg:grid-cols-[20rem_1fr]">
        <div className="relative border-b border-edge lg:border-b-0 lg:border-r">
          <div className="relative h-72 overflow-hidden">
            <GameIcon
              filename={character.gachaSplash}
              kind="splash"
              className="h-full w-full object-cover object-top"
              sizes="320px"
              priority
            />
            {/* The art bleeds into the panel instead of ending on a hard edge. */}
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />

            {constellations.length > 0 && (
              <ol className="absolute right-2 top-3 space-y-1.5">
                {constellations.map((constellation, index) => (
                  <li
                    key={index}
                    title={`C${index + 1} · ${constellation.name}`}
                    className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                      constellation.unlocked
                        ? 'border-accent bg-ink/80'
                        : 'border-edge bg-ink/60 opacity-40 grayscale'
                    }`}
                  >
                    {constellation.icon ? (
                      <GameIcon
                        filename={constellation.icon}
                        kind="constellation"
                        className="h-5 w-5"
                        sizes="20px"
                      />
                    ) : (
                      <span className="font-mono text-[0.65rem] text-muted">C{index + 1}</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {talents.length > 0 && (
            <ul className="flex justify-center gap-2 px-3 pb-3">
              {talents.map((talent, index) => (
                <li
                  key={index}
                  title={talent.name}
                  className="flex flex-col items-center gap-1"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-edge bg-ink">
                    {talent.icon ? (
                      <GameIcon
                        filename={talent.icon}
                        kind="talent"
                        className="h-6 w-6"
                        sizes="24px"
                      />
                    ) : (
                      <span className="font-mono text-[0.65rem] text-muted">
                        {['N', 'E', 'Q'][index]}
                      </span>
                    )}
                  </span>
                  <span className="tabular font-mono text-[0.65rem]">
                    {talent.level}
                    {talent.bonus > 0 && <span className="text-accent">+{talent.bonus}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 p-4">
          <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-lg font-medium">{character.name}</h1>
            <span className="rounded border border-edge bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
              {t('levelPrefix')} {loadout.level}
            </span>
            <span className="font-mono text-xs" style={{ color: accent }}>
              {'★'.repeat(character.rarity)}
            </span>
            <span className="font-mono text-xs uppercase text-muted">
              {character.elementText} · {character.weaponText}
            </span>
            {!loadout.known && (
              <span className="font-mono text-xs text-warn">{t('noSheetInRoster')}</span>
            )}
          </header>

          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            {t('characterAttributes')}
          </h3>
          <dl className="grid gap-x-6 sm:grid-cols-2">
            <StatRow
              label={propLabel(catalog, 'FIGHT_PROP_HP')}
              total={value('FIGHT_PROP_HP')}
              base={loadout.base.hp}
              locale={locale}
            />
            <StatRow
              label={propLabel(catalog, 'FIGHT_PROP_CRITICAL')}
              prop="FIGHT_PROP_CRITICAL"
              total={value('FIGHT_PROP_CRITICAL')}
              locale={locale}
            />
            <StatRow
              label={propLabel(catalog, 'FIGHT_PROP_ATTACK')}
              total={value('FIGHT_PROP_ATTACK')}
              base={loadout.base.attack}
              locale={locale}
            />
            <StatRow
              label={propLabel(catalog, 'FIGHT_PROP_CRITICAL_HURT')}
              prop="FIGHT_PROP_CRITICAL_HURT"
              total={value('FIGHT_PROP_CRITICAL_HURT')}
              locale={locale}
            />
            <StatRow
              label={propLabel(catalog, 'FIGHT_PROP_DEFENSE')}
              total={value('FIGHT_PROP_DEFENSE')}
              base={loadout.base.defense}
              locale={locale}
            />
            <StatRow
              label={propLabel(catalog, 'FIGHT_PROP_HEAL_ADD')}
              prop="FIGHT_PROP_HEAL_ADD"
              total={value('FIGHT_PROP_HEAL_ADD')}
              locale={locale}
            />
            <StatRow
              label={propLabel(catalog, 'FIGHT_PROP_ELEMENT_MASTERY')}
              prop="FIGHT_PROP_ELEMENT_MASTERY"
              total={value('FIGHT_PROP_ELEMENT_MASTERY')}
              locale={locale}
            />
            <StatRow
              label={propLabel(catalog, 'FIGHT_PROP_CHARGE_EFFICIENCY')}
              prop="FIGHT_PROP_CHARGE_EFFICIENCY"
              total={value('FIGHT_PROP_CHARGE_EFFICIENCY')}
              locale={locale}
            />
            {damageProp && (
              <StatRow
                label={propLabel(catalog, damageProp)}
                prop={damageProp}
                total={value(damageProp)}
                locale={locale}
                accent={accent}
              />
            )}
            {otherDamage.map((prop) => (
              <StatRow
                key={prop}
                label={propLabel(catalog, prop)}
                prop={prop}
                total={value(prop)}
                locale={locale}
              />
            ))}
          </dl>

          <h3 className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-muted">
            {t('weaponHeading')}
          </h3>
          {loadout.weapon && weaponDefinition ? (
            <div className="group relative flex items-center gap-3 rounded-lg border border-edge bg-surface-2 p-3">
              <div className="relative shrink-0">
                <GameIcon
                  filename={weaponDefinition.icon}
                  kind="weapon"
                  className="h-14 w-14 rounded border border-edge bg-ink"
                  sizes="56px"
                />
                <span className="absolute -left-1 -top-1 rounded bg-ink px-1 font-mono text-[0.65rem] text-accent">
                  R{loadout.weapon.refinement}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm">{weaponDefinition.name}</span>
                  <span className="rounded border border-edge px-1 font-mono text-[0.65rem] text-muted">
                    {t('levelPrefix')} {loadout.weapon.level}
                  </span>
                  <span className="font-mono text-[0.65rem] text-accent">
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
        </div>
      </div>

      <div className="border-t border-edge p-4">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
            {t('artifactsHeading')}
          </h3>
          {loadout.setCounts.map(([setId, count]) => (
            <span key={setId} className="font-mono text-xs text-muted">
              {catalog.artifacts.get(setId)?.name ?? `#${setId}`}{' '}
              <span className={count >= 2 ? 'text-accent' : ''}>×{count}</span>
            </span>
          ))}
        </div>

        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {SLOT_ORDER.map((slot) => (
            <ArtifactCard
              key={slot}
              catalog={catalog}
              slot={slot}
              piece={bySlot.get(slot) ?? null}
              locale={locale}
              characterId={character.id}
              buildId={buildId}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * One attribute row.
 *
 * `base` splits the total the way the game does — the white base and the green
 * bonus stacked next to the final number — which is the only way to see whether
 * a total comes from the character or from the gear.
 */
function StatRow({
  label,
  prop,
  total,
  base,
  locale,
  accent,
}: {
  label: string;
  prop?: string;
  total: number;
  base?: number;
  locale: Locale;
  accent?: string;
}) {
  const formatted = prop
    ? formatPropValue(prop, total, 'percent', locale)
    : Math.round(total).toLocaleString(locale);

  return (
    <div className="flex items-center justify-between gap-3 border-b border-edge/50 py-1.5">
      <dt className="truncate text-xs text-muted">{label}</dt>
      <dd className="tabular flex items-baseline gap-2 font-mono">
        {base !== undefined && (
          <span className="flex flex-col items-end text-[0.6rem] leading-tight">
            <span className="text-muted">{Math.round(base).toLocaleString(locale)}</span>
            <span className="text-good">
              +{Math.round(total - base).toLocaleString(locale)}
            </span>
          </span>
        )}
        <span className="text-sm" style={accent ? { color: accent } : undefined}>
          {formatted}
        </span>
      </dd>
    </div>
  );
}

async function ArtifactCard({
  catalog,
  slot,
  piece,
  locale,
  characterId,
  buildId,
}: {
  catalog: Catalog;
  slot: string;
  piece: LoadoutPiece | null;
  locale: Locale;
  characterId: number;
  buildId: string | null;
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
      <li className="group relative rounded-lg border border-dashed border-edge p-3 text-xs text-muted">
        {title} · {t('emptySlotText')}
        {actions}
      </li>
    );
  }

  const set = catalog.artifacts.get(piece.setId);

  // The number every guide quotes, next to the rolls it is made of. Only when
  // there is one: a zero on a mastery piece reads as a verdict, and it is not.
  const crit = critValue(piece.substats);
  const rating = critRating(crit);
  const critRatingLabel = await getTranslations('common.critRating');

  return (
    <li className="group relative flex flex-col rounded-lg border border-edge bg-surface-2 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs" title={set?.name ?? undefined}>
            {set?.pieces[piece.slot]?.name ?? set?.name ?? `#${piece.setId}`}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[0.65rem]">
            <span className="rounded bg-ink px-1 text-muted">{t('levelPrefix')} {piece.level}</span>
            <span className="text-accent">{'★'.repeat(piece.rarity)}</span>
            {crit > 0 && (
              <span
                className={`tabular ${CRIT_TONE[rating]}`}
                title={t('critValueHint', { value: crit.toFixed(1), rating: critRatingLabel(rating) })}
              >
                CV {crit.toFixed(1)}
              </span>
            )}
          </p>
        </div>
        <GameIcon
          filename={set?.pieces[piece.slot]?.icon}
          kind="relic"
          className="h-9 w-9 shrink-0"
          sizes="36px"
        />
      </div>

      <p className="mt-3 flex items-baseline justify-between gap-2 border-b border-edge pb-2">
        <span className="truncate text-xs text-muted">{propLabel(catalog, piece.mainProp)}</span>
        <span className="tabular font-mono text-base">
          {formatPropValue(piece.mainProp, piece.mainValue, 'percent', locale)}
        </span>
      </p>

      <ul className="mt-2 space-y-1">
        {piece.substats.map((substat) => (
          <li key={substat.prop} className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-baseline gap-1">
              <span className="truncate text-[0.7rem] text-muted">
                {propLabel(catalog, substat.prop)}
              </span>
              {/* Rolls, not value: the badge the game shows on an upgraded piece. */}
              {substat.rolls >= 1 && (
                <span className="rounded bg-ink px-1 font-mono text-[0.6rem] text-muted">
                  {Math.floor(substat.rolls)}
                </span>
              )}
            </span>
            <span
              className={`tabular font-mono text-xs ${
                isPercentProp(substat.prop) ? 'text-accent' : ''
              }`}
            >
              +{formatPropValue(substat.prop, substat.value, 'percent', locale)}
            </span>
          </li>
        ))}
      </ul>

      {actions}
    </li>
  );
}
