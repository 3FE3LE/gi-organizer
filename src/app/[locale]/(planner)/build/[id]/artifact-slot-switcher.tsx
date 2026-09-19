'use client';

import { useState } from 'react';

/**
 * The five slots, as a row on a phone.
 *
 * Five full cards stacked is a screen and a half of scrolling before the
 * weapon is even in view — a cost every visit pays whether the visit is to
 * check one substat or to read the whole loadout. The row asks the smaller
 * question first (what's here, at a glance) and only pays for a full card
 * when a slot is actually tapped. `sm:` and up already had room for all five
 * side by side, so nothing here touches that layout.
 */
export function ArtifactSlotSwitcher({
  slots,
}: {
  slots: { key: string; title: string; compact: React.ReactNode; full: React.ReactNode }[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const active = slots.find((slot) => slot.key === selected) ?? null;

  return (
    <div className="sm:hidden">
      <ul className="grid grid-cols-5 gap-1.5">
        {slots.map((slot) => (
          <li key={slot.key}>
            <button
              type="button"
              onClick={() => setSelected((current) => (current === slot.key ? null : slot.key))}
              aria-label={slot.title}
              aria-pressed={slot.key === selected}
              className={`flex w-full items-center justify-center rounded-lg p-1 transition-colors ${
                slot.key === selected ? 'bg-surface-2 ring-1 ring-accent' : 'hover:bg-surface-2/60'
              }`}
            >
              {slot.compact}
            </button>
          </li>
        ))}
      </ul>

      {active && (
        <ul className="mt-2 grid grid-cols-1 gap-2">
          {active.full}
        </ul>
      )}
    </div>
  );
}
