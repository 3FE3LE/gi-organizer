/**
 * What a Server Action answered, announced rather than only drawn.
 *
 * Every action in this app reports back the same way — `idle`, then `ok` or a
 * failure with a message — and every screen used to render that message into a
 * paragraph that did not exist a moment earlier. A live region added at the
 * same moment it changes is a live region nothing announces: assistive tech
 * watches for changes inside regions it already knows about. So the element is
 * always in the tree and only its content changes.
 *
 * `status` rather than `alert` even for a failure: these are the results of
 * something the user just did, so they belong in the polite queue instead of
 * interrupting whatever is being read.
 */
export type ActionState = { status: string; message?: string };

export function ActionStatus({
  state,
  className = '',
  tone,
}: {
  state: ActionState;
  /** Applied only when there is something to say, so an idle status takes no space. */
  className?: string;
  /** Overrides the default text colour for the failure case. */
  tone?: (state: ActionState) => string;
}) {
  const idle = state.status === 'idle' || !state.message;
  const colour = tone
    ? tone(state)
    : state.status === 'ok'
      ? 'text-muted'
      : 'text-accent';

  return (
    <p
      role="status"
      aria-live="polite"
      className={idle ? 'sr-only' : `${className} ${colour}`}
    >
      {idle ? '' : state.message}
    </p>
  );
}
