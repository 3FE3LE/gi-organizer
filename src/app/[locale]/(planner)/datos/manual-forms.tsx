'use client';

import { useActionState } from 'react';

import {
  type FormState,
  addCharacterAction,
  addWeaponAction,
} from './inventory-actions';

type Option = { id: number; name: string; detail: string };

/**
 * Manual entry for what the scan missed. Kept in one place so it is obvious
 * which parts of the inventory are typed rather than observed — `source` on the
 * row records the same thing.
 */
export function ManualForms({
  characters,
  weapons,
}: {
  characters: Option[];
  weapons: Option[];
}) {
  const [characterState, addCharacter, addingCharacter] =
    useActionState<FormState, FormData>(addCharacterAction, { status: 'idle' });
  const [weaponState, addWeapon, addingWeapon] =
    useActionState<FormState, FormData>(addWeaponAction, { status: 'idle' });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        action={addCharacter}
        key={characterState.status === 'ok' ? characterState.message : 'character'}
        className="space-y-3 rounded border border-edge bg-surface p-4"
      >
        <h3 className="text-sm">Añadir personaje</h3>

        <Picker name="characterId" label="Personaje" options={characters} />

        <div className="grid grid-cols-3 gap-2">
          <Number name="level" label="Nivel" min={1} max={90} defaultValue={90} />
          <Number name="ascension" label="Ascenso" min={0} max={6} defaultValue={6} />
          <Number name="constellation" label="Const." min={0} max={6} defaultValue={0} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Number name="auto" label="Normal" min={1} max={10} defaultValue={1} />
          <Number name="skill" label="Habilidad" min={1} max={10} defaultValue={1} />
          <Number name="burst" label="Definitiva" min={1} max={10} defaultValue={1} />
        </div>

        <Submit pending={addingCharacter} state={characterState} />
      </form>

      <form
        action={addWeapon}
        key={weaponState.status === 'ok' ? weaponState.message : 'weapon'}
        className="space-y-3 rounded border border-edge bg-surface p-4"
      >
        <h3 className="text-sm">Añadir arma</h3>

        <Picker name="weaponId" label="Arma" options={weapons} />

        <div className="grid grid-cols-3 gap-2">
          <Number name="level" label="Nivel" min={1} max={90} defaultValue={90} />
          <Number name="ascension" label="Ascenso" min={0} max={6} defaultValue={6} />
          <Number name="refinement" label="Refin." min={1} max={5} defaultValue={1} />
        </div>

        <p className="text-xs text-muted">
          Entra sin asignar. Equipar es otra operación.
        </p>

        <Submit pending={addingWeapon} state={weaponState} />
      </form>
    </div>
  );
}

/**
 * A datalist over a plain text input rather than a select: 122 characters and
 * 249 weapons are more than a dropdown is usable for, and typing a few letters
 * is how anyone finds one.
 */
function Picker({ name, label, options }: { name: string; label: string; options: Option[] }) {
  const listId = `${name}-options`;

  return (
    <label className="block text-xs text-muted">
      {label}
      <input
        name={`${name}-search`}
        list={listId}
        required
        placeholder="escribe para buscar"
        className="mt-1 w-full rounded border border-edge bg-ink px-2 py-1.5 text-sm text-text"
        onChange={(event) => {
          const match = options.find((option) => option.name === event.target.value);
          const hidden = event.currentTarget.form?.elements.namedItem(name);
          if (hidden instanceof HTMLInputElement) hidden.value = match ? String(match.id) : '';
        }}
      />
      <input type="hidden" name={name} />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.id} value={option.name}>
            {option.detail}
          </option>
        ))}
      </datalist>
    </label>
  );
}

function Number({
  name, label, min, max, defaultValue,
}: { name: string; label: string; min: number; max: number; defaultValue: number }) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <input
        type="number"
        name={name}
        min={min}
        max={max}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded border border-edge bg-ink px-2 py-1.5 font-mono text-sm text-text"
      />
    </label>
  );
}

function Submit({ pending, state }: { pending: boolean; state: FormState }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-edge bg-ink px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
      >
        {pending ? 'Guardando…' : 'Añadir'}
      </button>
      {state.status !== 'idle' && (
        <span
          className={`font-mono text-xs ${
            state.status === 'ok' ? 'text-muted' : 'text-accent'
          }`}
        >
          {state.message}
        </span>
      )}
    </div>
  );
}
