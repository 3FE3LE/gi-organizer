/**
 * Pulls the community build priorities and reduces them to ids.
 *
 * Only the programmatic part is kept — artifact set ids, weapon ids, and the
 * `FIGHT_PROP_*` priorities per slot. No prose, no explanations, no showcase.
 * The result is a list of priorities, which is all the suggester reads.
 *
 * There is no API: the data sits inside a minified bundle whose filename is
 * hashed per deploy, so the chunk is located from the page each run and the
 * shape is validated before anything is written.
 *
 *     pnpm data:builds
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { goodKey, normalizeGoodKey } from '../src/lib/good/derive.ts';
import { parseStatPriority } from '../src/lib/good/build-stats.ts';

const ORIGIN = 'https://genshin.gg';
const DATA = path.join(import.meta.dirname, '..', 'src', 'generated', 'data');
const OUT = path.join(DATA, 'builds.json');

const USER_AGENT = 'gi-organizer/0.1 (build priorities)';

type Crosswalk = {
  artifactSets: Record<string, number>;
  weapons: Record<string, number>;
  characters: Record<string, number>;
  traveler: { bodies: { male: number; female: number } };
};

type UpstreamBuild = {
  name?: string;
  stats?: string[];
  substats?: string[];
  weapons?: string[];
  artifacts?: string[];
};

type UpstreamCharacter = {
  name?: string;
  role?: string;
  type?: string;
  weapon?: string;
  build?: UpstreamBuild;
};

async function fetchText(url: string) {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status} ${response.statusText}`);
  return response.text();
}

/**
 * The blob is a JS single-quoted literal wrapping JSON. Three of its escapes
 * are not valid JSON and have to be undone first: `\\`, `\'`, and `\xNN` —
 * the last one appears as soft hyphens inside weapon names.
 */
function readJsString(source: string, start: number) {
  const out: string[] = [];
  let i = start;

  while (i < source.length) {
    const c = source[i];

    if (c === '\\') {
      const next = source[i + 1];
      if (next === '\\') { out.push('\\'); i += 2; }
      else if (next === "'") { out.push("'"); i += 2; }
      else if (next === 'x') {
        out.push(String.fromCharCode(Number.parseInt(source.slice(i + 2, i + 4), 16)));
        i += 4;
      } else { out.push(c + next); i += 2; }
      continue;
    }

    if (c === "'") return out.join('');
    out.push(c);
    i += 1;
  }

  throw new Error('unterminated string literal in the bundle');
}

function extractCharacters(bundle: string): UpstreamCharacter[] {
  const marker = "JSON.parse('";
  let index = bundle.indexOf(marker);

  while (index !== -1) {
    const raw = readJsString(bundle, index + marker.length);
    if (raw.includes('"build"')) {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) throw new Error('the build blob is not an array');
      return parsed as UpstreamCharacter[];
    }
    index = bundle.indexOf(marker, index + marker.length);
  }

  throw new Error('no build data in the bundle; the upstream layout changed');
}

/** Soft hyphens are typography, not part of the name. */
const clean = (name: string) => name.replace(/\u00AD/g, '').trim();

/**
 * The lists use everyday nicknames while the catalog uses full names. Spelled
 * out rather than fuzzy-matched, so a new one is reported instead of guessed.
 */
const CHARACTER_ALIASES: Record<string, string> = {
  Ayaka: 'Kamisato Ayaka',
  Ayato: 'Kamisato Ayato',
  Childe: 'Tartaglia',
  Heizou: 'Shikanoin Heizou',
  Itto: 'Arataki Itto',
  Kazuha: 'Kaedehara Kazuha',
  Kokomi: 'Sangonomiya Kokomi',
  Raiden: 'Raiden Shogun',
  Sara: 'Kujou Sara',
};

/** Two misspellings upstream. Listed, not corrected by similarity. */
const WEAPON_ALIASES: Record<string, string> = {
  'Gest of the Might Wolf': 'Gest of the Mighty Wolf',
  'Prototype Archiac': 'Prototype Archaic',
};

const SET_ALIASES: Record<string, string> = {
  'Emblem of Severed Fates': 'Emblem of Severed Fate',
};

const ELEMENT_BY_LABEL: Record<string, string> = {
  Anemo: 'ELEMENT_ANEMO', Geo: 'ELEMENT_GEO', Electro: 'ELEMENT_ELECTRO',
  Dendro: 'ELEMENT_DENDRO', Hydro: 'ELEMENT_HYDRO', Pyro: 'ELEMENT_PYRO',
  Cryo: 'ELEMENT_CRYO',
};

/**
 * `Traveler (Anemo)` is one body with one build per element, so the element is
 * kept alongside the id rather than collapsing six entries into one.
 */
function readTraveler(name: string, bodies: { male: number }) {
  const match = name.match(/^Traveler \((\w+)\)$/);
  if (!match) return null;
  return { characterId: bodies.male, element: ELEMENT_BY_LABEL[match[1]] ?? null };
}

/** `Harbinger of Dawn R5` is a name plus a minimum refinement. */
function readWeaponName(raw: string) {
  const name = clean(raw);
  const match = name.match(/^(.*?)\s+R([1-5])$/);
  return match
    ? { name: match[1], minRefinement: Number(match[2]) }
    : { name, minRefinement: 1 };
}

function makeResolver(table: Record<string, number>) {
  const lenient = new Map<string, number>();
  for (const [key, id] of Object.entries(table)) lenient.set(normalizeGoodKey(key), id);

  return (name: string) => {
    const key = goodKey(clean(name));
    return table[key] ?? lenient.get(normalizeGoodKey(key));
  };
}

type Report = { unresolved: Map<string, number>; unknownStats: Map<string, number> };

const note = (map: Map<string, number>, value: string) =>
  map.set(value, (map.get(value) ?? 0) + 1);

async function main() {
  const page = await fetchText(`${ORIGIN}/`);
  const chunk = page.match(/\/static\/js\/main\.[a-f0-9]+\.chunk\.js/)?.[0];
  if (!chunk) throw new Error('could not find the main chunk on the page');

  const bundle = await fetchText(`${ORIGIN}${chunk}`);
  const upstream = extractCharacters(bundle);

  const crosswalk = JSON.parse(
    await readFile(path.join(DATA, 'core', 'good.json'), 'utf8'),
  ) as Crosswalk;

  const resolveCharacter = makeResolver(crosswalk.characters);
  const resolveWeapon = makeResolver(crosswalk.weapons);
  const resolveSet = makeResolver(crosswalk.artifactSets);

  const report: Report = { unresolved: new Map(), unknownStats: new Map() };

  const entries = upstream.flatMap((entry) => {
    if (!entry.name || !entry.build) return [];

    const traveler = readTraveler(clean(entry.name), crosswalk.traveler.bodies);
    const characterId = traveler?.characterId
      ?? resolveCharacter(CHARACTER_ALIASES[clean(entry.name)] ?? entry.name);

    if (characterId === undefined) {
      note(report.unresolved, `character:${clean(entry.name)}`);
      return [];
    }

    // Slot order upstream is sands, goblet, circlet — flower and plume are
    // fixed by the game, so no list bothers to state them.
    const mainStats = (entry.build.stats ?? []).map((display) => {
      const { props, unknown } = parseStatPriority(display);
      for (const value of unknown) note(report.unknownStats, value);
      return props;
    });

    const substats = (entry.build.substats ?? []).flatMap((display) => {
      const { props, unknown } = parseStatPriority(display);
      for (const value of unknown) note(report.unknownStats, value);
      return props;
    });

    const weapons = (entry.build.weapons ?? []).flatMap((raw) => {
      const { name, minRefinement } = readWeaponName(raw);
      const id = resolveWeapon(WEAPON_ALIASES[name] ?? name);
      if (id === undefined) { note(report.unresolved, `weapon:${name}`); return []; }
      return [{ weaponId: id, minRefinement }];
    });

    // `A + B` is a two-piece split; a bare name is the whole four. A few
    // entries separate the pair with a newline instead of a plus.
    const artifacts = (entry.build.artifacts ?? []).flatMap((entryName) => {
      const parts = entryName.split(/[+\n]/).map(clean).filter(Boolean);
      const ids = parts.flatMap((part) => {
        const id = resolveSet(SET_ALIASES[part] ?? part);
        if (id === undefined) { note(report.unresolved, `set:${part}`); return []; }
        return [id];
      });
      if (ids.length !== parts.length) return [];
      return [{ setIds: ids, pieces: ids.length === 1 ? 4 : 2 }];
    });

    return [{
      characterId,
      travelerElement: traveler?.element ?? null,
      role: entry.role ?? null,
      mainStats,
      substats: [...new Set(substats)],
      weapons,
      artifacts,
    }];
  });

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify({
    version: 1,
    fetchedAt: new Date().toISOString(),
    source: `${ORIGIN}${chunk}`,
    entries,
  })}\n`);

  console.log(
    `builds: ${entries.length} of ${upstream.length} characters → ` +
    `${path.relative(process.cwd(), OUT)}`,
  );

  for (const [label, map] of [
    ['unresolved names', report.unresolved],
    ['unknown stat strings', report.unknownStats],
  ] as const) {
    if (map.size === 0) continue;
    console.log(`  ${label} (${map.size}):`);
    for (const [value, count] of [...map].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`    ${value} ×${count}`);
    }
  }
}

await main();
