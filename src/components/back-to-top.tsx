'use client';

import { ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/**
 * A way back up from the bottom of a long page.
 *
 * The roster is a hundred and twenty cards, the box can be over a thousand
 * pieces, and on a phone the header — the only other way out — has scrolled
 * away. So once the page is a screen deep, a button appears in the corner.
 *
 * It is out of the tab order and the accessibility tree while hidden (`inert`),
 * because a control that cannot be seen should not be reachable either. It sits
 * above the phone's section bar and the build form's sticky save row; see
 * `.back-to-top` in `globals.css`.
 */
export function BackToTop() {
  const t = useTranslations('ui');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setVisible(window.scrollY > window.innerHeight);
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  function toTop() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    // Where a keyboard user would expect to be after "top": the start of the
    // content, not the button they pressed at the bottom of it.
    document.getElementById('content')?.focus({ preventScroll: true });
  }

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label={t('backToTop')}
      title={t('backToTop')}
      data-visible={visible}
      inert={!visible}
      className="back-to-top glass fixed right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border text-muted shadow-md transition-[opacity,translate,color] duration-200 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[visible=false]:pointer-events-none data-[visible=false]:translate-y-2 data-[visible=false]:opacity-0 sm:right-6"
    >
      <ArrowUp size={18} aria-hidden />
    </button>
  );
}
