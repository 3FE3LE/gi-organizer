'use client';

import { X } from 'lucide-react';
import { useState } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Hint } from '@/components/hint';

/**
 * A name that opens into what it actually does.
 *
 * The same shape as a talent's disc in `abilities.tsx`: a hover hint for
 * whoever is already reading closely, and a tap for whoever wants the whole
 * thing — full text, in a dialog, rather than a bubble that has to fit next
 * to whatever it was drawn over. A tooltip that only opens on hover or focus
 * is a tooltip a touch screen never sees; the dialog is what a tap actually
 * does here.
 */
export function EffectButton({
  title,
  lines,
  hint,
  closeLabel,
  className,
  children,
}: {
  title: string;
  /** One paragraph per bonus — a set's 2pc and 4pc, a weapon's passive. */
  lines: string[];
  /** Shown on hover/focus, before anyone taps. */
  hint: string;
  closeLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (lines.length === 0) {
    return <span className={className}>{children}</span>;
  }

  return (
    <>
      <Hint text={hint}>
        <button type="button" onClick={() => setOpen(true)} className={className}>
          {children}
        </button>
      </Hint>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="panel max-w-sm gap-0 overflow-hidden p-0 ring-0"
        >
          <header className="flex items-start gap-3 border-b border-edge px-4 py-3">
            <DialogTitle className="flex-1 text-sm font-normal">{title}</DialogTitle>
            <DialogClose
              aria-label={closeLabel}
              className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            >
              <X size={16} aria-hidden />
            </DialogClose>
          </header>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto px-4 py-3 text-xs leading-relaxed text-muted">
            {lines.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
