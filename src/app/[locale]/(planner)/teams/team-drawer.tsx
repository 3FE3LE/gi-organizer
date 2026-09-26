'use client';

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, GripVertical, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { startTransition, useOptimistic, useState } from 'react';

import { AssetImage } from '@/components/asset-image';
import { buttonVariants } from '@/components/ui/button';
import { StatusIcon } from '@/components/status-icon';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';

import { reorderTeamsAction } from './actions';

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
          <SortableTeams
            locale={locale}
            teams={teams}
            selectedId={selectedId}
            onPick={() => setOpen(false)}
          />
          <div onClick={() => setOpen(false)}>{create}</div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** A list only moves up and down; a row dragged sideways stays in its lane. */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/**
 * The rows, in the order the player keeps them, and a grip to change it.
 *
 * Only the grip drags, so a tap on the row still opens the team. It is also
 * excluded from the drawer's own swipe — without that, pulling a team down
 * the list would pull the whole sheet closed.
 */
function SortableTeams({
  locale,
  teams,
  selectedId,
  onPick,
}: {
  locale: string;
  teams: RailEntry[];
  selectedId: string | null;
  onPick: () => void;
}) {
  const t = useTranslations('teams');
  const [shown, reorder] = useOptimistic(teams, (_, next: RailEntry[]) => next);
  const [announcement, setAnnouncement] = useState('');
  // Pointer only. dnd-kit's keyboard sensor listens on the window, and the
  // drawer stops arrow keys before they get there — so the keyboard moves a
  // team from its grip instead, one place per arrow, see `step`.
  const sensors = useSensors(useSensor(PointerSensor));

  const nameOf = (id: UniqueIdentifier) => shown.find((team) => team.id === id)?.name ?? '';
  const placeOf = (id: UniqueIdentifier | undefined) =>
    shown.findIndex((team) => team.id === id) + 1;

  const commit = (next: RailEntry[]) => {
    startTransition(async () => {
      reorder(next);
      await reorderTeamsAction(next.map((team) => team.id));
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    commit(arrayMove(
      shown,
      shown.findIndex((team) => team.id === active.id),
      shown.findIndex((team) => team.id === over.id),
    ));
  };

  const step = (id: string, by: -1 | 1) => {
    const from = shown.findIndex((team) => team.id === id);
    const to = from + by;
    if (from === -1 || to < 0 || to >= shown.length) return;
    commit(arrayMove(shown, from, to));
    setAnnouncement(t('dragListDropped', { name: nameOf(id), n: to + 1 }));
  };

  return (
    <DndContext
      id="team-list"
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: { draggable: t('dragListInstructions') },
        announcements: {
          onDragStart: ({ active }) => t('dragPicked', { name: nameOf(active.id) }),
          onDragOver: ({ active, over }) =>
            over ? t('dragListOver', { name: nameOf(active.id), n: placeOf(over.id) }) : '',
          onDragEnd: ({ active, over }) =>
            over ? t('dragListDropped', { name: nameOf(active.id), n: placeOf(over.id) }) : t('dragCancelled'),
          onDragCancel: () => t('dragCancelled'),
        },
      }}
    >
      <SortableContext items={shown.map((team) => team.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {shown.map((team) => (
            <SortableTeam
              key={team.id}
              locale={locale}
              team={team}
              selected={team.id === selectedId}
              onPick={onPick}
              onStep={(by) => step(team.id, by)}
            />
          ))}
        </ul>
      </SortableContext>
      <p aria-live="polite" className="sr-only">{announcement}</p>
    </DndContext>
  );
}

function SortableTeam({
  locale,
  team,
  selected,
  onPick,
  onStep,
}: {
  locale: string;
  team: RailEntry;
  selected: boolean;
  onPick: () => void;
  /** One place up or down, from the keyboard. */
  onStep: (by: -1 | 1) => void;
}) {
  const t = useTranslations('teams');
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({ id: team.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative flex items-stretch gap-1 ${isDragging ? 'z-10 opacity-90' : ''}`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          onStep(event.key === 'ArrowUp' ? -1 : 1);
        }}
        aria-keyshortcuts="ArrowUp ArrowDown"
        data-base-ui-swipe-ignore=""
        aria-label={t('dragHandle', { name: team.name })}
        title={t('dragHandle', { name: team.name })}
        className={`${buttonVariants({ variant: 'ghost', size: 'icon-sm' })} h-auto shrink-0 cursor-grab touch-none text-muted active:cursor-grabbing`}
      >
        <GripVertical size={14} aria-hidden />
      </button>
      <Link
        href={`/${locale}/teams?team=${team.id}`}
        onClick={onPick}
        aria-current={selected ? 'true' : undefined}
        className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
          team.draft ? 'border-dashed' : ''
        } ${
          selected
            ? 'border-accent ring-1 ring-accent'
            : 'border-edge bg-surface hover:border-edge-strong'
        } ${isDragging ? 'shadow-lg' : ''}`}
      >
        <Row team={team} />
      </Link>
    </li>
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
          {team.errors > 0 && (
            <span className="inline-flex items-center gap-0.5 text-bad"><StatusIcon status="error" size={10} />{team.errors}</span>
          )}
          {team.warnings > 0 && (
            <span className="inline-flex items-center gap-0.5 text-warn"><StatusIcon status="warning" size={10} />{team.warnings}</span>
          )}
          {team.errors === 0 && team.warnings === 0 && filled === 4 && (
            <span className="inline-flex items-center gap-0.5 text-good"><StatusIcon status="met" size={10} />{t('ok')}</span>
          )}
        </span>
      </span>
    </span>
  );
}
