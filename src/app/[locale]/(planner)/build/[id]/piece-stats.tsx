'use client';

import { useTranslations } from 'next-intl';

/**
 * The stats of one piece, and the same piece next to what is worn now.
 *
 * A ranking says which piece is better; it does not say why, and a player about
 * to give up a set bonus wants to see the trade stat by stat before making it.
 * So every candidate row can open into this: both spreads side by side, with
 * the props the build asked for marked, and the direction of each change.
 *
 * Values arrive pre-formatted — the server owns the locale — but the raw number
 * comes with them, because the arrow is a comparison and a formatted string
 * cannot be compared.
 */

export type StatLine = {
  prop: string;
  label: string;
  /** Formatted for display. */
  text: string;
  /** Same value, unformatted, so two lines can be compared. */
  value: number;
  /** Substats only: how many top rolls the value is worth. */
  rolls: number | null;
  /** Whether the build asked for this stat. */
  wanted: boolean;
};

export type PieceStats = {
  /** Main stat, or a weapon's base ATK. */
  main: StatLine | null;
  substats: StatLine[];
};

export function PieceComparison({
  equipped,
  candidate,
  candidateLabel,
}: {
  equipped: PieceStats | null;
  candidate: PieceStats;
  candidateLabel?: string;
}) {
  const t = useTranslations('build');
  const rows = mergeRows(equipped, candidate);

  return (
    <table className="w-full border-collapse font-mono text-2xs">
      <thead>
        <tr className="text-muted">
          <th className="py-1 text-left font-normal">{t('statHeader')}</th>
          <th className="py-1 text-right font-normal">{t('equippedHeader')}</th>
          <th className="py-1 text-right font-normal">
            {candidateLabel ?? t('defaultCandidateLabel')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.kind}:${row.prop}`} className="border-t border-edge/40">
            <td className="py-1 pr-2">
              <span className={row.wanted ? 'text-accent' : 'text-muted'}>{row.label}</span>
              {row.kind === 'main' && <span className="text-muted"> {t('mainStatSuffix')}</span>}
            </td>
            <Cell line={row.equipped} />
            <Cell line={row.candidate} direction={row.direction} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cell({
  line,
  direction,
}: {
  line: StatLine | null;
  direction?: 'up' | 'down' | 'same';
}) {
  // A stat the candidate does not have is a loss, not a blank: colouring it
  // keeps the row readable as a trade rather than as missing data.
  if (!line) {
    return (
      <td className={`py-1 text-right ${direction === 'down' ? 'text-bad' : 'text-muted'}`}>—</td>
    );
  }

  return (
    <td className="tabular py-1 text-right">
      {line.rolls !== null && line.rolls >= 1 && (
        <span className="mr-1 rounded bg-ink px-1 text-muted">{Math.floor(line.rolls)}</span>
      )}
      <span
        className={
          direction === 'up' ? 'text-good' : direction === 'down' ? 'text-bad' : undefined
        }
      >
        {direction === 'up' && '▲'}
        {direction === 'down' && '▼'}
        {line.text}
      </span>
    </td>
  );
}

type Row = {
  kind: 'main' | 'substat';
  prop: string;
  label: string;
  wanted: boolean;
  equipped: StatLine | null;
  candidate: StatLine | null;
  direction: 'up' | 'down' | 'same';
};

/**
 * One row per stat either piece carries.
 *
 * A main stat and a substat of the same prop stay separate rows: 46.6% ATK from
 * a sands and 5.8% from a roll are not the same line on the character screen,
 * and merging them would invent a comparison nobody can act on.
 */
function mergeRows(equipped: PieceStats | null, candidate: PieceStats): Row[] {
  const rows: Row[] = [];

  if (equipped?.main || candidate.main) {
    rows.push(row('main', equipped?.main ?? null, candidate.main ?? null));
  }

  const byProp = new Map<string, { equipped: StatLine | null; candidate: StatLine | null }>();
  for (const line of equipped?.substats ?? []) {
    byProp.set(line.prop, { equipped: line, candidate: null });
  }
  for (const line of candidate.substats) {
    const pair = byProp.get(line.prop);
    if (pair) pair.candidate = line;
    else byProp.set(line.prop, { equipped: null, candidate: line });
  }

  for (const pair of byProp.values()) {
    rows.push(row('substat', pair.equipped, pair.candidate));
  }

  return rows;
}

function row(kind: Row['kind'], equipped: StatLine | null, candidate: StatLine | null): Row {
  const line = candidate ?? equipped!;
  // A prop only one side has still gets a direction: gaining a stat is an
  // improvement, losing one is not, and leaving both blank hides the trade.
  const direction: Row['direction'] = !candidate
    ? 'down'
    : !equipped || candidate.value > equipped.value
      ? candidate.value === equipped?.value ? 'same' : 'up'
      : candidate.value < equipped.value
        ? 'down'
        : 'same';

  return {
    kind,
    prop: line.prop,
    label: line.label,
    wanted: line.wanted,
    equipped,
    candidate,
    direction,
  };
}
