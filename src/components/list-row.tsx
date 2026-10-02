/**
 * A list row shaped like a table's: what the row is about on the left, its
 * figures on the right, in two lines.
 *
 * ```
 * [lead]  title ………………………  value
 *         detail ……………………  detailValue
 * ```
 *
 * Every list in the app used to be one flex-wrapped line — face, name, a
 * phrase, two figures — and on a phone each piece wrapped wherever it ran out
 * of room: the name truncated to a few letters, the phrase broke into a column
 * one word wide, and a figure dropped onto a line of its own or ran into the
 * text beside it. Here each piece has a cell. The title truncates, the detail
 * is the one cell allowed to wrap, and the figures never break, so a row is
 * two lines at any width and its numbers stay in a right-hand column.
 *
 * `as` is the element the row is drawn as: an `li` in a list, a `span` inside
 * a fold's trigger, which is a button and cannot hold a `div`.
 */
export function ListRow({
  as: Element = 'li',
  lead,
  title,
  value,
  detail,
  detailValue,
  className = '',
}: {
  as?: 'li' | 'div' | 'span';
  /** A face, an icon or a rank: it spans both lines. */
  lead?: React.ReactNode;
  title: React.ReactNode;
  /** The figure the row is read for. */
  value?: React.ReactNode;
  detail?: React.ReactNode;
  /** A second figure, under the first. */
  detailValue?: React.ReactNode;
  className?: string;
}) {
  const hasLead = lead != null && lead !== false;
  const hasDetailValue = detailValue != null && detailValue !== false;
  const hasDetail = (detail != null && detail !== false) || hasDetailValue;

  return (
    <Element
      className={`grid items-center gap-x-3 gap-y-0.5 ${hasLead ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]'} ${className}`}
    >
      {/* At the top, so a row whose detail runs to several lines keeps its
          face beside its name. */}
      {hasLead && <span className={`flex items-center gap-2 self-start ${hasDetail ? 'row-span-2' : ''}`}>{lead}</span>}
      <span className="min-w-0 truncate">{title}</span>
      <span className="tabular justify-self-end whitespace-nowrap text-right font-mono">{value}</span>
      {hasDetail && (
        <>
          {/* Without a figure under the first, the detail has the line to
              itself rather than wrap beside an empty cell. */}
          <span className={`min-w-0 font-mono text-2xs text-muted ${hasDetailValue ? '' : 'col-span-2'}`}>{detail}</span>
          {hasDetailValue && (
            <span className="tabular justify-self-end whitespace-nowrap text-right font-mono">{detailValue}</span>
          )}
        </>
      )}
    </Element>
  );
}
