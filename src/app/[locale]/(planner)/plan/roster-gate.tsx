import { RotateCcw, X } from 'lucide-react';

import type { Catalog } from '@/lib/data/catalog';

import { dismissRoster, restoreRoster } from './roster-actions';

/**
 * Who the plan is for, and who it is not.
 *
 * With nothing written down the planner assumes every owned character is
 * headed for the cap, because sixty characters with no stated target still
 * have sixty characters' worth of demand. That is the honest reading and it is
 * also every material in the game on the first screen, which nobody can act on.
 *
 * So this is where the list gets cut down. Everything is in by default and the
 * player says no — the opposite way round from asking them to opt sixty
 * characters in one at a time, which is the version nobody finishes.
 */
export function RosterGate({
  catalog,
  roster,
}: {
  catalog: Catalog;
  roster: { characterId: number; hasTarget: boolean; dismissed: boolean }[];
}) {
  const named = roster
    .map((entry) => ({
      ...entry,
      name: catalog.characters.get(entry.characterId)?.name ?? `#${entry.characterId}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const planned = named.filter((entry) => !entry.dismissed);
  const dismissed = named.filter((entry) => entry.dismissed);

  if (named.length === 0) return null;

  return (
    <details className="group rounded-lg border border-edge bg-surface" open={planned.length > 0 && dismissed.length === 0}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
        <span className="font-mono text-[0.65rem] uppercase text-muted">en el plan</span>
        <span>
          <span className="text-accent">{planned.length}</span>
          <span className="text-muted"> de {named.length}</span>
        </span>
        {dismissed.length > 0 && (
          <span className="text-muted">· {dismissed.length} descartados</span>
        )}
        <span className="ml-auto font-mono text-[0.6rem] uppercase text-muted group-open:hidden">
          elegir
        </span>
      </summary>

      <div className="space-y-3 border-t border-edge px-3 py-3">
        <p className="max-w-prose text-xs leading-relaxed text-muted">
          Sin un objetivo escrito, el plan asume que cada personaje va a nivel 90 con
          los talentos a 9. Descarta a quien no estés subiendo y su demanda desaparece
          del total, no solo de la vista.
        </p>

        <div className="flex flex-wrap gap-2">
          <Bulk action={dismissRoster} disabled={planned.length === 0}>
            <X size={11} /> descartar todos
          </Bulk>
          <Bulk action={restoreRoster} disabled={dismissed.length === 0}>
            <RotateCcw size={11} /> restaurar todos
          </Bulk>
        </div>

        <ul className="flex flex-wrap gap-1.5">
          {named.map((entry) => (
            <li key={entry.characterId}>
              <form action={entry.dismissed ? restoreRoster.bind(null, entry.characterId) : dismissRoster.bind(null, entry.characterId)}>
                <button
                  type="submit"
                  title={entry.dismissed ? 'Volver a incluirlo' : 'Descartarlo del plan'}
                  className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[0.7rem] transition-colors ${
                    entry.dismissed
                      ? 'border-edge text-muted line-through hover:border-accent hover:text-text'
                      : 'border-accent bg-surface-2 text-accent hover:border-bad hover:text-bad'
                  }`}
                >
                  {entry.name}
                  {/* A character with a target of their own was planned for on
                      purpose, so the assumption is not what is driving them. */}
                  {entry.hasTarget && !entry.dismissed && <span className="text-[0.55rem]">●</span>}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function Bulk({
  action,
  disabled,
  children,
}: {
  action: (characterId: number | null) => Promise<void>;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={action.bind(null, null)}>
      <button
        type="submit"
        disabled={disabled}
        className="flex items-center gap-1.5 rounded border border-edge px-2.5 py-1 font-mono text-[0.65rem] uppercase text-muted transition-colors hover:border-accent hover:text-text disabled:opacity-40"
      >
        {children}
      </button>
    </form>
  );
}
