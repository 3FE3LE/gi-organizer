'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useSwipeable } from 'react-swipeable';

/**
 * Walking the roster with a thumb.
 *
 * The previous/next portraits sit outside the panel's edges, which a phone
 * does not have the width for, so below `lg` they are not drawn and the page
 * had no way to the next character but back through the gallery. A horizontal
 * swipe over the panel is that way: left for the next, right for the previous,
 * the same two links the arrows are.
 *
 * The panel leans a little with the finger, so the gesture reads as moving the
 * character rather than as nothing until it suddenly navigates. A swipe that
 * starts on a control of its own — the level slider, a field, a row that
 * scrolls sideways — belongs to that control and is left alone. Touch only: a
 * mouse drag over the panel is a text selection.
 */
const THRESHOLD = 70;
const LEAN = 0.35;
const MAX_LEAN = 64;

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
  const [lean, setLean] = useState(0);
  const ignored = useRef(false);

  const handlers = useSwipeable({
    onTouchStartOrOnMouseDown: ({ event }) => {
      ignored.current = ownsSwipe(event.target);
    },
    onSwiping: ({ dir, deltaX }) => {
      if (ignored.current || (dir !== 'Left' && dir !== 'Right')) return;
      const toward = deltaX < 0 ? nextHref : previousHref;
      // Leans less toward a side with nowhere to go.
      const scale = toward ? LEAN : LEAN / 4;
      setLean(Math.max(-MAX_LEAN, Math.min(MAX_LEAN, deltaX * scale)));
    },
    onSwiped: ({ dir, absX }) => {
      setLean(0);
      if (ignored.current || absX < THRESHOLD) return;
      const href = dir === 'Left' ? nextHref : dir === 'Right' ? previousHref : null;
      if (href) router.push(href, { scroll: false });
    },
    onTouchEndOrOnMouseUp: () => setLean(0),
    trackTouch: true,
    trackMouse: false,
    delta: 12,
  });

  return (
    <div
      {...handlers}
      style={{
        transform: lean ? `translateX(${lean}px)` : undefined,
        transition: lean ? 'none' : 'transform 200ms ease-out',
      }}
    >
      {children}
    </div>
  );
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
