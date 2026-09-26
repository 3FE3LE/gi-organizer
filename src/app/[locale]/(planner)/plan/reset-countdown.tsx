'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Hint } from '@/components/hint';

const MINUTE = 60_000;

/**
 * How long today's domains have left.
 *
 * The first paint uses the server's clock, so the markup hydrates without a
 * mismatch; the browser's clock takes over once mounted and ticks with the
 * minute. When the reset passes the page is refreshed rather than left saying
 * "0 min" over yesterday's rotation — the day strip, the heading and every
 * domain below it turn with the server's answer.
 */
export function ResetCountdown({ at, serverNow }: { at: string; serverNow: string }) {
  const t = useTranslations('plan');
  const router = useRouter();
  const target = Date.parse(at);
  const [now, setNow] = useState(() => Date.parse(serverNow));

  useEffect(() => {
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= target) router.refresh();
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [target, router]);

  // Rounded up, so the last minute reads "1 min" rather than "0 min".
  const left = Math.max(0, Math.ceil((target - now) / MINUTE));
  const hours = Math.floor(left / 60);
  const minutes = left % 60;

  return (
    <Hint text={t('resetTitle')}>
      <span tabIndex={0} className="tabular rounded font-mono text-xs text-muted">
        {hours > 0 ? t('resetInHours', { hours, minutes }) : t('resetInMinutes', { minutes })}
      </span>
    </Hint>
  );
}
