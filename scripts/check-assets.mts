/**
 * Verifies that the icon names in the generated catalog resolve on the asset
 * host. A missing name is invisible at build time — `next/image` only fails when
 * a viewer loads the page — so this is the check that catches a patch renaming
 * or omitting an asset.
 *
 *     pnpm data:check-assets              # samples 25 names per kind
 *     pnpm data:check-assets --all        # every name, ~2000 requests
 *     pnpm data:check-assets --sample 60
 *
 * Requests are capped at 6 in flight to stay a polite client.
 *
 * A full run also writes `assets-missing.json`: the names the host routed for
 * their kind does not serve. The app reads it to draw a placeholder instead of
 * firing a request that 404s. A sampled run never writes it, since a partial
 * list would erase known gaps.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { type AssetKind, iconUrl } from '../src/lib/data/assets.ts';
import type {
  ById,
  CoreArtifact,
  CoreCharacter,
  CoreMaterial,
  CoreWeapon,
  EnkaStore,
} from '../src/lib/data/types.ts';

const DATA_DIR = path.join(import.meta.dirname, '..', 'src', 'generated', 'data');
const CONCURRENCY = 6;

const args = process.argv.slice(2);
const checkAll = args.includes('--all');
const sampleSize = Number(args[args.indexOf('--sample') + 1]) || 25;

async function readJson<T>(relative: string) {
  return JSON.parse(await readFile(path.join(DATA_DIR, relative), 'utf8')) as T;
}

/** Evenly spaced rather than random, so a rerun checks the same names. */
function sample<T>(items: T[], size: number) {
  if (checkAll || items.length <= size) return items;
  const step = items.length / size;
  return Array.from({ length: size }, (_, i) => items[Math.floor(i * step)]);
}

type Target = { kind: AssetKind; name: string };

async function collect(): Promise<Target[]> {
  const [characters, weapons, artifacts, materials, enka] = await Promise.all([
    readJson<ById<CoreCharacter>>('core/characters.json'),
    readJson<ById<CoreWeapon>>('core/weapons.json'),
    readJson<ById<CoreArtifact>>('core/artifacts.json'),
    readJson<ById<CoreMaterial>>('core/materials.json'),
    readJson<EnkaStore>('enka/characters.json'),
  ]);

  const groups: Record<AssetKind, string[]> = {
    avatar: Object.values(characters).map((c) => c.icon).filter(nonNull),
    avatarSide: Object.values(characters).map((c) => c.sideIcon).filter(nonNull),
    splash: Object.values(characters).map((c) => c.gachaSplash).filter(nonNull),
    weapon: Object.values(weapons).map((w) => w.icon).filter(nonNull),
    weaponAwaken: Object.values(weapons).map((w) => w.awakenIcon).filter(nonNull),
    relic: Object.values(artifacts)
      .flatMap((a) => Object.values(a.pieces).map((piece) => piece?.icon))
      .filter(nonNull),
    material: Object.values(materials).map((m) => m.icon).filter(nonNull),
    // Talent and constellation art is named by `pnpm data:enka`, not by the
    // catalog, so it is collected from that table instead.
    talent: Object.values(enka).flatMap((entry) => Object.values(entry.skills)),
    constellation: Object.values(enka).flatMap((entry) => entry.constellationIcons),
  };

  return (Object.entries(groups) as [AssetKind, string[]][]).flatMap(([kind, names]) =>
    sample([...new Set(names)], sampleSize).map((name) => ({ kind, name })),
  );
}

function nonNull<T>(value: T | null | undefined): value is T {
  return value != null;
}

async function head(target: Target) {
  const url = iconUrl(target.name, target.kind);
  if (!url) return { ...target, status: 0 };

  const response = await fetch(url, {
    method: 'HEAD',
    headers: { 'user-agent': 'gi-organizer/0.1 (asset check)' },
  });
  return { ...target, status: response.status };
}

async function main() {
  const targets = await collect();
  const results: Awaited<ReturnType<typeof head>>[] = [];

  // A plain worker pool: `CONCURRENCY` consumers pulling off one shared queue.
  const queue = [...targets];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let next = queue.pop(); next; next = queue.pop()) {
        results.push(await head(next));
      }
    }),
  );

  const missing = results.filter((result) => result.status !== 200);
  const byKind = new Map<string, number>();
  for (const result of results) {
    byKind.set(result.kind, (byKind.get(result.kind) ?? 0) + 1);
  }

  const summary = [...byKind].map(([kind, count]) => `${kind} ${count}`).join(', ');
  console.log(`checked ${results.length} assets (${summary})`);

  for (const result of missing) {
    console.log(`  ${result.status} ${result.kind} ${result.name}`);
  }

  if (checkAll) {
    const names = missing.map((result) => result.name).sort();
    await writeFile(
      path.join(DATA_DIR, 'assets-missing.json'),
      `${JSON.stringify(names)}\n`,
    );
    console.log(`${names.length} unresolved name(s) → assets-missing.json`);
    return;
  }

  if (missing.length > 0) {
    console.log('re-run with --all to record these as known gaps');
  }
}

await main();
