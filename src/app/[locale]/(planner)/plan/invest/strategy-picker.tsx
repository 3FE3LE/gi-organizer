'use client';

import { useTranslations } from 'next-intl';
import { useOptimistic, useTransition } from 'react';

import { FieldSelect } from '@/components/field-select';
import { SegmentButton, SegmentStrip } from '@/components/segmented-links';
import type { Strategy } from '@/lib/rules/invest';

import { chooseStrategy } from './actions';

/**
 * Balanced, one team, or one character — and which one, when it is one.
 *
 * Optimistic, like the other account settings: the choice is a small fact and
 * the list reorders on the round trip; the strip should not look as if the
 * tap had missed while it does.
 */
export function StrategyPicker({
  strategy,
  teams,
  characters,
}: {
  strategy: Strategy;
  teams: { id: string; name: string }[];
  characters: { id: number; name: string }[];
}) {
  const t = useTranslations('invest');
  const [shown, setShown] = useOptimistic(strategy);
  const [, startTransition] = useTransition();

  const pick = (next: Strategy) => startTransition(async () => {
    setShown(next);
    await chooseStrategy(next);
  });

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <div className="space-y-0.5">
        <p className="font-mono text-2xs uppercase tracking-wide text-muted">{t('strategyLabel')}</p>
        <SegmentStrip label={t('strategyLabel')}>
          <SegmentButton active={shown.mode === 'balance'} onClick={() => pick({ mode: 'balance' })}>
            {t('balance')}
          </SegmentButton>
          {teams.length > 0 && (
            <SegmentButton
              active={shown.mode === 'team'}
              onClick={() => pick({ mode: 'team', teamId: shown.mode === 'team' ? shown.teamId : teams[0].id })}
            >
              {t('team')}
            </SegmentButton>
          )}
          {characters.length > 0 && (
            <SegmentButton
              active={shown.mode === 'character'}
              onClick={() => pick({
                mode: 'character',
                characterId: shown.mode === 'character' ? shown.characterId : characters[0].id,
              })}
            >
              {t('character')}
            </SegmentButton>
          )}
        </SegmentStrip>
      </div>

      {shown.mode === 'team' && (
        <FieldSelect
          label={t('teamPick')}
          value={shown.teamId}
          onValueChange={(teamId) => pick({ mode: 'team', teamId })}
          groups={[{ options: teams.map((team) => ({ value: team.id, label: team.name })) }]}
          triggerClassName="w-auto py-1.5"
        />
      )}
      {shown.mode === 'character' && (
        <FieldSelect
          label={t('characterPick')}
          value={String(shown.characterId)}
          onValueChange={(id) => pick({ mode: 'character', characterId: Number(id) })}
          groups={[{ options: characters.map((character) => ({ value: String(character.id), label: character.name })) }]}
          triggerClassName="w-auto py-1.5"
        />
      )}
    </div>
  );
}
