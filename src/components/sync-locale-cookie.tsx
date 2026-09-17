'use client';

import { useEffect } from 'react';

/**
 * Mirrors the interface's resolved locale into a cookie Server Actions can
 * read.
 *
 * `next/root-params` cannot be called from inside a Server Action — see
 * `src/i18n/request.ts` — so a translated confirmation message from one
 * (`"team created"`) has nowhere else to learn which language to answer in.
 * This is the only other place that writes the cookie; the request config
 * only reads it.
 */
export function SyncLocaleCookie({ locale }: { locale: string }) {
  useEffect(() => {
    document.cookie = `ui-locale=${locale}; path=/; max-age=31536000; samesite=lax`;
  }, [locale]);

  return null;
}
