import { notFound } from 'next/navigation';

import { getCatalog } from '@/lib/data/catalog';
import { isLocale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { readHistory } from '@/lib/player/history';
import type { Move } from '@/lib/player/move';

import { HistoryControls } from '../history-controls';

export const dynamic = 'force-dynamic';

const OPS: Record<Move['kind'], string> = {
  'equip-artifact': 'equipó artefacto',
  'unequip-artifact': 'quitó artefacto',
  'equip-weapon': 'equipó arma',
  'unequip-weapon': 'quitó arma',
};

/**
 * What the player changed.
 *
 * The log stores ids only, so the names come from the catalog at render time —
 * which makes the history localized for free and keeps it readable after a
 * patch renames something.
 */
export default async function HistoryPage({ params }: PageProps<'/[locale]/datos/historial'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const catalog = await getCatalog(locale);
  const entries = readHistory(getDb());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="max-w-prose text-sm text-muted">
          Cada movimiento, y de dónde salió. Deshacer devuelve la pieza a quien
          la llevaba, no a donde estaba.
        </p>
        <HistoryControls />
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted">Nada todavía.</p>
      ) : (
        <ol className="space-y-1">
          {entries.map((entry) => {
            const { move } = entry.summary;
            const target =
              'toCharacterId' in move
                ? catalog.characters.get(move.toCharacterId)?.name ?? `#${move.toCharacterId}`
                : null;

            return (
              <li
                key={entry.seq}
                className={`flex flex-wrap items-baseline gap-x-3 rounded border border-edge px-3 py-1.5 font-mono text-xs ${
                  entry.undone ? 'bg-surface/40 text-muted line-through' : 'bg-surface'
                }`}
              >
                <span className="text-muted">#{entry.seq}</span>
                <span className="text-muted">{entry.at.slice(11, 19)}</span>
                <span className="text-text">{OPS[move.kind] ?? entry.op}</span>
                {target && <span>→ {target}</span>}
                {entry.summary.label && (
                  <span className="text-muted">{entry.summary.label}</span>
                )}
                {entry.undone && <span className="text-accent">deshecho</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
