import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The checks a person cannot be asked to repeat on every page.
 *
 * axe finds the mechanical half of accessibility — a control with no name, a
 * landmark nested inside itself, a heading that skips a level, text under the
 * contrast ratio — which is exactly the half that regresses silently while
 * nobody is looking at a screen reader. The judgement half (is the focus order
 * sensible, does the label say the right thing) stays with review; this is the
 * floor, not the ceiling.
 *
 * Scoped to WCAG 2.1 A and AA, because that is the bar the app is written to.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Venti, the character `e2e/seed.mts` writes. Repeated rather than imported:
 *  importing the seed would re-run it inside the test process. */
const SEEDED_CHARACTER = 10000022;

const PAGES = [
  { name: 'roster', path: '/es/characters' },
  { name: 'plan', path: '/es/plan' },
  { name: 'artifacts', path: '/es/artifacts' },
  { name: 'teams', path: '/es/teams' },
  { name: 'data', path: '/es/data' },
  { name: 'build', path: `/es/build/${SEEDED_CHARACTER}?tab=objective` },
  // The catalogue entry, which is where the element colours are loudest.
  { name: 'catalogue', path: `/es/characters/${SEEDED_CHARACTER}` },
];

/**
 * Both palettes, because there are two of them now and a contrast failure in
 * the one nobody developed in is exactly the one that ships. The theme is
 * stored, not negotiated, so the suite writes the same key the toggle does —
 * see `components/theme-script.tsx`.
 */
const THEMES = ['dark', 'light'] as const;

for (const theme of THEMES) {
for (const { name, path } of PAGES) {
  test(`${name} has no axe violations (${theme})`, async ({ page }) => {
    await page.addInitScript((value) => {
      try {
        localStorage.setItem('gi-theme', value);
      } catch {
        // Nothing stored means the system theme, which is still a valid run.
      }
    }, theme);
    await page.goto(path);

    // The page is dynamic and streams; waiting for the heading rather than a
    // timeout means the scan runs against the real content and not a skeleton.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

    // Down to the node, so a failure names the element to fix rather than a
    // rule to go looking for.
    expect(
      violations.flatMap((violation) =>
        violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`)),
    ).toEqual([]);
  });
}
}

test('the candidates dialog keeps focus and gives it back', async ({ page }) => {
  await page.goto(`/es/build/${SEEDED_CHARACTER}`);

  const opener = page.getByRole('button', { name: 'Editar' }).first();
  await opener.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Focus moved into the dialog rather than staying on the page behind it.
  await expect(dialog).toContainText(/./);
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // And came back to what opened it, so the next Tab resumes where it was.
  await expect(opener).toBeFocused();
});
