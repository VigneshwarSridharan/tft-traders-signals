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
complete — monorepo, Docker Compose, and CI are in place. No product features
yet; next up is [Task 2: database schema](./docs/TASKS.md#-task-2--database-schema--migrations-m).

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

### Tracking domain (DNS + TLS)

The open pixel (`/o/{token}.gif`) and click redirect (`/c/{token}`) are served
by the api container on the `TRACKING_HOST` Caddy block
([docker/caddy/Caddyfile](./docker/caddy/Caddyfile)) — no separate service.

For production:

1. Point a subdomain of your sending domain (e.g. `track.yourdomain.com`) at
   this host with an `A`/`AAAA` record. Using a subdomain of the *From*
   domain — rather than a third-party tracking domain — is what keeps
   tracked links looking legitimate to spam filters and recipients (see
   [PRD §2.4](./docs/PRD.md#24-tracking-pixel--click-tracking-architecture)).
2. Set `TRACKING_HOST` (Caddy) and `TRACKING_DOMAIN` (used to build the
   pixel/link URLs at send time) to that hostname in `.env`.
3. Caddy automatically obtains and renews a Let's Encrypt certificate for it
   — no other TLS configuration needed. Locally, `TRACKING_HOST` defaults to
   `track.localhost`, which Caddy serves with a locally-trusted self-signed
   cert (`tls internal`).

Optional: set `GEOLITE2_CITY_DB_PATH` to a MaxMind GeoLite2 City `.mmdb` file
(mount it as a volume in `docker-compose.yml`, alongside the existing
`attachments_data` volume pattern) to enrich open/click events with
country/city. Requires a free MaxMind account — see
[dev.maxmind.com/geoip/geolite2-free-geolocation-data](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data).
Without it, tracking still works; events just have no geo data.

### Common scripts (run from repo root)

| Command | Description |
|---|---|
| `npm run lint` | Lint all workspaces |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run test` | Unit tests for all workspaces |
| `npm run build` | Production build for all workspaces |
| `npm run test:e2e --workspace apps/api` | API e2e tests (supertest) |
