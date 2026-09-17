import type { AbstractIntlMessages } from 'next-intl';

/**
 * The namespaces that cross to the browser.
 *
 * `NextIntlClientProvider` serialises whatever it is handed into the payload of
 * every page, for every navigation. Most of these strings are read by Server
 * Components through `getTranslations`, which never needs the provider — so
 * shipping the whole file means paying for the catalogue's prose, the
 * diagnostics vocabulary and the character sheet's labels on a route that
 * renders none of them.
 *
 * This is the list of namespaces a `'use client'` component actually calls
 * `useTranslations` with. Adding one to a client component means adding it
 * here; next-intl fails loudly on a missing message rather than rendering a
 * blank, so the mistake surfaces on the first render rather than in a report.
 */
const CLIENT_NAMESPACES = [
  'nav',
  'ui',
  'common',
  'artifacts',
  'build',
  'plan',
  'teams',
  'data',
] as const;

export function clientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return Object.fromEntries(
    CLIENT_NAMESPACES
      .filter((namespace) => namespace in messages)
      .map((namespace) => [namespace, messages[namespace]]),
  );
}
