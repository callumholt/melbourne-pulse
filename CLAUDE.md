# CLAUDE.md

## Project Overview
Melbourne Pulse is a real-time city activity dashboard that ingests City of Melbourne open data (pedestrian sensors, microclimate) and displays precinct-level activity.

## Commands
```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
```

## Tech Stack
- Next.js 16 (App Router, RSC, TypeScript strict)
- Tailwind CSS 4 + shadcn/ui (new-york style)
- Neon Postgres (serverless driver)
- Recharts for data visualisation
- Vercel deployment; scheduling runs on cron-job.org

## Scheduled jobs
Scheduling lives at cron-job.org, not in `vercel.json` — re-adding a `crons` block
would double-run them. Both jobs authenticate with an `Authorization: Bearer
$CRON_SECRET` header.

| Job | Endpoint | Schedule |
| --- | --- | --- |
| 8268006 | `/api/ingest` | hourly, :05 UTC |
| 8268007 | `/api/digest` | Sundays 21:00 UTC |

`/api/ingest` re-reads a 3-day trailing window because CoM publishes a day's
hours progressively over the following day or two.

## Architecture
- `src/app/` - App Router pages and API routes
- `src/components/` - React components (dashboard/, ui/)
- `src/lib/` - Utilities, Neon DB client, CoM API client
- `scripts/` - One-off scripts (seed, backfill)
- `data/` - Static data files (precinct-sensor mapping)

## Path Aliases
Use `@/` prefix for imports (maps to `./src/*`)
