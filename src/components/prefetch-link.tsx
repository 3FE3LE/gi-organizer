'use client';

import Link from 'next/link';
import { useState, type ComponentProps } from 'react';

type LinkProps = ComponentProps<typeof Link>;

/**
 * A link that warms its destination when the pointer arrives.
 *
 * Every page in this app reads the player's own database, so every route is
 * dynamic — and Next prefetches a dynamic route only when a link asks for it
 * outright. Left on the default, the click is the first the server hears of the
 * destination, React commits the new page in a separate pass, and the shared
 * element morph never pairs: the avatar the player clicked does not become the
 * splash, it is simply replaced by it. That is the whole reason the transitions
 * looked intermittent — they fired exactly when the route happened to be warm.
 *
 * Prefetching the lot on sight is the other extreme: the roster is a hundred
 * and twenty cards, and a viewport of them would be twenty full renders of a
 * page nobody has asked for yet. Hover and focus are the cheapest honest signal
 * of intent there is, and the two hundred milliseconds between them and the
 * click are enough for a local route to arrive.
 *
 * `touchstart` stands in for hover where there is none. It fires before the
 * click on the same tap, which buys less time but still beats learning about
 * the route from the navigation itself.
 */
export function PrefetchLink({
  children,
  eager = false,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: Omit<LinkProps, 'prefetch'> & {
  /**
   * Warm on sight rather than on hover, for the handful of links a screen is
   * built to be walked with. A click with no dwell — a tap, a fast pointer —
   * never gives hover time to land, and those are the links where losing the
   * morph is most obvious.
   */
  eager?: boolean;
}) {
  const [warm, setWarm] = useState(eager);

  return (
    <Link
      {...props}
      // `true` rather than `null`: the default would prefetch the route only as
      // far as its nearest loading boundary, and a dynamic route without one
      // gets nothing at all out of it.
      prefetch={warm}
      onMouseEnter={(event) => {
        setWarm(true);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setWarm(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setWarm(true);
        onTouchStart?.(event);
      }}
    >
      {children}
    </Link>
  );
}
