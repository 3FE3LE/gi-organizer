'use client';

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { countReadyUpgrades } from './upgrades-count';
import { buttonVariants } from '@/components/ui/button';

/**
 * Gear that can move tonight without farming, one tap from the queue.
 *
 * Asked for once the page has settled — on the browser's first idle moment —
 * so the plan paints and answers first and the count arrives a beat later. It
 * draws nothing until then, and nothing when the answer is zero: an empty
 * chip would be a promise with nothing behind it.
 */
export function UpgradesChip({
  locale, teamId, href,
}: {
  locale: string; teamId: string | null; href: string;
}) {
  const t = useTranslations('plan');
  const [count, setCount] = useState<{ key: string; value: number } | null>(null);
  const key = `${locale}:${teamId ?? ''}`;

  useEffect(() => {
    let cancelled = false;
    const ask = () => {
      countReadyUpgrades(locale, teamId)
        .then((value) => { if (!cancelled) setCount({ key, value }); })
        // A count that failed is a chip that is not drawn, not an error on
        // the page it only decorates.
        .catch(() => {});
    };
    const idle = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(ask, { timeout: 2000 })
      : window.setTimeout(ask, 300);

    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, [locale, teamId, key]);

  // A count for another team is not this team's count.
  if (!count || count.key !== key || count.value === 0) return null;

  return (
    <Link href={href} className={buttonVariants({ size: 'xs', className: 'rise' })}>
      {t('upgradesReady', { count: count.value })}
      <ArrowRight size={12} aria-hidden />
    </Link>
  );
}
