# Silsilah

A mobile-first web app for documenting family trees. You photograph a
handwritten family tree, AI reads the people and relationships, you review and
correct them, and you share the tree with relatives. It also suggests links
when two trees describe the same family.

- UI in English and Bahasa Indonesia (toggle at the top of every page)
- Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- Postgres (Neon) + Prisma 7, Auth.js v5 magic-link sign-in via Resend
- Vercel Blob (private) for images, Anthropic Claude (`claude-sonnet-5`) for extraction
- Runs on the Vercel Hobby plan

Design decisions and the build plan are in [`docs/PROPOSAL.md`](docs/PROPOSAL.md).

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Auth, data model, permissions, i18n, PWA manifest | **done** |
| 2 | Image upload and AI extraction | next |
| 3 | Review and correction screen | |
| 4 | Tree view (touch zoom/pan) and manual editing | |
| 5 | Merge detection, link-based merge, admin tuning page | |
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

npm run db:migrate             # apply migrations to DATABASE_URL_UNPOOLED
npm run dev                    # http://localhost:3000
```

If you don't have Postgres installed, you can run it in Docker:
`docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`.
Another option is a free Neon branch; put its URLs in `.env`.

**Signing in locally:** leave `RESEND_API_KEY` empty. The magic link is then
printed in the terminal running `npm run dev`. Open that link in the browser.

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
   project. This sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`
   (direct).
3. **Storage → Blob**: create a store with **private** access and connect it.
   This sets `BLOB_READ_WRITE_TOKEN`. Blob is used from phase 2 on.
4. Add the remaining environment variables from `.env.example`:
   - `AUTH_SECRET`
   - `RESEND_API_KEY` and `EMAIL_FROM` (the address must be on a domain
     verified in Resend)
   - `ANTHROPIC_API_KEY`
   - `CRON_SECRET`
   - `ADMIN_EMAILS`: the two admin email addresses, comma-separated
5. Set the **Build Command** to `npm run db:deploy && npm run build`, so
   migrations run on each deploy using the unpooled URL.
6. Deploy. `vercel.json` sets up one daily cron (`/api/cron/daily`). It
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

- All tree access goes through `assertTreePermission` (`src/lib/authz/tree-access.ts`).
  Non-members get a 404, so tree IDs can't be probed.
- Living-person details are removed on the server (`src/lib/tree/redact.ts`)
  before any data reaches a Viewer. Hiding is not left to the UI.
- The database stores only a SHA-256 hash of each invitation token.
- Edits use optimistic locking on `version`. A stale save gets a 409 that
  includes the current data.
