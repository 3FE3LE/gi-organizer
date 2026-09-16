import type { ImportIssue, ImportIssueCode } from './model';

/**
 * Primitive validators for untrusted JSON.
 *
 * Every one returns `undefined` on failure and records an issue, so a caller
 * composes them and checks once at the end. That is what lets a single bad
 * artifact be skipped while the other 1275 import.
 *
 * Hand-written rather than a schema library on purpose: the requirement is that
 * an unrecognized key is *reported*, and the coercing defaults that schema
 * libraries encourage would turn an unknown set into a real one.
 */
export class IssueLog {
  readonly issues: ImportIssue[] = [];

  add(
    code: ImportIssueCode,
    path: string,
    message: string,
    extra: { raw?: unknown; suggestion?: string; severity?: 'error' | 'warning' } = {},
  ) {
    this.issues.push({
      code,
      severity: extra.severity ?? 'error',
      path,
      message,
      raw: extra.raw,
      suggestion: extra.suggestion,
    });
    return undefined;
  }
}

export function asObject(value: unknown, path: string, log: IssueLog) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return log.add('wrong-type', path, 'expected an object', { raw: value });
  }
  return value as Record<string, unknown>;
}

export function asArray(value: unknown, path: string, log: IssueLog, max: number) {
  if (!Array.isArray(value)) {
    return log.add('wrong-type', path, 'expected an array', { raw: value });
  }
  if (value.length > max) {
    return log.add('out-of-range', path, `${value.length} entries exceeds the ${max} cap`);
  }
  return value as unknown[];
}

export function asString(value: unknown, path: string, log: IssueLog) {
  if (typeof value !== 'string') {
    return log.add('wrong-type', path, 'expected a string', { raw: value });
  }
  return value;
}

export function asInt(
  value: unknown,
  path: string,
  log: IssueLog,
  min: number,
  max: number,
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return log.add('wrong-type', path, 'expected a number', { raw: value });
  }
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) {
    return log.add('out-of-range', path, `expected ${min}-${max}`, { raw: value });
  }
  return rounded;
}

export function asNumber(value: unknown, path: string, log: IssueLog) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return log.add('wrong-type', path, 'expected a number', { raw: value });
  }
  return value;
}

/** Absent is not the same as wrong: a missing lock is unknown, not `false`. */
export function asOptionalBoolean(value: unknown, path: string, log: IssueLog) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') {
    log.add('wrong-type', path, 'expected a boolean', { raw: value, severity: 'warning' });
    return null;
  }
  return value;
}

export function asEnum<T extends string>(
  value: unknown,
  path: string,
  log: IssueLog,
  allowed: readonly T[],
  code: ImportIssueCode = 'wrong-type',
) {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return log.add(code, path, `expected one of ${allowed.join(', ')}`, { raw: value });
  }
  return value as T;
}

/** Cheap edit-distance suggestion, for "did you mean" on an unknown key. */
export function nearestKey(needle: string, haystack: Iterable<string>) {
  const target = needle.toUpperCase();
  let best: string | undefined;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of haystack) {
    const score = distance(target, candidate.toUpperCase());
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  // Beyond a third of the length the "suggestion" is noise.
  return bestScore <= Math.max(2, Math.floor(needle.length / 3)) ? best : undefined;
}

function distance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return previous[b.length];
}
