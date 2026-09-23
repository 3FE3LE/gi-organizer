import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';

import { newTeamAction } from './actions';

/**
 * The way in to a new team: one button, no questions.
 *
 * It asked for a name and a mode before a team could exist. A team here is
 * universal — the same four carry every mode — so the mode is gone, and the
 * name is asked for when the team is saved, once there is something to name.
 */
export async function CreateTeam({ locale, hasDraft }: { locale: string; hasDraft: boolean }) {
  const t = await getTranslations('teams');

  return (
    <form action={newTeamAction}>
      <input type="hidden" name="locale" value={locale} />
      <Button variant="default" type="submit" className="w-full justify-center gap-1.5">
        <Plus size={14} aria-hidden />
        {hasDraft ? t('openDraftButton') : t('newTeamButton')}
      </Button>
    </form>
  );
}
