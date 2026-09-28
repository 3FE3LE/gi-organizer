'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Mirrors the browser's timezone into a cookie the server can read, so the
 * game server can be guessed before anybody picks one — see
 * `@/lib/player/region`.
 *
 * The request carries no timezone of its own, so the very first render has to
 * go without it. When the cookie was missing or has changed, the page is
 * refreshed once so the day strip and the countdown land on the right clock
 * without waiting for the next navigation.
 */
export function SyncTimeZoneCookie({ name }: { name: string }) {
  const router = useRouter();

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;

    const value = encodeURIComponent(zone);
    const current = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${name}=`))
      ?.slice(name.length + 1);
    if (current === value) return;

    document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [name, router]);

  return null;
}
