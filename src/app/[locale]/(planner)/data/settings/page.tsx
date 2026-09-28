import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { isLocale } from '@/lib/data/locales';
import { readRegionSetting } from '@/lib/player/region';
import { GAME_REGIONS } from '@/lib/rules/game-day';

import { RegionPicker } from './region-picker';

/**
 * The account's settings: facts about the player the app cannot read out of a
 * scan.
 *
 * The game server is the first of them. It used to be a row of the plan's
 * filters, which made it look like a way of viewing the plan — something to
 * flip back and forth — when it is a fact about the account that changes about
 * once a lifetime and decides every day strip, countdown and birthday on the
 * site, not only the plan's.
 */
export default async function SettingsPage({ params }: PageProps<'/[locale]/data/settings'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getTranslations('data.settingsPage');
  const region = await getTranslations('common.region');
  const setting = await readRegionSetting();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            {t('serverHeading')}
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">{t('serverHint')}</p>
        </div>
        <RegionPicker regions={GAME_REGIONS} chosen={setting.chosen} />
        <p className="font-mono text-2xs text-muted">
          {setting.detected
            ? t('serverDetected', { region: region(setting.detected) })
            : t('serverUndetected', { region: region(setting.region) })}
        </p>
      </section>
    </div>
  );
}
