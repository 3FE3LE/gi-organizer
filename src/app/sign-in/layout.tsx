import { ClerkProvider } from '@clerk/nextjs';

import '../globals.css';

/**
 * A root layout of its own, same reason as `sign-up/layout.tsx`: nobody has
 * picked a locale yet on the door into the app, so there is nothing here to
 * hand off to `next-intl` — just enough to render Clerk's own sign-in form.
 */
export default function SignInLayout({ children }: LayoutProps<'/sign-in'>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
