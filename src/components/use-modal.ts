'use client';

import { useEffect, type RefObject } from 'react';

/**
 * What `aria-modal` promises and markup alone does not deliver.
 *
 * Saying a panel is modal tells a screen reader to ignore the page behind it.
 * Nothing about that moves the keyboard: without this, Tab walks straight out
 * of the dialog into the header links underneath, the Escape key is the only
 * way back, and closing leaves focus wherever it drifted to — usually the top
 * of the document, which means scrolling the whole page again to resume.
 *
 * So three things, all of them expected of a dialog:
 *
 *   1. **Focus moves in.** To the first control, or the panel itself when it
 *      has none yet, which is the case while the candidates are still loading.
 *   2. **Tab cycles inside.** Both directions, wrapping at the ends.
 *   3. **Focus goes back** to whatever opened it when it closes.
 *
 * Escape stays with the caller: some dialogs close on it and some want to ask
 * first, and that is a decision about the dialog rather than about focus.
 *
 * The page behind is also frozen, because a dialog that scrolls the document
 * under itself loses the reader's place in it.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useModalFocus(panel: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = panel.current;
    if (!node) return;

    const opener = document.activeElement as HTMLElement | null;
    const focusable = () => [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];

    // The panel itself when it holds nothing focusable yet — which is the case
    // while a candidate list is still loading. It carries `tabIndex={-1}` for
    // exactly this, so the next Tab starts here and not at the top of the page.
    const first = focusable()[0] ?? node;
    first.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const edge = event.shiftKey ? items[0] : items[items.length - 1];
      const wrap = event.shiftKey ? items[items.length - 1] : items[0];

      // Also covers focus sitting on the panel itself, which is outside the
      // list and would otherwise let Tab escape on the first press.
      if (document.activeElement === edge || !node.contains(document.activeElement)) {
        event.preventDefault();
        wrap.focus();
      }
    };

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey, true);

    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [panel]);
}
