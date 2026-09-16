'use server';

import { refresh } from 'next/cache';

import { redo, undo } from '@/lib/player/history';

export type HistoryState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export async function undoAction(): Promise<HistoryState> {
  const result = undo();
  refresh();

  if (result.ok) return { status: 'ok', message: `deshecho: ${result.op}` };
  return {
    status: 'error',
    message: result.reason === 'nothing-to-undo' ? 'nada que deshacer' : 'no se pudo deshacer',
  };
}

export async function redoAction(): Promise<HistoryState> {
  const result = redo();
  refresh();

  if (result.ok) return { status: 'ok', message: `rehecho: ${result.op}` };
  return {
    status: 'error',
    message: result.reason === 'nothing-to-redo' ? 'nada que rehacer' : 'no se pudo rehacer',
  };
}
