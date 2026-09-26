/**
 * Cross-checks the derived GOOD crosswalk against Genshin Optimizer's own
 * id-to-key maps.
 *
 * The keys in `core/good.json` are derived from English names rather than
 * copied from a list, which is what keeps a patch from needing hand-editing.
 * The risk that buys is a silent divergence: if the derivation and GOOD's
 * vocabulary ever disagree, an import rejects an item that should have
 * resolved. This is the check that finds that before a user does.
 *
 *     pnpm data:check-good
 *
 * It writes nothing. `core/` keeps exactly one owner, `scripts/build-data.mts`.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DATA = path.join(import.meta.dirname, '..', 'src', 'generated', 'data');

const SOURCES = {
  artifactSets: 'artifact',
  weapons: 'weapon',
  characters: 'character',
} as const;

type Section = keyof typeof SOURCES;

type Crosswalk = {
  artifactSets: Record<string, number>;
  weapons: Record<string, number>;
  characters: Record<string, number>;
  excluded: Record<Section, Record<string, number[]>>;
};

/** `  15001: 'GladiatorsFinale',` — the whole file is one object literal. */
const ENTRY = /^\s*(\d+):\s*'([A-Za-z0-9_]+)'/gm;

/** raw.githubusercontent sheds load under contention, so a 5xx is worth a retry. */
async function fetchText(url: string, attempts = 3) {
  let last = '';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, {
      headers: { 'user-agent': 'gi-organizer/0.1 (good key check)' },
    }).catch((error: Error) => error);

    if (response instanceof Error) {
      last = response.message;
    } else if (response.ok) {
      return await response.text();
    } else if (response.status < 500) {
      // A 404 means the upstream layout moved; retrying will not fix that.
      throw new UpstreamError(`${url}: HTTP ${response.status} ${response.statusText}`);
    } else {
      last = `HTTP ${response.status} ${response.statusText}`;
    }

    if (attempt < attempts) await new Promise((done) => setTimeout(done, attempt * 750));
  }

  throw new UpstreamError(`${url}: ${last}`);
}

class UpstreamError extends Error {}

async function fetchGoMap(file: string) {
  const url =
    'https://raw.githubusercontent.com/frzyc/genshin-optimizer/master/' +
    `libs/gi/dm/src/mapping/${file}.ts`;

  const source = await fetchText(url);
  const byId = new Map<number, string>();
  for (const match of source.matchAll(ENTRY)) {
    byId.set(Number(match[1]), match[2]);
  }
  if (byId.size === 0) {
    throw new Error(`${url}: parsed 0 entries — the upstream format changed`);
  }
  return byId;
}

function compare(ours: Record<string, number>, theirs: Map<number, string>) {
  const ourKeyById = new Map(Object.entries(ours).map(([key, id]) => [id, key]));

  const mismatched: string[] = [];
  const onlyTheirs: string[] = [];
  const onlyOurs: string[] = [];

  for (const [id, theirKey] of theirs) {
    const ourKey = ourKeyById.get(id);
    if (!ourKey) onlyTheirs.push(`${id} ${theirKey}`);
    else if (ourKey !== theirKey) mismatched.push(`${id} ours=${ourKey} theirs=${theirKey}`);
  }

  for (const [id, ourKey] of ourKeyById) {
    if (!theirs.has(id)) onlyOurs.push(`${id} ${ourKey}`);
  }

  return { mismatched, onlyTheirs, onlyOurs };
}

function report(label: string, entries: string[], limit = 12) {
  if (entries.length === 0) return;
  console.log(`  ${label} (${entries.length})`);
  for (const entry of entries.slice(0, limit)) console.log(`    ${entry}`);
  if (entries.length > limit) console.log(`    … ${entries.length - limit} more`);
}

async function main() {
  const crosswalk = JSON.parse(
    await readFile(path.join(DATA, 'core', 'good.json'), 'utf8'),
  ) as Crosswalk;

  let mismatches = 0;

  for (const section of Object.keys(SOURCES) as Section[]) {
    const theirs = await fetchGoMap(SOURCES[section]);
    const result = compare(crosswalk[section], theirs);
    mismatches += result.mismatched.length;

    const ours = Object.keys(crosswalk[section]).length;
    console.log(
      `${section}: ${ours} derived, ${theirs.size} upstream, ` +
      `${result.mismatched.length} mismatched`,
    );

    // A mismatch is a real divergence: the same id, two different keys. The
    // "only" lists are expected — the catalog ships entities GOOD never sees,
    // and the Traveler is deliberately excluded from the derived map.
    report('MISMATCH', result.mismatched);
    report('only upstream', result.onlyTheirs);
    report('only derived', result.onlyOurs);

    const excluded = Object.entries(crosswalk.excluded[section]);
    for (const [key, ids] of excluded) {
      console.log(`  ambiguous "${key}" -> ${ids.join(', ')} (omitted by design)`);
    }
  }

  if (mismatches > 0) {
    console.error(
      `\n${mismatches} key(s) resolve to a different id upstream. ` +
      'Add an override in CHARACTER_KEY_OVERRIDES or fix goodKey() ' +
      'in src/lib/good/derive.ts, then re-run pnpm data:build.',
    );
    process.exitCode = 1;
    return;
  }

  console.log('\nno divergence');
}

// A network failure here proves nothing about the crosswalk, so it exits
// distinctly from a real divergence: this check is advisory, and the build has
// already asserted the properties that matter locally.
await main().catch((error: unknown) => {
  if (error instanceof UpstreamError) {
    console.error(`upstream unavailable: ${error.message}`);
    console.error('the crosswalk was not checked; re-run when GitHub responds');
    process.exitCode = 2;
    return;
  }
  throw error;
});
