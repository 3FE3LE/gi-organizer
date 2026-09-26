/**
 * Refreshes the Enka character store.
 *
 * Enka's showcase payload identifies talents by internal skill id
 * (`skillLevelMap: { "10017": 10 }`) and gives no ordering. The catalog keys a
 * talent by its position, not its skill id, so the two cannot be joined
 * without this table, which maps every avatar to its ordered skill ids and to the proud-skill groups that
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

/*
 * The per-game store. The old `store/characters.json` beside it is frozen:
 * it stopped at 134 entries, before the Cryo Traveler and every character
 * since, so a Cryo Traveler had no talent table and no element to be read as.
 * This one names its assets as paths (`/ui/Skill_A_01.png`), which `asset`
 * turns back into the bare names the rest of the pipeline uses.
 */
const SOURCE =
  'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/gi/avatars.json';

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

/**
 * `/ui/Skill_A_01.png` → `Skill_A_01`; a bare name passes through. The store
 * writes `None` where it has no asset — the elementless Traveler — which is
 * no name at all, not a file called that.
 */
function asset(value: string | null | undefined) {
  if (!value || value === 'None') return null;
  return value.replace(/^\/ui\//, '').replace(/\.png$/, '');
}

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
      sideIcon: asset(entry.SideIconName),
      skillOrder: entry.SkillOrder ?? [],
      skills: Object.fromEntries(
        Object.entries(entry.Skills ?? {})
          .map(([id, name]) => [id, asset(name)])
          .filter(([, name]) => name !== null),
      ),
      proudMap: entry.ProudMap ?? {},
      constellationIcons: (entry.Consts ?? []).map(asset).filter((name) => name !== null),
    }]),
  );

  /*
   * A character read without a depot — a Traveler a GOOD import named no
   * element for, a body nobody has picked one for — falls back to the bare
   * id. This store leaves the Traveler's bare entry elementless and empty,
   * and lists the Manekins by depot only. The old store filled the bare entry
   * with the Anemo form, the one every account starts in, and so does this —
   * or with the first form, for a character that has no Anemo one.
   */
  const bases = new Set(Object.keys(pruned).filter((key) => key.includes('-'))
    .map((key) => key.split('-')[0]));
  for (const base of bases) {
    if ((pruned[base]?.constellationIcons.length ?? 0) > 0) continue;
    const forms = Object.entries(pruned).filter(([key]) => key.startsWith(`${base}-`));
    const pick = forms.find(([, form]) => form.element === 'Wind')
      ?? forms.find(([, form]) => form.constellationIcons.length > 0);
    if (pick) pruned[base] = { ...pick[1] };
  }

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(pruned)}\n`);

  const travelers = Object.keys(pruned).filter((key) => key.includes('-')).length;
  console.log(
    `enka store: ${Object.keys(pruned).length} entries ` +
    `(${travelers} Traveler depots) → ${path.relative(process.cwd(), OUT)}`,
  );
}

await main();
