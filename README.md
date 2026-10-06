# VITICO Wholesale

B2B wholesale ordering platform for VITICO customers in Fiji, the Pacific, New Zealand and Australia.
The product spec lives in [`docs/SPEC.md`](docs/SPEC.md).

## Repository layout

```
apps/web        Next.js app: customer portal (/portal), admin (/admin), auth pages
packages/db     Prisma schema, migrations, seed data, shared DB client
docs/           Specification
```

## Getting started

Requirements: Node 22+, pnpm 10, PostgreSQL 16 (or Docker).

```bash
cp .env.example .env
docker compose up -d postgres        # or point DATABASE_URL at your own Postgres
pnpm install                         # also generates the Prisma client
pnpm db:deploy                       # apply migrations
pnpm db:seed                         # reference data + fake customers
pnpm dev                             # http://localhost:3000
```

Create the test database once (used by `pnpm test` and the e2e tests, wiped on each run):

```bash
docker compose exec postgres createdb -U vitico vitico_test
```

### Seeded logins

All seeded users have the password `Vitico!2026` (override with `SEED_PASSWORD`).

| Email | Role |
|---|---|
| admin@vitico.test | Super admin |
| ops@vitico.test | Admin / Ops |
| pricing@vitico.test | Pricing manager |
| rep@vitico.test | Sales rep (assigned to all active seed customers) |
| accounts@vitico.test | Accounts |
| owner@bulamart.test | Customer owner (VIP, Viti Levu) |
| buyer@bulamart.test | Customer purchasing user (FJD 5,000 approval limit) |
| owner@apiawholesale.test | Export customer owner (Partner, Samoa) |
| owner@nukualofatrading.test | Pending application (sign-in blocked until approved) |

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run the web app in development |
| `pnpm lint` / `pnpm typecheck` | Static checks |
| `pnpm test` | Unit + integration tests (Vitest, against `TEST_DATABASE_URL`) |
| `pnpm build` | Production build |
| `pnpm --filter @vitico/web test:e2e` | Playwright end-to-end tests (run `pnpm build` first) |
| `pnpm db:migrate` | Create a migration after editing `schema.prisma` |
| `pnpm db:deploy` | Apply migrations |
| `pnpm db:seed` | Seed development data (refuses to run in production) |

## How the code is organised

- **Services** (`apps/web/src/server/services`) hold the business rules. They take the database
  client and an *actor* (who is doing it) as arguments, check permissions themselves, write audit
  log entries, and are covered by integration tests.
- **Server actions** (`app/**/actions.ts`) are thin: authenticate with a guard, validate input
  with Zod (`lib/validation.ts`), call a service, revalidate.
- **Permissions** are declared in one place (`lib/auth/permissions.ts`). Sales reps only see their
  assigned customers; customer data is always scoped to the signed-in user's company.
- **Auth** is email + password (argon2) with database sessions in an HTTP-only cookie. Accounts lock
  for 15 minutes after 5 failed attempts. Invite and password-reset links are single-use and stored hashed.

Until email delivery is added, invite and password-reset links are shown on screen for the person
who created them to send on.
