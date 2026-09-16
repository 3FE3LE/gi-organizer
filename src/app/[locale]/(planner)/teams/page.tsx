import { notFound } from 'next/navigation';

import { resolveIcon } from '@/lib/data/icon';
import { getCatalog, propLabel } from '@/lib/data/catalog';
import { ELEMENT_COLORS, elementColor } from '@/lib/data/elements';
import { roleLabel } from '@/lib/rules/role-labels';
import { isLocale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { readRoster } from '@/lib/player/characters';
import { resolveBuildForSlot } from '@/lib/player/builds';
import { readGear } from '@/lib/player/queries';
import { computeStats, evaluateGoals } from '@/lib/rules/stats';
import { getAnnotations } from '@/lib/rules/assemble';
import { getProfileId } from '@/lib/player/db';
import { MECHANICS, MECHANIC_IDS } from '@/lib/data/mechanics';
import { assemble } from '@/lib/rules/assemble';
import { describe, type Naming } from '@/lib/rules/messages/es';
import { targetKey } from '@/lib/rules/types';

import { TeamBoard, type SlotView, type TeamView } from './team-board';
import { TeamRail, type RailEntry } from './team-rail';

export const dynamic = 'force-dynamic';

const SLOT_LABELS: Record<string, string> = {
  flower: 'flor', plume: 'pluma', sands: 'arena', goblet: 'cáliz', circlet: 'diadema',
};

/**
 * Teams, and everything the rules say about them.
 *
 * The engine returns diagnostics bucketed by target, so each slot looks up its
 * own key rather than scanning a list — the difference between one pass and one
 * pass per slot once there are a dozen teams.
 */
export default async function TeamsPage({ params, searchParams }: PageProps<'/[locale]/teams'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const catalog = await getCatalog(locale);
  const db = getDb();
  const { teams, result, input } = await assemble(catalog, db);
  const annotations = await getAnnotations(catalog);

  const requested = (await searchParams).team;
  const selectedId = typeof requested === 'string' && teams.some((team) => team.id === requested)
    ? requested
    : teams[0]?.id ?? null;

  const naming: Naming = {
    character: (id) => catalog.characters.get(id)?.name ?? `#${id}`,
    weapon: (id) => catalog.weapons.get(id)?.name ?? `#${id}`,
    artifactSet: (id) => catalog.artifacts.get(id)?.name ?? `#${id}`,
    element: (type) => elementName(catalog, type),
    slot: (slot) => SLOT_LABELS[slot] ?? slot,
  };

  const findingsFor = (key: string) =>
    (result.byTarget.get(key) ?? []).map((diagnostic) => ({
      id: diagnostic.id,
      severity: diagnostic.severity,
      message: describe(diagnostic, naming),
    }));

  // Which declarations a slot is asked for comes from the rules that could
  // actually fire on it — including the piece count, so a single Viridescent
  // flower does not prompt for something no rule will ever read.
  const declarationFields = new Map<string, { setId: number; pieces: number }[]>();
  for (const rule of input.rules) {
    if (rule.kind !== 'non-stacking' || rule.partition.by !== 'declaration') continue;
    for (const provider of rule.providers) {
      if (provider.type !== 'artifact-set') continue;
      const field = rule.partition.field;
      declarationFields.set(field, [
        ...(declarationFields.get(field) ?? []),
        { setId: provider.setId, pieces: provider.pieces },
      ]);
    }
  }

  const elementOptions = Object.keys(ELEMENT_COLORS)
    .filter((type) => type !== 'ELEMENT_NONE' && type !== 'ELEMENT_ANEMO')
    .map((type) => ({ value: type, label: elementName(catalog, type) }));

  const bonusesBySet = new Map(
    [...annotations.sets]
      .filter(([, annotation]) => annotation.bonus2pc)
      .map(([setId, annotation]) => [setId, annotation.bonus2pc!]),
  );

  /** Everything a slot needs beyond its diagnostics: build, gear, thresholds. */
  const slotDetail = async (characterId: number, roles: SlotView['roles']) => {
    const character = catalog.characters.get(characterId);
    const build = await resolveBuildForSlot(characterId, roles, null, db);
    const gear = await readGear(characterId, db);
    const pieces = [...gear.bySlot.values()];

    const counts = new Map<number, number>();
    for (const piece of pieces) counts.set(piece.setId, (counts.get(piece.setId) ?? 0) + 1);

    const stats = character?.stats['90'];
    const weaponDefinition = gear.weapon
      ? catalog.weapons.get(gear.weapon.weaponId)
      : null;
    const weaponStats = weaponDefinition?.stats['90'];

    const totals = stats
      ? computeStats({
          character: { hp: stats.hp ?? 0, attack: stats.attack ?? 0, defense: stats.defense ?? 0 },
          ascension: character
            ? { prop: character.substatType, value: stats.specialized ?? 0 }
            : null,
          weapon: weaponDefinition && weaponStats
            ? {
                baseAttack: weaponStats.attack ?? 0,
                prop: weaponDefinition.mainStatType,
                value: weaponStats.specialized ?? 0,
              }
            : null,
          pieces,
          setBonuses: [...counts]
            .filter(([, count]) => count >= 2)
            .flatMap(([setId]) => bonusesBySet.get(setId) ?? []),
        }).totals
      : {};

    return {
      build,
      weapon: weaponDefinition
        ? `${weaponDefinition.name} R${gear.weapon?.refinement ?? 1}`
        : null,
      gear: [...counts]
        .sort((a, b) => b[1] - a[1])
        .map(([setId, count]) => `${catalog.artifacts.get(setId)?.name ?? setId} ×${count}`),
      goals: evaluateGoals(totals, build?.goals ?? []).map((goal) => ({
        label: propLabel(catalog, goal.prop),
        status: goal.status,
        actual: goal.actual,
        min: goal.min,
      })),
    };
  };

  /**
   * Everything that concerns one team.
   *
   * Not just the targets that name the team: a finding about a member — gear
   * missing pieces, a weapon over-allocated — is about the team too, and
   * counting only `team` and `team-slot` targets silently drops those. The
   * rail said "ok" on a team with an incomplete build until this was shared.
   */
  const diagnosticsForTeam = (team: (typeof teams)[number]) => {
    const members = new Set(team.slots.map((slot) => slot.characterId));

    return result.diagnostics.filter((diagnostic) =>
      diagnostic.targets.some((target) => {
        switch (target.kind) {
          case 'team':
          case 'team-slot':
            return target.teamId === team.id;
          case 'character':
          case 'weapon-slot':
          case 'artifact-slot':
            return members.has(target.characterId);
          default:
            return false;
        }
      }));
  };

  const rail: RailEntry[] = teams.map((team) => {
    const findings = diagnosticsForTeam(team);

    return {
      id: team.id,
      name: team.name,
      mode: team.mode,
      objectiveLabel: team.objective
        ? MECHANICS[team.objective as keyof typeof MECHANICS]?.label ?? team.objective
        : null,
      members: team.slots.length,
      errors: findings.filter((finding) => finding.severity === 'error').length,
      warnings: findings.filter((finding) => finding.severity === 'warning').length,
    };
  });

  const selectedTeam = teams.find((team) => team.id === selectedId) ?? null;
  const selectedDiagnostics = selectedTeam ? diagnosticsForTeam(selectedTeam) : [];

  const views: TeamView[] = await Promise.all(teams
    .filter((team) => team.id === selectedId)
    .map(async (team) => ({
    id: team.id,
    name: team.name,
    mode: team.mode,
    objective: team.objective,
    findings: findingsFor(targetKey({ kind: 'team', teamId: team.id })),
    slots: await Promise.all(team.slots.map(async (slot): Promise<SlotView> => {
      const character = catalog.characters.get(slot.characterId);
      const gear = input.gear.get(slot.characterId);
      const worn = new Map<number, number>();
      for (const setId of gear?.sets.values() ?? []) {
        worn.set(setId, (worn.get(setId) ?? 0) + 1);
      }

      const needed = [...declarationFields]
        .filter(([, providers]) =>
          providers.some((provider) => (worn.get(provider.setId) ?? 0) >= provider.pieces))
        .map(([field]) => ({ field, options: elementOptions }));

      const detail = await slotDetail(slot.characterId, slot.roles);

      return {
        characterId: slot.characterId,
        name: character?.name ?? `#${slot.characterId}`,
        icon: await resolveIcon(character?.icon, 'avatar'),
        element: character?.elementText ?? '',
        elementColor: elementColor(character?.elementType ?? 'ELEMENT_NONE'),
        buildName: detail.build ? roleLabel(detail.build.role) : null,
        gear: detail.gear,
        weapon: detail.weapon,
        goals: detail.goals,
        buildHref: `/${locale}/build/${slot.characterId}`,
        roles: slot.roles,
        declarations: slot.declarations,
        needed,
        findings: [
          ...findingsFor(targetKey({
            kind: 'team-slot', teamId: team.id, characterId: slot.characterId,
          })),
          ...findingsFor(targetKey({ kind: 'weapon-slot', characterId: slot.characterId })),
          ...findingsFor(targetKey({ kind: 'character', characterId: slot.characterId })),
        ],
      };
    })),
  })));

  const objectives = MECHANIC_IDS.map((id) => ({ id, label: MECHANICS[id].label }));

  // A character belongs to one team at a time, so the picker states who holds
  // each one rather than letting the add fail after the click.
  const teamOf = new Map<number, { id: string; name: string }>();
  for (const team of teams) {
    for (const slot of team.slots) {
      if (!teamOf.has(slot.characterId)) teamOf.set(slot.characterId, { id: team.id, name: team.name });
    }
  }

  const roster = (await readRoster(db, await getProfileId(db)))
    .map((entry) => catalog.characters.get(entry.characterId))
    .filter((character) => character !== undefined)
    .map((character) => ({
      id: character.id,
      name: character.name,
      detail: `${character.elementText} ${character.rarity}★`,
      inTeam: teamOf.get(character.id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <TeamRail locale={locale} teams={rail} selectedId={selectedId} />

      <main className="min-w-0 space-y-6">
        {views.length === 0 ? (
          <p className="max-w-prose text-sm text-muted">
            Ningún equipo todavía. Crea uno a la izquierda y añade personajes de tu roster.
          </p>
        ) : (
          views.map((team) => (
            <TeamBoard key={team.id} team={team} roster={roster} objectives={objectives} />
          ))
        )}

        {selectedDiagnostics.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
              Detectado en este equipo{' '}
              <span className="font-mono">{selectedDiagnostics.length}</span>
            </h2>
            <ul className="space-y-1">
              {selectedDiagnostics.map((diagnostic) => (
                <li
                  key={diagnostic.id}
                  className={`rounded border-l-2 border border-edge bg-surface px-3 py-1.5 text-xs ${
                    diagnostic.severity === 'error'
                      ? 'border-l-bad'
                      : diagnostic.severity === 'warning'
                        ? 'border-l-warn'
                        : 'border-l-edge-strong'
                  }`}
                >
                  <span className="font-mono text-muted">{diagnostic.code}</span>{' '}
                  {describe(diagnostic, naming)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function elementName(catalog: Awaited<ReturnType<typeof getCatalog>>, type: string) {
  for (const character of catalog.characters.values()) {
    if (character.elementType === type && character.elementText) return character.elementText;
  }
  return type.replace('ELEMENT_', '').toLowerCase();
}
