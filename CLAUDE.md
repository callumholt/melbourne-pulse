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
- Vercel deployment with cron ingestion

## Architecture
- `src/app/` - App Router pages and API routes
- `src/components/` - React components (dashboard/, ui/)
- `src/lib/` - Utilities, Neon DB client, CoM API client
- `scripts/` - One-off scripts (seed, backfill)
- `data/` - Static data files (precinct-sensor mapping)

## Path Aliases
Use `@/` prefix for imports (maps to `./src/*`)
