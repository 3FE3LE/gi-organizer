import { FitIcons } from '@/components/fit-icons';
import { type Catalog, statLabel } from '@/lib/data/catalog';
import type { ScoredPiece } from '@/lib/rules/assemble';
import type { PieceFit } from '@/lib/rules/piece-score';

/**
 * The fit marks for a piece the character already wears.
 *
 * The candidates in the gear dialog always carried them; the pieces on the
 * character did not, so the one question the build page exists to answer — is
 * what I have on right for this build — was asked of everything except the
 * gear being worn. The score is the same one the candidates are ranked by, so
 * the piece on and the piece offered are read against each other directly.
 */
export function EquippedFit({
  fit,
  mainProp,
  catalog,
}: {
  fit: PieceFit | undefined;
  mainProp: string;
  catalog: Catalog;
}) {
  if (!fit) return null;
  return <FitIcons fit={fit} mainProp={mainProp} mainLabel={statLabel(catalog, mainProp)} />;
}

/** Every scored piece's fit, by instance, from the build's suggestions. */
export function fitsById(suggestions: { pieces: Map<string, ScoredPiece[]> }) {
  return new Map(
    [...suggestions.pieces.values()].flat().map((piece) => [piece.instanceId, piece.fit]),
  );
}
