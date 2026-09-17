'use client';

import { ChevronDown, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { AssetImage } from '@/components/asset-image';

/**
 * Choosing a set, with the set in front of you.
 *
 * A native `<select>` cannot draw an icon, and a set is recognised by its
 * flower long before its name is read — sixty-three names in a dropdown is a
 * reading exercise, sixty-three flowers is a glance. So this is a disclosure
 * over a list of buttons: the icon, the name, and what the ranking thought of
 * it, on one row.
 *
 * The effects are the other half. A set is a decision about a bonus, and the
 * bonus was two clicks away in the game's own UI and nowhere at all in this
 * one. Now the chosen set carries them, with the piece count that this plan
 * actually activates marked — a 2+2 never earns a four-piece bonus, and
 * showing one next to the other is how a plan gets built on a line nobody has.
 */

export type SetEffect = { pieces: 1 | 2 | 4; text: string };

export type SetOption = {
  /** The set id, as a string, because that is what the form holds. */
  value: string;
  name: string;
  /** Rank, plan and stock — the line the suggestion list used to show. */
  note: string | null;
  icon: string | null;
  effects: SetEffect[];
};

export type SetOptions = { suggested: SetOption[]; all: SetOption[] };

export function SetPicker({
  label,
  options,
  value,
  onChange,
  placeholder,
  /** How many pieces of this set the current plan wears: 4, or 2 in a 2+2. */
  activePieces,
}: {
  /**
   * Which of the plan's sets this picks.
   *
   * The trigger's text is the chosen set, so it has no stable name of its own:
   * before a choice it reads the placeholder and after one it reads whatever
   * was chosen, which leaves nothing for a screen reader to announce or for a
   * caller to address.
   */
  label: string;
  options: SetOptions;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  activePieces: 2 | 4;
}) {
  const t = useTranslations('build');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hinting, setHinting] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const popupId = useId();

  const byValue = useMemo(() => {
    const index = new Map<string, SetOption>();
    for (const option of [...options.suggested, ...options.all]) {
      if (!index.has(option.value)) index.set(option.value, option);
    }
    return index;
  }, [options]);

  const selected = value ? byValue.get(value) ?? null : null;

  // The suggested group keeps its ranking order; the rest stays alphabetical.
  // A set that is both only appears once, at the top, where the reason for it
  // being there is written.
  const groups = useMemo(() => {
    const matches = (option: SetOption) =>
      option.name.toLocaleLowerCase().includes(query.toLocaleLowerCase());

    const suggested = options.suggested.filter(matches);
    const shown = new Set(suggested.map((option) => option.value));

    return [
      { label: t('suggestedForCharacter'), items: suggested },
      { label: t('allOption'), items: options.all.filter((o) => matches(o) && !shown.has(o.value)) },
    ].filter((group) => group.items.length > 0);
  }, [options, query, t]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={root} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setHinting(true)}
        onMouseLeave={() => setHinting(false)}
        onFocus={() => setHinting(true)}
        onBlur={() => setHinting(false)}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        aria-describedby={selected && hinting ? `${popupId}-effects` : undefined}
        className="flex w-full min-w-0 items-center gap-2 rounded border border-edge bg-ink px-2 py-1.5 text-left text-sm transition-colors hover:border-accent focus:border-accent"
      >
        {selected ? (
          <>
            <AssetImage
              src={selected.icon}
              kind="relic"
              className="h-7 w-7 shrink-0"
              sizes="28px"
            />
            <span className="min-w-0 flex-1 truncate">
              {selected.name}
              {selected.note && <span className="text-muted"> {selected.note}</span>}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted">{placeholder}</span>
        )}
        <ChevronDown
          size={14}
          aria-hidden
          className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {selected && hinting && !open && (
        <Effects id={`${popupId}-effects`} option={selected} activePieces={activePieces} />
      )}

      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-64 rounded border border-edge-strong bg-surface shadow-lg">
          <div className="flex items-center gap-2 rounded-t border-b border-edge bg-ink px-2">
            <Search size={13} aria-hidden className="shrink-0 text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchSetPlaceholder')}
              aria-label={t('searchSetAria')}
              className="w-full bg-transparent py-2 text-xs"
            />
          </div>

          {/* Deliberately not an ARIA listbox: that role promises arrow-key
              navigation and a roving tabindex, and a half-implemented one is
              worse for a screen reader than plain buttons, which Tab and Enter
              already handle. */}
          <ul id={popupId} className="max-h-72 overflow-y-auto">
            <li>
              <Row
                selected={value === ''}
                onSelect={() => choose('')}
                label={<span className="text-muted">{placeholder}</span>}
              />
            </li>

            {groups.map((group) => (
              <li key={group.label}>
                <p className="border-y border-edge/40 bg-surface-2 px-2 py-1 font-mono text-[0.6rem] uppercase text-muted">
                  {group.label}
                </p>
                <ul aria-label={group.label}>
                  {group.items.map((option) => (
                    <li key={option.value}>
                      <Row
                        selected={option.value === value}
                        onSelect={() => choose(option.value)}
                        icon={option.icon}
                        label={
                          <>
                            <span className="truncate">{option.name}</span>
                            {option.note && (
                              <span className="truncate font-mono text-[0.65rem] text-muted">
                                {option.note}
                              </span>
                            )}
                          </>
                        }
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}

            {groups.length === 0 && (
              <li className="px-2 py-3 text-center text-xs text-muted">
                {t('noSetFound')}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({
  selected,
  onSelect,
  icon,
  label,
}: {
  selected: boolean;
  onSelect: () => void;
  icon?: string | null;
  label: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-2 px-2 py-2 text-left text-xs transition-colors hover:bg-surface-2 ${
        selected ? 'bg-surface-2/50 text-accent' : ''
      }`}
    >
      {icon !== undefined && (
        <AssetImage src={icon} kind="relic" className="h-7 w-7 shrink-0" sizes="28px" />
      )}
      <span className="flex min-w-0 flex-1 flex-col">{label}</span>
    </button>
  );
}

/**
 * What the set does, and which line of it this plan actually buys.
 *
 * A four-piece plan activates both bonuses; a 2+2 activates only the first of
 * each set. The inactive line stays visible rather than being hidden — knowing
 * what you are giving up is the point of splitting a set in the first place.
 */
function Effects({
  id,
  option,
  activePieces,
}: {
  id: string;
  option: SetOption;
  activePieces: 2 | 4;
}) {
  const t = useTranslations('build');
  if (option.effects.length === 0) return null;

  return (
    <div
      id={id}
      role="tooltip"
      className="absolute z-30 mt-1 w-full min-w-64 rounded border border-edge-strong bg-surface-2 p-3 shadow-xl"
    >
      <p className="mb-1 font-mono text-[0.6rem] uppercase text-muted">{option.name}</p>
      <ul className="space-y-1">
        {option.effects.map((effect) => {
          const active = effect.pieces <= activePieces;

          return (
            <li key={effect.pieces} className="flex gap-2 text-xs">
              <span
                className={`shrink-0 font-mono text-[0.65rem] ${
                  active ? 'text-accent' : 'text-muted line-through'
                }`}
              >
                {effect.pieces}pc
              </span>
              <span className={active ? '' : 'text-muted'}>{effect.text}</span>
            </li>
          );
        })}
      </ul>
      {activePieces === 2 && (
        <p className="mt-2 font-mono text-[0.6rem] text-muted">
          {t('twoPlusTwoNote')}
        </p>
      )}
    </div>
  );
}
