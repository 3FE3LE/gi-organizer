'use server';

import { refresh } from 'next/cache';
import { getTranslations } from 'next-intl/server';

import { redo, undo } from '@/lib/player/history';

export type HistoryState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export async function undoAction(): Promise<HistoryState> {
  const result = await undo();
  refresh();
  const t = await getTranslations('data.history');

  if (result.ok) return { status: 'ok', message: t('undoneMessage', { op: result.op }) };
  return {
    status: 'error',
    message: result.reason === 'nothing-to-undo' ? t('nothingToUndo') : t('undoFailed'),
  };
}

export async function redoAction(): Promise<HistoryState> {
  const result = await redo();
  refresh();
  const t = await getTranslations('data.history');

  if (result.ok) return { status: 'ok', message: t('redoneMessage', { op: result.op }) };
  return {
    status: 'error',
    message: result.reason === 'nothing-to-redo' ? t('nothingToRedo') : t('redoFailed'),
  };
}
