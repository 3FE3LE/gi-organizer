/**
 * A part of a dock's controls that folds away once the dock is docked — or,
 * the other way round, that only unfolds then.
 *
 * These used to be `display: none` flipped on the frame the dock stuck, so the
 * bar lost or gained half its height at once, right under the eye of anybody
 * scrolling slowly. They fold instead, the way `Collapse` does: a one-row grid
 * running from `1fr` to `0fr`, fading as it goes. Spacing belongs inside the
 * fold (padding on `className`), never on the parent as a `gap`, so a folded
 * part leaves nothing behind.
 *
 * `when` says in which state it is folded: `docked` for the rows that give way
 * to the list, `undocked` for the summary that stands in for them, and
 * `docked-phone` for what only a phone's docked bar has no room for.
 */
export function DockFold({
  when,
  className,
  children,
}: {
  when: 'docked' | 'undocked' | 'docked-phone';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // Padding on the innermost box: the folding row cannot shrink below the
    // padding of its own item, so a fold spaced on that item stopped at 8 px.
    <div data-fold={when} className="dock-fold">
      <div>
        <div className={className}>{children}</div>
      </div>
    </div>
  );
}
