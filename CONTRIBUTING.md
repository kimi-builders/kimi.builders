# Contributing to kimi.builders

Thanks for helping build the community site for [kimi.builders](https://kimi.builders) —
a non-official, non-commercial community by and for builders who ship with Kimi.
The stack: Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict ·
Tailwind v4 · MySQL 8 (`mysql2`, plain SQL, no ORM).

## Setup

```bash
npm ci
cp .env.example .env.local        # fill in what you need; most features work without secrets
npm run db:migrate                # creates/syncs your local MySQL schema (kb_dev)
npm run dev
```

Node 22+ and a local MySQL 8 are expected. Uploads and transactional email
degrade gracefully when their credentials are absent.

## Before you open a PR

The full gate, run from the repo root:

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Integration tests hit a real MySQL and refuse to run unless `DATABASE_URL`
points at a database whose name contains `kbu-mysql` (guard against nuking a
dev database):

```bash
DATABASE_URL='mysql://root@127.0.0.1:3306/kbu-mysql' npm run test:usage-db
# also: test:auth-db, test:works-db, test:moderation-db, test:analytics-db
```

Touching `db/migrations/`? The CI workflow replays every migration from zero —
keep `db/schema.sql` (end state) in sync and never edit an applied migration.

## House conventions (the short list)

- **Comments are English and follow [docs/comment-style.md](docs/comment-style.md)**:
  constraints, contracts, and rationale only — never narration or change
  history. `tests/comment-language.test.ts` ratchets this; when your PR
  converts Chinese comments to English, regenerate the snapshot with
  `UPDATE_BASELINE=1 npm test` in the same PR.
- **Data layer** (`src/lib/*`): validation, assembly, and query building are
  pure functions (unit-tested directly); DB reads/writes sit at the bottom of
  the file. Render paths stay forgiving — a corrupt payload falls back to
  empty instead of killing the page.
- **Public visibility predicate** is always `visibility = 'public' AND
  hidden_at IS NULL` (posts and works alike). Private or hidden content must
  never leak through a public surface.
- **User-facing copy** lives in the i18n dictionary (`src/lib/i18n.ts`) as
  zh/en pairs — never hardcode UI strings, never put copy in comments.
- **Visuals**: design tokens only (colors, radii, status colors); page headers
  via the shared `components/PageHeader.tsx`; segmented controls share
  `components/seg-classes.ts`.
- **New routes** must be added to the matcher in `proxy.ts`, or the right
  rail stays hidden on those pages.
- **No new dependencies** without raising it first — check `package.json`.
- Commits: `<type>(<scope>): <subject>` (e.g. `fix(works): converge filter
  inputs so placeholders match bound args`).

The full (Chinese) engineering brief lives in `AGENTS.md`.

## Good first issues

The comment migration is intentionally broken into per-file or per-directory
batches — search issues labeled `good first issue`. The pattern for each file:

1. Translate comments per the style guide: keep every constraint, drop
   narration and date tags.
2. Run `UPDATE_BASELINE=1 npm test`, include the regenerated
   `tests/comment-baseline.json`, and add the file to the `locked` list —
   locked files must stay at zero CJK comment lines forever.
3. Open a comment-only PR (never mix with logic changes).

Questions? Open an issue or find us in the community discussions.
