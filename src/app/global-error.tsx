'use client';

import './globals.css';

/**
 * The last boundary: a failure in the root layout itself, which is where the
 * locale, the messages and the whole chrome are decided.
 *
 * So it renders its own document and cannot translate anything — there is no
 * provider above it and no resolved locale to ask. It answers in the default
 * locale, and its only job is to not be a white screen.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="es" className="h-full">
      <body className="flex min-h-full items-center justify-center p-6">
        <div role="alert" className="max-w-prose space-y-3">
          <h1 className="text-lg font-medium">Algo se rompió</h1>
          <p className="text-sm text-muted">
            La aplicación no pudo cargar. Volvé a intentarlo; si sigue igual, recargá la página.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="rounded border border-accent px-3 py-1.5 text-sm text-accent transition-colors hover:bg-surface-2"
          >
            Reintentar
          </button>
          {error.digest && (
            <p className="font-mono text-xs text-muted">Referencia: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
