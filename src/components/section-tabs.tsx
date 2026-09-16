'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The tabs of a section.
 *
 * Two pages that answer the same question — what to do next, what the account
 * holds — read as one place with two views rather than two entries in a nav
 * bar that is already too long. The active tab comes from the path, so a
 * bookmark lands where it says.
 */
export function SectionTabs({
  tabs,
}: {
  tabs: { href: string; label: string; hint?: string }[];
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-x-1 border-b border-edge">
      {tabs.map((tab) => {
        // The section root is only active on an exact match; a deeper tab would
        // otherwise light both up.
        const active = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            title={tab.hint}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              active
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
