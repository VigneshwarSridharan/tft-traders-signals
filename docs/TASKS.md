# Task Breakdown

## Email Engagement & Tracking Platform — Implementation Plan

| | |
|---|---|
| **Document version** | 1.0 |
| **Related docs** | [PRD.md](./PRD.md) · [ERD.md](./ERD.md) |

Tasks are ordered so each one is independently completable, testable, and
mergeable — designed to be executed **one by one**. Each task lists its
dependencies, scope, and acceptance criteria. Sizes: **S** (≤ ½ day),
**M** (~1 day), **L** (2–3 days).

**Status legend:** ⬜ not started · 🟨 in progress · ✅ done

---

## Phase 1 — Core send + track (MVP)

### ✅ Task 1 — Project scaffolding & infrastructure (M)
**Depends on:** —
- Monorepo setup: NestJS API (`apps/api`), Next.js dashboard (`apps/web`),
  shared types package (`packages/shared`).
- Docker Compose: Postgres 16, Redis 7, api, web, worker, Caddy/Traefik reverse
  proxy with TLS.
- Environment config loader with validation; `.env.example`; secrets excluded
  from repo.
- CI pipeline: lint, typecheck, unit tests on every push.
- **Accept:** `docker compose up` serves a health-check API endpoint and a
  placeholder dashboard page; CI green.

### ✅ Task 2 — Database schema & migrations (M)
**Depends on:** 1
- Implement the full [ERD](./ERD.md) as migrations (all tables, enums, indexes,
  monthly partitioning for `tracking_events`, `citext` extension, updated_at
  triggers).
- Seed script: template categories, default settings, first admin user.
- **Accept:** migrations run clean up/down on empty DB; seed produces a
  loginable admin; schema matches ERD review.

### ✅ Task 3 — Authentication & user management (M)
**Depends on:** 2
- Email+password login (argon2id), sessions with refresh rotation, logout.
- User CRUD (admin only), roles stored (RBAC *enforcement* matures in Task 19,
  but admin-vs-non-admin guard exists now), invitation flow with expiring link.
- Dashboard shell: login page, authenticated layout, nav skeleton,
  mobile-responsive base, theme scaffolding (dark mode toggle wired, polish later).
- **Accept:** admin can invite a user; invited user sets password and logs in;
  unauthenticated API calls rejected.

### ✅ Task 4 — Sender account management (Zoho SMTP/IMAP connectivity) (M)
**Depends on:** 3
- CRUD for `sender_accounts` (admin only); app-password encryption at rest
  (AES-256-GCM envelope; key from env/secret store).
- "Verify connection" action: live SMTP login + IMAP login test with clear
  error surfacing; status transitions (active / auth_failed / disabled).
- Quota fields (daily/hourly) with usage counters displayed.
- **Accept:** all five Zoho accounts connect and verify; wrong password shows
  actionable error; credentials never appear in logs or API responses.

### ✅ Task 5 — Customer management (M)
**Depends on:** 3
- Customer CRUD + list with search/sort/pagination; tags; notes.
- Custom field definitions (admin) + per-customer values with type validation.
- CSV import (with dedupe by email + error report) and export.
- Flags surfaced: unsubscribed / suppressed / tracking opt-out (read-only here;
  writers come in Tasks 10, 21).
- **Accept:** import a 500-row CSV with some bad rows → valid rows in, error
  report lists bad ones; custom field appears as a merge candidate.

### ✅ Task 6 — Template management (L)
**Depends on:** 3
- Template CRUD with categories, draft/active/archived status, duplicate,
  soft-delete; default template per category.
- Rich HTML editor (e.g. TipTap) + HTML source view + plain-text tab with
  auto-generate-from-HTML.
- Merge-field picker (`{{customer.name}}`, custom fields, sender fields);
  placeholder extraction + unknown-placeholder warnings at save.
- Versioning: every save of an active template creates an immutable
  `template_version`; preview with sample or selected-customer data.
- HTML sanitization on save; test-send stub (real send wired in Task 8).
- **Accept:** create → edit → duplicate → archive a Quotation template;
  preview renders merged sample data; version history visible.

### ✅ Task 7 — Send pipeline: queue, rendering, SMTP worker (L)
**Depends on:** 4, 5, 6
- Compose API: sender + customer(s) + template/ad-hoc body + attachments →
  per-recipient `email_messages` rows (status `queued`) with merged
  subject/body snapshots, generated `Message-ID`, `public_token`.
- Merge engine with per-field fallbacks and required-field validation;
  CSS inlining (`juice`).
- BullMQ send worker: per-account rate limiting against quotas, retry with
  exponential backoff (3×), terminal `failed` with SMTP error stored;
  `sent` on 250 OK with `smtp_response` + `sent_at`.
- Attachment storage (local volume, size limits per Zoho 25 MB total).
- Compose-time suppression/unsubscribe guard (blocks; admin override logged).
- **Accept:** an email composed in the API arrives in a real inbox from the
  chosen Zoho account, appears in Zoho's Sent folder, and the message row shows
  `sent` with the SMTP response; killing the worker mid-queue loses nothing.

### ✅ Task 8 — Compose UI (L)
**Depends on:** 7
- Compose flow per FR-4.1: account picker (with remaining quota), customer
  picker, template picker (grouped by category, default pre-selected), subject/
  body editing, per-recipient merge preview, attachments, test-send to self.
- Drafts: save/resume compose state.
- **Accept:** full compose → preview → send journey works from the browser on
  desktop and mobile widths; draft survives page reload.

### ✅ Task 9 — Tracking service: pixel + click redirect (L)
**Depends on:** 7
- Send-time processing: inject `<img src="https://TRACK_DOMAIN/o/{token}.gif">`
  and rewrite all `<a href>` (skip `mailto:`/anchors) into `/c/{token}` links,
  persisting `email_links`; honor per-send tracking toggle and per-customer
  opt-out.
- Tracking HTTP endpoints (dependency-light module): `/o/:token.gif` returns
  1×1 GIF `no-store` and enqueues an open event; `/c/:token` 302s to the stored
  original URL and enqueues a click event; unknown token → homepage redirect;
  per-IP rate limiting; no cookies.
- Event ingester worker: UA parsing (device/OS/browser), GeoLite2 country/city,
  Apple-MPP/Gmail-proxy flagging, bot heuristics (scanner UAs, <3 s clicks,
  datacenter IPs, all-links-instantly), click-implies-open inference;
  transactional counter updates on `email_messages` / `email_links`.
- Custom tracking domain configuration documented (DNS + TLS).
- **Accept:** open a sent email in Gmail → open recorded with device info
  within 5 s; click a link → lands on the original URL and click recorded with
  the right link; Outlook SafeLinks-style prefetch is flagged as bot and
  excluded from counters.

### ✅ Task 10 — Inbound worker: bounce detection & suppression (L)
**Depends on:** 7
- IMAP sync per sender account (polling with stored UID cursor; IDLE if stable),
  idempotent intake into `inbound_messages`.
- DSN parsing (multipart/report), RFC 3463 classification → `bounces` row,
  message status → `bounced`, `bounce_type` set.
- Delivery heuristic job: `sent` + 48 h + no bounce → `delivered`.
- Suppression writes: hard bounce → immediate; 3 soft bounces/30 days →
  suppressed; suppression list UI (view, manual add, admin release with audit).
- **Accept:** sending to a nonexistent address on a major provider produces a
  `bounced (hard)` status and a suppression entry within one poll cycle;
  re-sending to that address is blocked in compose.

### ✅ Task 11 — Sent-mail dashboard (message list + detail) (L)
**Depends on:** 9, 10
- List view per FR-6.1: all columns, quick filters (status, account, template,
  date range, tag), text search (recipient/subject), pagination, saved filters.
- Detail view per FR-6.2: rendered snapshot, event timeline (opens with
  device/geo, clicks with link, bounce diagnostic), first/last open, per-link
  click table, bot-events toggle.
- **Accept:** answer "did customer X open the quote I sent Tuesday?" in under
  10 seconds using filters; timeline matches raw events.

### ✅ Task 12 — Scheduled sending (M)
**Depends on:** 8
- Schedule at compose (date/time/timezone) → `scheduled` status + BullMQ
  delayed job; scheduled queue screen with edit/cancel before dispatch.
- **Accept:** email scheduled for +5 min sends on time; cancelled schedule
  never sends; worker restart doesn't drop scheduled jobs.

**🏁 Phase 1 milestone:** the team sends all quotation email through the
platform and sees opens, clicks, and bounces per message.

---

## Phase 2 — Analytics & engagement

### ✅ Task 13 — Stats rollup & analytics API (M)
**Depends on:** 11
- Incremental `daily_stats` rollup job (by day × account × template);
  analytics endpoints: KPI set (sent, delivered, rates, opens, clicks, CTR,
  CTOR, bounce, reply) with period + previous-period comparison; time series
  with day/week/month/year grain.
- **Accept:** API numbers reconcile exactly with raw-event queries on a test
  dataset; year query returns <200 ms using rollups.

### ✅ Task 14 — Analytics dashboard UI (L)
**Depends on:** 13
- KPI tiles with period selector + deltas; activity time-series charts;
  leaderboards (top templates, most-opened emails, most-clicked links,
  most-engaged customers); template-vs-template and account-vs-account
  comparison views; best-time-to-send weekday×hour heatmap.
- **Accept:** all FR-7 views render correctly against seeded data at
  mobile/desktop widths in light and dark mode.

### ✅ Task 15 — Reply tracking (M)
**Depends on:** 10
- Extend inbound worker: correlate `In-Reply-To`/`References` with sent
  `Message-ID`s → set `replied_at`, emit reply event; replied status in list,
  detail timeline, and analytics (reply rate).
- **Accept:** replying to a tracked email from a personal account marks it
  Replied within one poll cycle.

### ✅ Task 16 — Real-time dashboard updates (M)
**Depends on:** 11
- SSE stream of tracking events (auth-scoped); sent-list and detail views
  update live; toast on first-open/click/reply for the viewing user.
- **Accept:** with the dashboard open, opening a tracked email shows the event
  without refresh in <5 s.

### ✅ Task 17 — Notification center (M)
**Depends on:** 16
- In-app notification inbox (`notifications` table) + per-user preferences
  (which events, in-app vs email digest); events: first open, click, reply,
  bounce, send failed, quota warning.
- **Accept:** user with "bounce" enabled gets an in-app notification on a hard
  bounce; user with it disabled doesn't.

### ✅ Task 18 — Follow-up reminders & customer engagement history (M)
**Depends on:** 15, 17
- Per-send follow-up rule ("remind me if no reply/open in X days") → scheduled
  check → notification with one-click follow-up compose (pre-filled from a
  follow-up template, threaded via In-Reply-To).
- Customer profile: full communication timeline + engagement score
  (recency/frequency-weighted opens, clicks, replies).
- **Accept:** unanswered email triggers a reminder on day X; engaged-customer
  list ranks obviously-engaged test customers first.

---

## Phase 3 — Platform hardening & compliance

### ✅ Task 19 — RBAC & multi-user hardening (M)
**Depends on:** 3 (+ all feature endpoints)
- Enforce the four roles across every endpoint and UI surface per PRD §1.5
  (agents see only their own sends; viewers read-only; permission matrix
  documented + tested).
- **Accept:** endpoint-level permission test matrix passes; UI hides what the
  role can't do.
- See [PERMISSIONS.md](./PERMISSIONS.md) for the full matrix, the ownership-
  scoping design, and the documented limitation on agent-scoped aggregate
  analytics (daily_stats has no per-user dimension yet).

### ✅ Task 20 — Audit logging (S)
**Depends on:** 19
- Audit writes on: auth events, sends, template changes, credential changes,
  suppression overrides, exports, role changes; admin audit viewer with
  filters.
- **Accept:** each listed action produces a correct audit row; non-admins
  cannot read audit logs.

### ✅ Task 21 — Unsubscribe & compliance tooling (M)
**Depends on:** 9
- Unsubscribe link injection + `List-Unsubscribe` / `List-Unsubscribe-Post`
  headers; hosted one-click unsubscribe page → suppression + event.
- CAN-SPAM footer (physical address from settings) enforced on templates.
- GDPR tools: per-customer data export (JSON) and erasure (hard-delete customer
  + anonymize message rows); IP truncation job after retention window; raw
  event purge job dropping expired partitions (aggregates retained).
- **Accept:** unsubscribe click blocks future sends immediately; erasure
  removes all PII for a customer while keeping aggregate stats consistent.

### ✅ Task 22 — Exports & reports (M)
**Depends on:** 14
- CSV/Excel export for sent-mail list and all analytics views; PDF report
  (period summary with charts); export actions audit-logged.
- **Accept:** exported Excel matches on-screen data; PDF renders charts
  correctly.

### ✅ Task 23 — Public REST API & outbound webhooks (L)
**Depends on:** 13, 19
- API keys (scoped, hashed, revocable) + token auth; endpoints: send email,
  CRUD templates/customers, message status, analytics; OpenAPI spec + docs
  page; per-key rate limiting.
- Outbound webhooks: endpoint CRUD, HMAC-SHA256 signatures, event fan-out
  (sent/opened/clicked/bounced/replied/unsubscribed), retries with backoff,
  auto-disable after repeated failure, delivery log UI.
- **Accept:** a script using an API key sends a tracked email and polls its
  status; a test webhook receiver gets a signed `opened` payload and signature
  verifies.

### 🟨 Task 24 — Production readiness & polish (M)
**Depends on:** all
- Dark-mode and mobile polish pass across all screens; empty/loading/error
  states. ✅ Audited all 16 dashboard pages + shared components; coverage
  was already broad, one real gap fixed (webhook delivery log's loading/
  empty rows missing a `dark:` text color).
- Ops: ✅ structured logging (`nestjs-pino`, JSON in prod), ✅ error tracking
  (`@sentry/nestjs` + `@sentry/nextjs`, opt-in via `SENTRY_DSN`), ✅ deepened
  health checks (`/health` liveness, `/health/ready` DB+Redis readiness, a
  dedicated worker health endpoint, docker-compose healthchecks for
  api/worker/web), ✅ Postgres backup + restore scripts
  ([docs/BACKUP.md](./BACKUP.md)), ✅ deploy runbook
  ([docs/DEPLOY.md](./DEPLOY.md)), ✅ tracking-domain DNS/TLS guide (already
  in README, predates this task), ✅ deliverability spot-check checklist
  ([docs/DELIVERABILITY_CHECKLIST.md](./DELIVERABILITY_CHECKLIST.md)).
- ✅ Load-test tooling for the tracking endpoints (scanner-storm scenario)
  and the send queue (`scripts/load-test/`, see its README).
- **Accept:** the tooling and runbooks are built, and everything
  scriptable was verified (lint/typecheck/build/unit tests green; both
  load-test scripts smoke-tested against mock servers). What's **not yet
  done**, because it requires a real deployment target this environment
  doesn't have: an actual clean-VM run of docs/DEPLOY.md, an actual
  `scripts/backup.sh` → `scripts/restore.sh` drill against a live database
  (docs/BACKUP.md's drill log is still empty), and running
  `scripts/load-test/tracking.js` against a real deployed instance to
  confirm the p95 <100 ms target. Whoever deploys this next should run
  those three and check them off here.

### ✅ Task 25 — Scheduled/emailed periodic reports (M)
**Depends on:** 22 (exports & reports), 23 (public API — none directly, but reuses its module patterns)
- `report_subscriptions` table (owner, report kind [analytics PDF / sent-mail
  export], filters, cadence + hour/day-of-week/day-of-month, recipients,
  sending account, active flag, last/next run).
- Admin/manager CRUD API (`/report-subscriptions`) reusing Task 22's
  `ReportsService` export/PDF builders; a `run-now` action enqueues an
  immediate run through the same worker path as the hourly scheduler.
- BullMQ hourly worker scans due subscriptions, regenerates the report,
  and emails it as an attachment via the owning sender account
  (`EmailSenderService.sendNow`, extended to support attachments); failures
  are recorded per-subscription (`last_run_error`) without blocking others.
- Dashboard page (Report Subscriptions, admin/manager) to create/manage
  subscriptions and trigger a manual run.
- **Accept:** a weekly analytics-PDF subscription and a daily sent-mail-CSV
  subscription both fire on schedule and land in the inbox as attachments;
  "run now" queues an out-of-band run; disabling a sender account surfaces
  as a run failure without breaking other subscriptions.

---

## Suggested v2 backlog (not scheduled)

- Drag-and-drop email builder (block-based).
- Zoho Mail REST API integration (OAuth2, thread sync) replacing app passwords.
- Sequences (multi-step automated follow-up campaigns).
- A/B subject-line testing.
- Browser extension / Zoho Mail add-on for tracking from the native UI.
- ZeptoMail/SES transport option per account for volume growth.
