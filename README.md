# GI Organizer

Team and build planner for Genshin Impact, built on Next.js 16 (App Router,
Turbopack).

The premise is scarcity: a plan is only useful if it respects what you actually
own. One Favonius Lance cannot be equipped on four polearm supports, and two
characters on the same team cannot both wear the same 4-piece set. Everything
below is arranged so those constraints are expressible rather than bolted on.

Current dataset: **game version 7.1** (`genshin-db` 5.2.14).

## Layers

```
catalog   what the game defines      generated, read-only, id-keyed
assets    where the art lives        per-kind host routing
enka      what a player has shown    payload contract + id joins
```

The catalog is shared and immutable. Ownership and assignment are per player and
mutable, and they refer to the catalog only by id.

### Catalog

`scripts/build-data.mts` reads `genshin-db` and writes `src/generated/data`:

```
meta.json                              game version, generation date, counts
core/{characters,weapons,artifacts,materials}.json   language-neutral, by id
core/good.json                         GOOD name-key <-> catalog id crosswalk
i18n/<locale>/{characters,weapons,artifacts,materials}.json
i18n/<locale>/props.json               localized FIGHT_PROP_* labels
i18n/<locale>/characters/<id>.json     talents + constellation, per character
enka/characters.json                   Enka skill-ordering table
assets-missing.json                    names the routed host does not serve
```

Two rules drive the split:

1. **Ids are the only stable key.** Names are localized and change between
   patches, so every relation — ascension costs, artifact pieces, equipped gear
   from an Enka import — is stored as an id and resolved to a name at render
   time.
2. **A locale change must not invalidate structure.** Stats, rarities and costs
   are written once; switching language only swaps the string files.

`src/lib/data/catalog.ts` is the read entry point. `getCatalog(locale)` assembles
and freezes one catalog per locale per process, with `Map` lookups by id and
reverse indexes precomputed — `weaponsByType`, `charactersByElement`,
`materialsByCategory`. Those indexes are the ones a scarcity-aware planner reads:
"which polearms could this character hold" must not be a scan.

`registry.ts` sits underneath as the file reader. Feature code should not need
it, with one exception: talent and constellation text is over 1 MB per locale and
is read one character at a time, so it is sharded per id and deliberately kept
out of the catalog.

Stats come from `genshin-db`'s stat *functions*, which are not serializable. The
pipeline evaluates them at every ascension breakpoint, where `"80"` is level 80
before the ascension and `"80+"` after. `StatFunction` takes the phase as a
**positional** argument (`stats(80, 6)`); an options object is silently ignored
and makes every post-ascension row a duplicate.

`genshin-db` 5.2.13's declaration for materials is stale — the runtime object has
`sources`, not `source`, plus an undeclared `version`. Patched locally in
`MaterialRecord`.

### Stat identifiers

`FIGHT_PROP_*` is the game's own enum and the join key for anything stat-shaped:
catalog ascension stats, weapon main stats, artifact substats, Enka payloads.
`src/lib/data/props.ts` owns labels and formatting.

`genshin-db` ships no folder of stat labels, so the pipeline harvests them from
every character's ascension substat and every weapon's main stat, which together
cover all 16 types the game shows. The four flat variants (`FIGHT_PROP_HP`,
`_ATTACK`, `_DEFENSE`, `_BASE_ATTACK`) never appear there because nothing ascends
into them; artifacts use them, and the game labels a flat stat exactly like its
percentage twin, so they alias.

The two sources disagree on scale for the same stat: `genshin-db` reports a ratio
(`0.24` is 24%), Enka reports a percentage (`22.1` is 22.1%). `formatPropValue`
requires the scale rather than guessing, because mixing them is an error of 100×
that still looks plausible.

### Assets

Names in the catalog are the game's internal asset names (`UI_AvatarIcon_Ambor`,
`UI_RelicIcon_15001_4`). No single fan host serves all of them. Measured over all
2065 names:

| kind | count | host | resolved |
| --- | --- | --- | --- |
| avatar | 122 | Enka | 122 |
| avatarSide | 122 | Enka | 122 |
| splash | 120 | Enka | 120 |
| weapon | 248 | Enka | 248 |
| weaponAwaken | 248 | Enka | 248 |
| relic | 299 | Enka | 299 |
| material | 906 | Amber | 868 |

Enka is flat — one path for every kind — and complete except for a large share of
material icons. Amber has those, but no side icons, no `_Awaken` weapons, and
relics under a `reliquary/` subpath. So `src/lib/data/assets.ts` routes by asset
kind, and both hosts are allowlisted in `next.config.ts`.

The 38 unresolved names are obscure quest and TCG items; none is an ascension,
talent or weapon material, so no cost list is affected. They are recorded in
`assets-missing.json` and `GameIcon` draws a placeholder for them instead of
firing a request that 404s.

Asset names are immutable — a patch adds names, it never repoints an existing one
— which is what makes the year-long `minimumCacheTTL` safe. Images go through the
Next optimizer; `GameIcon` passes the intrinsic source size per kind so the
optimizer never fetches a variant larger than needed.

### Enka import

`src/lib/enka/schema.ts` is the payload contract for
`GET https://enka.network/api/uid/<uid>` — no trailing slash, and a descriptive
`user-agent` is required. It was written against a live response, so the optional
markers reflect what the endpoint actually omits.

Every id in the payload joins the catalog directly, with no translation table:

| Enka | catalog |
| --- | --- |
| `avatarInfoList[].avatarId` | character id |
| `equipList[].itemId` (weapon) | weapon id |
| `equipList[].flat.setId` | artifact set id |
| `flat.equipType` | artifact slot, via `SLOT_BY_EQUIP_TYPE` |
| `flat.reliquarySubstats[].appendPropId` | `FIGHT_PROP_*` |

Talents are the one exception. Enka keys them by internal skill id
(`skillLevelMap: { "10017": 10 }`) with no ordering, and `genshin-db` has no
skill ids at all. Enka's own store table bridges them, giving each avatar its
ordered skill ids plus the proud-skill groups that `proudSkillExtraLevelMap` (the
+3 from constellations) is keyed by. `pnpm data:enka` mirrors it; keys are
`avatarId`, or `avatarId-skillDepotId` for the Traveler, whose skills change with
the chosen element.

Note for the ownership model to come: an artifact's `itemId` is its *definition*,
not a unique piece — two identical flowers share it. `reliquary.appendPropIdList`
is the roll history, which makes a content fingerprint of a piece effectively
unique, so re-importing a showcase can dedupe against what is already owned
instead of inventing a second copy of the same artifact.

## The GOOD crosswalk

GOOD — the inventory interchange format that Inventory Kamera and Genshin
Optimizer speak — identifies everything by a PascalCase English name
(`GladiatorsFinale`, `SkywardBlade`, `HuTao`), while this catalog is keyed by
the game's numeric ids. `core/good.json` bridges the two.

The keys are **derived, not vendored**: strip diacritics, delete `' ’ " . , : ! ? ( )`
without creating a word boundary, split on the rest, capitalize each token.
There is no stop-word list — `of` and `the` capitalize like anything else, hence
`NightOfTheSkysUnveiling`. Genshin Optimizer generates its keys from the English
TextMap and Inventory Kamera arrives at the same strings by a different route,
which is why the two interoperate; deriving means a patch needs no hand-editing.

Measured against the current catalog: **63/63 sets, 246/246 weapons, 120/120
characters, zero mismatches** with Genshin Optimizer's published maps.

Two things are not derivable and are handled explicitly:

- **The Traveler.** GOOD keys it by element (`TravelerAnemo`) and carries no
  gender; the catalog has `Aether` (10000005) and `Lumine` (10000007). The
  bodies and the element keys are emitted as their own block.
- **`PrizedIsshinBlade`** — ids 11419, 11420 and 11421 share one English name.
  Rather than let one win, the key goes to `excluded` as data, so an import can
  say "known ambiguous quest weapon" instead of "unknown key".

A collision in the *lenient* key space (upper-cased, alphanumerics only) fails
the build, because the import's casing-tolerant fallback would otherwise be able
to resolve to the wrong entity.

`pnpm data:check-good` re-measures against upstream. It writes nothing, so
`core/` keeps its single owner.

## The player database

The catalog is what the game defines; the player's own data — what they own,
what is assigned, the teams being planned — lives in SQLite at
`data/gi-organizer.db` (override with `GI_DB_PATH`, gitignored, and never under
`src/generated`, which the pipeline deletes).

`node:sqlite` is built into Node 24, so this costs no dependency. It was chosen
for one property above the rest: **the single-assignment invariant is a column,
not a rule.** A weapon or artifact piece carries one nullable
`assigned_character_id`, so "two characters wear the same piece" is not a
constraint that can be forgotten — it is a state the row cannot hold. Two partial
unique indexes add the rest: one weapon per character, one piece per slot.

Constraints expressible in the row live in SQL. Constraints needing catalog
knowledge — a polearm user cannot hold a claymore — live in the mutation layer,
because the catalog is not in the database and should not be.

`src/lib/db/client.ts` is the only module that opens a handle; swapping to
`better-sqlite3` is one file. The handle hangs off `globalThis` because
`next dev` re-evaluates modules on hot reload and a module-scoped one would leak
a descriptor per edit. `PRAGMA foreign_keys` is per-connection and off by
default, so it is set on every connect alongside WAL and a busy timeout.

Schema changes are an append-only array in `src/lib/db/migrations.ts`, applied
by `PRAGMA user_version` inside a transaction.

## The import layer

Two sources, one normalized shape (`src/lib/inventory/model.ts`). Downstream
code never branches on where an item came from — it branches on `coverage`,
because only a source that saw the whole inventory may claim a missing item is
gone. A GOOD export is `full`; an Enka showcase is `partial` and can never
delete anything.

```
src/lib/good/{derive,keys,stats,schema,parse}.ts   GOOD file -> normalized
src/lib/enka/{schema,slots,normalize,fetch}.ts     showcase  -> normalized
src/lib/inventory/{guards,fingerprint,plan,apply,assignment}.ts
```

Measured on a real Inventory Kamera 1.4.5 export (GOOD v3, 1276 artifacts, 106
weapons, 61 characters): every set, weapon and character key resolved, in 13 ms.

### Validation

Hand-written guards, no schema library. Each returns `T | undefined` and records
a typed issue, so **the envelope aborts and an item does not** — a wrong
`format` means this is not a GOOD file, while a bad artifact is skipped and
reported while the other 1275 import. An unrecognized key is never coerced: it
is reported with the raw value and a nearest-match suggestion, because silently
mapping an unknown set onto a real one corrupts the inventory it describes.

### Identity

Nothing is hashed — a fingerprint is a readable string so a conflict report can
print it.

```
identity     setId|slot|rarity|mainProp          the bucket a match is searched in
fingerprint  a1|identity|level|sorted substats   the whole observable state
lineage      l1|identity|sorted substat props    what survives levelling
```

Deliberately excluded from the fingerprint: the main stat *value* (GOOD omits it
and it is a function of rarity and level), the source's item id (Enka's is the
piece definition, Inventory Kamera's is a per-scan counter that **repeats** — a
real export has two different weapons both at `id: 0`), and substat *order*,
which differs between scanners.

Matching runs exact fingerprint first across the whole file, then a levelling
pass within the identity bucket. Fitting is not enough to pick a winner: across
a wide level gap the roll budget admits unrelated pieces too, so candidates are
ranked by how many rolls they leave unexplained and only a tie at the minimum is
ambiguous. Matched candidates are consumed, so two identical flowers against one
owned flower stay two pieces.

Inventory Kamera reports the not-yet-activated fourth substat
(`unactivatedSubstats` — present on 775 of the 1276 pieces, always exactly one,
always summing to four). Folding it into the lineage removes the one real
discontinuity, where a three-substat piece becomes a four-substat piece at +4.

**A fingerprint change never changes identity.** It is a derived index; the row
keeps its id, so every assignment pointing at it survives.

### Authority

Per field, never per source. Most recent observation wins, except where a source
is structurally blind: Enka cannot see a lock, GOOD cannot see the constellation
talent bonus, and neither may overwrite what it cannot observe. Absence is the
third case — only a `full` import may say a piece is gone, and even then a plan
whose absences exceed a fifth of the inventory is marked `suspect` and refuses
to prune, because a scan that failed halfway looks exactly like a collection
that was sold.

`applyImport` re-checks exclusivity and throws rather than persisting an
inventory that claims one piece is on two characters.

### Enka

`GET /api/enka/<uid>` — a Route Handler, because this is a cacheable read of
third-party data rather than a mutation. Two scales are converted at the
boundary and nowhere else: `reliquary.level` is 1-based (a +20 piece reports
21) and `affixMap` counts refinements from zero. Both are off-by-one errors that
still look plausible in a UI.

Talent levels arrive keyed by internal skill id with no ordering, so
`enka/characters.json` supplies the order and the proud-skill groups that the
constellation +3 is keyed by. Without that table the levels are unattributable,
and the normalizer reports rather than guesses.

The payload carries a `ttl` and no `Cache-Control`, so the TTL is only knowable
after reading the body — which rules out `next: { revalidate }` and is why the
cache is ours. A repeat inside the window answers from it with
`x-enka-cached: 1` and makes no upstream request at all.

## Importing, end to end

```
POST /api/import/good        upload -> stage to data/imports -> return a plan
Server Action applyStaged    plan -> apply -> persist, in one transaction
Server Action applyShowcase  Enka seed by UID
/[locale]/import             upload, review, apply
/[locale]/inventory          what is owned, and what the scan could not explain
```

The upload is a Route Handler because Server Action bodies are capped at 1 MB
and a real export is several times that; raising `serverActions.bodySizeLimit`
would lift the cap for every action on the site. Applying is an action, because
it is a mutation.

The two steps are separate on purpose. An import is the one operation that can
quietly invent or delete a piece, and the tool is worthless if the inventory is
not true — so the file is staged to disk, the plan is returned, and nothing is
written until the numbers have been looked at. Staging to disk also survives a
restart and leaves the file that produced a given state.

`src/lib/player/db.ts` loads rows into the pure `Inventory` shape and writes
back only the difference. `planImport` and `applyImport` stay pure and stay the
only definition of what a merge means, which is why a re-import of an unchanged
file performs **zero writes** — idempotence is observable in the database, not
only in the planner.

Two ordering details that are easy to get wrong and were:

- **Interchangeable copies must not shuffle.** Weapons reconcile by count, so a
  copy that merely changed hands produces no verdict; a full import re-derives
  every holder from the file. A copy whose current holder the file still reports
  keeps it, and only what is left over is handed out — otherwise an identical
  re-import moves gear between characters and reads as a change the user did not
  make.
- **A moved assignment collides with itself.** The partial unique indexes are
  checked per statement, so mid-transaction two rows briefly claim one holder.
  Every changed assignment is released to `NULL` in a first pass, which keeps the
  intermediate state legal without weakening the constraint.

### Bad input is repaired, not obeyed

A weapon on a character that cannot hold it is a misread, not a broken
invariant — a real scan put a quest sword on the Wanderer, a catalyst user. The
assignment is dropped, the weapon is kept, and the repair is reported. Aborting
1442 other items over one bad `location` would be the worse outcome.

True exclusivity conflicts do refuse: `applyImport` throws rather than persist an
inventory claiming one piece is on two characters.

### Manual entry

Inventory Kamera reads the character screen separately from the inventory, so an
export can carry a character's gear while omitting the character. In a real
export three holders had gear and no record: the Traveler, the Wanderer, and a
training dummy the crosswalk cannot resolve at all.

So `/[locale]/inventory` lists **equipment whose holder is not in the roster**
and offers manual entry for characters and weapons. Artifacts are not typed by
hand — re-import the GOOD file. A manually added weapon arrives unassigned,
because a copy that shows up already equipped is how a scarcity count starts to
drift.

## Commands

```bash
pnpm dev
pnpm data:build              # regenerate the catalog (offline)
pnpm data:enka               # refresh Enka's skill table (network)
pnpm data:builds             # refresh build priorities, ids only (network)
pnpm data:check-assets       # sample asset coverage
pnpm data:check-assets --all # every name; rewrites assets-missing.json
pnpm data:check-good         # cross-check GOOD keys against Genshin Optimizer
pnpm data:fixture            # regenerate the synthetic GOOD fixture
pnpm test                    # node:test over the pure layers
pnpm build                   # data:build + next build
pnpm typecheck
pnpm lint
```

`pnpm test` runs Node's built-in runner over the pure layers. The app uses
bundler-style imports (the `@/` alias, no file extensions), which Node does not
resolve on its own, so `scripts/test-loader.mjs` registers a resolver hook —
about thirty lines instead of a test framework and a transpile step. One
consequence worth knowing: Node's type stripping rejects TypeScript parameter
properties, so the pure layers declare class fields explicitly.

Tests that need a real inventory export skip when none is present, since exports
are personal data and gitignored. On the machine that has one, they are the only
tests that exercise the matcher at full scale — including a pass that levels
every one of the 1276 pieces and asserts that none is duplicated or lost.

`data:build` runs on `prebuild` and clears only what it owns, so it never wipes
the two network-sourced files beside it. Both are committed, which keeps
`pnpm build` offline. Re-run them after a patch bump:

```bash
pnpm add genshin-db@latest
pnpm data:build && pnpm data:enka && pnpm data:builds
pnpm data:check-assets --all && pnpm data:check-good
```

## Moving gear

One operation, defined once. `src/lib/player/move.ts` is a pure function with no
server import, so the server and the client's optimistic reducer run the same
code — a tool that keeps one copy of this rule on the server and another in a
client store has two definitions of "equipped", and they drift the moment one
gains a special case.

**Equipping is a move, never an unassign followed by an assign.** There is no
public pair of operations to interleave, so the invariant has no window to be
violated in:

```ts
performMove({ kind: 'equip-artifact', instanceId, toCharacterId }, { expectedHolderId })
```

`expectedHolderId` is a compare-and-set on the holder the UI showed the user,
which closes the gap between rendering a row and clicking it. A mismatch comes
back as `conflict` with the actual holder, and the UI re-asks instead of
stomping whatever moved.

Inside one transaction: read the piece and whatever occupies the destination,
free the displaced slot, write the new assignments, and record the inverse. The
inverse is written **in the same transaction as the change it reverses** —
written separately it could be lost, and an undo stack that sometimes cannot
undo is worse than none.

Only the rows a move can touch are loaded. Moving one goblet reads two rows, not
a thousand.

### Undo, not branches

Copy-on-write plan trees and three-way merges are weeks of work for one player,
and the case that matters — *what if Venti goes to team 3* — is already free: a
team is four cheap rows, so twelve teams side by side **is** the branching
model.

`undo` replays the stored inverse through `performMove`, so there is one
definition of what a move does, with `log: false` — a replay is not a new change,
and clearing the redo stack there would erase the entries undo is walking back
through. A forward move discards the redo stack, the way every editor behaves.

`transaction()` is reentrant for this: undo composes moves, and SQLite rejects a
nested `BEGIN`, so an inner call becomes a savepoint that still rolls back its
own work without committing the outer one.

The change log stores **ids only**. The history page resolves them through the
catalog when it renders, so it is localized for free and stays readable after a
patch renames something.

### Client and server split for assets

`GameIcon` is an async Server Component: knowing which asset names no host
serves means reading generated data. An async server component cannot be
rendered from a client one, so a server page calls `resolveIcon` and hands down
a URL, and `AssetImage` — client-safe — draws it.

## Teams and rules

```
src/lib/rules/{types,evaluate,assemble}.ts   the engine
src/lib/rules/messages/es.ts                 the only file that knows a language
src/lib/annotations/{types,resolve,seed-rules}.ts
src/data/curated/annotations.json            hand-authored, outside src/generated
src/lib/player/{teams,targets}.ts
```

A team references characters only, never gear. A character has one global build
— which is what the game enforces — so adding them to a second team cannot
create a gear conflict, because there is nothing to conflict. **The role lives
on the slot**, so Venti is a support in one team and a sub-dps in another with
no duplication and no "which role is the real one".

### The rule language

A closed union of three shapes, not an expression language: `non-stacking`,
`role-coverage`, `tag-limit`. A DSL would mean an editor, a validator, an
evaluator and a migration story for one player. Every rule holds ids —
`setId`, `weaponId`, `FIGHT_PROP_*`, element enums — and never a phrase, so it
survives a locale change and a patch that renames something.

The `partition` on a non-stacking rule is the part that earns its place:

| case | partition |
| --- | --- |
| Noblesse Oblige — flat aura | `{ by: 'none' }` |
| Deepwood Memories — no textual signal at all | `{ by: 'none' }` |
| **Viridescent Venerer — conditional** | `{ by: 'declaration', field: 'vvAbsorbedElement' }` |

Two Viridescent wearers cannot shred the *same* element but can shred different
ones, so flat uniqueness would be wrong in both directions. Same element
declared, error; different, clean; either undeclared, a warning that says it
cannot be proven rather than a verdict it cannot support. The team board only
asks for a declaration when a rule could actually read it — four pieces, not
one.

Built-in checks are not authorable, because they are facts about the model
rather than opinions about the game: weapon scarcity, incomplete gear, a
character in both halves of one deployment, the Theater's element restriction.

Output is diagnostics, never booleans. Each carries the targets the UI should
paint and is pre-bucketed by target, so a slot looks up its own key in O(1)
instead of scanning. Nothing is persisted — a stored diagnostic could only be
stale.

### Suggestions

`pnpm data:builds` pulls community build priorities and reduces them to ids:
artifact set ids, weapon ids with a refinement floor, and `FIGHT_PROP_*`
priorities per slot. No prose, no explanations — the emitted file has no free
text in it at all.

There is no API; the data sits in a minified bundle whose filename is hashed per
deploy, so the chunk is located from the page each run. Three JS escapes have to
be undone before the blob is JSON: `\\`, `\'`, and `\xNN` — the last shows up as
soft hyphens inside weapon names. Names resolve through the same GOOD crosswalk
the importer uses, plus small alias tables for nicknames (`Childe` →
`Tartaglia`) and upstream typos (`Prototype Archiac`). Anything unresolved is
reported with a count rather than dropped; the current run resolves 124 of 124.

**The list is a weak signal, not the spine.** It ranks in a vacuum, which is
precisely how both Venti and Sucrose end up told to wear Viridescent Venerer —
that collision comes straight from the source. It also goes silent exactly when
help is needed most: if all of its picks are already worn by the other three
members of a team, it has nothing left to say.

So the candidate pool is **every set in the catalog**, not the handful a list
names. Ordering, strongest first:

| rank by | source |
| --- | --- |
| the player pinned it | `build_target.set_ids_json` |
| a teammate is not already supplying it | the rules engine |
| the declared slot role matches the set's affinity | curated annotations |
| the external list mentions it | scraped priorities |
| how close to complete it already is | inventory |

**Owning the pieces is the last word, not the first.** A set with nothing in the
box is a farming target, not a bad answer, so it keeps its place and picks up a
`0/4 · a farmear` label. The only real exclusion is a teammate already supplying
the aura — that one is a dead end no amount of farming fixes.

The effect, on a real inventory:

```
no role declared, nothing pinned
  Día de los Vientos Alzantes    ok    unannotated, list#2
  Ritual Antiguo de la Nobleza   ok    list#3

Venti declared "buffer"
  Ritual Antiguo de la Nobleza   ok    role-match, list#3
  Instructor                     ok    role-match          ← not on his list at all
  Tenacidad de la Geoarmada      ok    role-match          ← nor this
  Noche de la Revelación         ok    role-match          ← nor this

Emblema del Destino pinned by hand
  Emblema del Destino            ok    pinned
```

One declared role reorders the whole list, and three of the top five are sets
the external source never mentions for that character. A pin ends the argument.

An unannotated set is labelled `unannotated`, not buried. Absent curation means
unknown affinity, not unsuitability.

### Which piece, not which set

Choosing the set is half the question. The other half is which four pieces, and
that is where a thousand-piece box either helps or does nothing:

```
Venti — busca: Prob. CRIT > Daño CRIT > ATQ > Maestría · Cáliz: Bono Anemo

Cáliz, ordenado por encaje
  Reminiscencia de la Purificación  +20  Bono Anemo  main stat ok · 3.9 rolls útiles
  Llamas Albinas                    +16  Bono Geo    main stat fuera · 0.8
  Orquesta del Errante              +20  Bono Geo    main stat fuera · 0.7
```

`piece-score.ts` scores every owned piece against the build. **Set membership is
deliberately not part of the score** — a better off-set piece is a better piece,
and the four-of-a-set constraint is the set suggestions' job, not this one.

Substats are converted to *rolls* (`value / max roll at that rarity`) because
raw values are incomparable: 19 Elemental Mastery and 19 flat ATK are not the
same amount of anything. Each roll is weighted by where the build puts that
substat, with a small residual for ones it never asked for. A main stat the
build does not want scales the piece down rather than removing it — a goblet's
main stat outweighs any realistic substat spread, but the piece is still
choosable. Flower and plume are scored on substats alone, since the game chose
their main stat.

### Where scarcity actually lives

Two characters cannot *hold* one weapon instance: the schema forbids it and so
does the game. So a shortage never appears in what is equipped — it appears
between two **plans**. `build_target` holds the weapon a build is aiming for,
and the scarcity check counts targets first, falling back to what a character
holds when it has none.

That is the four-Favonius-Lances report, and without the target table it had
nothing to report on.

### The curated layer

`src/data/curated/annotations.json` asserts what the game data cannot: set
stackability, mechanic tags, rework notes. It lives outside `src/generated` so
`pnpm data:build` cannot delete it, and `reviewedInVersion` is **per entry**, so
a patch bump produces a work queue instead of invalidating 63 sets at once.

Non-stacking rules are generated from it, so the curator edits stackability in
one place. A user disables a seed rule rather than deleting it, which keeps a
seed refresh idempotent; an override of `null` tombstones an entry for the same
reason.

Nothing is pre-filled by parsing effect text, not even as a first pass to be
reviewed — the failure modes are systematic, and a wrong value is worse than an
empty one because it looks reviewed.

## The roster, not the catalog

`/[locale]/characters` is the player's gallery: what they have first, what they
do not dimmed below, **ordered by release** rather than alphabetically. A
gallery sorted by name is a lookup table; sorted by release it is a timeline of
the account, which is how anyone remembers who they pulled. Every character
carries `version`, so this costs nothing.

Ownership is a roster row, not gear. A scan reads the inventory and the
character screen separately, so equipment can arrive without its owner — the
gallery names those cases at the top rather than leaving them to be discovered.

An owned character's link goes to their **build**; the catalog entry is
reference material, reachable from there. That inversion is the point: the
detail page was a wiki article about a character, and what the player needs is
the state of *their* character.

## Builds are targets

A build is what a character is *meant* to become, not a record of what they
wear. The gap between the two is the only thing worth reporting, and it is the
premise of the whole planner.

A character has **several**, because the same character is a different target
in different teams. Venti supporting and Venti as a sub-dps want different main
stats, different sets and different thresholds; one row per character could
only ever hold one of them.

```ts
type Build = {
  characterId; name; role; objective;
  weaponId; weaponRefinement;
  setPlan;      // [{ setIds: [15002], pieces: 4 }] or a 2+2 split
  mainStats;    // { sands: [props], goblet: [...], circlet: [...] }
  substats;     // ordered, best first
  goals;        // [{ prop, min }] — the thresholds that decide if it works
};
```

Builds are authored on the character's page: a pill per build, a form for all
of it, and a **desde prioridades** button that fills one from the community
list so there is something to disagree with instead of fifteen blank fields.
The seed deliberately leaves two things empty — the role, because the external
vocabulary is not ours, and the thresholds, because those are a judgement about
this account rather than a fact about the character.

Every field but the name is optional. A build written in one sitting with a
role and two thresholds is worth more than a form nobody finishes, and each
layer downstream degrades to "no opinion" on a missing field rather than
breaking.

The main-stat pickers only offer what the slot can actually roll, so the form
cannot express a build the game could never produce.

A team slot resolves its build in that order: an explicit choice, then the one
whose role matches what the slot declared, then the default. A slot that says
"support" is never measured against a sub-dps target just because that one was
authored first.

Once a build exists it **replaces the external priorities** as the thing
suggestions measure against. The scraped list only fills in for a character
nobody has planned yet — measuring against a stranger's priorities when the
player stated their own answers the wrong question. Same character, same team,
different declared role:

```
rol buffer   → build "Support anemo"  · mide Recarga > Maestría > CRIT
                 Sombra Verde         pinned, objective, partial
rol sub-dps  → build "Sub-DPS"        · mide CRIT > Daño CRIT > ATQ
                 Día de los Vientos   pinned
```

## Stat totals and goals

`src/lib/rules/stats.ts` sums what can be summed: character base, weapon base
and main stat, artifact main stats and substats, and flat two-piece set
bonuses. **Conditional effects are not summed** — almost every four-piece bonus
is one, and adding them would need a damage model and an uptime assumption.
They are shown beside the total, never folded into it.

Two things it gets right that are easy to get wrong:

- ATK% scales the character base **and** the weapon base together. Applying it
  to the character alone is the classic quiet error.
- CRIT Rate, CRIT DMG and Energy Recharge start at 5, 50 and 100, not zero.

Artifact main stat values are not in `genshin-db`, so the anchors at +0 and max
level are embedded and the levels between are interpolated linearly. That is
**accurate to 0.6% at worst** against published +4 values, and always low rather
than high — enough to decide whether a build clears a threshold, not a
substitute for the game's own number if one ever matters to the decimal. At max
level, where most planning happens, it is exact.

Goals read `met`, `close` (within five percent) or `short`.

## What to change next

`src/lib/rules/compare.ts` answers the question the tool exists for, and it is
never "is this artifact good" but "is it good **for this build**" — character,
role, target stats, team. The same circlet is mediocre for one and excellent
for another.

Three kinds of opportunity, and only the first is obvious:

| kind | now | later | what it is |
| --- | --- | --- | --- |
| **upgrade** | better | better | take it |
| **prospect** | worse | better | a raw piece whose substats point at the goals |
| **stopgap** | better | worse | a levelled off-set piece next to your own raw on-set one |

The prospect is the case nobody surfaces. A +0 circlet with CRIT DMG, ATK% and
flat ATK loses today to a +20 with CRIT Rate, DEF, DEF% and HP — and overtakes
it the moment it is fed, because every roll lands on something the build wants.
No amount of comparing current values shows that.

The stopgap came out of running it on a real account: nearly every levelled
alternative beat Venti's unfed on-set pieces today and lost to them at max. That
is worth wearing now and abandoning later, which is a different instruction from
"take it", so it gets its own name and sorts below a lasting gain even when the
number today is bigger.

**Potential is a range, not an estimate.** Where a roll lands is genuinely
unknown, so the bounds assume every remaining roll hits the piece's worst and
best substat respectively; a three-substat piece has its unknown fourth bounded
the same way. An expected value would read as a promise.

Ordering puts a swap that moves a goal from `short` to `met` above one that
merely scores higher, then keeping the planned set bonus, then a lasting gain
over a temporary one.

Every row states the whole trade — now, at max, remaining rolls, whether the
set bonus survives, who loses the piece, which goals change — because the
decision is a trade and showing only the upside would be a different, worse
tool.

## What is left to farm

Demand is a gap: what a build says a character should reach, minus where they
are. A planner with no target has nothing to plan, which is why the levelling
target lives on the build and why the page is empty until one states it. The
honest answer to "what should I farm" when nothing is planned is "you have not
said".

Only **168 of 919** materials are day-gated — talent books and weapon ascension
materials, behind 48 domains on a weekly rotation. The other 751 are bosses,
local specialties, mob drops and Mora: a question of quantity, never of
schedule. The page separates them, because mixing the two turns a plan into a
shopping list.

```
1 build con objetivo · 1 dominio · 3 sin horario

Hoy — miércoles
  Domain of Mastery: Realm of Slumber            faltan 51
    Filosofía de la poesía   faltan 51   tienes 5 de 56    Venti talentos ×56

Sin horario
    Esencia de Slime         faltan 56   tienes 15 de 71   Venti ascenso ×24 · talentos ×47
    Cecilia                  faltan 29   tienes 31 de 60   Venti ascenso ×60
```

Material counts come from the GOOD import, which used to discard them. All 545
in a real export resolve; five names are shared by several quest items and are
reported rather than guessed, and none of the five appears in any ascension or
talent cost.

**A character is levelled once, however many builds they have.** Two builds
aiming at 90 do not cost two ascensions, so demand is pooled per character and
takes the most demanding target across them. Running it on a real account with
two Venti builds showed every mora figure at exactly double before this was
fixed. Weapons are the exception and are deduped by weapon instead: two builds
planning different weapons really do need both ascended.

Each row says who needs it and why — one entry per character and reason, not
one per cost line, because nine talent levels is nine identical rows saying the
same thing.

## The chain

Three artifacts arrive, one improves a character, the piece they were wearing
frees up, that piece improves somebody else, and theirs frees up in turn.
Evaluating each build alone never finds this: the second move only looks
worthwhile once the first has happened.

`src/lib/rules/cascade.ts` searches greedily with displacement accounting —
take the move with the best net effect across the whole account, apply it, look
again. Taking a piece from another build is priced at what that build gives up
after taking its own best free replacement; without that, every move looks free
and the chain is a fiction.

**Deliberately not an optimal assignment.** A maximum-weight matching would
score higher and produce a list nobody can follow. This produces a sequence
with a reason at every step, which is the point.

Two properties worth knowing. The order is by value, not by causation, so an
independent move can land between two links of a chain — `chainsOf` groups a
move with what it made possible, rather than trusting the sequence. And an
equivalent outcome in fewer moves wins: three builds that want the same thing
get one move, not three that arrive at the same total.

A piece worn by a character with **no build** costs the plan nothing and still
undresses them, so the move names them and marks them `sin build`. Reporting
that as "free" would be lying by omission — which it was, until a run on a real
account showed five pieces arriving from nowhere.

```
10 movimientos · +34.0 en total

1. pluma    la de Lan Yan   → Sacarosa (sin build)   +5.3
2. arena    la de Fréminet  → Venti    (sin build)   +4.5   rompe el set
4. cáliz    una pieza libre → Venti                  +3.8   rompe el set
```

Over 1276 pieces and two builds it runs in 36 ms. Chains are rare at two
builds — nothing wants the junk that gets freed — and get common as more builds
compete for the same pool.

## One queue for the account

Five slots per build and a dozen builds is sixty lists, and sixty lists is not
an answer. `src/lib/rules/agenda.ts` folds them into one ordering.

Nothing in it is new information. The value is the sort:

1. **Anything that closes a goal**, whatever it costs. A build that misses its
   threshold is not working, and a marginal swap on one that already works is
   not the next thing to do.
2. **Empty slots**, which are holes rather than marginal decisions.
3. Upgrades, then prospects worth levelling.
4. What needs farming: unfinished set plans, weapons nobody owns.
5. Goals nothing in the account can reach — stated plainly, because silence
   would read as "nothing to do here".

Cost breaks ties, cheapest first: `free`, `displaces`, `needs-levelling`,
`breaks-set`, `needs-farming`. A change that costs nothing is the one to do
first.

Two things the queue refuses to say. A swap that would break a goal already met
is never proposed, however much it scores. And a marginal gain — under half a
point, or a prospect worth less than a full roll — is left out, or every unfed
piece in the account becomes a to-do.

On a real account:

```
7 pendientes · 4 hacibles ya · 0 cierran una meta

Venti · Sub-DPS   mejor pluma disponible      +3.4   rompe el set
Venti · Sub-DPS   mejor arena disponible      +1.7   rompe el set
Venti · Sub-DPS   mejor cáliz disponible      +1.3   rompe el set
Venti · Sub-DPS   Daño CRIT 65/180 — nada en tu cuenta lo arregla   hay que farmear
Venti · Sub-DPS   Prob. CRIT 9/70 — nada en tu cuenta lo arregla    hay que farmear
```

A build only enters the queue through the one it actually resolved to. Scoring
a sub-dps target against gear assembled for a support would invent work.

## What a team is for

A team can state its objective — `stellar-swirl`, `hyperbloom`, `nightsoul`, one
of 22. Without one, a build can only be recommended generically, which is how
every member ends up offered the same three sets.

**Mechanic membership is derived, not curated**, because the criterion is a fact
rather than a judgement: an entity's own effect text either names the mechanic
or it does not. That is the opposite of set stackability, where the text is
systematically silent. `pnpm data:build` emits `core/mechanics.json` — 59
characters, 15 sets, 40 weapons tagged. Longer terms match first, so
`Stellar Swirl` is never also counted as plain `Swirl`.

What a tag means is narrower than it looks: the entity *interacts* with the
mechanic, not that it is good at it — every Anemo character mentions Swirl. It
is a filter, and the curated layer refines it.

The objective sits between the collision check and the slot role in the
suggestion ordering: a set that serves what the team exists for beats one that
is merely right for the role. On a real inventory, setting `stellar-swirl` on
Sucrose's team pulls Testimonio Escarlata into the top four — a set with no role
annotation that her external list never mentions.

Role now comes **before** the character when adding a member. The order is the
point: a slot's role decides which sets get suggested for it, who wins a
contested set, and whether a coverage rule sees the member at all. Adding
someone and setting the role afterwards means the first thing the screen shows
is an answer computed without it.

## Getting the data out

Two formats, for two different fears.

```
GET  /api/export         native backup — everything, by id, restorable
GET  /api/export/good    GOOD v3 — the exit, readable by Genshin Optimizer
POST /api/import/native  restore, replacing everything
```

The native serializer is also what a snapshot stores, so one definition of "the
whole state" is used twice — and a snapshot can be restored through the same
code path a backup is.

**A backup nobody can restore is not a backup**, so restore ships with the
export rather than after it. It is destructive by definition: the whole point is
to discard the current state, so it runs in one transaction and the UI asks
first.

Reads are ordered by id, which makes an export byte-stable — two backups of the
same state diff to nothing, and only then does a diff between two backups mean
anything.

Measured on a real inventory: 1.08 MB native, 305 KB GOOD, `x-skipped: 0`.
Re-importing our own GOOD output through our own parser reports **1276
unchanged, 106 unchanged, zero issues** — which is the strongest fidelity check
available, since it exercises both directions of every name and stat mapping.

The GOOD export carries `unactivatedSubstats` too. GOOD v3 has the field and so
do we, so the exit is lossless rather than merely adequate. Two things it cannot
carry, because the format has no room for them: an *unobserved* lock exports as
`false`, since GOOD has no third state, and the constellation talent bonus is
left out rather than folded into the base levels, which would inflate every C3
and C5 by three.

## Look and layout

The palette takes Genshin's temperature and its gold and leaves the scrollwork:
deep blue-slate grounds under a single warm accent. The slate carries a blue
cast rather than being neutral grey, which is what makes the gold read as gold
instead of as beige. Three verdict colours — good, warn, bad — sit close in
value so a dense table does not strobe.

A tool someone stares at for an hour needs calm surfaces and one loud colour,
not ornament. Numbers get `font-variant-numeric: tabular-nums`, because almost
every number here sits in a column beside another one.

`/[locale]/teams` is two panels: a rail listing every team and a workspace for
the selected one, chosen through `?team=`. The rail's job is to make choosing
cheap **and to say which team needs attention before you click** — a rail that
only lists names makes you open all of them to find the broken one. So each row
carries its mode, objective, member count and its error and warning counts.

Each slot in the workspace shows the character, the build their declared role
resolved to, the sets they are wearing, their weapon, and that build's goals
already evaluated — the whole of §3's "personajes, roles, builds, armas,
artefactos" in one card, with the name linking through to the full build page.

One bug worth recording: the rail counted only findings whose target named the
team, and reported `ok` on a team whose member had an incomplete build. A
finding about a member is a finding about the team, so the rail and the
workspace now share one predicate rather than each deciding what belongs.

## Rendering boundary

The catalog is static and the player's data is not, and the line between them is
load-bearing:

- `/[locale]/characters/**` stays SSG — 500 prerendered pages over a frozen
  catalog.
- `/[locale]/inventory`, `/[locale]/build/[id]`, `/[locale]/teams` and
  `/[locale]/history` are `force-dynamic`. Reading SQLite touches no request API, so Next would
  otherwise prerender them and bake the player's state into the build.
- Player data is never cached — not `unstable_cache`, not `use cache`. A local
  SQLite read is microseconds and wrapping it adds a coherence problem exactly
  where correctness matters. Mutations call `refresh()`, not `revalidateTag`,
  whose stale-while-revalidate would show the user the state from before their
  own write.

One trap worth naming: a player-data read in `src/app/[locale]/layout.tsx` would
make all 500 prerendered pages dynamic, because that layout is shared by every
one of them.

## Locales

`src/lib/data/locales.ts` is the single registry. Each entry maps an app locale to
the `genshin-db` language name and to Project Amber's path segment, so later live
fetches stay consistent with the generated strings.

`genshin-db` 5.2.13 ships 15 languages. Four are wired up (`es`, `en`, `ja`,
`zh-Hans`); adding one is a single entry plus `pnpm data:build`.
