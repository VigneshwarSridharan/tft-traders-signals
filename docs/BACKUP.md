# Backup & Restore Runbook

Covers the Postgres database, which holds all durable state (customers,
templates, sent mail, tracking events, audit logs, etc.). Redis holds only
transient queue/job state and the realtime pub/sub channel — it is not
backed up; a lost Redis instance drops in-flight jobs but no historical data
(BullMQ jobs are re-enqueued from Postgres-backed application state where it
matters, e.g. `scheduled_sends`).

Attachments on local disk (`ATTACHMENT_STORAGE_PATH`, the
`attachments_data` volume) are out of scope here — back that volume up with
your usual host/volume snapshot tooling if attachment retention matters to
you.

## Schedule

Run `scripts/backup.sh` on a daily cron job from the host running
docker-compose (or a machine with `docker compose` access to it):

```cron
# 03:15 UTC daily, off-peak
15 3 * * * cd /path/to/tft-traders-signals && ./scripts/backup.sh /var/backups/tft >> /var/log/tft-backup.log 2>&1
```

The script writes a timestamped, gzip-compressed `pg_dump` to the given
directory (default `./backups`) and prunes files older than
`BACKUP_RETENTION_DAYS` (default 14).

**Copy backups off the host.** A backup that lives only on the machine it
protects isn't a backup — it's disk usage. Sync the output directory to
off-site storage (S3, another host, etc.) after each run; that step is
intentionally left to your existing infra tooling rather than baked into
the script, since credentials/targets vary per deployment.

## Restore

```sh
./scripts/restore.sh /var/backups/tft/tft_traders_signals_20260101T031500Z.sql.gz
```

This **drops and recreates** the database, terminating any active
connections first. It prompts for confirmation (type the database name) —
pass `--yes` as a second argument to skip the prompt for scripted use (e.g.
restoring into a fresh disaster-recovery host, never against a database you
intend to keep).

After restoring, run migrations to catch the DB up to the app's expected
schema if the dump predates a since-applied migration:

```sh
npm run migrate:up --workspace apps/api
```

## Restore drill

A backup you have never restored is unverified. Run this drill after
setting up backups, and periodically (e.g. quarterly) after that:

1. Spin up a scratch environment: `docker compose -f docker-compose.yml up -d postgres` on a host separate from production (or use a disposable `POSTGRES_DB` name on a non-prod stack).
2. Take a fresh backup of production: `./scripts/backup.sh`.
3. Restore it into the scratch environment: `./scripts/restore.sh <dump> --yes`.
4. Verify:
   - `docker compose exec postgres psql -U tft -d tft_traders_signals -c "SELECT count(*) FROM customers;"` returns a non-zero, expected-ish count.
   - `npm run migrate:up --workspace apps/api` reports no pending migrations (or applies cleanly if the dump is older than HEAD).
   - The API boots against the restored DB and `/health/ready` reports `database: "ok"`.
5. Record the drill date and result somewhere durable (this file's git history is fine — commit a one-line note, or track it in your incident/ops log).

| Date | Dump restored | Result | Notes |
| --- | --- | --- | --- |
| _(none yet — run the drill and log it here)_ | | | |
