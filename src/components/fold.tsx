'use client';

import { Accordion } from '@base-ui/react/accordion';
import { createContext, useContext } from 'react';

import { FoldMark } from '@/components/fold-mark';

/**
 * The app's one fold: a line that opens onto what it hides.
 *
 * There were three before — `<details>` with a CSS height transition where the
 * browser had one, the team panel's accordion, and hand-rolled grids — and
 * they neither looked nor moved alike: a pile on the plan faded while an aura
 * slid, and a browser without `::details-content` snapped the first open while
 * animating the second. This is the accordion's motion, a transition on the
 * panel's measured height, with the plan piles' look: a card, the fold mark on
 * the left, the content under a rule.
 *
 * Folds inside one `FoldGroup` are exclusive: opening one closes the one that
 * was open, so a list of folds never grows by more than one of them. A `Fold`
 * outside any group is its own, and simply opens and shuts.
 *
 * `summary` and `children` may be server components: this file only owns the
 * state and the motion.
 */

const InGroup = createContext(false);

export function FoldGroup({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <InGroup value>
      <Accordion.Root multiple={false} className={className}>
        {children}
      </Accordion.Root>
    </InGroup>
  );
}

/** How the fold is dressed. */
const LOOKS = {
  /** A card of its own, as the plan's piles are. */
  card: {
    item: 'card',
    trigger: 'gap-3 px-3 py-2 text-xs',
    panel: 'border-t border-edge',
  },
  /** A row inside a card someone else draws — "more filters" under a strip. */
  row: {
    item: 'border-t border-edge',
    trigger: 'gap-2 px-3 py-2 text-xs transition-colors hover:bg-surface-2/60',
    panel: 'border-t border-edge',
  },
  /** No frame: a heading or a link-like line that opens. */
  bare: {
    item: '',
    trigger: 'gap-1.5',
    panel: '',
  },
} as const;

export function Fold({
  summary,
  children,
  look = 'card',
  defaultOpen = false,
  mark = 'start',
  className = '',
  triggerClassName = '',
  panelClassName = '',
  style,
}: {
  /** The line that stays: what the fold is, and what is worth knowing shut. */
  summary: React.ReactNode;
  children: React.ReactNode;
  look?: keyof typeof LOOKS;
  /** Open on first render. Key the fold on it to reopen on a new value. */
  defaultOpen?: boolean;
  /** Where the fold mark sits, or `none` for a summary that draws its own. */
  mark?: 'start' | 'end' | 'none';
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  style?: React.CSSProperties;
}) {
  const grouped = useContext(InGroup);
  const dress = LOOKS[look];

  const item = (
    <Accordion.Item
      value={grouped ? undefined : 'fold'}
      className={`${dress.item} ${className}`}
      style={style}
    >
      <Accordion.Header className="flex">
        <Accordion.Trigger
          className={`group/trigger flex min-w-0 flex-1 cursor-pointer items-center text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${dress.trigger} ${triggerClassName}`}
        >
          {mark === 'start' && <FoldMark group="trigger" />}
          {summary}
          {mark === 'end' && <FoldMark group="trigger" className="ml-auto" />}
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Panel className="fold-panel">
        <div className={`${dress.panel} ${panelClassName}`}>{children}</div>
      </Accordion.Panel>
    </Accordion.Item>
  );

  if (grouped) return item;

  // A fold alone is an accordion of one, so it moves exactly as a grouped one.
  return (
    <Accordion.Root defaultValue={defaultOpen ? ['fold'] : []}>
      {item}
    </Accordion.Root>
  );
}
