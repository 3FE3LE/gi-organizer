/**
 * Resolver hook for running the app's modules under `node --test`.
 *
 * The source uses bundler-style imports — the `@/` alias from `tsconfig.json`
 * and no file extensions — neither of which Node resolves on its own. Node 24's
 * synchronous `registerHooks` closes the gap in a few lines, so the pure layers
 * (`inventory`, `good`, `enka`) are testable without a bundler, a test
 * framework, or a transpile step.
 *
 * Run it through `pnpm test`, which wires the flag and the glob.
 */
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

/** `./foo` -> `./foo.ts`, and `./foo` -> `./foo/index.ts`. */
function withExtension(filePath) {
  if (existsSync(filePath) && path.extname(filePath)) return filePath;
  for (const candidate of [`${filePath}.ts`, `${filePath}.tsx`, path.join(filePath, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // `server-only` throws on import outside a React Server Component. It is a
    // bundler guard, and this harness is not a bundler — stubbing it is what
    // lets a server module be exercised directly by a test.
    if (specifier === 'server-only') {
      return { url: pathToFileURL(path.join(SRC, '..', 'scripts', 'server-only-stub.mjs')).href, shortCircuit: true };
    }

    // `next/cache` is the framework's invalidation hook. A test exercising a
    // server action wants the writes, not the revalidation, so it is stubbed
    // for the same reason `server-only` is.
    if (specifier === 'next/cache') {
      return { url: pathToFileURL(path.join(ROOT, 'scripts', 'next-cache-stub.mjs')).href, shortCircuit: true };
    }

    // `next/navigation` is the framework's control flow. A test exercising a
    // server action wants the write it performs, not the navigation after it,
    // so it is stubbed for the same reason `next/cache` is.
    if (specifier === 'next/navigation') {
      return { url: pathToFileURL(path.join(ROOT, 'scripts', 'next-navigation-stub.mjs')).href, shortCircuit: true };
    }

    if (specifier.startsWith('@/')) {
      const resolved = withExtension(path.join(SRC, specifier.slice(2)));
      if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }

    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const parent = path.dirname(fileURLToPath(context.parentURL));
      const resolved = withExtension(path.resolve(parent, specifier));
      if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});
