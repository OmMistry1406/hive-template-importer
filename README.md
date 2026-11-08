# Template Importer

Moves a Spectora template into an editable, structured database without losing the inspector's work. Upload an HTML-text export, review a row-by-row import report, then edit and copy the template.

- **Live app:** https://hive-template-importer-theta.vercel.app (Vercel, with Supabase Postgres in `us-east-1`)
- **Sign in:** reviewer username and password are in the submission email. The home page and walkthrough video are public.
- **Input file:** [`samples/InterNACHI-Residential-2026-11-06.xls`](samples/InterNACHI-Residential-2026-11-06.xls), Spectora's InterNACHI Residential template, exported with Export to spreadsheet, then Export HTML Text, on 2026-11-06. It is sample content with no customer data.

See [NOTES.md](NOTES.md) for decisions, limits and testing, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design.

## Run locally

Requires Node 24. No accounts or credentials are needed. Without `DATABASE_URL` the app uses PGlite, a real Postgres stored in `.data/`. Without sign-in variables, it accepts the local-only account `reviewer` / `local-demo-password`.

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
npm run db:check   # RLS on every table, function grants, seeded template verified
npm run dev
```

To try the schema on a local Supabase instead, start Docker and run `supabase start`.

## Environment variables

| Name | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | On Vercel | Postgres connection string. Server-side only. |
| `DEMO_USERNAME` | On Vercel | Reviewer sign-in name. |
| `DEMO_PASSWORD` | On Vercel | Reviewer password. |
| `SESSION_SECRET` | On Vercel | At least 32 characters; signs session cookies. |
| `CRON_SECRET` | On Vercel | Authorises the daily `/api/health` call from Vercel Cron. |
| `DATABASE_CA_CERT` | No | Supabase CA certificate, so TLS verifies the server. |

On Vercel, the app refuses to start without `DATABASE_URL`, and refuses every sign-in until all three sign-in variables are set. It never falls back to the local defaults there. Credentials never belong in the repo; `.env*` files are ignored except `.env.example`.

## Deploy to Vercel

1. Import the repo into Vercel, or run `vercel --prod`.
2. Set the variables above in the project settings.
3. Seed once from your machine with `npm run db:seed`.

## Tests

```sh
npm test              # 60 parser, database and sign-in tests, on real Postgres via PGlite
npm run build
npx playwright install chromium-headless-shell
npm run test:e2e      # 23 browser tests: workflow, sign-in and failure cases
LIVE_USER=... LIVE_PASSWORD=... npm run test:live   # 3 read-only checks on the deployed app
npm run typecheck
npm run lint
```

## Demo video

`public/media/walkthrough.mp4` is recorded by a script, against a local server with its own database:

```sh
npm run build
DATABASE_URL= DEMO_USERNAME= DEMO_PASSWORD= SESSION_SECRET= PGLITE_DIR=.data/demo npx next start -p 3200
npx tsx scripts/record-demo.ts            # records, narrates with Windows text-to-speech, cuts long pauses
npx tsx scripts/record-demo.ts --remix    # rebuilds from the last recording
```

The submitted walkthrough uses the presenter's own camera intro and narration:

```sh
python -I scripts/align-voice.py         # matches the narration recording to the script lines
python -I scripts/build-final-video.py   # cleans the voice, fits scenes to it, adds the intro
```

## Layout

```
samples/                  The committed Spectora export
supabase/migrations/      Database schema
src/lib/import/           Reader, parser, HTML checks, verification, import transaction
src/lib/db/               Database connection and queries
src/lib/auth/             Session tokens and sign-in configuration
src/proxy.ts              Sends signed-out requests to sign-in
src/app/                  Pages, server actions and the upload route
src/components/           Editor and report UI
tests/, e2e/              Automated checks
scripts/                  Seed, database check and demo recorder
docs/                     Architecture and walkthrough script
```
