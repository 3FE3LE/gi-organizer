'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Light or dark, and nothing in between.
 *
 * The third state — "follow the system" — is the one the app starts in and the
 * one a toggle cannot express without becoming a three-way control nobody
 * reads. So this is a switch: until it is touched the stylesheet follows the
 * operating system, and touching it writes a choice that outranks it.
 *
 * ## Why the icon is decided in CSS
 *
 * Which theme is on screen is a fact only the browser holds — the page is
 * prerendered, and `theme-script.tsx` resolves it before React exists. A
 * component that worked it out in an effect would render nothing at all until
 * hydration, which on a cold load is a blank square in the header for as long
 * as the JavaScript takes. Both icons ship, and the same selectors that pick
 * the palette pick which one is visible. See `globals.css`.
 *
 * The label stays constant for the same reason: it has to be right before the
 * component knows anything, and "switch theme" always is.
 */
export function ThemeToggle() {
  const t = useTranslations('ui');

  function toggle() {
    const root = document.documentElement;
    const current = root.dataset.theme
      ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const next = current === 'light' ? 'dark' : 'light';

    root.dataset.theme = next;
    try {
      localStorage.setItem('gi-theme', next);
    } catch {
      // Private mode, or storage denied. The theme still applies to this page.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t('themeToggle')}
      title={t('themeToggle')}
      className="btn btn-quiet btn-icon"
    >
      <Sun size={16} aria-hidden className="theme-sun" />
      <Moon size={16} aria-hidden className="theme-moon" />
    </button>
  );
}
