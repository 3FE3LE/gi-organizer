import type { Client } from '@libsql/client';

/**
 * Schema migrations, applied by the `schema_version` table.
 *
 * Append only — never edit a shipped entry. The array index plus one is the
 * version, so a released migration is part of the on-disk contract.
 */
const MIGRATIONS: string[] = [
  /* 1 */ `
    -- One row today. The column exists on every table so that sharing later is
    -- a session lookup in one function rather than a schema change.
    CREATE TABLE profile (
      id                     TEXT PRIMARY KEY,
      name                   TEXT NOT NULL,
      created_at             TEXT NOT NULL,
      last_seen_game_version TEXT
    );

    CREATE TABLE character_build (
      profile_id     TEXT    NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
      character_id   INTEGER NOT NULL,
      level          INTEGER NOT NULL CHECK (level BETWEEN 1 AND 100),
      ascension      INTEGER NOT NULL CHECK (ascension BETWEEN 0 AND 6),
      constellation  INTEGER NOT NULL DEFAULT 0 CHECK (constellation BETWEEN 0 AND 6),
      -- Base levels, 1-10. The +3 from constellations is tracked separately
      -- because only Enka reports it and a GOOD import must not clear it.
      talent_auto    INTEGER NOT NULL DEFAULT 1 CHECK (talent_auto BETWEEN 1 AND 10),
      talent_skill   INTEGER NOT NULL DEFAULT 1 CHECK (talent_skill BETWEEN 1 AND 10),
      talent_burst   INTEGER NOT NULL DEFAULT 1 CHECK (talent_burst BETWEEN 1 AND 10),
      talent_bonus_json TEXT,
      -- Traveler only: which element's skill set is active.
      skill_depot_id INTEGER,
      notes          TEXT,
      seen_at        TEXT    NOT NULL,
      seen_from      TEXT    NOT NULL,
      PRIMARY KEY (profile_id, character_id)
    );

    CREATE TABLE weapon_instance (
      id                    TEXT    PRIMARY KEY,
      profile_id            TEXT    NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
      weapon_id             INTEGER NOT NULL,
      level                 INTEGER NOT NULL CHECK (level BETWEEN 1 AND 90),
      ascension             INTEGER NOT NULL CHECK (ascension BETWEEN 0 AND 6),
      refinement            INTEGER NOT NULL CHECK (refinement BETWEEN 1 AND 5),
      -- Nullable on purpose: Enka never reports locks, and an unknown must not
      -- overwrite a known value on the next import.
      locked                INTEGER,
      fingerprint           TEXT    NOT NULL,
      source                TEXT    NOT NULL CHECK (source IN ('good','enka','manual')),
      -- The invariant. One row, one owner slot.
      assigned_character_id INTEGER,
      seen_at               TEXT    NOT NULL,
      created_at            TEXT    NOT NULL
    );

    CREATE UNIQUE INDEX ux_weapon_holder
      ON weapon_instance(profile_id, assigned_character_id)
      WHERE assigned_character_id IS NOT NULL;
    CREATE INDEX ix_weapon_pick
      ON weapon_instance(profile_id, weapon_id, assigned_character_id);
    CREATE INDEX ix_weapon_fingerprint
      ON weapon_instance(profile_id, fingerprint);

    CREATE TABLE artifact_instance (
      id                    TEXT    PRIMARY KEY,
      profile_id            TEXT    NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
      set_id                INTEGER NOT NULL,
      slot                  TEXT    NOT NULL
        CHECK (slot IN ('flower','plume','sands','goblet','circlet')),
      rarity                INTEGER NOT NULL CHECK (rarity BETWEEN 1 AND 5),
      -- 0-20, as the game displays it. Enka's reliquary.level is 1-based and is
      -- normalized on import.
      level                 INTEGER NOT NULL CHECK (level BETWEEN 0 AND 20),
      main_prop             TEXT    NOT NULL,
      substats_json         TEXT    NOT NULL,
      -- Enka only: append-only roll order, which identifies a piece exactly.
      roll_history_json     TEXT,
      locked                INTEGER,
      fingerprint           TEXT    NOT NULL,
      source                TEXT    NOT NULL CHECK (source IN ('good','enka','manual')),
      assigned_character_id INTEGER,
      seen_at               TEXT    NOT NULL,
      created_at            TEXT    NOT NULL
    );

    -- Two pieces cannot share one character's slot, and the row itself cannot
    -- name two characters. Together these make double assignment unrepresentable.
    CREATE UNIQUE INDEX ux_artifact_slot
      ON artifact_instance(profile_id, assigned_character_id, slot)
      WHERE assigned_character_id IS NOT NULL;
    CREATE INDEX ix_artifact_pick
      ON artifact_instance(profile_id, slot, set_id, assigned_character_id);
    CREATE INDEX ix_artifact_fingerprint
      ON artifact_instance(profile_id, fingerprint);

    CREATE TABLE team (
      id         TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      mode       TEXT NOT NULL CHECK (mode IN ('abyss','theater','stygian','other')),
      position   INTEGER NOT NULL,
      notes      TEXT
    );

    -- The role lives on the slot, not on the character, so the same character
    -- can be a support in one team and a sub-dps in another.
    CREATE TABLE team_slot (
      team_id      TEXT    NOT NULL REFERENCES team(id) ON DELETE CASCADE,
      character_id INTEGER NOT NULL,
      position     INTEGER NOT NULL CHECK (position BETWEEN 0 AND 3),
      roles_json   TEXT    NOT NULL DEFAULT '[]',
      -- Facts the engine cannot derive, e.g. which element this Viridescent
      -- Venerer wearer actually swirls.
      declarations_json TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (team_id, character_id),
      UNIQUE (team_id, position)
    );

    CREATE TABLE deployment (
      id            TEXT PRIMARY KEY,
      profile_id    TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      mode          TEXT NOT NULL CHECK (mode IN ('abyss','theater','stygian','other')),
      team_ids_json TEXT NOT NULL DEFAULT '[]',
      theater_json  TEXT
    );

    -- profile_id NULL marks a curated seed rule; user rules carry a profile.
    CREATE TABLE rule (
      id           TEXT PRIMARY KEY,
      profile_id   TEXT REFERENCES profile(id) ON DELETE CASCADE,
      kind         TEXT NOT NULL,
      enabled      INTEGER NOT NULL DEFAULT 1,
      severity     TEXT NOT NULL CHECK (severity IN ('info','warning','error')),
      params_json  TEXT NOT NULL,
      label        TEXT NOT NULL,
      seed_version INTEGER
    );

    -- The inverse is written inside the same transaction as the change it
    -- reverses; written separately it could be lost.
    CREATE TABLE change_log (
      seq          INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id   TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
      at           TEXT NOT NULL,
      op           TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      inverse_json TEXT NOT NULL,
      undone_at    TEXT
    );
    CREATE INDEX ix_change_log_live ON change_log(profile_id, seq) WHERE undone_at IS NULL;

    CREATE TABLE snapshot (
      id         TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
      at         TEXT NOT NULL,
      label      TEXT NOT NULL,
      data_json  TEXT NOT NULL
    );

    CREATE TABLE import_run (
      id           TEXT PRIMARY KEY,
      profile_id   TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
      at           TEXT NOT NULL,
      source       TEXT NOT NULL,
      origin       TEXT NOT NULL,
      game_version TEXT NOT NULL,
      counts_json  TEXT NOT NULL
    );
  `,
  /* 2 */ `
    -- Inventory Kamera reports the not-yet-activated fourth substat, which is
    -- what keeps a piece's lineage stable when it crosses +4. Enka does not,
    -- so the column is nullable rather than defaulted to an empty array.
    ALTER TABLE artifact_instance ADD COLUMN unactivated_json TEXT;
  `,
  /* 3 */ `
    -- What a character is *meant* to end up with, as opposed to what they hold.
    --
    -- Scarcity bites here and nowhere else. Two characters cannot hold one
    -- weapon instance — the schema forbids it and so does the game — so a
    -- shortage only ever shows up as two plans wanting the same weapon. Without
    -- this table the "four Favonius Lances" report has nothing to report on.
    CREATE TABLE build_target (
      profile_id   TEXT    NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
      character_id INTEGER NOT NULL,
      weapon_id    INTEGER,
      refinement   INTEGER CHECK (refinement BETWEEN 1 AND 5),
      set_ids_json TEXT    NOT NULL DEFAULT '[]',
      notes        TEXT,
      PRIMARY KEY (profile_id, character_id)
    );
  `,
  /* 4 */ `
    -- What the team is *for*. A build with no stated purpose can only be
    -- recommended generically, which is how every member ends up with the same
    -- three sets. An objective is what makes a suggestion situational.
    ALTER TABLE team ADD COLUMN objective TEXT;
  `,
  /* 5 */ `
    -- A build is what a character is *meant* to become, and a character can
    -- have several: the same Venti is a support in one team and a sub-dps in
    -- another, and those are different targets, not one target seen twice.
    --
    -- This replaces build_target, which held one thin row per character and
    -- could not express either the plurality or the goals.
    CREATE TABLE build (
      id                TEXT    PRIMARY KEY,
      profile_id        TEXT    NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
      character_id      INTEGER NOT NULL,
      name              TEXT    NOT NULL,
      -- The role this build is for. A team slot picks the build whose role it
      -- declared, which is what makes a suggestion situational.
      role              TEXT,
      -- The mechanic it is built around, if narrower than the team's.
      objective         TEXT,
      weapon_id         INTEGER,
      weapon_refinement INTEGER CHECK (weapon_refinement BETWEEN 1 AND 5),
      -- [{ setIds: [15002], pieces: 4 }] or a 2+2 split.
      set_plan_json     TEXT    NOT NULL DEFAULT '[]',
      -- { sands: [props], goblet: [...], circlet: [...] }
      main_stats_json   TEXT    NOT NULL DEFAULT '{}',
      -- Ordered, best first.
      substats_json     TEXT    NOT NULL DEFAULT '[]',
      -- [{ prop, min }] — the thresholds that decide whether it works.
      goals_json        TEXT    NOT NULL DEFAULT '[]',
      notes             TEXT,
      -- Shown first on the character page.
      is_default        INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT    NOT NULL
    );

    CREATE INDEX ix_build_character ON build(profile_id, character_id);

    -- Which build this slot is aiming at. Null means "whatever matches the
    -- declared role", resolved at read time.
    ALTER TABLE team_slot ADD COLUMN build_id TEXT REFERENCES build(id) ON DELETE SET NULL;
  `,
  /* 6 */ `
    -- What the account holds. Only the counts: the catalog already knows what
    -- each material is, where it drops and on which days.
    CREATE TABLE material_stock (
      profile_id  TEXT    NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
      material_id INTEGER NOT NULL,
      count       INTEGER NOT NULL,
      seen_at     TEXT    NOT NULL,
      PRIMARY KEY (profile_id, material_id)
    );

    -- Where the build is trying to get to. Without it there is no demand to
    -- plan for: a material planner needs a gap, and the gap is between what a
    -- character is and what the build says it should be.
    ALTER TABLE build ADD COLUMN target_level INTEGER;
    ALTER TABLE build ADD COLUMN target_ascension INTEGER;
    ALTER TABLE build ADD COLUMN target_talents_json TEXT;
  `,
  /* 7 */ `
    -- Levelling belongs to the character, not to a role.
    --
    -- The material planner already treated it that way: it took the highest
    -- target across a character's builds, because there is one character to
    -- ascend and one set of talents to feed. Holding it per build meant asking
    -- the same question once per role and reconciling the answers afterwards.
    ALTER TABLE character_build ADD COLUMN target_level INTEGER;
    ALTER TABLE character_build ADD COLUMN target_ascension INTEGER;
    ALTER TABLE character_build ADD COLUMN target_talents_json TEXT;

    UPDATE character_build SET
      target_level = (
        SELECT MAX(b.target_level) FROM build b
        WHERE b.profile_id = character_build.profile_id
          AND b.character_id = character_build.character_id),
      target_ascension = (
        SELECT MAX(b.target_ascension) FROM build b
        WHERE b.profile_id = character_build.profile_id
          AND b.character_id = character_build.character_id),
      target_talents_json = (
        SELECT b.target_talents_json FROM build b
        WHERE b.profile_id = character_build.profile_id
          AND b.character_id = character_build.character_id
          AND b.target_talents_json IS NOT NULL
        ORDER BY b.target_level DESC LIMIT 1);

    -- A goal is identified by what it is for — a role, a mechanic — not by a
    -- name somebody typed. Two goals with the same role were two ways to say
    -- one thing, and only ever one of them was measured: a team slot resolves
    -- a single build, and a character now belongs to a single team.
    --
    -- The survivor of each group is the one that was default, and the most
    -- recent among equals.
    DELETE FROM build WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, MAX((CASE WHEN is_default = 1 THEN '2' ELSE '1' END) || created_at)
        FROM build
        GROUP BY profile_id, character_id, IFNULL(role, ''), IFNULL(objective, '')
      )
    );

    ALTER TABLE build DROP COLUMN name;
    ALTER TABLE build DROP COLUMN is_default;
    ALTER TABLE build DROP COLUMN target_level;
    ALTER TABLE build DROP COLUMN target_ascension;
    ALTER TABLE build DROP COLUMN target_talents_json;

    CREATE UNIQUE INDEX ux_build_role
      ON build(profile_id, character_id, IFNULL(role, ''), IFNULL(objective, ''));
  `,
  /* 8 */ `
    -- Characters the player has looked at and decided not to invest in.
    --
    -- The plan assumes everyone is headed for the cap, because that is the
    -- only honest default once nobody has stated a target: a roster of sixty
    -- with no plan has sixty characters' worth of demand whether it is written
    -- down or not. What that produces on the first screen is every material in
    -- the game, which is true and useless.
    --
    -- So the answer is not a smaller assumption, it is a way to say no. A
    -- timestamp rather than a flag, because "when did I decide this" is what
    -- makes a months-old dismissal worth revisiting.
    ALTER TABLE character_build ADD COLUMN dismissed_at TEXT;
  `,
];

/**
 * The applied version.
 *
 * It used to live in `PRAGMA user_version`, which is a property of a local
 * file and not something a libSQL server exposes to a client. A table says the
 * same thing over the network, and a database written by the file build is
 * recognized by its schema so the count is not lost in the move.
 */
async function appliedVersion(client: Client): Promise<number> {
  const found = await client.execute(
    `SELECT name FROM sqlite_schema
     WHERE type = 'table' AND name IN ('schema_version', 'profile')`,
  );
  const tables = new Set(found.rows.map((row) => row.name as string));

  if (tables.has('schema_version')) {
    const row = await client.execute('SELECT version FROM schema_version WHERE id = 0');
    return Number(row.rows[0]?.version ?? 0);
  }

  // Written before the version moved out of the pragma. Anything that has the
  // first migration's table but no version table is at least at version 1.
  if (tables.has('profile')) {
    const row = await client.execute('PRAGMA user_version');
    return Number(row.rows[0]?.user_version ?? 0) || 1;
  }

  return 0;
}

const VERSION_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_version (
    id      INTEGER PRIMARY KEY CHECK (id = 0),
    version INTEGER NOT NULL
  );`;

const RECORD_VERSION = `INSERT INTO schema_version (id, version) VALUES (0, ?)
  ON CONFLICT (id) DO UPDATE SET version = excluded.version`;

export async function migrate(client: Client): Promise<number> {
  const applied = await appliedVersion(client);

  // Still recorded in the pragma of a file this build no longer reads from
  // there. Write it where the next run will look, then stop.
  if (applied >= MIGRATIONS.length) {
    await client.executeMultiple(VERSION_TABLE);
    await client.execute({ sql: RECORD_VERSION, args: [applied] });
    return applied;
  }

  const tx = await client.transaction('write');
  try {
    for (let version = applied; version < MIGRATIONS.length; version += 1) {
      await tx.executeMultiple(MIGRATIONS[version]);
    }
    await tx.executeMultiple(VERSION_TABLE);
    await tx.execute({ sql: RECORD_VERSION, args: [MIGRATIONS.length] });
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }

  return MIGRATIONS.length;
}

export const SCHEMA_VERSION = MIGRATIONS.length;
