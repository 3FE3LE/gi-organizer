'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { ActionStatus } from '@/components/action-status';
import { AssetImage } from '@/components/asset-image';
import { ElementIcon } from '@/components/element-icon';
import { Button } from '@/components/ui/button';

import type { ActionState } from './import-actions';
import { addToRosterAction } from './roster-actions';

export type UnrosteredEntry = {
  id: number;
  name: string;
  icon: string | null;
  items: number;
  /** Set for the Traveler, who needs a body and an element on top. */
  traveler: {
    bodies: { body: 'male' | 'female'; name: string; icon: string | null }[];
    elements: { value: string; label: string }[];
  } | null;
};

/**
 * One character the scan saw only through their gear, and the few numbers
 * that put them on the roster: level, constellation, talents — and for the
 * Traveler, which body and which element.
 */
export function AddToRoster({ entry }: { entry: UnrosteredEntry }) {
  const t = useTranslations('data.inventoryPage.addRoster');
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addToRosterAction, { status: 'idle' },
  );
  const [body, setBody] = useState<'male' | 'female'>('male');
  const [element, setElement] = useState<string | null>(null);
  const shown = entry.traveler?.bodies.find((candidate) => candidate.body === body);

  return (
    <li className="card space-y-3 p-3">
      <div className="flex items-center gap-3">
        <AssetImage
          src={shown?.icon ?? entry.icon}
          kind="avatar"
          alt=""
          className="h-10 w-10 rounded-full border border-edge bg-surface-2"
          sizes="40px"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{shown?.name ?? entry.name}</p>
          <p className="font-mono text-2xs text-muted">{t('itemsCount', { count: entry.items })}</p>
        </div>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="characterId" value={entry.id} />

        {entry.traveler && (
          <>
            <Choice label={t('body')}>
              {entry.traveler.bodies.map((candidate) => (
                <Option
                  key={candidate.body}
                  selected={body === candidate.body}
                  onClick={() => setBody(candidate.body)}
                >
                  {candidate.name}
                </Option>
              ))}
              <input type="hidden" name="body" value={body} />
            </Choice>

            <Choice label={t('element')}>
              {entry.traveler.elements.map((candidate) => (
                <Option
                  key={candidate.value}
                  selected={element === candidate.value}
                  onClick={() => setElement(candidate.value)}
                  title={candidate.label}
                >
                  <ElementIcon element={candidate.value} label={candidate.label} className="h-5 w-5" sizes="20px" />
                </Option>
              ))}
              {element && <input type="hidden" name="element" value={element} />}
            </Choice>
          </>
        )}

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Number name="level" label={t('level')} min={1} max={90} defaultValue={90} />
          <Number name="constellation" label={t('constellation')} min={0} max={6} defaultValue={0} />
          <Number name="auto" label={t('auto')} min={1} max={10} defaultValue={1} />
          <Number name="skill" label={t('skill')} min={1} max={10} defaultValue={1} />
          <Number name="burst" label={t('burst')} min={1} max={10} defaultValue={1} />
          <label className="flex items-end gap-1.5 pb-2 text-xs text-muted">
            <input type="checkbox" name="ascended" defaultChecked className="accent-accent" />
            {t('ascended')}
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <ActionStatus state={state} className="font-mono text-xs" />
          <Button
            type="submit"
            size="sm"
            disabled={pending || (entry.traveler !== null && element === null)}
            className="ml-auto"
          >
            {t('submit')}
          </Button>
        </div>
      </form>
    </li>
  );
}

function Choice({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-2xs uppercase tracking-wide text-muted">{label}</p>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Option({
  selected,
  onClick,
  title,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={title}
      onClick={onClick}
      className={`flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${
        selected ? 'border-transparent bg-accent font-medium text-on-accent' : 'border-edge text-muted hover:border-edge-strong hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}

function Number({
  name, label, min, max, defaultValue,
}: {
  name: string; label: string; min: number; max: number; defaultValue: number;
}) {
  return (
    <label className="min-w-0 space-y-1">
      <span className="block font-mono text-2xs uppercase tracking-wide text-muted">{label}</span>
      <input
        type="number"
        name={name}
        min={min}
        max={max}
        defaultValue={defaultValue}
        required
        className="field tabular w-full px-2 py-1.5 font-mono text-sm"
      />
    </label>
  );
}
