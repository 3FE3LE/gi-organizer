'use client';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type FieldOption = { value: string; label: string; disabled?: boolean };

/** A run of options under a heading, or one with no heading at all. */
export type FieldGroup = { label?: string; options: FieldOption[] };

/**
 * The app's one dropdown.
 *
 * Every picker on the planner was a bare `<select>`: fine for four weekdays,
 * poor for the ones that matter here. A weapon list is two hundred entries in
 * two groups where the rank, the source and how many spares you hold are part
 * of the label; a set list carries the same. A native menu renders those as one
 * grey column of truncated text, cannot be styled, and on desktop opens a menu
 * that ignores the page's own type and spacing.
 *
 * So the dropdowns are shadcn's, over Base UI: same keyboard behaviour a native
 * select has — type to jump, arrows to move, Escape to dismiss — with the app's
 * surfaces, and a popup that can hold more than a string per row later on.
 *
 * It is one wrapper rather than the primitive spread across a dozen files so
 * that "a select in this app" is a single decision: the trigger keeps the
 * `field` look the inputs beside it have, the empty choice is a real option
 * rather than a placeholder nobody can pick, and every instance states its own
 * name for a screen reader.
 */
export function FieldSelect({
  value,
  defaultValue,
  onValueChange,
  onBlur,
  label,
  placeholder,
  groups,
  name,
  className,
  triggerClassName,
  disabled,
}: {
  /** Controlled value. Omit it and pass `defaultValue` for a plain form field. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onBlur?: () => void;
  /** What the control is called, for the accessibility tree. */
  label: string;
  /** The empty choice, when one is allowed. Omit to require a value. */
  placeholder?: string;
  groups: FieldGroup[];
  /** Mirrors the old `<select name>`, so a form still posts the value. */
  name?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}) {
  const options = groups.flatMap((group) => group.options);
  // Base UI reads the selected row's label from here, which is what lets the
  // trigger show `Amenoma Kageuchi · forjable` instead of `11414`.
  const items = Object.fromEntries(options.map((option) => [option.value, option.label]));

  return (
    <Select
      name={name}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(String(next ?? ''))}
      items={{ ...items, '': placeholder ?? '' }}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={label}
        onBlur={onBlur}
        className={`field h-auto w-full min-w-0 justify-between px-2 py-2 text-sm ${triggerClassName ?? ''}`}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>

      <SelectContent className={`max-h-80 ${className ?? ''}`}>
        {placeholder && (
          <SelectGroup>
            <SelectItem value="">{placeholder}</SelectItem>
          </SelectGroup>
        )}

        {groups.map((group, index) => (
          <SelectGroup key={group.label ?? index}>
            {group.label && <SelectLabel>{group.label}</SelectLabel>}
            {group.options.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
