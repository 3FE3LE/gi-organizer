'use client';

import { ChevronDown, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

import { AssetImage } from '@/components/asset-image';
import { buttonVariants } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';

export type RailEntry = {
  id: string;
  name: string;
  /** Not saved yet: named by the page, drawn dashed. */
  draft: boolean;
  objectiveLabel: string | null;
  /** Four positions, in party order; `null` where a slot is empty. */
  members: ({ name: string; icon: string | null; elementColor: string } | null)[];
  errors: number;
  warnings: number;
};

/**
 * The team list, as a sheet over the page.
 *
 * It was a column beside the board, which on a phone meant the list first and
 * the team a scroll below it, and on a desktop a fixed quarter of the width
 * spent on names. The board is the page now; the list is a button that says
 * which team is open, and opens the list over everything — a team per row,
 * as its four faces in party order, so a team is recognised by who is in it
 * rather than by what it was named.
 */
export function TeamDrawer({
  locale,
  teams,
  selectedId,
  create,
}: {
  locale: string;
  teams: RailEntry[];
  selectedId: string | null;
  /** The new-team button, rendered on the server with its action. */
  create: React.ReactNode;
}) {
  const t = useTranslations('teams');
  const [open, setOpen] = useState(false);
  const selected = teams.find((team) => team.id === selectedId) ?? null;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        className="card flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:border-accent sm:w-auto sm:min-w-80"
      >
        {selected ? <Row team={selected} /> : <span className="text-sm text-muted">{t('noTeamOpen')}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-2xs text-muted">
          {t('allTeams', { count: teams.length })}
          <ChevronDown size={12} aria-hidden />
        </span>
      </DrawerTrigger>

      <DrawerContent className="rounded-none data-[swipe-axis=y]:[--drawer-content-height:100dvh] data-[swipe-axis=y]:[--drawer-content-max-height:100dvh]">
        <DrawerHeader className="flex-row items-center justify-between gap-3 border-b border-edge pb-3 text-left">
          <DrawerTitle className="page-title">
            {t('heading')} <span className="font-mono text-sm text-muted">{teams.length}</span>
          </DrawerTitle>
          <DrawerClose
            aria-label={t('closeAria')}
            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
          >
            <X size={16} aria-hidden />
          </DrawerClose>
        </DrawerHeader>

        <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <ul className="space-y-2">
            {teams.map((team) => (
              <li key={team.id}>
                <Link
                  href={`/${locale}/teams?team=${team.id}`}
                  onClick={() => setOpen(false)}
                  aria-current={team.id === selectedId ? 'true' : undefined}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                    team.draft ? 'border-dashed' : ''
                  } ${
                    team.id === selectedId
                      ? 'border-accent bg-surface-2'
                      : 'border-edge bg-surface hover:border-edge-strong'
                  }`}
                >
                  <Row team={team} />
                </Link>
              </li>
            ))}
          </ul>
          <div onClick={() => setOpen(false)}>{create}</div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** A team on one line: four faces, then its name and what needs attention. */
function Row({ team }: { team: RailEntry }) {
  const t = useTranslations('teams');
  const filled = team.members.filter(Boolean).length;

  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span className="flex shrink-0 gap-1">
        {team.members.map((member, index) => member ? (
          <span
            key={index}
            title={member.name}
            className="rounded-full p-px"
            style={{ background: member.elementColor }}
          >
            <AssetImage
              src={member.icon}
              kind="avatar"
              alt={member.name}
              className="block h-9 w-9 rounded-full bg-icon-bed"
              sizes="36px"
            />
          </span>
        ) : (
          <span key={index} className="h-[2.375rem] w-[2.375rem] rounded-full border border-dashed border-edge" />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${team.draft ? 'text-muted' : ''}`}>{team.name}</span>
        <span className="flex flex-wrap items-baseline gap-x-2 font-mono text-2xs text-muted">
          {team.draft && <span>{t('draftTag')}</span>}
          {team.objectiveLabel && <span className="text-accent">{team.objectiveLabel}</span>}
          {team.errors > 0 && <span className="text-bad">{team.errors} ✗</span>}
          {team.warnings > 0 && <span className="text-warn">{team.warnings} !</span>}
          {team.errors === 0 && team.warnings === 0 && filled === 4 && (
            <span className="text-good">{t('ok')}</span>
          )}
        </span>
      </span>
    </span>
  );
}
