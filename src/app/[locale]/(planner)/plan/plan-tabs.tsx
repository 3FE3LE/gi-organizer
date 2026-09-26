'use client';

import { useQueryStates } from 'nuqs';
import { usePathname } from 'next/navigation';

import { SectionTabs } from '@/components/section-tabs';

import { scopeHref, scopeParsers } from './filters';

/**
 * The plan's two views, carrying the team between them.
 *
 * Narrowed to a team, "what to farm" and "what to change" are both about
 * that team; a tab that dropped it would widen the other view back to the
 * whole account without a word. The team is read from the URL through the
 * same parser the pages load it with, so the link and the page cannot
 * disagree about it.
 */
export function PlanTabs({ tabs }: { tabs: { href: string; label: string; hint: string }[] }) {
  const pathname = usePathname();
  const [scope] = useQueryStates(scopeParsers);

  return (
    <SectionTabs
      tabs={tabs.map((tab) => ({
        ...tab,
        href: scopeHref(tab.href, scope),
        active: pathname === tab.href,
      }))}
    />
  );
}
