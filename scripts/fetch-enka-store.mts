/**
 * Refreshes the Enka character store.
 *
 * Enka's showcase payload identifies talents by internal skill id
 * (`skillLevelMap: { "10017": 10 }`) and gives no ordering. `genshin-db` has no
 * skill ids at all, so the two cannot be joined without this table, which maps
 * every avatar to its ordered skill ids and to the proud-skill groups that
 * `proudSkillExtraLevelMap` (the +3 from constellations) is keyed by.
 *
 * This is the one part of the dataset that needs the network, so it lives in its
 * own script and its output is committed. Re-run it when a patch adds
 * characters:
 *
 *     pnpm data:enka
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE =
  'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/characters.json';

const OUT = path.join(
  import.meta.dirname, '..', 'src', 'generated', 'data', 'enka', 'characters.json',
);

/** Shape of one entry in Enka's store. Only the fields used are declared. */
type StoreEntry = {
  Element?: string;
  WeaponType?: string;
  SideIconName?: string;
  SkillOrder?: number[];
  Skills?: Record<string, string>;
  ProudMap?: Record<string, number>;
  Consts?: string[];
  NameTextMapHash?: number;
};

async function main() {
  const response = await fetch(SOURCE, {
    headers: { 'user-agent': 'gi-organizer/0.1 (data pipeline)' },
  });
  if (!response.ok) {
    throw new Error(`enka store: HTTP ${response.status} ${response.statusText}`);
  }

  const store = (await response.json()) as Record<string, StoreEntry>;

  // Keys are `avatarId`, or `avatarId-skillDepotId` for the Traveler, whose
  // skills change with the chosen element. The showcase payload carries
  // `skillDepotId`, so both forms are resolvable at import time.
  const pruned = Object.fromEntries(
    Object.entries(store).map(([key, entry]) => [key, {
      element: entry.Element ?? null,
      weaponType: entry.WeaponType ?? null,
      sideIcon: entry.SideIconName ?? null,
      skillOrder: entry.SkillOrder ?? [],
      skills: entry.Skills ?? {},
      proudMap: entry.ProudMap ?? {},
      constellationIcons: entry.Consts ?? [],
    }]),
  );

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(pruned)}\n`);

  const travelers = Object.keys(pruned).filter((key) => key.includes('-')).length;
  console.log(
    `enka store: ${Object.keys(pruned).length} entries ` +
    `(${travelers} Traveler depots) → ${path.relative(process.cwd(), OUT)}`,
  );
}

await main();
