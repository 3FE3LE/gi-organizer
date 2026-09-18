import { expect, test } from '@playwright/test';

/**
 * The bug these exist for: the build forms saved correctly and then showed you
 * an empty field, because React resets a form with an action once the action
 * resolves and an uncontrolled field goes back to what it mounted with.
 *
 * 178 unit tests could not see it — the write was right, the screen was not. So
 * each of these asserts the same thing in the same order: choose, save, and
 * then read the control back, both straight away and after a reload.
 */

/**
 * Picks the nth row of a `FieldSelect` and returns what it says.
 *
 * The form's dropdowns are Base UI listboxes now, not `<select>`s, so there is
 * nothing to `selectOption` and no `value` to read back: the trigger is a
 * button that states the chosen row, and the rows only exist while it is open.
 * Addressed by label, which is what a person has to go on too.
 */
async function choose(page: import('@playwright/test').Page, label: string, nth: number) {
  const trigger = page.getByRole('combobox', { name: label, exact: true });
  await trigger.click();

  const option = page.getByRole('option').nth(nth);
  const text = (await option.innerText()).trim();
  await option.click();
  await expect(trigger).toContainText(text);

  return { trigger, text };
}

const CHARACTER = 10000022;
const BUILD = `/es/build/${CHARACTER}?tab=objective`;

/**
 * Opens the set picker and returns its list.
 *
 * Scoped through the trigger's `aria-controls` rather than by taking the first
 * list on the page: the build page has six, and picking buttons out of "the"
 * list quietly selected a Comparar from the artifact slots instead.
 *
 * Addressed by its label and not by its text, because its text is the set it
 * holds — so a test that ran after one which chose a set could not find it.
 */
async function openSetPicker(page: import('@playwright/test').Page) {
  const trigger = page.getByRole('button', { name: 'primer set del plan' });
  await trigger.click();

  const id = await trigger.getAttribute('aria-controls');
  expect(id).toBeTruthy();

  // Index 0 clears the choice, so the sets start at 1.
  return page.locator(`[id="${id}"]`).getByRole('button');
}

test('a chosen set survives its own save', async ({ page }) => {
  await page.goto(BUILD);

  const option = (await openSetPicker(page)).nth(1);
  const chosen = (await option.innerText()).split('\n')[0].trim();
  expect(chosen).toBeTruthy();

  await option.click();
  const trigger = page.getByRole('button', { expanded: false }).filter({ hasText: chosen });
  await expect(trigger).toBeVisible();

  await page.getByRole('button', { name: 'Guardar objetivo' }).click();
  await expect(page.getByText(/guardado/)).toBeVisible();

  // The control still holds it, and so does the database.
  await expect(page.getByText(chosen).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(chosen).first()).toBeVisible();
});

test('the chosen set shows what its bonus does', async ({ page }) => {
  await page.goto(BUILD);

  await (await openSetPicker(page)).nth(1).click();

  // Hovering the picker is what asks for the effects; a 4-piece plan activates both lines.
  await page.getByRole('button', { expanded: false }).first().hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('2pc');

  // Switching to 2+2 marks the four-piece line as one this plan never buys.
  await page.getByRole('button', { name: '2 + 2' }).click();
  await page.getByRole('button', { expanded: false }).first().hover();
  await expect(page.getByRole('tooltip')).toContainText('sólo cuenta el bono de 2 piezas');
});

test('main stats survive the same save', async ({ page }) => {
  await page.goto(BUILD);

  const label = 'main stat de arena';
  const { trigger, text } = await choose(page, label, 1);

  await page.getByRole('button', { name: 'Guardar objetivo' }).click();
  await expect(page.getByText(/guardado/)).toBeVisible();
  await expect(trigger).toContainText(text);

  await page.reload();
  await expect(page.getByRole('combobox', { name: label, exact: true })).toContainText(text);
});

test('the substat priority survives its own save', async ({ page }) => {
  await page.goto(BUILD);

  const label = 'Substat 1º del plan';
  const { trigger, text } = await choose(page, label, 1);

  await page.getByRole('button', { name: 'Guardar objetivo' }).click();
  await expect(page.getByText(/guardado/)).toBeVisible();
  await expect(trigger).toContainText(text);

  await page.reload();
  await expect(page.getByRole('combobox', { name: label, exact: true })).toContainText(text);
});

test('a stat goal round-trips with its threshold', async ({ page }) => {
  await page.goto(BUILD);

  const label = 'Estadística de la meta 1';
  const { text } = await choose(page, label, 1);
  await page.locator('input[name="goals.0.min"]').fill('200');
  await page.getByRole('button', { name: 'Guardar objetivo' }).click();
  await expect(page.getByText(/guardado/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('combobox', { name: label, exact: true })).toContainText(text);
  await expect(page.locator('input[name="goals.0.min"]')).toHaveValue('200');
});

test('the levelling target reaches the farming plan', async ({ page }) => {
  await page.goto(BUILD);

  // The talent steppers are `Controller`-driven and carry no field name, so
  // they are addressed the way a person addresses them: by their label.
  await page.getByLabel('objetivo: Normal', { exact: true }).fill('9');
  await page.getByRole('button', { name: 'Guardar objetivo' }).click();
  await expect(page.getByText(/guardado/)).toBeVisible();

  await page.goto('/es/plan?range=all');
  await expect(page.getByText(/build con objetivo de nivel/)).toBeVisible();
});

test('the goal rows start at three and grow on request', async ({ page }) => {
  await page.goto(BUILD);

  const rows = page.getByRole('combobox', { name: /Estadística de la meta/ });
  await expect(rows).toHaveCount(3);

  await page.getByRole('button', { name: 'otro objetivo' }).click();
  await expect(rows).toHaveCount(4);

  await page.getByRole('button', { name: 'Quitar el objetivo 4' }).click();
  await expect(rows).toHaveCount(3);
});

test('a role and its priority save together with the rest', async ({ page }) => {
  await page.goto(BUILD);

  const role = page.getByRole('combobox', { name: 'Rol', exact: true });
  await role.click();
  await page.getByRole('option', { name: 'Potenciador', exact: true }).click();

  await page.getByRole('button', { name: 'Guardar objetivo' }).click();
  await expect(page.getByText(/guardado/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Rol', exact: true })).toContainText('Potenciador');
});

/**
 * Refinement is copies, and copies are only a plan where they can be forged.
 *
 * A five-star or an off-banner four-star is a wish: nothing the player does
 * between now and the next copy changes anything, so the field states what the
 * account holds instead of asking for a target. The forged bows here are
 * Prototype Crescent and Hamayumi; the five-star is Elegy for the End and the
 * battle-pass one is The Viridescent Hunt.
 */
test('the refinement target asks only for weapons that can be forged', async ({ page }) => {
  await page.goto(BUILD);

  const weapon = page.getByRole('combobox', { name: 'Arma objetivo', exact: true });
  const refinement = page.getByRole('spinbutton', { name: 'refinamiento del arma objetivo' });
  const stated = page.getByText('no forjable');

  const pick = async (name: string) => {
    await weapon.click();
    await page.getByRole('option', { name, exact: false }).first().click();
  };

  // Forged, so the copies are farmable and the stepper is there.
  await pick('Arco Compuesto');
  await expect(refinement).toBeVisible();
  await expect(stated).toHaveCount(0);

  // A five-star: copies are wishes, so the field states what the account holds.
  await pick('Alas Celestiales');
  await expect(refinement).toHaveCount(0);
  await expect(stated).toBeVisible();

  await pick('Masacrademonios');
  await expect(refinement).toBeVisible();

  // The battle pass hands out one copy per cycle: a date, not a cost.
  await pick('Cazadora Esmeralda');
  await expect(refinement).toHaveCount(0);
});
