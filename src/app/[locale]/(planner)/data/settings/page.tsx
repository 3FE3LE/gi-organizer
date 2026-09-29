import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { isLocale } from '@/lib/data/locales';
import { readRegionSetting } from '@/lib/player/region';
import { readEnkaAccount } from '@/lib/player/enka-profile';
import { readWorldLevelSetting } from '@/lib/player/world-level';
import { GAME_REGIONS } from '@/lib/rules/game-day';
import { WORLD_LEVELS } from '@/lib/rules/resin';

import { RegionPicker } from './region-picker';
import { UidForm } from './uid-form';
import { WorldLevelPicker } from './world-level-picker';

/**
 * The account's settings: facts about the player the app cannot read out of a
 * scan.
 *
 * The game server is the first of them. It used to be a row of the plan's
 * filters, which made it look like a way of viewing the plan — something to
 * flip back and forth — when it is a fact about the account that changes about
 * once a lifetime and decides every day strip, countdown and birthday on the
 * site, not only the plan's.
 *
 * The world level is the second: drop rates scale with it, so it is what the
 * resin estimate is priced at.
 */
export default async function SettingsPage({ params }: PageProps<'/[locale]/data/settings'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getTranslations('data.settingsPage');
  const region = await getTranslations('common.region');
  const [setting, world, enka] = await Promise.all([readRegionSetting(), readWorldLevelSetting(), readEnkaAccount()]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            {t('uidHeading')}
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">{t('uidHint')}</p>
        </div>
        <UidForm uid={enka.uid} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            {t('languageHeading')}
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">{t('languageHint')}</p>
        </div>
        <LocaleSwitcher current={locale} />
      </section>

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

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            {t('worldLevelHeading')}
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">{t('worldLevelHint')}</p>
        </div>
        <WorldLevelPicker levels={WORLD_LEVELS} chosen={world.chosen} automatic={world.detected ?? 8} />
        {world.detected !== null && (
          <p className="font-mono text-2xs text-muted">{t('worldLevelDetected', { level: world.detected })}</p>
        )}
      </section>
    </div>
  );
}
