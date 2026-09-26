/**
 * Downloads the game data from Project Amber (gi.yatta.moe) into a local cache.
 *
 * Amber is the catalog's one source now. `genshin-db`, which it replaces,
 * regenerated a character only in the patch that introduced them: when 6.7
 * rewrote Beidou's, Diona's and Wriothesley's talents, and 6.2 gave the
 * Hexerei their Secret Rite passives, none of it reached the package, and the
 * planner kept costing and describing the characters as they were in 1.0.
 * Amber mirrors the game's own data every patch, existing characters included.
 *
 * The cache is the raw responses, one file per request, under `.cache/yatta`
 * (ignored by git). `pnpm data:build` reads only the cache, so a build is
 * reproducible and needs no network; this script is the one that does. Re-run
 * it when a patch lands:
 *
 *     pnpm data:yatta
 *
 * Amber's avatar list trails a release by a few days, so the characters are
 * also discovered from Enka's store (`pnpm data:enka`), which does not, and
 * fetched by id — a detail answers before the list includes it.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { LOCALES } from '../src/lib/data/locales.ts';

const API = 'https://gi.yatta.moe/api/v2';
const CACHE = path.join(import.meta.dirname, '..', '.cache', 'yatta');
const ENKA = path.join(import.meta.dirname, '..', 'src', 'generated', 'data', 'enka', 'characters.json');

/** Requests in flight at once: quick, and polite to a volunteer-run API. */
const CONCURRENCY = 8;

async function get(url: string, attempt = 1): Promise<unknown> {
  const response = await fetch(url, { headers: { 'user-agent': 'gi-organizer data build' } });
  if (response.ok) return response.json();
  if (response.status === 404) return null;
  if (attempt >= 4) throw new Error(`${response.status} ${url}`);
  await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  return get(url, attempt + 1);
}

async function save(relative: string, value: unknown) {
  const file = path.join(CACHE, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value)}\n`);
}

/** Runs `work` over `items`, `CONCURRENCY` at a time. */
async function pool<T>(items: T[], work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) await work(items[next++]);
  }));
}

type List = { data: { items: Record<string, unknown> } };

async function main() {
  const enka = JSON.parse(await readFile(ENKA, 'utf8')) as Record<string, unknown>;
  // `10000005-504` is a Traveler's skill depot, not a character.
  const enkaIds = Object.keys(enka).filter((key) => !key.includes('-'));

  // The curves turn a base stat into every level's; the changelog says which
  // patch each id first appeared in, which is the only version Amber keeps.
  for (const file of ['avatarCurve', 'weaponCurve', 'changelog']) {
    await save(`static/${file}.json`, await get(`${API}/static/${file}`));
  }

  let requests = 0;
  const started = Date.now();

  for (const { amber } of Object.values(LOCALES)) {
    const lists: Record<string, string[]> = {};

    for (const kind of ['avatar', 'weapon', 'reliquary', 'material']) {
      const list = (await get(`${API}/${amber}/${kind}`)) as List;
      await save(`${amber}/${kind}.json`, list);
      lists[kind] = Object.keys(list.data.items);
    }

    // The list's Travelers are one entry per element (`10000005-anemo`); the
    // bare body ids come from Enka with everybody else.
    const avatars = [...new Set([...lists.avatar, ...enkaIds])];
    const jobs = [
      ...avatars.map((id) => ['avatar', id] as const),
      ...lists.weapon.map((id) => ['weapon', id] as const),
      ...lists.reliquary.map((id) => ['reliquary', id] as const),
      ...lists.material.map((id) => ['material', id] as const),
    ];

    await pool(jobs, async ([kind, id]) => {
      const detail = await get(`${API}/${amber}/${kind}/${id}`);
      requests += 1;
      if (detail) await save(`${amber}/${kind}/${id}.json`, detail);
    });

    console.log(`yatta ${amber}: ${avatars.length} avatars, ${lists.weapon.length} weapons, `
      + `${lists.reliquary.length} sets, ${lists.material.length} materials`);
  }

  console.log(`yatta: ${requests} details in ${Math.round((Date.now() - started) / 1000)} s → .cache/yatta`);
}

await main();
