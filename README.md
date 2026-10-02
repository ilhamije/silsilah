# Silsilah

A mobile-first web app for documenting family trees. You photograph a
handwritten family tree, AI reads the people and relationships, you review and
correct them, and you share the tree with relatives. It also suggests links
when two trees describe the same family.

- UI in English and Bahasa Indonesia (toggle at the top of every page)
- Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- Postgres (Neon) + Prisma 7, Auth.js v5 magic-link sign-in via Resend
- Anthropic Claude (`claude-sonnet-5`) reads the photos. **Photos are never stored**: each is
  sent once to be read and then discarded, and only the confirmed data is saved
- Runs on the Vercel Hobby plan

Design decisions and the build plan are in [`docs/PROPOSAL.md`](docs/PROPOSAL.md).

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Auth, data model, permissions, i18n, PWA manifest | **done** |
| 2 | Photo capture and AI extraction (photos never stored) | **done** |
| 3 | Review and correction screen, saving | **done** |
| 4 | Tree view (touch zoom/pan) and manual editing | **done** |
| 5 | Merge detection, link-based merge, admin tuning page | in progress: matching engine done (`src/lib/merge`) |
| 6 | GEDCOM / JSON export (GEDCOM import if time allows) | |
| 7 | Sharing UI: invites, members, suggested edits, activity, recently deleted | |

The sharing and collaboration *logic* (roles, invitations, optimistic locking,
recently deleted, living-person privacy, suggested edits, activity log) is
already in `src/lib` and covered by tests. Phase 7 adds the screens for it.

## Local setup

Requirements: Node 20.9+ (22 recommended) and PostgreSQL 14+.

```bash
npm install                    # also runs `prisma generate`
cp .env.example .env           # then set AUTH_SECRET (npx auth secret)

# Create two local databases: one for the app, one for tests
createdb silsilah
createdb silsilah_test

npm run db:migrate             # apply migrations to SIL7878_DATABASE_URL_UNPOOLED
npm run dev                    # http://localhost:3000
```

If you don't have Postgres installed, you can run it in Docker:
`docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`.
Another option is a free Neon branch; put its URLs in `.env`.

**Reading photos locally without an API key:** keep `EXTRACTION_MOCK=1` in
`.env`. Every photo is then "read" as the sample tree in `fixtures/`, so you can
try the whole flow for free. Set `ANTHROPIC_API_KEY` and remove the flag to use
the real AI.

**Signing in locally:** leave `RESEND_API_KEY` empty. The magic link is then
printed in the terminal running `npm run dev`. Open that link in the browser.

## Design system

The look is archival and editorial, made for readers aged 40 and over. The
tokens live in `src/app/globals.css` and the shared components in
`src/components/ui.tsx`.

| Token | Value | Use |
|---|---|---|
| `--paper` | `#FBFBFA` | page background |
| `--ink` | `#1E2229` | text and borders (15.4:1 on paper) |
| `--accent` | `#2B4C6F` | every interactive element (8.6:1) |
| `--rule` | ink at 12% | 1px structural lines |

- **Headings:** Instrument Serif at regular weight; italics for storytelling.
- **Body, navigation and data:** Plus Jakarta Sans. Both fonts are
  self-hosted by `next/font`.
- **Body text:** 18px with a 1.625 line height; running text is capped at
  `65ch` (the `.measure` class). The type scale is shifted up, so nothing
  renders below 15px.
- **Interactive elements** are at least 44px tall. Hover shows a colour change
  plus an underline, and keyboard focus is a 3px Heritage Blue outline.
- **No shadows, gradients or dark theme.** Structure comes from 1px rules and
  white space. `AlbumFrame` (a white mat with photo corners) is the only
  "object" style, and it's reserved for photographs.

## Email (Resend)

Sign-in links (and later, invitations) are sent with the official `resend`
SDK (`src/lib/email/send.ts`).

1. Create an API key with **Sending access** at https://resend.com/api-keys
   and set it as `RESEND_API_KEY`.
2. Add and verify your domain at https://resend.com/domains, by adding the DNS
   records Resend shows you.
3. Set `EMAIL_FROM` to an address on that domain, e.g.
   `Silsilah <noreply@yourdomain.com>`. There is no built-in fallback
   sender. Resend's test sender `onboarding@resend.dev` only delivers to the
   email address that owns the Resend account, so other people (including
   the second admin) never receive anything.
4. Redeploy.

**If sign-in emails don't arrive:** the login page says "We couldn't send
the sign-in email". The exact reason is in the Vercel logs: open **Project →
Logs**, search for `[email]`, and read the hint on the line below it. Typical
causes are an unverified domain, the test sender, or a wrong API key.

## Super admins

Admins are set with the `ADMIN_EMAILS` environment variable, a comma-separated
list:

```bash
ADMIN_EMAILS="first.admin@example.com,second.admin@example.com"
```

- Locally, put it in `.env` and restart the server.
- On Vercel, go to **Project → Settings → Environment Variables**, add
  `ADMIN_EMAILS` for Production (and Preview if you want), then **redeploy**.
  Changes to environment variables only take effect after a redeploy.
- Each admin signs in normally with a magic link to that exact address (case
  doesn't matter). An **Admin** link then appears in the header, leading to
  `/admin`.
- To remove an admin, take the address out of the list and redeploy.

There is no admin flag in the database, so admin rights can't be granted from
inside the app. The admin area shows app-wide statistics and, from phase 5,
merge-tuning data. **It does not give access to anyone's family trees.** Tree
access always requires membership. Non-admins who open `/admin` get a 404.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest: unit tests plus DB-backed permission tests (needs `DATABASE_URL_TEST`; those suites are skipped without it) |
| `npm run db:migrate` | Create/apply a migration in development |
| `npm run db:deploy` | Apply migrations (production/CI) |
| `node scripts/generate-icons.mjs` | Regenerate PWA icons from `public/icons/icon.svg` |

The test database is migrated with `prisma migrate deploy`, and each suite
truncates its tables. Never point `DATABASE_URL_TEST` at data you care about.

## Deploying to Vercel (Hobby)

1. Import the repository in Vercel.
2. **Storage → Marketplace → Neon**: create a database and connect it to the
   project with the env var prefix `SIL7878_`. This sets `SIL7878_DATABASE_URL`
   (pooled) and `SIL7878_DATABASE_URL_UNPOOLED` (direct), which the app reads.
3. Add the remaining environment variables from `.env.example`:
   - `AUTH_SECRET`
   - `RESEND_API_KEY` and `EMAIL_FROM` (see **Email** below)
   - `ANTHROPIC_API_KEY` (from console.anthropic.com; set a monthly spend limit there)
   - optionally `EXTRACTION_DAILY_LIMIT` (pages per user per day, default 60)
   - `CRON_SECRET`
   - `ADMIN_EMAILS`: the two admin email addresses, comma-separated
4. Set the **Build Command** to `npm run db:deploy && npm run build`, so
   migrations run on each deploy using the unpooled URL.
5. Deploy. `vercel.json` sets up one daily cron (`/api/cron/daily`). It
   permanently removes people deleted more than 30 days ago and cleans up old
   invitations.

## Project layout

```
prisma/              schema.prisma + migrations
messages/            en.json, id.json (UI strings; a test checks both have the same keys)
src/auth.ts          Auth.js config (magic link via Resend)
src/i18n/            locale config + next-intl request config
src/lib/authz/       roles, permission matrix, the tree-access gate
src/lib/             services: trees, people, relationships, sharing/*, tree/* (dates, living, redaction, reads)
src/app/             pages and route handlers
tests/unit           pure logic tests
tests/integration    DB-backed tests (permissions, invites, privacy, locking, soft delete)
docs/PROPOSAL.md     design, data model, extraction prompt, merge rule
```

## Security model (short version)

- **Photos are never stored.** They stay in the browser (IndexedDB) until the
  review is confirmed. Each one is sent once to
  `POST /api/trees/[treeId]/extract`, which checks the Editor role, identifies
  the file type from its bytes, enforces a per-user daily limit, forwards the
  photo to Claude in memory, and discards it. `ExtractionLog` records outcomes
  and token counts only: no names, no images.

- All tree access goes through `assertTreePermission` (`src/lib/authz/tree-access.ts`).
  Non-members get a 404, so tree IDs can't be probed.
- Living-person details are removed on the server (`src/lib/tree/redact.ts`)
  before any data reaches a Viewer. Hiding is not left to the UI.
- The database stores only a SHA-256 hash of each invitation token.
- Edits use optimistic locking on `version`. A stale save gets a 409 that
  includes the current data.
