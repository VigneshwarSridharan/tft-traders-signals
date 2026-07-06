# Email Engagement & Tracking Platform (Zoho Mail)

A self-hosted email management and tracking system that layers composition,
templating, open/click tracking, bounce detection, and engagement analytics on
top of **Zoho Mail** — which remains the provider for all inbound and outbound
email across five sender accounts.

## Planning documents

| Document | Contents |
|---|---|
| [docs/PRD.md](./docs/PRD.md) | Product requirements: goals, roles, full feature spec (templates, compose/send, tracking, dashboards, analytics), and architecture decisions — Zoho SMTP evaluation, tracking-pixel/click-redirect design, bounce detection via IMAP, security, scalability, GDPR/CAN-SPAM compliance. |
| [docs/ERD.md](./docs/ERD.md) | Database design: Mermaid ER diagram, all tables with columns/types/indexes, partitioning and rollup strategy, key design decisions. |
| [docs/TASKS.md](./docs/TASKS.md) | Implementation plan: 24 ordered tasks across 3 phases, each with dependencies, scope, and acceptance criteria — designed to be executed one at a time. |

## Status

🚧 [Task 1: Project scaffolding](./docs/TASKS.md#-task-1--project-scaffolding--infrastructure-m)
and [Task 2: database schema](./docs/TASKS.md#-task-2--database-schema--migrations-m)
complete — monorepo, Docker Compose, CI, and the full ERD as migrations are in
place. No product features yet; next up is
[Task 3: authentication & user management](./docs/TASKS.md#-task-3--authentication--user-management-m).

## Stack

Node.js + TypeScript (NestJS API, Next.js dashboard) · PostgreSQL 16 ·
Redis + BullMQ workers · Docker Compose. Rationale in
[PRD §2.6](./docs/PRD.md#26-recommended-technology-stack).

## Repo layout

```
apps/
  api/      NestJS API — also runs as the worker process (src/worker.ts)
  web/      Next.js dashboard
packages/
  shared/   TypeScript types shared between api and web
docker/     Dockerfiles + Caddy reverse-proxy config
docs/       PRD, ERD, task breakdown
```

## Getting started

Prerequisites: Node.js 22+, Docker & Docker Compose.

```bash
cp .env.example .env   # fill in real values before using this outside local dev
npm install
```

### Run with Docker Compose (full stack)

```bash
docker compose up --build
```

This starts Postgres, Redis, the api, the worker, the web dashboard, and a
Caddy reverse proxy. Once up:

- API health check: http://localhost:3000/health
- Dashboard: http://localhost:3001
- Via the reverse proxy (locally-trusted TLS cert): https://dashboard.localhost
  and https://api.localhost/health

### Run locally without Docker

```bash
npm run build:shared   # apps/api and apps/web import compiled output from packages/shared
npm run dev:api         # http://localhost:3000
npm run dev:web          # http://localhost:3001
```

### Common scripts (run from repo root)

| Command | Description |
|---|---|
| `npm run lint` | Lint all workspaces |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run test` | Unit tests for all workspaces |
| `npm run build` | Production build for all workspaces |
| `npm run test:e2e --workspace apps/api` | API e2e tests (supertest) |

### Database

Migrations ([node-pg-migrate](https://github.com/salsita/node-pg-migrate)) and
the seed script live under `apps/api/db`, independent of the app's eventual
ORM/query layer. They read `DATABASE_URL` from the environment (or
`apps/api/.env`).

| Command (run from `apps/api`) | Description |
|---|---|
| `npm run db:migrate:up` | Apply all pending migrations |
| `npm run db:migrate:down -- 0` | Roll back every migration (empties the schema) |
| `npm run db:migrate:create -- <name>` | Scaffold a new migration file |
| `npm run db:seed` | Seed template categories, default settings, and an admin user (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`, defaults to `admin@example.com` / `ChangeMe123!` — change this in any shared environment) |
