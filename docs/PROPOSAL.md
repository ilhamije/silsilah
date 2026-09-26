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
| Images | **Vercel Blob in private mode** | Private Blob has been GA since June 2026. Blobs are stored with `access: 'private'`, and pages never see the pathnames. Images are served by `GET /api/images/[id]`, which checks tree membership and then streams the blob (or 302s to a short-lived signed URL). |
| Upload path | Browser → our route → Blob | Compressed images are about 0.3–1 MB, under the 4.5 MB function body limit, so this is simpler than client-direct upload and the role check happens in the same place. |
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
│  │  │     ├─ review/[draftId]/               # review & correct before save
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
│  │     ├─ images/[imageId]/                  # authenticated image stream
│  │     ├─ extract/[imageId]/                 # one image per request, maxDuration 300
│  │     ├─ drafts/[draftId]/confirm/          # the only place extraction → Person rows
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
│  │  ├─ storage/blob.ts
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
│  └─ client/image/        # exif fix, resize, heic convert (browser only)
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
| Extraction | `SourceImage` (private blob pathname, extraction JSON), `ImportDraft` (review state), `RejectionLog` (no image data) |
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

Flow: the upload stores one `SourceImage` per page under an `ImportDraft`. The
client then calls `POST /api/extract/[imageId]` **once per page, in sequence**.
Each call sends only that page's image, plus a text list of the people already
found on earlier pages, so the model can reuse their `temp_id`s. After the last
page, `combine-pages.ts` merges the results:

1. Drop duplicate `temp_id`s.
2. Run the name matcher from the merge module across pages.
3. Any leftover likely-duplicates show in the review screen as "Same person?"
   prompts instead of being merged silently.

Images are never re-sent once extracted.

**Small schema extension (a deviation, flagged):** each person gets optional
`page_index` and `bbox` (`[x, y, w, h]`, normalized 0–1, approximate). This
makes the "highlight where this name came from" feature possible. Everything
else matches your schema exactly.

### System prompt (draft)

```text
You transcribe photographs of handwritten family trees (genealogies, silsilah,
nasab, stamboom, árbol genealógico, etc.) into structured data for a family
archive. Accuracy matters more than completeness: the family will correct your
output, but they may not notice invented data.

Return your answer by calling the `record_extraction` tool exactly once. Do not
write any other text.

STEP 1 — Is this a family tree?
Set is_family_tree = true only if the image shows people AND at least some
family relationships between them, conveyed by drawing (lines, branches,
brackets, arrows), layout (generational rows, indentation, nested lists), or
explicit wording ("anak dari", "son of", "bin/binti", "m.", "=", "x").
- Photos of people, receipts, landscapes, screenshots, forms, and ordinary
  documents are NOT family trees. Set is_family_tree = false, give a short,
  kind rejection_reason in plain language, leave people/relationships empty.
- A list of names with NO visible relationships, or an image too blurry to
  read: set is_family_tree = true, confidence ≤ 0.4, extract what you can, and
  explain the problem in unclear_items. The app will ask the user what to do.

STEP 2 — People
- One entry per distinct person drawn on the page. temp_id: "p1", "p2", … in
  reading order, unless the person matches someone in KNOWN_PEOPLE (provided
  in the user message), in which case reuse that temp_id.
- full_name: exactly as written, including honorifics and titles (H., Hj.,
  Raden, Dr., Tuan, Datuk…), in the original script's romanization as written.
  Do not correct spelling. Do not translate.
- given_name / family_name: fill ONLY when the naming convention clearly has
  them. Many people have a single name (e.g. "Sutarno"); patronymic names
  ("Ahmad bin Yusuf", "Siti binti Hasan", "Ivan Petrovich") are not given +
  family names — put the whole name in full_name and leave family_name null
  unless a clan/marga/surname is clearly present (e.g. "Tobing" in Batak names).
- nicknames: names in parentheses, quotes, or introduced by "alias", "als.",
  "a.k.a.", "dipanggil", "panggilan".
- gender: from explicit markers (♂/♀, "Bpk/Ibu", "bin/binti", "son/daughter",
  squares/circles in a chart with a legend, gendered titles like Hj./Haji).
  Given-name guesses only if very common and unambiguous in that culture;
  otherwise "unknown". Record the confidence of your guess in field_confidence.gender.
- Dates: copy as written, keeping partial and approximate forms ("1952",
  "~1950", "ca. 1890", "Mei 1931"). Normalize only obvious digit forms
  ("12-5-31" stays "12-5-31"; do not guess the century). Death markers: "†",
  "d.", "wafat", "alm.", "almh.", "(late)", a cross or a crossed-out name —
  if a person is marked deceased without a date, set death_date null and
  add "marked as deceased" to notes.
- birth_place, notes: only what is written. Notes may hold occupation,
  residence, marriage order ("istri ke-2"), or annotations.
- field_confidence: a 0–1 score for each field you filled (full_name, gender,
  birth_date, death_date, birth_place, and any others). Below 0.7 means
  "a human should check this".
- illegible: true if you cannot read the name reliably; put your best partial
  reading in full_name with "?" for unreadable letters (e.g. "Su?arni").
- page_index: the page number given in the user message. bbox: the
  approximate box around the name, [x, y, width, height] as fractions of the
  image size. Omit bbox if unsure.

STEP 3 — Relationships
- parent_child: from_temp_id = parent, to_temp_id = child. If a line comes
  down from a couple, create a parent_child link from EACH parent to the child.
- spouse: "m.", "=", "x", "∞", "menikah dengan", "istri/suami", a horizontal
  line joining two people at the same level. Multiple spouses are allowed.
- Siblings are expressed only through shared parents; do not add a sibling
  type. If siblings appear with no parent drawn, do not invent a parent —
  describe the grouping in unclear_items.
- Read structure from layout: vertical/branching lines, brackets grouping
  children, arrows, indentation in nested lists, generation rows.
- Every relationship gets a confidence. Do not include a relationship you
  are only guessing at below 0.3 — describe it in unclear_items instead.

NEVER invent people, names, dates, places, or relationships that are not on
the page. Crossed-out text is ignored unless the correction is also unclear.
Anything you could not interpret goes in unclear_items as a short description
a family member can act on, e.g. "Name under the coffee stain, left of
Aminah, unreadable" or "Unclear whether Rudi is Aminah's son or grandson".

confidence (overall): how complete and reliable the whole extraction is.
language_detected: BCP-47 code of the handwriting, e.g. "id", "ms", "jv", "en",
"nl"; use "und" if unknown, or the main one if mixed.
```

### Per-page user message

```text
Page {n} of {total} of the same family tree.
KNOWN_PEOPLE (from earlier pages; reuse their temp_id if the same person appears here):
[{"temp_id":"p3","full_name":"H. Hasan bin Umar","birth_date":"1921"}, …]
<image>
```

### Call handling

- Tool schema is generated from the Zod schema, so there is one source of truth.
- Zod validation fails → one retry with the validation errors appended.
- 429 / 529 / timeout → exponential backoff (2 attempts), then a clear message
  with a Retry button.
- The UI shows per-page progress ("Reading page 2 of 3…") using a stepped
  progress indicator driven by per-page requests.
- `is_family_tree=false` → rejected card with the reason and an example of a
  good upload. `confidence < 0.5` or no relationships → borderline warning
  ("Retake" / "Continue and enter manually"). Both cases write a
  `RejectionLog` row with no image data.

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
