'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { ActionStatus } from '@/components/action-status';

import {
  type ActionState,
  applyShowcaseAction,
  applyStagedAction,
} from './import-actions';

type Summary = {
  artifacts: { unchanged: number; upgraded: number; added: number; ambiguous: number; absent: number };
  weapons: { unchanged: number; added: number; absent: number };
  characters: number;
  issues: number;
};

type Preview = {
  token: string;
  filename: string;
  bytes: number;
  origin: string;
  coverage: 'full' | 'partial';
  summary: Summary;
  suspect: { reason: string } | null;
  issues: { code: string; count: number; examples: { path: string; message: string; suggestion?: string }[] }[];
};

/**
 * Upload, then review, then apply.
 *
 * The two steps are separate on purpose: an import is the one operation that
 * can quietly invent or delete a piece, and the whole tool is worthless if the
 * inventory is not true. So nothing is written until the numbers have been
 * looked at.
 */
export function ImportForm() {
  const t = useTranslations('data.import');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();

  const [applyState, apply, applying] = useActionState<ActionState, FormData>(
    applyStagedAction, { status: 'idle' },
  );
  const [seedState, seed, seeding] = useActionState<ActionState, FormData>(
    applyShowcaseAction, { status: 'idle' },
  );

  function upload(form: FormData) {
    setUploadError(null);
    setPreview(null);

    startUpload(async () => {
      const response = await fetch('/api/import/good', { method: 'POST', body: form });
      const body = await response.json();

      if (!response.ok) {
        setUploadError(body.message ?? body.error ?? t('readError'));
        return;
      }
      setPreview(body as Preview);
    });
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          {t('fileSectionTitle')}
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted">
          {t('fileSectionHint')}
        </p>

        <form action={upload} className="mt-4 flex flex-wrap items-center gap-3">
          {/* A file input carries an intrinsic width wider than a small phone,
              so it is capped rather than allowed to widen the page. */}
          <input
            type="file"
            name="file"
            accept=".json,.GOOD,application/json"
            required
            className="min-w-0 max-w-full text-sm file:mr-3 file:rounded-md file:border file:border-edge file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-text"
          />
          <Button variant="outline" type="submit" disabled={uploading}>
            {uploading ? t('reading') : t('preview')}
          </Button>
        </form>

        {uploadError && (
          <p className="mt-3 card px-3 py-2 text-sm text-accent">
            {uploadError}
          </p>
        )}

        {preview && (
          <div className="mt-6 space-y-4">
            <p className="font-mono text-xs text-muted">
              {preview.filename} · {(preview.bytes / 1024).toFixed(0)} KB ·{' '}
              {preview.origin} · {t('coveragePrefix', { coverage: preview.coverage })}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Counts title={t('artifactsCounts')} entries={Object.entries(preview.summary.artifacts)} />
              <Counts title={t('weaponsCounts')} entries={Object.entries(preview.summary.weapons)} />
            </div>

            <p className="font-mono text-xs text-muted">
              {t('charactersInFile', { count: preview.summary.characters })}
            </p>

            {preview.suspect && (
              <p className="rounded border border-accent/40 bg-surface px-3 py-2 text-sm">
                <strong className="text-accent">{t('suspectLabel')}</strong> {preview.suspect.reason}.
                {t('suspectSuffix')}
              </p>
            )}

            {preview.issues.length > 0 && (
              <ul className="space-y-2 text-xs">
                {preview.issues.map((group) => (
                  <li key={group.code} className="card px-3 py-2">
                    <p className="font-mono">
                      {group.code} <span className="text-muted">×{group.count}</span>
                    </p>
                    {group.examples.map((example) => (
                      <p key={example.path} className="mt-1 text-muted">
                        {example.path}: {example.message}
                        {example.suggestion && ` ${t('suggestionHint', { suggestion: example.suggestion })}`}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            )}

            <form action={apply} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="token" value={preview.token} />
              {/* Only a source that saw the whole inventory may prune, and even
                  then only because the user asked for it. */}
              {preview.coverage === 'full' && (
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input type="checkbox" name="onAbsent" value="remove" />
                  {t('removeAbsentLabel')}
                </label>
              )}
              <Button
                variant="default"
                type="submit"
                disabled={applying}
              >
                {applying ? t('applying') : t('apply')}
              </Button>
            </form>

            <Result state={applyState} />
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          {t('showcaseSectionTitle')}
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted">
          {t('showcaseSectionHint')}
        </p>

        <form action={seed} className="mt-4 flex flex-wrap items-center gap-3">
          <input
            name="uid"
            inputMode="numeric"
            placeholder="UID"
            pattern="[1-9][0-9]{8,9}"
            required
            className="field h-8 w-40 rounded-lg px-2.5 font-mono text-sm"
          />
          <Button variant="outline" type="submit" disabled={seeding}>
            {seeding ? t('reading') : t('importShowcase')}
          </Button>
        </form>

        <Result state={seedState} />
      </section>
    </div>
  );
}

function Counts({ title, entries }: { title: string; entries: [string, number][] }) {
  return (
    <div className="card p-3">
      <p className="text-sm">{title}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 font-mono text-xs">
        {entries.map(([key, value]) => (
          <div key={key} className="flex justify-between">
            <dt className="text-muted">{key}</dt>
            <dd className={value > 0 ? '' : 'text-muted'}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Result({ state }: { state: ActionState }) {
  return (
    <ActionStatus
      state={state}
      className="mt-3 rounded border px-3 py-2 font-mono text-xs"
      tone={(current) =>
        current.status === 'ok'
          ? 'border-edge bg-surface'
          : 'border-accent/40 bg-surface text-accent'}
    />
  );
}
