import { notFound } from 'next/navigation';

import { GameIcon } from '@/components/game-icon';
import { getCatalog } from '@/lib/data/catalog';
import { isLocale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { readRoster } from '@/lib/player/characters';
import { getProfileId, readInventory } from '@/lib/player/db';


/**
 * Reading SQLite touches no request API, so Next would happily prerender this
 * page and bake the counts into the build. The player's inventory is the one
 * thing on this site that must never be a build artifact.
 */
export const dynamic = 'force-dynamic';

/**
 * What the player owns, and what the inventory cannot explain.
 *
 * The second part is the one that earns its place: a scan reads gear and the
 * character screen separately, so it can report a piece equipped on someone it
 * never recorded. Left unsaid, that gear looks assigned to nobody.
 */
export default async function InventoryPage({ params }: PageProps<'/[locale]/datos'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const catalog = await getCatalog(locale);
  const db = getDb();
  const profileId = getProfileId(db);
  const inventory = readInventory(db, profileId);
  const roster = readRoster(db, profileId);

  const rostered = new Set(roster.map((entry) => entry.characterId));
  const holders = new Set(
    [...inventory.artifacts, ...inventory.weapons]
      .map((item) => item.equippedTo)
      .filter((id): id is number => id !== null),
  );
  const unrostered = [...holders].filter((id) => !rostered.has(id));

  const assignedArtifacts = inventory.artifacts.filter((piece) => piece.equippedTo !== null);
  const assignedWeapons = inventory.weapons.filter((weapon) => weapon.equippedTo !== null);

  // The scarcity view: a weapon owned in one copy cannot serve two characters,
  // and the count is the only thing that says so.
  const stock = new Map<string, { weaponId: number; refinement: number; total: number; assigned: number }>();
  for (const weapon of inventory.weapons) {
    const key = `${weapon.weaponId}|${weapon.refinement}`;
    const entry = stock.get(key) ?? {
      weaponId: weapon.weaponId, refinement: weapon.refinement, total: 0, assigned: 0,
    };
    entry.total += 1;
    if (weapon.equippedTo !== null) entry.assigned += 1;
    stock.set(key, entry);
  }

  const duplicated = [...stock.values()]
    .filter((entry) => entry.total > 1)
    .sort((a, b) => b.total - a.total);

  const name = (id: number) => catalog.characters.get(id)?.name ?? `#${id}`;

  return (
    <div className="space-y-10">
      <section>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Artefactos" value={inventory.artifacts.length}
            note={`${assignedArtifacts.length} equipados`} />
          <Stat label="Armas" value={inventory.weapons.length}
            note={`${assignedWeapons.length} equipadas`} />
          <Stat label="Roster" value={roster.length} note="con ficha" />
          <Stat label="Sin asignar" value={inventory.artifacts.length - assignedArtifacts.length}
            note="piezas libres" />
        </dl>
      </section>

      {unrostered.length > 0 && (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Equipo sin ficha de personaje
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Estos personajes llevan equipo pero no están en el roster, porque el
            escaneo lee el inventario y la pantalla de personajes por separado.
            Añádelos abajo para que cuenten en la planificación.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {unrostered.map((id) => (
              <li
                key={id}
                className="flex items-center gap-2 rounded border border-accent/40 bg-surface px-3 py-1.5 text-sm"
              >
                <GameIcon
                  filename={catalog.characters.get(id)?.icon}
                  kind="avatar"
                  className="h-6 w-6"
                  sizes="24px"
                />
                {name(id)}
                <span className="font-mono text-xs text-muted">
                  {[...inventory.artifacts, ...inventory.weapons]
                    .filter((item) => item.equippedTo === id).length} objetos
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {duplicated.length > 0 && (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Armas con varias copias
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Lo que realmente limita cuántos personajes pueden llevar cada arma.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {duplicated.map((entry) => {
              const weapon = catalog.weapons.get(entry.weaponId);
              return (
                <li
                  key={`${entry.weaponId}-${entry.refinement}`}
                  className="flex items-center gap-3 rounded border border-edge bg-surface px-3 py-2"
                >
                  <GameIcon filename={weapon?.icon} kind="weapon" className="h-8 w-8" sizes="32px" />
                  <span className="flex-1 truncate text-sm">{weapon?.name ?? `#${entry.weaponId}`}</span>
                  <span className="font-mono text-xs text-muted">
                    R{entry.refinement} · {entry.assigned}/{entry.total} en uso
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded border border-edge bg-surface p-3">
      <dt className="text-xs uppercase text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-xl">{value.toLocaleString()}</dd>
      <dd className="font-mono text-xs text-muted">{note}</dd>
    </div>
  );
}
