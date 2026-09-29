'use client';

import { RotateCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { syncShowcaseAction } from '@/app/[locale]/showcase-actions';

/** Reads the showcase now, whatever the last read was. */
export function RefreshShowcase({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => {
        await syncShowcaseAction(true);
        router.refresh();
      })}
      className={buttonVariants({ variant: 'outline', size: 'xs', className: 'gap-1.5' })}
    >
      <RotateCw size={12} aria-hidden className={pending ? 'animate-spin' : ''} />
      {label}
    </button>
  );
}
