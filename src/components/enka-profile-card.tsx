import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { GameIcon } from '@/components/game-icon';
import { RefreshShowcase } from '@/components/refresh-showcase';
import type { Catalog } from '@/lib/data/catalog';
import type { Locale } from '@/lib/data/locales';
import type { EnkaAccount } from '@/lib/player/enka-profile';

/**
 * The account as the game shows it to anyone: the profile Enka reads off the
 * UID. Without a UID, the way to add one.
 */
export async function EnkaProfileCard({
  account,
  catalog,
  locale,
}: {
  account: EnkaAccount;
  catalog: Catalog;
  locale: Locale;
}) {
  const t = await getTranslations('enka');
  const { uid, profile } = account;

  if (!uid) {
    return (
      <div className="card flex flex-wrap items-center gap-3 p-3 text-sm text-muted">
        <span className="flex-1">{t('noUid')}</span>
        <Link href={`/${locale}/data/settings`} className="underline hover:text-accent">{t('addUid')}</Link>
      </div>
    );
  }

  const face = profile?.avatarId ? catalog.characters.get(profile.avatarId) : undefined;
  const number = new Intl.NumberFormat(locale);
  const ago = profile ? relative(Date.parse(profile.fetchedAt), locale) : null;
  const facts: [string, string][] = profile
    ? [
        [t('adventureRank'), profile.adventureRank !== null ? String(profile.adventureRank) : '—'],
        [t('worldLevel'), profile.worldLevel !== null ? String(profile.worldLevel) : '—'],
        [t('achievements'), profile.achievements !== null ? number.format(profile.achievements) : '—'],
        [t('abyss'), profile.abyss ? `${profile.abyss.floor}-${profile.abyss.chamber}` : '—'],
        [t('showcase'), String(profile.showcase.length)],
      ]
    : [];

  return (
    <section className="card p-3">
      <div className="flex flex-wrap items-center gap-3">
        <GameIcon
          filename={face?.icon}
          kind="avatar"
          alt=""
          className="h-12 w-12 shrink-0 rounded-full border border-edge bg-surface-2"
          sizes="48px"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{profile?.nickname ?? t('unknownName')}</p>
          <p className="font-mono text-2xs text-muted">
            UID {uid}{ago && ` · ${t('updated', { ago })}`}
          </p>
          {profile?.signature && <p className="mt-0.5 truncate text-xs text-muted">{profile.signature}</p>}
        </div>
        <RefreshShowcase label={t('refresh')} />
      </div>
      {facts.length > 0 ? (
        <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2 border-t border-edge pt-3 sm:grid-cols-5">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="font-mono text-2xs uppercase tracking-wide text-muted">{label}</dt>
              <dd className="tabular font-mono text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs text-muted">{t('notRead')}</p>
      )}
    </section>
  );
}

function relative(at: number, locale: string) {
  const minutes = Math.round((Date.now() - at) / 60000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (minutes < 60) return format.format(-minutes, 'minute');
  if (minutes < 60 * 48) return format.format(-Math.round(minutes / 60), 'hour');
  return format.format(-Math.round(minutes / 1440), 'day');
}
