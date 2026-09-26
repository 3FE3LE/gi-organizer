import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      {/* Into the app when nothing asked for a particular page: `/` is the
          public landing now, and landing there after signing in would be a
          step backwards. A redirect from a protected page still wins. */}
      <SignIn fallbackRedirectUrl="/es/plan" />
    </main>
  );
}
