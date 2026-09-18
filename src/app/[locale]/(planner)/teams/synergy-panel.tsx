'use client';

import { useTranslations } from 'next-intl';

/**
 * What the team is, beside what is wrong with it.
 *
 * The findings under each slot are faults; this is the other half — the
 * resonance the elements buy, the reactions those same elements enable, and
 * the set bonuses one member is hanging over the other three. All of it is
 * computed in `lib/rules/synergy.ts` and arrives here as ids and names, so this
 * file only decides what is worth reading first.
 *
 * Read top to bottom it answers the three questions in the order a team is
 * built: what the party gets for free, what it can do, and what its gear does
 * for everyone else.
 */
export type SynergyView = {
  resonances: {
    id: string;
    /** The element's accent, or the neutral one for Protective Canopy. */
    color: string;
    members: string[];
  }[];
  mechanics: {
    id: string;
    label: string;
    active: boolean;
    objective: boolean;
    /** Element names the team does not field. */
    missing: string[];
    /** Whether it also wants any element at all to react with. */
    missingAny: boolean;
    carriers: string[];
  }[];
  auras: {
    key: string;
    setName: string;
    pieces: number;
    /** The game's own words for the bonus at this piece count. */
    effect: string | null;
    wearer: string;
    partitioned: boolean;
    alsoWornBy: string[];
  }[];
};

export function SynergyPanel({ synergy }: { synergy: SynergyView }) {
  const t = useTranslations('teams');
  const resonanceName = useTranslations('common.resonance');
  const resonanceEffect = useTranslations('common.resonanceEffect');

  return (
    <section className="space-y-3 border-b border-edge px-4 py-3">
      <h3 className="text-2xs font-medium uppercase tracking-wide text-muted">
        {t('synergyHeading')}
      </h3>

      <div className="grid gap-3 lg:grid-cols-3">
        <Group title={t('resonanceHeading')}>
          {synergy.resonances.length === 0 ? (
            <Empty>{t('noResonance')}</Empty>
          ) : (
            synergy.resonances.map((resonance) => (
              <div
                key={resonance.id}
                className="rounded border border-edge border-l-2 bg-surface-2 px-2 py-1.5"
                style={{ borderLeftColor: resonance.color }}
              >
                <p className="text-xs">{resonanceName(resonance.id)}</p>
                <p className="mt-0.5 text-2xs leading-snug text-muted">
                  {resonanceEffect(resonance.id)}
                </p>
                <p className="mt-0.5 font-mono text-2xs text-muted">
                  {resonance.members.join(' · ')}
                </p>
              </div>
            ))
          )}
        </Group>

        <Group title={t('mechanicsHeading')}>
          {synergy.mechanics.length === 0 ? (
            <Empty>{t('noMechanics')}</Empty>
          ) : (
            /* Chips rather than rows: a Dendro team fields six reactions, and
               six paragraphs of "who brings this" is a wall in front of the
               one line that matters. What a chip cannot say — the element the
               team is short of, the second member who agrees — is said under
               it, and only by the chips that have something to say. */
            <ul className="flex flex-wrap gap-1">
              {synergy.mechanics.map((mechanic) => (
                <li
                  key={mechanic.id}
                  className={`rounded border px-1.5 py-0.5 text-2xs ${
                    mechanic.objective
                      ? 'border-accent text-accent'
                      : mechanic.active
                        ? 'border-edge text-text'
                        : 'border-dashed border-edge text-muted'
                  }`}
                >
                  {mechanic.label}
                  {mechanic.objective && (
                    <span className="ml-1 font-mono uppercase text-accent">
                      {t('mechanicObjective')}
                    </span>
                  )}
                  {!mechanic.active && (
                    <span className="ml-1 font-mono text-warn">
                      {t('mechanicMissing', {
                        elements: [
                          ...mechanic.missing,
                          ...(mechanic.missingAny ? [t('mechanicMissingAny')] : []),
                        ].join(', '),
                      })}
                    </span>
                  )}
                  {/* One carrier is that character's own kit. Two is the team
                      agreeing on something, which is the synergy worth naming. */}
                  {mechanic.carriers.length > 1 && (
                    <span className="ml-1 font-mono text-muted">
                      {t('mechanicCarriers', { names: mechanic.carriers.join(' · ') })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Group>

        <Group title={t('aurasHeading')}>
          {synergy.auras.length === 0 ? (
            <Empty>{t('noAuras')}</Empty>
          ) : (
            synergy.auras.map((aura) => (
              <div key={aura.key} className="rounded border border-edge bg-surface-2 px-2 py-1.5">
                <p className="text-xs">
                  {t('auraPieces', { pieces: aura.pieces, name: aura.setName })}{' '}
                  <span className="font-mono text-2xs text-muted">
                    {t('auraWearer', { name: aura.wearer })}
                  </span>
                </p>
                {aura.effect && (
                  <p className="mt-0.5 text-2xs leading-snug text-muted">{aura.effect}</p>
                )}
                {/* The duplicate is already an error under the slot that wears
                    it; here it is the reason this aura is worth less than it
                    looks, which is a different thing to know. */}
                {aura.alsoWornBy.length > 0 && (
                  <p className="mt-0.5 font-mono text-2xs text-warn">
                    {t(aura.partitioned ? 'auraPartitioned' : 'auraShared', {
                      names: aura.alsoWornBy.join(' · '),
                    })}
                  </p>
                )}
              </div>
            ))
          )}
        </Group>
      </div>
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="font-mono text-2xs uppercase tracking-wide text-muted">{title}</h4>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-2xs leading-snug text-muted">{children}</p>;
}
