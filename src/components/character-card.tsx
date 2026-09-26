import { EyeOff } from 'lucide-react';

import { ElementIcon } from '@/components/element-icon';
import { FoldMark } from '@/components/fold-mark';
import { Hint } from '@/components/hint';
import { elementColor } from '@/lib/data/elements';

/**
 * The parts a character card is drawn from, shared by the roster and the
 * team board so the two cannot drift: a character reads the same wherever
 * they appear — the element washing the top, the rarity the bottom, the level
 * as a ring round the portrait, the element and the constellation on its rim,
 * the level and talents under the name, and one mark in the corner.
 *
 * No hooks and no translation calls: every string comes in already worded, so
 * the parts render the same in a Server Component and a client one.
 */

/** The element as a wash behind the portrait, the rarity rising from the foot. */
export function CardWash({ elementType, rarity }: { elementType: string; rarity: number }) {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-25 transition-opacity duration-300 group-hover:opacity-45"
        style={{ background: `radial-gradient(60% 100% at 50% 0%, ${elementColor(elementType)}, transparent 70%)` }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 opacity-35 transition-opacity duration-300 group-hover:opacity-55"
        style={{
          background: `linear-gradient(to top, var(${rarity >= 5 ? '--rarity-5' : '--rarity-4'}), transparent)`,
        }}
      />
    </>
  );
}

/**
 * The one mark a card carries in its corner: out of the plan, or a talent
 * book they still need is in rotation today. Out of the plan wins — the plan
 * farms nothing for them.
 *
 * Its explanation depends on what the card is. A card that is itself a link —
 * the roster's — cannot hold a second thing to focus, and a tooltip inside it
 * would cost the link its page transition (see `components/hint.tsx`), so
 * there the mark keeps a plain `title` and says itself to a screen reader
 * through its hidden text. A card that is not a link — the team board's —
 * passes `focusable`, and the mark becomes a stop on the keyboard with a real
 * hint.
 */
export function CardMark({
  dismissed,
  booksToday,
  labels,
  focusable = false,
  className = 'right-2 top-2',
}: {
  dismissed: boolean;
  booksToday: boolean;
  labels: { dismissed: string; today: string; todayTitle: string };
  /** Whether the mark can take focus and a hint: only on a card that is not a link. */
  focusable?: boolean;
  /** Where in the corner, for a card that keeps something else there. */
  className?: string;
}) {
  const explain = (text: string, mark: React.ReactElement) =>
    focusable ? <Hint text={text}>{mark}</Hint> : mark;
  const ring = focusable
    ? ' focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
    : '';

  if (dismissed) {
    return explain(
      labels.dismissed,
      <span
        title={focusable ? undefined : labels.dismissed}
        tabIndex={focusable ? 0 : undefined}
        className={`absolute z-10 rounded-sm text-muted ${className}${ring}`}
      >
        <EyeOff size={13} aria-hidden />
        <span className="sr-only">{labels.dismissed}</span>
      </span>,
    );
  }
  if (!booksToday) return null;

  return explain(
    labels.todayTitle,
    <span
      title={focusable ? undefined : labels.todayTitle}
      tabIndex={focusable ? 0 : undefined}
      className={`absolute z-10 rounded-full border border-accent/50 bg-surface px-1.5 font-mono text-2xs leading-4 text-accent ${className}${ring}`}
    >
      {labels.today}
      <span className="sr-only">: {labels.todayTitle}</span>
    </span>,
  );
}

/** Lower right of the portrait, just outside its 40px radius. */
const CONSTELLATION_ANGLE = 35;
/** Upper left, across the portrait from the constellation. */
const ELEMENT_ANGLE = 215;
/** Just outside the 40px radius, so a badge overlaps the border, not the face. */
const RIM = 42;

/**
 * An 80px portrait with what belongs on it: the level ring, the element's
 * emblem and the constellation on the rim. The picture itself is `children`,
 * because each page draws it its own way — the roster through a view
 * transition to the build page, the team board with an asset resolved on the
 * server.
 */
export function CharacterPortrait({
  elementType,
  elementText,
  constellation,
  ring,
  children,
}: {
  elementType: string;
  elementText: string;
  /** Null for a character the account does not have. */
  constellation: number | null;
  /** How far the level is towards its target, 0–1, and what it says on hover. */
  ring: { value: number; title: string } | null;
  children: React.ReactNode;
}) {
  return (
    <div className="relative mx-auto h-20 w-20">
      {ring && <LevelRing value={ring.value} title={ring.title} />}
      {children}
      <RimBadge angle={ELEMENT_ANGLE} className="h-6 w-6 p-0">
        <ElementIcon element={elementType} label={elementText} className="h-4 w-4" />
      </RimBadge>
      {constellation !== null && (
        <RimBadge
          angle={CONSTELLATION_ANGLE}
          // Full constellations are the milestone; any other is a count.
          className={`min-w-4 px-1 font-mono text-2xs leading-4 ${
            constellation >= 6 ? 'text-accent' : constellation > 0 ? 'text-text' : 'text-muted'
          }`}
        >
          C{constellation}
        </RimBadge>
      )}
    </div>
  );
}

/**
 * Where a character is: the level, then the three talents, each green once it
 * has reached its own target. One colour for all three hid which one was
 * short.
 */
export function LevelTalents({
  level,
  talent,
  met,
  labels,
}: {
  level: number;
  talent: { auto: number; skill: number; burst: number };
  /** Per talent, whether it reached its target; null when there is none to reach. */
  met: { auto: boolean; skill: boolean; burst: boolean } | null;
  labels: { level: string; talents: string };
}) {
  return (
    <span className="whitespace-nowrap font-mono text-2xs text-muted">
      {/* A narrow card has no room for the prefix; the ring already says it
          is the level. */}
      <span className="sm:hidden">{level}</span>
      <span className="hidden sm:inline">{labels.level}</span>
      {' · '}
      <span title={labels.talents} className="tabular">
        {(['auto', 'skill', 'burst'] as const).map((key, at) => (
          <span key={key}>
            {at > 0 && '·'}
            <span className={met?.[key] ? 'text-good' : ''}>{talent[key]}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * What the marks on a card mean, drawn as they appear on it.
 *
 * Each of them is explained on hover, which a phone does not have and which
 * nobody finds without being told to look. Folded, so it costs one line to
 * the player who already knows.
 */
export function CardLegend({
  labels,
  className = '',
}: {
  labels: { summary: string; ring: string; talents: string; today: string; todayText: string; dismissed: string };
  className?: string;
}) {
  const circumference = 2 * Math.PI * 9.5;
  const items = [
    {
      key: 'ring',
      mark: (
        <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6 -rotate-90">
          <circle cx="12" cy="12" r="9.5" fill="none" strokeWidth="2.5" className="stroke-edge" />
          <circle
            cx="12" cy="12" r="9.5" fill="none" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={circumference * 0.3}
            className="stroke-accent"
          />
        </svg>
      ),
      text: labels.ring,
    },
    {
      key: 'talents',
      mark: (
        <span className="font-mono text-2xs text-muted">
          <span className="text-good">1</span>·6·<span className="text-good">9</span>
        </span>
      ),
      text: labels.talents,
    },
    {
      key: 'today',
      mark: (
        <span className="rounded-full border border-accent/50 bg-surface px-1.5 font-mono text-2xs leading-4 text-accent">
          {labels.todayText}
        </span>
      ),
      text: labels.today,
    },
    { key: 'dismissed', mark: <EyeOff size={14} aria-hidden className="text-muted" />, text: labels.dismissed },
  ];

  return (
    <details className={`group/legend text-xs sm:max-w-md ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-1 text-muted hover:text-text sm:justify-end">
        <FoldMark group="legend" />
        {labels.summary}
      </summary>
      <ul className="card mt-2 space-y-2 p-3">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3">
            <span className="flex w-20 shrink-0 justify-center">{item.mark}</span>
            <span className="text-muted">{item.text}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * The level as a ring on the portrait's own rim, where the eye already is.
 * Full turns green: that character has reached what the plan wants of them.
 */
function LevelRing({ value, title }: { value: number; title: string }) {
  const radius = 41;
  const length = 2 * Math.PI * radius;

  return (
    <svg viewBox="0 0 88 88" aria-hidden className="pointer-events-none absolute -inset-1 h-[88px] w-[88px] -rotate-90">
      <title>{title}</title>
      <circle cx="44" cy="44" r={radius} fill="none" strokeWidth="2.5" className="stroke-edge" />
      <circle
        cx="44"
        cy="44"
        r={radius}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={length}
        strokeDashoffset={length * (1 - value)}
        className={value >= 1 ? 'stroke-good' : 'stroke-accent'}
      />
    </svg>
  );
}

function RimBadge({ angle, className, children }: { angle: number; className: string; children: React.ReactNode }) {
  const radians = (angle * Math.PI) / 180;

  return (
    <span
      className={`tabular absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-edge bg-surface text-center shadow-sm ${className}`}
      style={{
        left: `calc(50% + ${(Math.cos(radians) * RIM).toFixed(2)}px)`,
        top: `calc(50% + ${(Math.sin(radians) * RIM).toFixed(2)}px)`,
      }}
    >
      {children}
    </span>
  );
}
