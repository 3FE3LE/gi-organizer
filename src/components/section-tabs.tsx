'use client';

import { usePathname } from 'next/navigation';

import { HoverLabel } from '@/components/hint';
import { PrefetchLink } from '@/components/prefetch-link';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type SectionTab = {
  href: string;
  label: string;
  hint?: string;
  /** A count beside the label, for tabs whose size is the point. */
  badge?: number;
  /**
   * Whether this tab is the one in view, when the path cannot say.
   *
   * The section tabs are routes and read the path. The plan's day view and the
   * build screen's tabs are one route with a query parameter, so they state it.
   */
  active?: boolean;
};

/**
 * The tabs of a section.
 *
 * Two pages that answer the same question — what to do next, what the account
 * holds — read as one place with two views rather than two entries in a nav
 * bar that is already too long. The active tab comes from the path, so a
 * bookmark lands where it says.
 *
 * This markup existed three times: here, in the plan's talent/weapon switch and
 * in the build screen's tabs, character for character down to the `-mb-px`.
 * Three copies of one strip is three places to change it and three chances for
 * one of them to drift, so the two that key off something other than the path
 * pass `active` instead of repeating the strip.
 *
 * ## Why these tabs are links
 *
 * shadcn's `Tabs` normally swap panels in place, which is the wrong model here:
 * every one of these views is a URL that has to survive a bookmark, a refresh
 * and the back button. So the primitive supplies the roles, the roving focus
 * and the underline, and `render` turns each tab into a `next/link` — a real
 * navigation with a real href, wearing the tab strip's clothes. `value` is the
 * href, which is what makes "which tab is current" the same question as "where
 * am I".
 */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();

  // The section root is only active on an exact match; a deeper tab would
  // otherwise light both up.
  const current = tabs.find((tab) => tab.active ?? pathname === tab.href)?.href;

  return (
    <Tabs value={current ?? null} className="gap-0">
      <TabsList
        variant="line"
        className="h-auto w-full flex-wrap justify-start gap-x-1 rounded-none border-b border-edge p-0"
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.href}
            value={tab.href}
            /* The tab *is* the link, so there is no `<button>` under it and the
               primitive is told so: with `nativeButton` left on it would wire up
               button semantics — and complain — for an anchor. */
            nativeButton={false}
            className="group relative h-auto flex-none px-3 py-2 text-sm font-normal text-muted after:bottom-[-1px] after:bg-accent data-active:text-accent"
            render={
              /* Warm on sight: a strip is two or three links, and every one of
                 them is a route the player is one click from. An unwarmed
                 route commits outside the transition and the crossfade between
                 panels never runs — see `components/prefetch-link.tsx`. */
              <PrefetchLink
                href={tab.href}
                eager
                aria-current={tab.href === current ? 'page' : undefined}
              />
            }
          >
            {tab.label}
            {tab.badge !== undefined && <span className="ml-1 font-mono text-xs">{tab.badge}</span>}
            {/* Drawn below: the strip sits at the top of its section, and a
                label above it would land on the page header. A tab is a link,
                so this is the CSS label, not a tooltip — see `hint.tsx`. The
                span around it only resets the tab's `whitespace-nowrap`, which
                a longer hint would otherwise run out of its bubble with. It is
                `contents`, so it adds no box — no flex gap beside the label —
                and the label still hangs off the tab. */}
            {tab.hint && (
              <span className="contents whitespace-normal">
                <HoverLabel text={tab.hint} side="bottom" />
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
