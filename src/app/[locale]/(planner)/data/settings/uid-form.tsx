'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { buttonVariants } from '@/components/ui/button';

import { saveUid, type UidState } from './actions';

/** The UID, typed once; empty and saved forgets it. */
export function UidForm({ uid }: { uid: string | null }) {
  const t = useTranslations('data.settingsPage');
  const [state, action, pending] = useActionState<UidState, FormData>(saveUid, { status: 'idle' });

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <label className="field flex h-9 items-center rounded-lg px-2.5">
        <span className="sr-only">{t('uidLabel')}</span>
        <input
          name="uid"
          defaultValue={uid ?? ''}
          inputMode="numeric"
          pattern="[1-9][0-9]{8,9}"
          placeholder="UID"
          className="w-36 bg-transparent font-mono text-sm outline-none placeholder:text-muted"
        />
      </label>
      <button type="submit" disabled={pending} className={buttonVariants({ size: 'sm' })}>
        {t('uidSave')}
      </button>
      {state.status !== 'idle' && (
        <span className={`font-mono text-2xs ${state.status === 'invalid' || state.status === 'unreachable' ? 'text-warn' : 'text-good'}`}>
          {t(`uidStatus.${state.status}`)}
        </span>
      )}
    </form>
  );
}
