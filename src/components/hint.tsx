'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * A hover hint that a keyboard reaches too.
 *
 * `title` is the cheapest tooltip in the browser and the worst one: it takes a
 * second to appear, never appears on a phone, cannot be reached by keyboard in
 * most browsers, and is styled by the operating system. Every one of those
 * matters on this app, where the hints are what a chip on the filter bar or a
 * disc on the splash actually mean.
 *
 * So the text moves into a real tooltip: shown on hover *and* on focus, dismissed
 * with Escape, and drawn in the app's own ink. The child keeps whatever it was —
 * `render` hands it the trigger's props rather than wrapping it in a span that
 * would break the layout around it.
 *
 * A hint is not a label: whatever the control says to a screen reader still has
 * to be on the control, which is why `aria-label` stays where it is.
 *
 * ## Not on a link
 *
 * This one is for controls that stay on the page. A hint over a *link* costs
 * that link its page transition: the bubble closes as a React state update, the
 * click sends that update into the transition the navigation is starting, and
 * React answers by calling `skipTransition()` — the shared element never
 * morphs and the page cuts instead. Closing it early, even with `flushSync` on
 * pointer down, does not help: the popup unmounts on its own exit animation,
 * which lands mid-transition either way. Links use `HoverLabel` below, which is
 * CSS and therefore cannot interrupt anything.
 */
export function Hint({
  text,
  side = 'top',
  children,
}: {
  text: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      {/* `role` explicitly: the primitive wires `aria-describedby` on the
          trigger, which is what a screen reader needs, and this is what makes
          the bubble addressable as a tooltip by anything else looking. */}
      <TooltipContent side={side} role="tooltip">{text}</TooltipContent>
    </Tooltip>
  );
}

const LABEL_SIDES = {
  top: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-1.5 -translate-x-1/2',
  left: 'right-full top-1/2 mr-1.5 -translate-y-1/2',
  right: 'left-full top-1/2 ml-1.5 -translate-y-1/2',
};

const LABEL_SCOPES = {
  group: 'group-hover:opacity-100 group-focus-visible:opacity-100',
  segment: 'group-hover/segment:opacity-100 group-focus-visible/segment:opacity-100',
};

/**
 * The same hint, for a trigger that navigates.
 *
 * Drawn by CSS from the state of the element around it, so nothing it does is a
 * React update and nothing it does can interrupt a view transition — see the
 * note on `Hint` above. It is rendered *inside* the trigger, which has to carry
 * `group relative`; the trigger keeps its own `aria-label`, so this bubble is
 * decoration and says so.
 */
export function HoverLabel({
  text,
  side = 'top',
  scope = 'group',
}: {
  text: string;
  side?: keyof typeof LABEL_SIDES;
  /**
   * Which `group` it answers to. The plain one by default; `segment` for a
   * trigger that sits inside some other `group`, which would light every
   * label under it at once.
   */
  scope?: keyof typeof LABEL_SCOPES;
}) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute z-50 w-max max-w-56 rounded-md border border-edge bg-surface-2 px-2 py-1 text-xs font-normal normal-case leading-snug text-text opacity-0 shadow-[var(--shadow-raised)] transition-opacity duration-150 ${LABEL_SCOPES[scope]} ${LABEL_SIDES[side]}`}
    >
      {text}
    </span>
  );
}
