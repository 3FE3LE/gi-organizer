import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      {/* Into the app, not the public landing that `/` now is. */}
      <SignUp fallbackRedirectUrl="/es/characters" />
    </main>
  );
}
