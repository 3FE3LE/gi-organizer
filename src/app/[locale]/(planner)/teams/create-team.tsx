'use client';

import { useActionState } from 'react';

import { type TeamActionState, createTeamAction } from './actions';

export function CreateTeam() {
  const [state, create, pending] = useActionState<TeamActionState, FormData>(
    createTeamAction, { status: 'idle' },
  );

  return (
    <form
      action={create}
      key={state.status === 'ok' ? state.message : 'create'}
      className="space-y-2"
    >
      <input
        name="name"
        required
        placeholder="Nombre del equipo"
        className="w-full rounded border border-edge bg-ink px-2 py-1.5 text-sm"
      />
      <select
        name="mode"
        defaultValue="abyss"
        className="w-full rounded border border-edge bg-ink px-2 py-1.5 text-sm"
      >
        <option value="abyss">Abismo</option>
        <option value="theater">Teatro</option>
        <option value="stygian">Stygian</option>
        <option value="other">Otro</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded border border-edge bg-ink px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
      >
        Crear equipo
      </button>
      {state.status !== 'idle' && (
        <span
          className={`font-mono text-xs ${state.status === 'ok' ? 'text-muted' : 'text-accent'}`}
        >
          {state.message}
        </span>
      )}
    </form>
  );
}
