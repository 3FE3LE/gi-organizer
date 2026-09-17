'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useActionState } from 'react';

import { type BuildFormState, createBuildAction } from './build-actions';

/**
 * The character's builds, as tabs.
 *
 * A character is a different target in different teams — supporting in one,
 * sub-dps in another — so the build is a mode of this screen rather than a
 * record buried in a list. It lives in the URL so every link is shareable and
 * a save comes back where it was.
 */

export type BuildTab = {
  id: string;
  /** The role this goal serves, already worded for reading. */
  label: string;
  /** The mechanic it narrows to, if any. */
  objective: string | null;
};

export function BuildPicker({
  characterId,
  builds,
  activeId,
  basePath,
  tab,
}: {
  characterId: number;
  builds: BuildTab[];
  activeId: string | null;
  basePath: string;
  tab: string;
}) {
  const t = useTranslations('build');
  const [createState, create, creating] = useActionState<BuildFormState, FormData>(
    createBuildAction, { status: 'idle' },
  );
  const state = createState;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {builds.map((build) => (
        <Link
          key={build.id}
          href={`${basePath}?build=${build.id}&tab=${tab}`}
          aria-current={build.id === activeId ? 'true' : undefined}
          className={`rounded border px-3 py-1 text-xs ${
            build.id === activeId
              ? 'border-accent bg-surface-2 text-accent'
              : 'border-edge text-muted hover:border-accent hover:text-text'
          }`}
        >
          {build.label}
          {build.objective && <span className="text-muted"> · {build.objective}</span>}
        </Link>
      ))}

      <form action={create}>
        <input type="hidden" name="characterId" value={characterId} />
        <input type="hidden" name="returnTo" value={basePath} />
        <button
          type="submit"
          disabled={creating}
          className="rounded border border-edge px-2 py-1 text-xs text-muted hover:border-accent disabled:opacity-50"
        >
          {t('addRoleButton')}
        </button>
      </form>

      {state.status === 'error' && (
        <span className="font-mono text-xs text-accent">{state.message}</span>
      )}
    </div>
  );
}
