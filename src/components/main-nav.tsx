'use client';

import { Database, Gem, ListChecks, Swords, Users, type LucideIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { PrefetchLink } from '@/components/prefetch-link';

/**
 * The icon per section, resolved here rather than passed in.
 *
 * The layout that lists the sections is a Server Component, and a component
 * reference does not survive that boundary — so the server names the section
 * and the browser picks the drawing.
 */
const ICONS: Record<string, LucideIcon> = {
  characters: Users,
  teams: Swords,
  artifacts: Gem,
  plan: ListChecks,
  data: Database,
};

export type NavItem = { id: string; href: string; label: string };

/**
 * The five sections, and which one you are in.
 *
 * `header` is the row of pills the wide layout has always had, and the current
 * one is filled — the cheapest orientation cue there is. `bar` is what a phone
 * gets instead: those same five pills wrapped to three lines there, and the
 * sticky header they sat in took a third of the viewport before the first row
 * of content. As a fixed bar along the bottom edge the nav is one row at any
 * label length, within thumb reach, and no longer competing with the page for
 * the top of the screen.
 *
 * ## Why this renders twice
 *
 * One element cannot be in both places. The bar has to be `position: fixed`,
 * and the header is a containing block for fixed descendants twice over — its
 * `backdrop-filter` and its `view-transition-name` each create one — so a bar
 * left inside the header would pin itself to the header's own bottom edge
 * rather than the viewport's. Only one variant is ever in the page: the other
 * is `display: none`, which takes it out of the accessibility tree and the tab
 * order too, so a screen reader still meets exactly five links.
 *
 * Active is a prefix match rather than an exact one, because `/plan/upgrades`
 * and `/data/history` are inside their section and should light it up.
 */
export function MainNav({
  items,
  label,
  variant,
}: {
  items: NavItem[];
  label: string;
  variant: 'header' | 'bar';
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} data-variant={variant} className="section-nav">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = ICONS[item.id];

        return (
          <PrefetchLink
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            data-active={active}
            className="section-nav-link"
          >
            {Icon ? <Icon size={18} aria-hidden strokeWidth={active ? 2.25 : 1.75} /> : null}
            <span>{item.label}</span>
          </PrefetchLink>
        );
      })}
    </nav>
  );
}
