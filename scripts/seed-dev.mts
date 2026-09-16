/**
 * Fills the development database from a GOOD export.
 *
 * `pnpm dev` runs against its own file under a profile nobody signs in as, so
 * it starts empty and every page is the empty state. That is the wrong thing
 * to look at while building a page about a thousand artifacts, and the
 * alternative — pointing development at the deployed database — means every
 * experiment is performed on the player's real account.
 *
 *     pnpm dev:seed                       # the newest export in data/imports
 *     pnpm dev:seed path/to/export.json
 *
 * Goes through the same parse and merge the app uses, so what lands here is
 * what would land in production, and a bug in the import shows up here first.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { getGoodCrosswalk } from '@/lib/data/registry';
import { createKeyResolver } from '@/lib/good/keys';
import { parseGood } from '@/lib/good/parse';
import { applyNormalized } from '@/lib/player/import';

const IMPORTS = 'data/imports';

async function newestExport() {
  const entries = await readdir(IMPORTS).catch(() => {
    throw new Error(`no ${IMPORTS}/ — pass a file: pnpm dev:seed path/to/export.json`);
  });

  const files = entries.filter((name) => name.endsWith('.json'));
  if (files.length === 0) throw new Error(`no .json under ${IMPORTS}/`);

  const dated = await Promise.all(files.map(async (name) => {
    const file = path.join(IMPORTS, name);
    return { file, at: (await stat(file)).mtimeMs };
  }));

  return dated.sort((a, b) => b.at - a.at)[0].file;
}

const file = process.argv[2] ?? await newestExport();
const json = JSON.parse(await readFile(file, 'utf8')) as unknown;

const parsed = parseGood(json, { resolver: createKeyResolver(await getGoodCrosswalk()) });
if (!parsed.ok) {
  throw new Error(`not a usable GOOD file: ${parsed.value.issues[0]?.message ?? 'unreadable'}`);
}

const result = await applyNormalized(parsed.value);

console.log(`seeded data/dev.db from ${file}`);
console.log(
  `  artefactos +${result.persisted.artifacts.inserted} ~${result.persisted.artifacts.updated}`
  + ` · armas +${result.persisted.weapons.inserted}`
  + ` · personajes ${result.charactersUpserted}`
  + ` · materiales ${result.materialsUpserted}`,
);
