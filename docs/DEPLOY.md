# Deploy Runbook (clean VM → production)

Step-by-step production deployment of the full stack (Postgres, Redis, api,
worker, web dashboard, Caddy reverse proxy) via Docker Compose onto a single
fresh VM. For the tracking-domain-specific DNS/TLS setup, see
[README.md § Tracking domain](../README.md#tracking-domain-dns--tls) — this
runbook covers the rest of the deployment around it.

## 1. Prerequisites

- A VM (2 vCPU / 4 GB RAM is a reasonable starting point) running a recent
  Linux distro, with a public IP.
- Docker Engine + the Docker Compose plugin installed
  ([docs.docker.com/engine/install](https://docs.docker.com/engine/install/)).
- Three DNS `A`/`AAAA` records pointed at the VM's IP:
  - your dashboard hostname (e.g. `app.yourdomain.com`)
  - your API hostname (e.g. `api.yourdomain.com`)
  - your tracking hostname (e.g. `track.yourdomain.com`) — must be a
    subdomain of your sending domain, see README for why
- Ports 80 and 443 open inbound (Caddy needs both for Let's Encrypt's HTTP-01
  challenge and TLS termination).
- Zoho (or other SMTP/IMAP) sender account credentials ready to enter once
  the dashboard is up.

## 2. Clone and configure

```sh
git clone <this-repo-url> tft-traders-signals
cd tft-traders-signals
cp .env.example .env
```

Edit `.env`. At minimum, in production you must set real, unique values for:

| Variable | Notes |
| --- | --- |
| `POSTGRES_PASSWORD` | Not just the `.env.example` default |
| `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` — encrypts stored app passwords |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 32` |
| `WEB_APP_URL` | `https://app.yourdomain.com` |
| `DASHBOARD_HOST` / `API_HOST` / `TRACKING_HOST` | Your three real hostnames from step 1 |
| `TRACKING_DOMAIN` | Same value as `TRACKING_HOST` |
| `SEND_FROM_DOMAIN` | Your sending domain |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | First admin login (leave password blank to have one generated and printed once) |

Optional but recommended for production observability:

| Variable | Notes |
| --- | --- |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Error tracking for api/worker and web, respectively. Unset = disabled, no account required. |
| `LOG_LEVEL` | `info` in production; `debug` while diagnosing an issue |
| `GEOLITE2_CITY_DB_PATH` | Enables open/click geo enrichment |

**Never commit `.env`.**

## 3. Bring the stack up

```sh
docker compose up --build -d
docker compose ps   # wait for postgres, redis, api, worker, web to report "healthy"
```

`api`, `worker`, and `web` all have container healthchecks
(`docker-compose.yml`) — `docker compose ps` won't show them `healthy` until
each has actually started serving traffic / connecting to its dependencies,
which is a more reliable signal than "container is running."

## 4. Migrate and seed

```sh
docker compose exec api npm run migrate:up --workspace apps/api
docker compose exec api npm run db:seed --workspace apps/api
```

The seed step prints the generated admin password once if you left
`SEED_ADMIN_PASSWORD` blank — capture it immediately, it isn't stored or
re-printable.

## 5. Verify

- `curl https://api.yourdomain.com/health` → `{"status":"ok",...}`
- `curl https://api.yourdomain.com/health/ready` → `{"status":"ok","checks":{"database":"ok","redis":"ok"}}`
- Open `https://app.yourdomain.com`, log in with the seeded admin.
- Add a real sender account and use its "Verify connection" action.
- Send a test email to yourself and confirm the open pixel/click tracking
  round-trips (see README's tracking-domain section for what "working"
  looks like).

## 6. Ongoing operations

- **Backups:** set up `scripts/backup.sh` on a cron job — see
  [docs/BACKUP.md](./BACKUP.md).
- **Logs:** `docker compose logs -f api worker` — both emit structured JSON
  lines in production (`LOG_LEVEL` controls verbosity).
- **Updating to a new version:**
  ```sh
  git pull
  docker compose up --build -d
  docker compose exec api npm run migrate:up --workspace apps/api
  ```
  Compose recreates only the containers whose image changed; Postgres/Redis
  data volumes are untouched.

## 7. Rollback

If a deploy goes bad:

```sh
git checkout <previous-good-commit-or-tag>
docker compose up --build -d
```

If the bad deploy included a migration that's incompatible with the
previous code version, roll the migration back first:

```sh
docker compose exec api npm run migrate:down --workspace apps/api -- 1
```

(repeat with a larger count to roll back further; check
`apps/api/migrations/` to see how many steps separate the two versions).
If data was corrupted rather than just schema-mismatched, restore from the
most recent backup instead — see [docs/BACKUP.md](./BACKUP.md).

## 8. Load testing (optional, before go-live)

`scripts/load-test/` has a scanner-storm scenario for the tracking
endpoints and a send-queue throughput scenario. See
[scripts/load-test/README.md](../scripts/load-test/README.md). Run these
against a staging copy of the stack, not production.
