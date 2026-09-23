import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

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
import { MECHANIC_IDS } from '@/lib/data/mechanics';
import { assemble, getMechanics } from '@/lib/rules/assemble';
import { synergyOf, type SynergyMember } from '@/lib/rules/synergy';
import { describe, type Naming } from '@/lib/rules/diagnostics';
import { targetKey } from '@/lib/rules/types';

import { TeamBoard, type RosterEntry, type SlotView, type TeamView } from './team-board';
import { type SynergyView } from './synergy-panel';
import { TeamRail, type RailEntry } from './team-rail';

export const dynamic = 'force-dynamic';

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
  const mechanics = await getMechanics();
  const t = await getTranslations('diagnostics');
  const tTeams = await getTranslations('teams');
  const slotLabel = await getTranslations('common.slot');
  const roleLabelT = await getTranslations('common.role');
  const mechanicLabelT = await getTranslations('common.mechanic');

  // One pass over the catalog rather than one per lookup. `elementName` was a
  // linear scan of every character, and it is called once per element option
  // and again for every diagnostic that names an element.
  const elementNames = new Map<string, string>();
  for (const character of catalog.characters.values()) {
    if (character.elementText && !elementNames.has(character.elementType)) {
      elementNames.set(character.elementType, character.elementText);
    }
  }
  const elementName = (type: string) =>
    elementNames.get(type) ?? type.replace('ELEMENT_', '').toLowerCase();

  const requested = (await searchParams).team;
  const selectedId = typeof requested === 'string' && teams.some((team) => team.id === requested)
    ? requested
    : teams[0]?.id ?? null;

  const naming: Naming = {
    character: (id) => catalog.characters.get(id)?.name ?? `#${id}`,
    weapon: (id) => catalog.weapons.get(id)?.name ?? `#${id}`,
    artifactSet: (id) => catalog.artifacts.get(id)?.name ?? `#${id}`,
    element: (type) => elementName(type),
    slot: (slot) => (slotLabel.has(slot) ? slotLabel(slot) : slot),
  };

  const findingsFor = (key: string) =>
    (result.byTarget.get(key) ?? []).map((diagnostic) => ({
      id: diagnostic.id,
      severity: diagnostic.severity,
      message: describe(diagnostic, naming, t),
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
    .map((type) => ({ value: type, label: elementName(type) }));

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

  // Kept from the pass the rail already makes: `selectedDiagnostics` used to
  // filter every diagnostic a second time for a team whose findings were in
  // hand.
  const findingsByTeam = new Map<string, ReturnType<typeof diagnosticsForTeam>>();

  const rail: RailEntry[] = teams.map((team) => {
    const findings = diagnosticsForTeam(team);
    findingsByTeam.set(team.id, findings);

    return {
      id: team.id,
      name: team.name,
      mode: team.mode,
      objectiveLabel: team.objective
        ? (mechanicLabelT.has(team.objective) ? mechanicLabelT(team.objective) : team.objective)
        : null,
      members: team.slots.length,
      errors: findings.filter((finding) => finding.severity === 'error').length,
      warnings: findings.filter((finding) => finding.severity === 'warning').length,
    };
  });

  const selectedTeam = teams.find((team) => team.id === selectedId) ?? null;
  const selectedDiagnostics = selectedTeam ? findingsByTeam.get(selectedTeam.id) ?? [] : [];

  /**
   * Everything a character brings to a team beyond their own build: the element
   * that resonates, the mechanics their kit names, the sets they are wearing.
   *
   * The two sources of mechanic tags are kept together here because they answer
   * the same question from opposite directions — the generated index reads the
   * game's own text, and the curated file states the ones the text never says
   * out loud, such as the Hexenzirkel classification behind Hexerei.
   */
  const memberOf = (characterId: number): SynergyMember => {
    const character = catalog.characters.get(characterId);
    const worn = new Map<number, number>();
    for (const setId of input.gear.get(characterId)?.sets.values() ?? []) {
      worn.set(setId, (worn.get(setId) ?? 0) + 1);
    }

    return {
      characterId,
      elementType: character?.elementType ?? 'ELEMENT_NONE',
      mechanics: [...new Set([
        ...(mechanics.characters[String(characterId)] ?? []),
        ...(annotations.characters.get(characterId)?.mechanics ?? []),
      ])],
      sets: [...worn].map(([setId, pieces]) => ({ setId, pieces })),
    };
  };

  /** The engine's answer, with every id turned into something readable. */
  const synergyViewFor = (team: (typeof teams)[number]): SynergyView => {
    const members = team.slots.map((slot) => memberOf(slot.characterId));
    const synergy = synergyOf(members, {
      objective: team.objective,
      setStacking: (setId) => annotations.sets.get(setId)?.stacking,
      // A party aura is the four-piece bonus, except on the circlet-only sets
      // whose whole effect is one piece. The catalog is what knows which is
      // which: those sets carry `effect1Pc` and no two-piece line at all.
      auraAt: (setId) => {
        const set = catalog.artifacts.get(setId);
        return set?.effect1Pc && !set.effect2Pc ? 1 : 4;
      },
    });
    const name = (characterId: number) =>
      catalog.characters.get(characterId)?.name ?? `#${characterId}`;

    return {
      resonances: synergy.resonances.map((resonance) => ({
        id: resonance.id,
        color: elementColor(resonance.elementType ?? 'ELEMENT_NONE'),
        members: resonance.members.map(name),
      })),
      mechanics: synergy.mechanics.map((mechanic) => ({
        id: mechanic.id,
        label: mechanicLabelT.has(mechanic.id) ? mechanicLabelT(mechanic.id) : mechanic.id,
        active: mechanic.active,
        objective: mechanic.objective,
        missing: mechanic.missing
          .filter((element) => element !== 'any')
          .map((element) => elementName(element)),
        missingAny: mechanic.missing.includes('any'),
        carriers: mechanic.carriers.map(name),
      })),
      auras: synergy.auras.map((aura) => {
        const set = catalog.artifacts.get(aura.setId);

        return {
          key: `${aura.setId}-${aura.wearer}`,
          setName: set?.name ?? `#${aura.setId}`,
          pieces: aura.pieces,
          // The game's own words, at the piece count actually worn: four pieces
          // on and the two-piece line is not what anyone is reading for.
          effect: (aura.pieces >= 4 ? set?.effect4Pc : set?.effect2Pc)
            ?? set?.effect1Pc ?? null,
          wearer: name(aura.wearer),
          partitioned: aura.partitioned,
          alsoWornBy: aura.alsoWornBy.map(name),
        };
      }),
    };
  };

  // One team is on screen, and it is the one already found above.
  const views: TeamView[] = await Promise.all((selectedTeam ? [selectedTeam] : [])
    .map(async (team) => ({
    id: team.id,
    name: team.name,
    mode: team.mode,
    objective: team.objective,
    findings: findingsFor(targetKey({ kind: 'team', teamId: team.id })),
    synergy: synergyViewFor(team),
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
        buildName: detail.build ? roleLabel(roleLabelT, detail.build.role) : null,
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

  const objectives = MECHANIC_IDS.map((id) => ({ id, label: mechanicLabelT(id) }));

  // A character belongs to one team at a time, so the picker states who holds
  // each one rather than letting the add fail after the click.
  const teamOf = new Map<number, { id: string; name: string }>();
  for (const team of teams) {
    for (const slot of team.slots) {
      if (!teamOf.has(slot.characterId)) teamOf.set(slot.characterId, { id: team.id, name: team.name });
    }
  }

  // Grouped by element in the picker, so the order is the element's first and
  // the name's second: the same order the game's own party screen filters by.
  const elementOrder = Object.keys(ELEMENT_COLORS);
  const owned = (await readRoster(db, await getProfileId(db)))
    .map((entry) => catalog.characters.get(entry.characterId))
    .filter((character) => character !== undefined)
    .sort((a, b) =>
      elementOrder.indexOf(a.elementType) - elementOrder.indexOf(b.elementType)
      || a.name.localeCompare(b.name, locale));
  const roster: RosterEntry[] = await Promise.all(owned.map(async (character) => ({
    id: character.id,
    name: character.name,
    icon: await resolveIcon(character.icon, 'avatar'),
    rarity: character.rarity,
    element: elementName(character.elementType),
    elementColor: elementColor(character.elementType),
    inTeam: teamOf.get(character.id) ?? null,
  })));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <TeamRail locale={locale} teams={rail} selectedId={selectedId} />

        {/* Not a `<main>`: the layout already owns that landmark, and two of
            them on a page means neither is the main one. */}
        <div className="min-w-0 space-y-6">
          {views.length === 0 ? (
            <p className="max-w-prose text-sm text-muted">{tTeams('empty')}</p>
          ) : (
            views.map((team) => (
              <TeamBoard key={team.id} team={team} roster={roster} objectives={objectives} />
            ))
          )}

          {selectedDiagnostics.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
                {tTeams('detectedHeading')}{' '}
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
                    {describe(diagnostic, naming, t)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

