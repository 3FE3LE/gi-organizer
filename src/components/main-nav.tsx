'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The five sections, and which one you are in.
 *
 * The old header was five links in muted grey that looked identical whichever
 * page you were on — the only way to know where you were was to read the
 * content. These are pills, and the current one is filled, which is the
 * cheapest orientation cue there is.
 *
 * Active is a prefix match rather than an exact one, because `/plan/upgrades`
 * and `/data/history` are inside their section and should light it up.
 */
export function MainNav({
  items,
  label,
}: {
  items: { href: string; label: string }[];
  label: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            data-active={active}
            className="chip px-3 py-1.5 text-sm"
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
