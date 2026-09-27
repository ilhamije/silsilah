# Silsilah — Phase 0 proposal

Status: **confirmed** (decisions recorded in section 7). Phase 1 is built.

This covers the three things asked for before any code: folder structure, data
model, and the extraction prompt. It also lists the stack decisions, including
where I deviate from the brief, plus the merge-rule interpretation and the open
questions I need answered before starting phase 1.

---

## 1. Stack decisions and deviations

| Area | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript, Tailwind v4 | As specified |
| i18n | `next-intl`, English (default) + Bahasa Indonesia, cookie-based, toggle in the header on every page | No locale in URLs |
| Hosting | Vercel Hobby | Fluid compute, so AI routes get `maxDuration = 300` (the Hobby maximum; I'll re-check it when the route is built) |
| DB | Neon Postgres via Vercel Marketplace, Prisma | `DATABASE_URL` (pooled) at runtime, `DATABASE_URL_UNPOOLED` as `directUrl` for migrations |
| **Local DB** | **Postgres too (Docker or a Neon dev branch), not SQLite** | **Deviation.** The schema uses Postgres enums, `String[]` and `Jsonb`. SQLite would need a second schema that drifts from production. Merge logic is pure TS, so its unit tests need no DB at all. |
| Images | **Never stored** (decision 6) | The photo stays in the browser (IndexedDB) for preview and review. It's sent once to `POST /api/trees/[treeId]/extract`, forwarded to the AI in memory, and dropped. No Vercel Blob. |
| Upload path | Browser → our route → Claude | Compressed images are about 0.3–1 MB, under the 4.5 MB function body limit. The route checks the role, sniffs the file type from its bytes, and enforces a per-user daily limit. |
| Auth | Auth.js v5, Prisma adapter, **magic link via Resend** | No passwords to store or reset. Resend also sends the invites. Credentials login can come later if you want it. |
| AI | Anthropic SDK, server only, `ANTHROPIC_MODEL` env, **default `claude-sonnet-5`** | Tool-use/structured output forces the JSON shape, Zod still validates it, and one retry on failure. |
| Tree view | **`family-chart`** (d3-based) | `react-d3-tree` only draws strict hierarchies, so it can't show two parents plus spouses. `family-chart` handles spouses and multiple parents, and d3-zoom gives pinch/pan. If it fights us on touch, I'll fall back to a custom SVG with `d3-zoom`. |
| HEIC | `heic2any`, lazy-loaded only when a HEIC file is picked | Keeps the main bundle small |
| Background work | `after()` from `next/server` for merge detection after save; one daily Vercel Cron (Hobby allows daily) for 30-day purges and expired invites | No queue service needed |
| Tests | Vitest (unit + integration with the Anthropic client mocked), Playwright for one smoke test | |

---

## 2. Folder structure

```
silsilah/
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ public/
│  ├─ manifest.webmanifest
│  └─ icons/                      # 192/512 + maskable
├─ fixtures/
│  ├─ extraction-valid.json       # 3-generation tree, 1 illegible name
│  ├─ extraction-rejected.json    # a receipt
│  ├─ extraction-borderline.json  # list of names, no relationships
│  └─ trees/
│     ├─ overlap-a.json           # the two overlapping trees for merge tests
│     ├─ overlap-b.json
│     └─ decoy-c.json             # shares names with A but no structure
├─ scripts/
│  ├─ tune-merge.ts               # re-run matching over fixtures with config variants
│  └─ seed.ts
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/  (auth)/verify/
│  │  ├─ (app)/
│  │  │  ├─ trees/page.tsx                     # my trees + shared with me
│  │  │  ├─ trees/new/
│  │  │  └─ trees/[treeId]/
│  │  │     ├─ page.tsx                        # tree view
│  │  │     ├─ upload/                         # capture/choose, preview, crop/rotate
│  │  │     ├─ review/                         # review & correct before save
│  │  │     ├─ people/[personId]/              # detail/edit, suggested edits
│  │  │     ├─ merges/ merges/[suggestionId]/  # side-by-side merge UI
│  │  │     ├─ deleted/                        # recently deleted (30 days)
│  │  │     └─ settings/                       # members, invites, privacy, activity, danger zone
│  │  ├─ invite/[token]/page.tsx
│  │  ├─ connections/[requestId]/              # cross-family connection requests
│  │  ├─ settings/                             # user settings (delete originals after confirm)
│  │  ├─ admin/merge-stats/
│  │  └─ api/
│  │     ├─ auth/[...nextauth]/
│  │     ├─ trees/[treeId]/…                   # people, relationships, members, invites,
│  │     │                                      # suggested-edits, activity, export
│  │     ├─ trees/[treeId]/extract/            # one page per request, maxDuration 300
│  │     ├─ trees/[treeId]/import/             # confirm: the only place extraction → Person rows
│  │     ├─ merges/[id]/{accept,reject,undo}/
│  │     └─ cron/daily/
│  ├─ lib/
│  │  ├─ db.ts  auth.ts  env.ts (zod-validated env)
│  │  ├─ authz/            # requireTreeRole(), role order, redactForViewer()
│  │  ├─ activity.ts       # logActivity(tx, …) used inside every write transaction
│  │  ├─ ai/
│  │  │  ├─ prompt.ts      # system prompt + per-page user message
│  │  │  ├─ schema.ts      # Zod schema = single source of truth for the JSON
│  │  │  ├─ extract.ts     # call, validate, retry once, map API errors
│  │  │  └─ combine-pages.ts
│  │  ├─ tree/             # graph helpers, living inference, optimistic-lock helpers
│  │  ├─ merge/
│  │  │  ├─ config.ts      # ALL thresholds live here
│  │  │  ├─ normalize.ts   # diacritics, honorifics, transliteration, patronymics
│  │  │  ├─ similarity.ts  # Jaro-Winkler + alias handling
│  │  │  ├─ candidates.ts  # name-level pairs + hard-conflict filter
│  │  │  ├─ structure.ts   # the merge rule
│  │  │  ├─ score.ts       # weights, bands
│  │  │  ├─ evidence.ts    # plain-language sentences
│  │  │  ├─ detect.ts      # orchestrates, persists MergeSuggestion
│  │  │  └─ apply.ts       # non-destructive merge + undo
│  │  ├─ gedcom/{export,import}.ts
│  │  └─ email/resend.ts
│  ├─ components/          # ui/, capture/, review/, tree/, merge/
│  └─ client/              # image prep (EXIF, resize, HEIC, rotate, crop) + local page store
├─ tests/
│  ├─ unit/                # normalize, similarity, merge rule, permissions, redaction
│  └─ integration/         # upload → extract (mocked) → review → confirm
├─ docs/PROPOSAL.md
├─ .env.example
└─ README.md
```

---

## 3. Data model (Prisma, abridged)

Ownership lives only in `TreeMember`. `FamilyTree` has no `ownerId`, which is
what makes multiple owners possible. The app refuses to remove or demote the
last owner.

The full, commented schema is in [`prisma/schema.prisma`](../prisma/schema.prisma);
it is the source of truth. In short:

| Area | Models |
|---|---|
| Auth.js | `User` (+ `locale`, `deleteOriginalsAfterConfirm`; super admins come from the `ADMIN_EMAILS` env var, not the DB), `Account`, `Session`, `VerificationToken` |
| Trees & sharing | `FamilyTree` (privacy + cross-family settings, `structureVersion`), `TreeMember` (role), `Invitation` (hashed token, single/multi-use, expiry, revoke) |
| Family data | `Person` (verbatim partial dates + parsed years, `isLiving`/`livingIsManual`, `nameKey`, `version`, `deletedAt`), `Relationship` (`PARENT_CHILD` / `SPOUSE`, `version`, `deletedAt`) |
| Extraction | `SourcePage` (confirmed page's extraction JSON, for provenance), `ExtractionLog` (outcome, counts and tokens per attempt, no names or images). No image storage. |
| Merging | `MergeSuggestion`, `MergeOutcome` (tuning analytics), `PersonLink` (accepted matches), `MergeOperation` (history + undo), `ConnectionRequest` |
| Collaboration | `SuggestedEdit`, `ActivityLog` |

Key mechanics:

- **Authorization.** Every route and server action begins with
  `requireTreeRole(treeId, 'VIEWER' | 'EDITOR' | 'OWNER')`. Removed members have
  no row, so they fail automatically. Viewer responses pass through
  `redactForViewer()` on the server when `hideLivingFromViewers` is on. This
  never happens only in the UI.
- **Optimistic locking.** Writes do `updateMany({ where: { id, version }, data: { …, version: { increment: 1 } } })`.
  If 0 rows change, the route returns 409 with the current row and a field
  diff, and the UI shows "Changed by X at 14:02 — keep yours / keep theirs,
  per field".
- **Soft delete.** `deletedAt` hides people and their relationships. They are
  restorable from "Recently deleted" and hard-deleted by the daily cron after
  30 days.
- **Living inference.** A person counts as deceased if they have a death date
  or year, or the notes contain "†" or "alm."/"almarhum(ah)". They count as
  living if the birth year is less than 100 years ago. Otherwise the value is
  unknown, which is treated as living for privacy. A manual override sets
  `livingIsManual`.
- **"Updated by X".** Clients refetch on `visibilitychange` and after saves. If
  `tree.updatedAt` is newer than the last fetch and `lastEditedById` is not the
  current user, a toast says "Updated by X a moment ago".

---

## 4. Extraction

**Photos are never stored** (decision 6). The flow:

1. The browser prepares each photo: HEIC → JPEG, EXIF orientation applied, at
   most 2000px on the long edge, JPEG 80%. It keeps the photos in IndexedDB,
   so they survive a reload, and they never leave the device otherwise.
2. The user can rotate, crop, replace, reorder or remove pages.
3. "Read these pages" sends the pages **one request per page, in order**, to
   `POST /api/trees/[treeId]/extract` (`maxDuration = 300`). Each request
   carries that page's image plus KNOWN_PEOPLE, a text list of the people the
   earlier pages found, so the model can reuse their ids.
4. The server checks the Editor role and the daily limit, sends the image to
   Claude, validates the answer, logs the outcome (`ExtractionLog`: counts
   only, no names, no image) and returns the result. The image is dropped.
5. New person ids are prefixed with a stable per-photo key, so ids stay
   unique even if pages are later reordered or removed. `combinePages()`
   merges the pages in the browser: a person seen twice is merged, gaps are
   filled from the more confident reading, and different ids with the same
   name are flagged as "possibly the same person" rather than merged.
6. The review screen shows the local photo next to the data (side by side on
   wide screens, a Details/Photo switch on phones), with the selected person's
   name outlined on the photo. Uncertain fields and links are amber until
   edited or marked "Looks right". Users can edit any field, add or remove
   people and connections, swap parent and child, combine two entries
   ("same person"), and link an entry to someone already in the tree. "Same
   person?" is only suggested for matching names whose birth years are at
   most 5 years apart. The draft autosaves on the device. Saving is blocked
   while someone would be their own ancestor or have more than two parents,
   and the server checks the same rules again, including existing links.
7. **Save** posts to `POST /api/trees/[treeId]/import`. That call creates the
   people, relationships and one `SourcePage` per page in a single
   transaction. It is idempotent via an `importId`, so a double tap saves
   once. The local photos and draft are then deleted.

**Schema extension (a deviation, flagged):** each person also has `bbox`
(`[x, y, w, h]`, fractions of the image, approximate), for highlighting where a
name came from. `field_confidence` is a fixed object with one key per field,
rather than an open map, because structured outputs require fixed keys.
Everything else matches your schema.

**Prompt:** the system prompt and the per-page message are in
[`src/lib/ai/prompt.ts`](../src/lib/ai/prompt.ts). The system prompt is frozen,
so it can be prompt-cached. The per-page message adds the page number,
KNOWN_PEOPLE, and the user's UI language for rejection reasons and "unclear"
notes.

**Call handling** (`src/lib/ai/extract.ts`)

- The model is `claude-sonnet-5` by default. The answer is constrained with
  structured outputs (`messages.parse` + `zodOutputFormat`), using the same
  Zod schema that validates it again on our side.
- Invalid output, or an answer cut off at `max_tokens`, gets one retry. A
  refusal is reported without retrying.
- The SDK retries temporary errors once (429, 5xx/529, connection problems),
  with a 120-second timeout. The browser then retries a retryable failure
  once more after 5 seconds and shows "The reading service is busy…" meanwhile.
  After that, a clear message and a "Try again" button appear.
- Each page gets a verdict. `is_family_tree = false` means **rejected**: the
  model's reason plus a hint about what a valid photo looks like.
  Confidence < 0.5, no relationships, or mostly illegible means **borderline**:
  "Retake photo" or "Continue and fill in by hand". The thresholds are in
  `src/lib/ai/classify.ts`.
- For local development without a key, `EXTRACTION_MOCK=1` returns the
  fixtures. It is ignored on Vercel production.

---

## 5. Merge detection — how I read the rule

**Name matching** (`normalize.ts`, `similarity.ts`)

Normalization steps:

1. NFKD, then strip diacritics, then lowercase.
2. Strip honorifics and titles from a configurable list: h, hj, haji, hajjah,
   raden, r, rr, tuan, puan, dato, datuk, bapak, pak, ibu, bu, mr, mrs, dr,
   prof, ir, drs, and academic suffixes such as s.h. and s.e.
3. Map old Indonesian/Malay spellings: oe→u, dj→j, tj→c, sj→sy, nj→ny, and
   ch→kh where configured.
4. Map common variants to one canonical form, e.g. Mohammad/Muhammad/Mohamed/
   Moh./M. → muhammad.
5. Split off patronymics: "X bin Y" → name X, father-name Y. The father name
   is a bonus signal.

A pair is a name match when either:

- Jaro-Winkler on the normalized full name is ≥ `nameSimilarity` (0.88), or
- the given names match exactly and the family names are compatible (equal,
  one missing, or JW ≥ 0.88).

Nicknames count as aliases, and the pair takes the best score over all alias
combinations. The pair is thrown out on a hard conflict: both birth years
known and more than 5 apart, or both genders known and different.

**Structural confirmation** (`structure.ts`)

Given candidate pairs M, a pair (a₁,b₁) is *structurally confirmed* if there
is another pair (a₂,b₂) ∈ M with a₁≠a₂ and b₁≠b₂, and one of these holds:

- **Common ancestor:** some pair (x,y) ∈ M, distinct from both, where x is an
  ancestor of a₁ and a₂ in A, y is an ancestor of b₁ and b₂ in B, and **the
  generation distances are identical**: d(x,a₁)=d(y,b₁) and d(x,a₂)=d(y,b₂).
  Distances go up to 3 (great-grandparent).
- **Common descendant:** the mirror case, with (x,y) a descendant of both,
  and distances up to 2 (grandchild).
- **Direct line** (added after review, so the rule is less strict): a₁ is a
  parent or grandparent of a₂ in A, and b₁ is the same relative of b₂ in B
  (same direction, same number of generations). A matched parent and child on
  their own therefore count as 2 confirmed pairs. Controlled by
  `directLinkMaxDepth` (default 2) in `config.ts`; set it to 0 to go back to
  the strict rule.
- **Spouses** (optional, off by default): a₁–a₂ married in A and b₁–b₂
  married in B. Couples with common names are weak evidence, so this is
  behind `allowSpouseLink` for tuning.

"Connected in the same way" is the equal-distance check. Without it, a person
listed as a grandchild in one tree could pair with a child in the other.

A suggestion is created when **|confirmed pairs| ≥ `minConfirmedPairs` (2)**.
Anchors (x,y) are counted as confirmed pairs too.

Before scoring, the pairs are made one-to-one by greedily picking the highest
(similarity × weight) pair, so one person can't match two people.

The cases from your test list come out like this:

| Case | Result |
|---|---|
| one matched pair only | no suggestion |
| two matched pairs, no relationship between them in either tree | no suggestion |
| matched parent + matched child only | suggest (direct line, usually Low) |
| matched siblings + matched parent | suggest (3 confirmed pairs) |
| matched cousins via matched grandparent | suggest (distance 2 on both sides) |
| matched parents via matched child | suggest (common descendant) |
| any of the above but a birth-year gap > 5 | that pair is dropped before structure, so it usually fails |

**Scoring** (`score.ts`)

Each confirmed pair contributes `similarity × weight(closest link)`, with
weights 1.0 (sibling/parent/child), 0.7 (grandparent/grandchild) and 0.5
(great-grandparent), and 0.6 for spouse links when
enabled. The score is the sum. Starting bands, all in
`config.ts`: **High ≥ 4.0, Medium ≥ 2.5, Low otherwise.** I'll calibrate
them against the fixtures with `scripts/tune-merge.ts`.

**Re-suggest suppression**

A rejected suggestion stores a fingerprint of its confirmed pair set. The same
two trees are suggested again only when the new confirmed set adds at least
`resuggestMinNewPairs` (default 2) pairs, or the band goes up.

**Scaling cross-family matching**

`Person.nameKey` (the normalized first token plus a phonetic key) is indexed.
Candidate trees are found by an indexed lookup among trees that opted in, and
the full comparison runs only on those.

**Cross-family privacy**

The requester only gets "A possible match was found with another family's
tree (N matching people)". The other tree's owners get a `ConnectionRequest`
showing the matched people from **their own** tree. Accepting grants both
sides read access for merging (see Q1).

**Merge application** (`apply.ts`): link, don't fold

Both trees stay as they are. Accepting a suggestion creates a `PersonLink`
for each matched pair the user keeps. For each conflicting field, the user
picks which value to keep, and that value is written to **both** linked
people. Each linked person shows "also in *Tree B*", and a tap jumps there.
A `MergeOperation` records the links it created and snapshots every person
row it changed, so undo removes the links and restores the old values
exactly. The user can also unlink a single pair later.

---

## 6. Build order (as specified)

1. Auth + data model + permissions layer + tests
2. Upload and extraction
3. Review screen
4. Tree view
5. Merge detection, merge UI, admin stats, tune script
6. Export (GEDCOM 5.5.1 + JSON), GEDCOM import if time allows
7. Sharing UI (invites, members, suggested edits, activity, recently deleted)

The sharing *data model* goes in with phase 1, as you asked.

---

## 7. Decisions (confirmed 2026-09-26)

1. **Accept merge = link the matched people**; both trees are kept. Data
   model: `PersonLink` + `MergeOperation` (no archiving of trees).
2. **Direct parent–child counts**: the rule gains the "direct line" case above.
3. **Model: `claude-sonnet-5`** (configurable via `ANTHROPIC_MODEL`).
4. **UI in English and Bahasa Indonesia**, English first, language toggle at
   the top of every page.
5. **Magic-link sign-in only** (Auth.js + Resend).
6. **Photos are never stored.** The AI reads each photo once, and only the
   confirmed data is kept. The photo stays on the user's device until the
   review is confirmed. There's no Vercel Blob. The trade-off: a review must
   be finished on the same device.
