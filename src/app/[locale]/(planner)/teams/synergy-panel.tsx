'use client';

import { useTranslations } from 'next-intl';

import { AssetImage } from '@/components/asset-image';
import { ElementIcon } from '@/components/element-icon';
import { Hint } from '@/components/hint';
import { StatusIcon, statusTone } from '@/components/status-icon';
import { Fold, FoldGroup } from '@/components/fold';

/**
 * What the team is, beside what is wrong with it.
 *
 * The findings under each slot are faults; this is the other half — the
 * resonance the elements buy, whether the reaction it was built for fires, and
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
    /** The game's element enum, for its emblem. `null` for Protective Canopy. */
    element: string | null;
    members: string[];
  }[];
  /** The mechanic the team was built for, or null when it names none. */
  objective: {
    label: string;
    active: boolean;
    /** Who makes it happen: its carriers and whoever fields an element it uses. */
    enablers: { characterId: number; name: string; icon: string | null }[];
  } | null;
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
      <h3 className="font-mono text-2xs uppercase tracking-wide text-muted">
        {t('synergyHeading')}
      </h3>

      {/*
        * One accordion over the whole panel, so one effect is open at a time.
        *
        * The effects are the game's own paragraphs — a four-piece bonus runs
        * to five lines — and printed open they made the auras column the
        * tallest thing on the page for text most players already know. Each
        * is a line now, its wearer beside it, and opens for whoever wants to
        * read it; opening another closes the last, so the panel never grows
        * by more than one paragraph.
        */}
      <FoldGroup className="grid gap-3 lg:grid-cols-3">
        <Group title={t('resonanceHeading')}>
          {synergy.resonances.length === 0 ? (
            <Empty>{t('noResonance')}</Empty>
          ) : (
            synergy.resonances.map((resonance) => (
              <Effect
                key={resonance.id}
                accent={resonance.color}
                icon={resonance.element ? <ElementIcon element={resonance.element} /> : null}
                title={resonanceName(resonance.id)}
                detail={resonance.members.join(' · ')}
              >
                {resonanceEffect(resonance.id)}
              </Effect>
            ))
          )}
        </Group>

        {/* Only the objective, as a verdict: it fires or it does not. The
            other reactions the elements happen to allow answered nothing the
            player asked, and a list of who brings each one ran off the card
            once three members carried the same thing. */}
        <Group title={t('objectiveMechanicHeading')}>
          {synergy.objective === null ? (
            <Empty>{t('noObjectiveMechanic')}</Empty>
          ) : (
            <ObjectiveMechanic objective={synergy.objective} />
          )}
        </Group>

        <Group title={t('aurasHeading')}>
          {synergy.auras.length === 0 ? (
            <Empty>{t('noAuras')}</Empty>
          ) : (
            synergy.auras.map((aura) => (
              <Effect
                key={aura.key}
                title={t('auraPieces', { pieces: aura.pieces, name: aura.setName })}
                detail={t('auraWearer', { name: aura.wearer })}
                // The duplicate is already an error under the slot that wears
                // it; here it is the reason this aura is worth less than it
                // looks, so it stays on the closed line where it is seen.
                warning={aura.alsoWornBy.length > 0
                  ? t(aura.partitioned ? 'auraPartitioned' : 'auraShared', {
                      names: aura.alsoWornBy.join(' · '),
                    })
                  : null}
              >
                {aura.effect}
              </Effect>
            ))
          )}
        </Group>
      </FoldGroup>
    </section>
  );
}

/** The objective's name in green with the faces that enable it, or in red. */
function ObjectiveMechanic({ objective }: { objective: NonNullable<SynergyView['objective']> }) {
  const t = useTranslations('teams');
  const status = objective.active ? 'met' : 'short';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <p className={`flex items-center gap-1.5 text-xs ${statusTone(status)}`}>
        <StatusIcon status={status} size={14} />
        {objective.label}
        <span className="sr-only">
          : {t(objective.active ? 'objectiveMechanicMet' : 'objectiveMechanicUnmet')}
        </span>
      </p>
      {objective.active && objective.enablers.length > 0 && (
        <ul className="flex -space-x-1.5">
          {objective.enablers.map((enabler) => (
            <li key={enabler.characterId}>
              {/* Not a link, so a real tooltip; focusable so a keyboard
                  reaches the name too. */}
              <Hint text={enabler.name}>
                <span
                  tabIndex={0}
                  className="block rounded-full ring-2 ring-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                >
                  <AssetImage
                    src={enabler.icon}
                    kind="avatar"
                    alt={enabler.name}
                    className="h-6 w-6 rounded-full bg-surface-2"
                    sizes="24px"
                  />
                </span>
              </Hint>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One effect: its name and who brings it on a line, the paragraph behind a tap. */
function Effect({
  title,
  detail,
  accent,
  icon = null,
  warning = null,
  children,
}: {
  title: string;
  detail: string;
  accent?: string;
  /** Drawn before the title: a resonance's element. */
  icon?: React.ReactNode;
  warning?: string | null;
  children: React.ReactNode;
}) {
  const summary = (
    <>
      {icon && <span className="self-start pt-px">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block">{title}</span>
        <span className="block font-mono text-2xs text-muted">{detail}</span>
        {warning && <span className="block font-mono text-2xs text-warn">{warning}</span>}
      </span>
    </>
  );

  // The plan piles' fold at a smaller size: the same card, mark and rule.
  const frame = 'rounded border border-edge bg-surface-2';
  const style = accent ? { borderLeftWidth: 2, borderLeftColor: accent } : undefined;

  if (!children) {
    return (
      <div className={`${frame} flex items-center gap-2 px-2 py-1.5 text-xs`} style={style}>
        {summary}
      </div>
    );
  }

  return (
    <Fold
      look="bare"
      className={frame}
      style={style}
      triggerClassName="gap-2 px-2 py-1.5 text-xs"
      panelClassName="border-t border-edge/60 px-2 py-2 text-2xs leading-snug text-muted"
      summary={summary}
    >
      {children}
    </Fold>
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
