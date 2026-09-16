import Link from 'next/link';

import { CreateTeam } from './create-team';

export type RailEntry = {
  id: string;
  name: string;
  mode: string;
  objectiveLabel: string | null;
  members: number;
  errors: number;
  warnings: number;
};

const MODE_LABEL: Record<string, string> = {
  abyss: 'Abismo', theater: 'Teatro', stygian: 'Stygian', other: 'Otro',
};

/**
 * The team list.
 *
 * Its job is to make choosing a team cheap and to say, before you click, which
 * one needs attention — a rail that only lists names makes you open all of them
 * to find the broken one.
 */
export function TeamRail({
  locale,
  teams,
  selectedId,
}: {
  locale: string;
  teams: RailEntry[];
  selectedId: string | null;
}) {
  return (
    <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
      <h1 className="text-lg font-medium">
        Equipos <span className="font-mono text-sm text-muted">{teams.length}</span>
      </h1>

      <ul className="space-y-1">
        {teams.map((team) => {
          const selected = team.id === selectedId;

          return (
            <li key={team.id}>
              <Link
                href={`/${locale}/teams?team=${team.id}`}
                aria-current={selected ? 'true' : undefined}
                className={`block rounded border px-3 py-2 transition-colors ${
                  selected
                    ? 'border-accent bg-surface-2'
                    : 'border-edge bg-surface hover:border-edge-strong'
                }`}
              >
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{team.name}</span>
                  <span className="tabular font-mono text-xs text-muted">{team.members}/4</span>
                </span>
                <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-mono text-[0.65rem] text-muted">
                  <span>{MODE_LABEL[team.mode] ?? team.mode}</span>
                  {team.objectiveLabel && <span className="text-accent">{team.objectiveLabel}</span>}
                  {team.errors > 0 && <span className="text-bad">{team.errors} ✗</span>}
                  {team.warnings > 0 && <span className="text-warn">{team.warnings} !</span>}
                  {team.errors === 0 && team.warnings === 0 && team.members === 4 && (
                    <span className="text-good">ok</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="rounded border border-edge bg-surface p-3">
        <CreateTeam />
      </div>
    </aside>
  );
}
