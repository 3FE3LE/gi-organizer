'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { ActionStatus } from '@/components/action-status';
import { FieldSelect } from '@/components/field-select';

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
        className="w-full field px-2 py-1.5 text-sm"
      />
      <FieldSelect
        name="mode"
        defaultValue="abyss"
        label={t('modeAria')}
        groups={[{ options: (['abyss', 'theater', 'stygian', 'other'] as const).map((mode) => ({
          value: mode, label: modeLabel(mode),
        })) }]}
        triggerClassName="py-1.5"
      />
      <Button
        variant="default"
        type="submit"
        disabled={pending}
        className="w-full justify-center"
      >
        {t('createButton')}
      </Button>
      <ActionStatus state={state} className="font-mono text-xs" />
    </form>
  );
}
