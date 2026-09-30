import { CalendarCheck, MonitorUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ElementIcon } from '@/components/element-icon';
import { HelpRow, HelpSection, HelpTip } from '@/components/help-tip';
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
 * The one mark a card carries in its corner: whether the plan farms for them.
 *
 * A calendar for someone in the plan, and "hoy" instead when a talent book
 * they still need is in rotation today — which says the same and more. Out of
 * the plan carries nothing: it used to be a crossed-out eye, the one mark on
 * the roster that said what a character was not, and on an account trimmed to
 * a dozen it was on nearly every card.
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
  labels: { planned: string; today: string; todayTitle: string };
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

  if (dismissed) return null;
  if (!booksToday) {
    return explain(
      labels.planned,
      <span
        title={focusable ? undefined : labels.planned}
        tabIndex={focusable ? 0 : undefined}
        className={`absolute z-10 rounded-sm text-accent after:absolute after:-inset-1.5 after:content-[''] ${className}${ring}`}
      >
        <CalendarCheck size={14} aria-hidden />
        <span className="sr-only">{labels.planned}</span>
      </span>,
    );
  }

  return explain(
    labels.todayTitle,
    <span
      title={focusable ? undefined : labels.todayTitle}
      tabIndex={focusable ? 0 : undefined}
      className={`absolute z-10 rounded-full border border-info/50 bg-surface px-1.5 font-mono text-2xs leading-4 text-info after:absolute after:-inset-1 after:content-[''] ${className}${ring}`}
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
/** Lower left, clear of the constellation opposite it and of the name below. */
const SHOWCASE_ANGLE = 145;
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
  showcased = null,
  children,
}: {
  elementType: string;
  elementText: string;
  /** Null for a character the account does not have. */
  constellation: number | null;
  /**
   * In the Enka showcase, and what that means on hover. Their progress is
   * read from it on its own — see `lib/player/showcase-sync.ts`.
   */
  showcased?: string | null;
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
      {showcased && (
        <RimBadge angle={SHOWCASE_ANGLE} className="h-5 w-5 p-0 text-accent">
          <span title={showcased} className="flex items-center justify-center">
            <MonitorUp size={11} aria-hidden />
            <span className="sr-only">{showcased}</span>
          </span>
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
  rating = null,
  ratingBelow = false,
}: {
  /** As the app writes it: `80+` once ascended at the breakpoint. */
  level: number | string;
  talent: { auto: number; skill: number; burst: number };
  /** Per talent, whether it reached its target; null when there is none to reach. */
  met: { auto: boolean; skill: boolean; burst: boolean } | null;
  labels: { level: string; talents: string };
  /** How well built, 0–100, and what it says on hover. */
  rating?: { score: number; title: string } | null;
  /**
   * On a phone, the rating on a line of its own. A roster card is too narrow
   * for all three, and its line truncates, so the rating was what got cut.
   */
  ratingBelow?: boolean;
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
      {rating && (
        <span className={ratingBelow ? 'block sm:inline' : ''}>
          <span className={ratingBelow ? 'hidden sm:inline' : ''}>{' · '}</span>
          <RatingValue score={rating.score} title={rating.title} />
        </span>
      )}
    </span>
  );
}

/**
 * What the marks on a card mean, drawn as they appear on it.
 *
 * Each of them is explained on hover, which a phone does not have and which
 * nobody finds without being told to look. Behind the app's `?`, written out
 * beside it, so it costs one line to the player who already knows.
 */
export function CardLegend({
  labels,
  className = '',
}: {
  labels: { summary: string; ring: string; talents: string; today: string; todayText: string; planned: string; showcase?: string };
  className?: string;
}) {
  const common = useTranslations('common');
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
        <span className="rounded-full border border-info/50 bg-surface px-1.5 font-mono text-2xs leading-4 text-info">
          {labels.todayText}
        </span>
      ),
      text: labels.today,
    },
    { key: 'planned', mark: <CalendarCheck size={14} aria-hidden className="text-accent" />, text: labels.planned },
    ...(labels.showcase
      ? [{ key: 'showcase', mark: <MonitorUp size={14} aria-hidden className="text-accent" />, text: labels.showcase }]
      : []),
  ];

  return (
    <div className={`text-xs ${className}`}>
      <HelpTip label={labels.summary} text={labels.summary} title={labels.summary} closeLabel={common('close')} align="end">
        <HelpSection>
          {items.map((item) => (
            <HelpRow key={item.key} mark={item.mark}>{item.text}</HelpRow>
          ))}
        </HelpSection>
      </HelpTip>
    </div>
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

/**
 * The rating, as a number on the card's own line — see `lib/rules/rating.ts`.
 * Green once a build reads as finished, muted while it is well short.
 */
export function RatingValue({ score, title }: { score: number; title: string }) {
  const tone = score >= 80 ? 'text-good' : score >= 50 ? 'text-text' : 'text-muted';
  return (
    <span title={title} className={`tabular ${tone}`}>
      {score}
      <span className="sr-only"> · {title}</span>
    </span>
  );
}
