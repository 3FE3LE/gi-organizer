'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { ActionStatus } from '@/components/action-status';

import { type TeamActionState, createTeamAction } from './actions';

export function CreateTeam() {
  const t = useTranslations('teams');
  const modeLabel = useTranslations('common.mode');
  const [state, create, pending] = useActionState<TeamActionState, FormData>(
    createTeamAction, { status: 'idle' },
  );

  return (
    <form
      action={create}
      key={state.status === 'ok' ? state.message : 'create'}
      className="space-y-2"
    >
      <input
        name="name"
        required
        placeholder={t('namePlaceholder')}
        aria-label={t('namePlaceholder')}
        className="w-full rounded border border-edge bg-ink px-2 py-1.5 text-sm"
      />
      <select
        name="mode"
        defaultValue="abyss"
        aria-label={t('modeAria')}
        className="w-full rounded border border-edge bg-ink px-2 py-1.5 text-sm"
      >
        <option value="abyss">{modeLabel('abyss')}</option>
        <option value="theater">{modeLabel('theater')}</option>
        <option value="stygian">{modeLabel('stygian')}</option>
        <option value="other">{modeLabel('other')}</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded border border-edge bg-ink px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
      >
        {t('createButton')}
      </button>
      <ActionStatus state={state} className="font-mono text-xs" />
    </form>
  );
}
