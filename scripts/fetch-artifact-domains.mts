/**
 * Which artifact domain drops which two sets.
 *
 * Amber, the catalog's source, carries no domains for artifacts: a set's own
 * record only says "Obtained from Mystic Offering". genshin-db does, one file
 * per domain level with the rewards it previews, so this reads the highest
 * level of every Domain of Blessing there, keeps its two five-star sets —
 * matched to the catalog by their English name — and the entrance a player
 * walks into, in each of the app's languages.
 *
 * Every five-star set that drops from a domain is in exactly one of them. The
 * rest drop from bosses or come from the strongbox, and the planner says so
 * rather than recommending a domain for them.
 *
 *     pnpm data:domains
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { LOCALES, type Locale } from '../src/lib/data/locales.ts';

const RAW = 'https://raw.githubusercontent.com/theBowja/genshin-db/main/src/data';
const LIST = 'https://api.github.com/repos/theBowja/genshin-db/contents/src/data/English/domains?ref=main';
const DATA = path.join(import.meta.dirname, '..', 'src', 'generated', 'data');
const OUT = path.join(DATA, 'artifact-domains.json');

/** genshin-db's folder per app locale. */
const FOLDERS: Record<Locale, string> = {
  es: 'Spanish',
  en: 'English',
  ja: 'Japanese',
  'zh-Hans': 'ChineseSimplified',
};

const LEVELS = ['i', 'ii', 'iii', 'iv', 'v', 'vi'];

type Domain = {
  name: string;
  regionName: string;
  entranceId: number;
  entranceName: string;
  unlockRank: number;
  rewardPreview: { name: string; rarity?: number }[];
};

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { 'user-agent': 'gi-organizer data build' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json() as Promise<T>;
}

async function main() {
  const listing = await json<{ name: string }[]>(LIST);

  // The highest level of each domain is the one a levelled account runs, and
  // the only one whose preview lists five-star pieces.
  const highest = new Map<string, { level: number; file: string }>();
  for (const { name } of listing) {
    const match = /^domainofblessing(.+?)(i|ii|iii|iv|v|vi)\.json$/.exec(name);
    if (!match) continue;
    const level = LEVELS.indexOf(match[2]);
    const known = highest.get(match[1]);
    if (!known || level > known.level) highest.set(match[1], { level, file: name });
  }

  const names = JSON.parse(await readFile(path.join(DATA, 'i18n', 'en', 'artifacts.json'), 'utf8')) as
    Record<string, { name: string }>;
  const idByName = new Map(Object.entries(names).map(([id, set]) => [set.name, Number(id)]));

  const domains = [];
  for (const { file } of [...highest.values()].sort((a, b) => a.file.localeCompare(b.file))) {
    const english = await json<Domain>(`${RAW}/English/domains/${file}`);
    const sets = english.rewardPreview.filter((reward) => reward.rarity === 5).map((reward) => {
      const id = idByName.get(reward.name);
      if (id === undefined) throw new Error(`${file}: no set named ${reward.name}`);
      return id;
    });
    if (sets.length !== 2) throw new Error(`${file}: expected two five-star sets, found ${sets.length}`);

    const entrance: Partial<Record<Locale, string>> = {};
    const region: Partial<Record<Locale, string>> = {};
    for (const locale of Object.keys(LOCALES) as Locale[]) {
      const localized = locale === 'en' ? english : await json<Domain>(`${RAW}/${FOLDERS[locale]}/domains/${file}`);
      entrance[locale] = localized.entranceName;
      region[locale] = localized.regionName;
    }

    domains.push({ entranceId: english.entranceId, unlockRank: english.unlockRank, setIds: sets, entrance, region });
  }

  const seen = new Set<number>();
  for (const domain of domains) {
    for (const id of domain.setIds) {
      if (seen.has(id)) throw new Error(`set ${id} drops from two domains`);
      seen.add(id);
    }
  }

  await mkdir(DATA, { recursive: true });
  await writeFile(OUT, `${JSON.stringify({ source: 'genshin-db', domains }, null, 1)}\n`);
  console.log(`${domains.length} domains, ${seen.size} sets → ${path.relative(process.cwd(), OUT)}`);
}

await main();
