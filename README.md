# Template Importer

Moves a Spectora template into an editable, structured database without losing the inspector's work. Upload an HTML-text export, review a row-by-row import report, then edit and copy the template.

- **Live app:** _added after deployment_
- **Login:** none; the app opens on the seeded template
- **Input file:** [`samples/InterNACHI-Residential-2026-11-06.xls`](samples/InterNACHI-Residential-2026-11-06.xls), Spectora's InterNACHI Residential template, exported with Export to spreadsheet, then Export HTML Text, on 2026-11-06. It is sample content with no customer data.

See [NOTES.md](NOTES.md) for decisions, limits and testing, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design.

## Run locally

Requires Node 24. No accounts or credentials are needed: without `DATABASE_URL` the app uses PGlite, a real Postgres stored in `.data/`.

```sh
npm install
npm run db:seed
npm run dev
```

Open http://localhost:3000.

## Use Supabase

The schema lives in `supabase/migrations` and is applied with the Supabase CLI.

```sh
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Copy `.env.example` to `.env.local`, then set `DATABASE_URL` to the **Transaction pooler** connection string from the Supabase **Connect** panel.

```sh
npm run db:seed
npm run dev
```

To try the schema on a local Supabase instead, start Docker and run `supabase start`.

## Environment variables

| Name | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | On Vercel | Postgres connection string. Server-side only. |
| `DATABASE_CA_CERT` | No | Supabase CA certificate, so TLS verifies the server. |

Credentials never belong in the repo; `.env*` files are ignored except `.env.example`.

## Deploy to Vercel

1. Import the repo into Vercel, or run `vercel --prod`.
2. Set `DATABASE_URL` in the project settings.
3. Seed once from your machine with `npm run db:seed`.

The app refuses to start on Vercel without `DATABASE_URL`, because Vercel's disk does not persist.

## Tests

```sh
npm test              # parser and database tests, on real Postgres via PGlite
npm run build
npx playwright install chromium-headless-shell
npm run test:e2e      # full workflow in a headless browser
npm run typecheck
npm run lint
```

## Layout

```
samples/                  The committed Spectora export
supabase/migrations/      Database schema
src/lib/import/           Reader, parser, HTML checks, verification, import transaction
src/lib/db/               Database connection and queries
src/app/                  Pages, server actions and the upload route
src/components/           Editor and report UI
tests/, e2e/              Automated checks
scripts/seed.ts           Imports the sample through the real importer
```
