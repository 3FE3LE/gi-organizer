'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ComponentProps } from 'react';

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
 * the route from the navigation itself. But a finger also lands on a card to
 * scroll past it, and each of those was a full render of a build page. So a
 * touch warms the link only once it has held still for a moment; one that
 * moves is a scroll, and warms nothing.
 *
 * `eager` links used to warm the moment they rendered, which on the gallery
 * was every owned character's build, requested while the gallery itself was
 * still loading and again for each row a scroll revealed — dozens of renders
 * in a few seconds, on a phone's network and processor. They now wait for the
 * page to finish loading, and warm only a link that has stayed on screen for a
 * beat: the cards the player stops on, not the ones a scroll carries past.
 */
const DWELL_MS = 400;
const TOUCH_HOLD_MS = 90;
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
  const [warm, setWarm] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);
  const touch = useRef(0);

  useEffect(() => {
    const node = link.current;
    if (!eager || warm || !node) return;

    let dwell = 0;
    let observer: IntersectionObserver | null = null;
    const watch = () => {
      observer = new IntersectionObserver(([entry]) => {
        clearTimeout(dwell);
        if (entry?.isIntersecting) dwell = window.setTimeout(() => setWarm(true), DWELL_MS);
      });
      observer.observe(node);
    };

    // After the page's own load, so the warming never competes with it.
    if (document.readyState === 'complete') watch();
    else window.addEventListener('load', watch, { once: true });

    return () => {
      window.removeEventListener('load', watch);
      observer?.disconnect();
      clearTimeout(dwell);
    };
  }, [eager, warm]);

  const cancelTouch = () => clearTimeout(touch.current);

  return (
    <Link
      {...props}
      ref={link}
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
        cancelTouch();
        touch.current = window.setTimeout(() => setWarm(true), TOUCH_HOLD_MS);
        onTouchStart?.(event);
      }}
      // A touch that moves is a scroll. One that ends early is a tap, and the
      // click right after it navigates anyway.
      onTouchMove={cancelTouch}
      onTouchCancel={cancelTouch}
    >
      {children}
    </Link>
  );
}
