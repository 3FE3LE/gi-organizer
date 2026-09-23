'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useSwipeable } from 'react-swipeable';

/**
 * Walking the roster with a thumb.
 *
 * The previous/next portraits sit outside the panel's edges, which a phone
 * does not have the width for, so below `lg` a horizontal swipe over the panel
 * is the way along the roster: left for the next, right for the previous.
 *
 * What makes it feel like moving a card rather than triggering a link:
 *
 *   - **The panel follows the finger on the compositor.** The lean is written
 *     straight to `style.transform` in an animation frame; nothing re-renders
 *     while the finger moves.
 *   - **The browser is told which axis is ours.** `touch-action: pan-y` hands
 *     vertical drags to the page and horizontal ones to this handler, so a
 *     swipe never fights the scroll and never waits for it to give up.
 *   - **Release commits by distance or by speed.** A flick counts even when
 *     short; a slow drag counts once it is far enough.
 *   - **The next page is already here.** Both neighbours are prefetched on
 *     mount, and the panel slides out the way it was thrown while the route
 *     changes, and the next one slides in from the other side, so there is no
 *     moment where the old character snaps back and waits for the network.
 *
 * A swipe that starts on a control of its own — the level slider, a field, a
 * row that scrolls sideways — belongs to that control. Touch only: a mouse
 * drag over the panel is a text selection.
 */
const COMMIT_DISTANCE = 80;
const COMMIT_VELOCITY = 0.45;
const MAX_LEAN = 90;

/** Which side the next panel enters from; set just before a swipe navigates. */
let enterFrom: 'left' | 'right' | null = null;

export function SwipeNavigate({
  previousHref,
  nextHref,
  children,
}: {
  previousHref: string | null;
  nextHref: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const ignored = useRef(false);
  const frame = useRef(0);

  useEffect(() => {
    if (previousHref) router.prefetch(previousHref);
    if (nextHref) router.prefetch(nextHref);
  }, [router, previousHref, nextHref]);

  // Arriving by a swipe: come in from the side the finger was moving away from.
  useEffect(() => {
    const node = panel.current;
    const from = enterFrom;
    enterFrom = null;
    if (!node || !from || reducedMotion()) return;
    node.animate(
      [
        { transform: `translate3d(${from === 'right' ? 40 : -40}%, 0, 0)`, opacity: 0 },
        { transform: 'translate3d(0, 0, 0)', opacity: 1 },
      ],
      { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }, []);

  const paint = (x: number, animate: boolean) => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const node = panel.current;
      if (!node) return;
      node.style.transition = animate ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
      node.style.transform = x === 0 ? '' : `translate3d(${x}px, 0, 0)`;
    });
  };

  const handlers = useSwipeable({
    onTouchStartOrOnMouseDown: ({ event }) => {
      ignored.current = ownsSwipe(event.target);
      // A layer of its own only while a finger is on it: permanently, it is a
      // screen-sized texture held for nothing.
      if (!ignored.current && panel.current) panel.current.style.willChange = 'transform';
    },
    onTouchEndOrOnMouseUp: () => {
      if (panel.current) panel.current.style.willChange = '';
    },
    onSwiping: ({ dir, deltaX }) => {
      if (ignored.current || (dir !== 'Left' && dir !== 'Right')) return;
      const toward = deltaX < 0 ? nextHref : previousHref;
      // Resistance: it gives more at the start of the drag than at the end,
      // and hardly at all toward a side with nowhere to go.
      const give = Math.min(MAX_LEAN, Math.abs(deltaX) ** 0.8) * (toward ? 1 : 0.25);
      paint(Math.sign(deltaX) * give, false);
    },
    onSwiped: ({ dir, absX, velocity }) => {
      const href = dir === 'Left' ? nextHref : dir === 'Right' ? previousHref : null;
      const committed = !ignored.current && href !== null
        && (absX >= COMMIT_DISTANCE || (velocity >= COMMIT_VELOCITY && absX >= 30));

      if (!committed || !href) {
        paint(0, true);
        return;
      }

      const node = panel.current;
      if (node && !reducedMotion()) {
        cancelAnimationFrame(frame.current);
        node.style.transition = 'transform 200ms ease-in, opacity 200ms ease-in';
        node.style.transform = `translate3d(${dir === 'Left' ? -45 : 45}%, 0, 0)`;
        node.style.opacity = '0';
      }
      enterFrom = dir === 'Left' ? 'right' : 'left';
      router.push(href, { scroll: false });
    },
    trackTouch: true,
    trackMouse: false,
    delta: 10,
  });

  const { ref: swipeRef, ...events } = handlers;

  return (
    <div
      {...events}
      ref={(node) => {
        panel.current = node;
        swipeRef(node);
      }}
      className="touch-pan-y"
    >
      {children}
    </div>
  );
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Whether the swipe started on something that uses a horizontal drag itself. */
function ownsSwipe(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [role="slider"], [data-slot="slider"]')) return true;

  for (let node: Element | null = target; node; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflow = getComputedStyle(node).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return true;
    }
  }
  return false;
}
