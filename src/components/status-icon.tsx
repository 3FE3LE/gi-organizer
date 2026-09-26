import { AlertTriangle, Check, Info, XCircle } from 'lucide-react';

/**
 * A verdict, drawn the same wherever one is given: green for met or fine,
 * amber for close or worth a look, red for short or wrong — each with its own
 * icon, so the colour is never the only thing saying it.
 *
 * Two vocabularies meet here because the app reports both: a goal is `met`,
 * `close` or `short`; a finding is `info`, `warning` or `error`. Accent is
 * kept for "selected" and "important", and never used for a verdict.
 */
export type Status = 'met' | 'close' | 'short' | 'info' | 'warning' | 'error';

const TONE: Record<Status, string> = {
  met: 'text-good',
  close: 'text-warn',
  short: 'text-bad',
  info: 'text-muted',
  warning: 'text-warn',
  error: 'text-bad',
};

const ICON = {
  met: Check,
  close: AlertTriangle,
  short: XCircle,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
} as const;

export function statusTone(status: string) {
  return TONE[status as Status] ?? 'text-muted';
}

export function StatusIcon({ status, size = 12, className = '' }: { status: string; size?: number; className?: string }) {
  const Icon = ICON[status as Status] ?? Info;
  return <Icon size={size} aria-hidden className={`inline shrink-0 ${statusTone(status)} ${className}`} />;
}
