import { ClerkProvider } from '@clerk/nextjs';

import '../globals.css';

/**
 * A root layout of its own — `[locale]` is the outermost segment for every
 * page that has one, so it owns `<html>`/`<body>` (see
 * `src/app/[locale]/layout.tsx`), and this door into the app sits outside
 * that segment: nobody has picked a locale yet, so there is nothing to hand
 * to `next-intl` here, just enough to render Clerk's own sign-up form.
 */
export default function SignUpLayout({ children }: LayoutProps<'/sign-up'>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
