# Product Requirements Document (PRD)

## Email Engagement & Tracking Platform for Zoho Mail

| | |
|---|---|
| **Document version** | 1.0 |
| **Date** | 2026-07-05 |
| **Status** | Draft for review |
| **Related docs** | [ERD.md](./ERD.md) · [TASKS.md](./TASKS.md) |

---

## 1. Overview

### 1.1 Problem statement

The business sends quotation, follow-up, invoice, and reminder emails to customers
from five Zoho Mail accounts. Today there is no visibility into what happens after
an email is sent: whether it was delivered, opened, or acted on. Follow-ups are
guesswork, and there is no central history of customer communication.

### 1.2 Product vision

A self-hosted, professional email engagement platform — comparable to the tracking
features of Mailchimp, Brevo, or SendGrid — that layers composition, templating,
tracking, and analytics **on top of Zoho Mail**, which remains the system of record
for sending and receiving email.

### 1.3 Goals

1. Compose and send personalized emails from a custom dashboard through Zoho Mail
   SMTP, so mail continues to originate from the existing five accounts.
2. Track delivery, opens (count + timestamps), clicks (per link), bounces, and
   replies for every email sent.
3. Provide a real-time per-email activity view and an aggregate analytics dashboard.
4. Manage reusable, categorized email templates with merge-field personalization.
5. Be privacy-compliant (GDPR, CAN-SPAM, and similar regulations).

### 1.4 Non-goals (v1)

- Bulk marketing campaigns / mass mailing lists (this is 1-to-1 and small-batch
  transactional/quotation email; Zoho Mail's sending limits do not support bulk).
- Replacing Zoho Mail as the mailbox — inbound mail continues to live in Zoho.
- Drag-and-drop visual email builder (optional, deferred to v2).
- Mobile native apps (the dashboard is mobile-responsive web).

### 1.5 Users

| Role | Description |
|---|---|
| **Owner/Admin** | Full access: user management, sender accounts, settings, all analytics. |
| **Manager** | Send emails, manage templates and customers, view all analytics. |
| **Agent** | Send emails using approved templates, view own sent mail and its analytics. |
| **Viewer** | Read-only access to dashboards and reports. |

---

## 2. Architecture decisions (answers to the technical questions)

### 2.1 Is Zoho Mail SMTP the best approach?

**Yes for this use case, with caveats.** Because the requirement is that mail
must originate from the five existing Zoho accounts (correct From address,
existing SPF/DKIM/DMARC alignment, replies landing in the Zoho inbox), Zoho Mail
SMTP (`smtp.zoho.com:465` SSL / `587` STARTTLS) is the right transport.

Caveats and recommendations:

- **Sending limits.** Zoho Mail is a mailbox product, not a bulk sender. Limits
  are roughly 50–500 emails/day/account depending on plan and account age, with
  per-hour throttles. The app must enforce per-account daily/hourly quotas and
  queue-and-retry rather than blast.
- **Auth.** Use per-account **app-specific passwords** (or OAuth2 via Zoho Mail
  API). Never store the primary account password. If 2FA is on (it should be),
  app passwords are required for SMTP anyway.
- **Sent folder.** Mail sent via SMTP **is** saved to the Zoho Sent folder
  (Zoho does this for authenticated SMTP), so the Zoho web UI stays consistent.
- **Alternative considered — Zoho Mail REST API** (`mail.zoho.com/api`): can also
  send messages and offers OAuth2. Recommended as a **v2 enhancement** for
  reading folders/threads; SMTP is simpler and sufficient for v1 sending.
- **Alternative considered — Zoho ZeptoMail / a transactional ESP**: would give
  native delivery/bounce webhooks, but mail would no longer originate from the
  Zoho Mail accounts and would require separate domain/subdomain setup. Rejected
  for v1 per the stated constraint; worth revisiting only if volume outgrows
  Zoho Mail limits.

### 2.2 Technical limitations of SMTP-based tracking (set expectations)

| Signal | What SMTP gives you | Mitigation |
|---|---|---|
| **Delivery** | Only "accepted by smtp.zoho.com" (250 OK). No confirmation the recipient server accepted or the message reached the inbox. | Treat `250 OK` as **Sent**. Upgrade to **Delivered** heuristically: no bounce within 24–48 h ⇒ assumed delivered. Mark explicitly **Bounced** when an NDR arrives (see 2.5). |
| **Opens** | Nothing. Requires tracking pixel. | Pixel (2.4). Accept known inaccuracies: image-blocking clients under-count; **Apple Mail Privacy Protection pre-fetches every pixel** (false opens, proxied IP); **Gmail proxies images** (masks IP/UA, may cache). Label geo/device data as "approximate"; flag Apple-proxy opens. |
| **Clicks** | Nothing. Requires link rewriting. | Redirect service (2.4). Filter **bot clicks** from security scanners (Outlook SafeLinks, Barracuda, etc.): heuristics = clicks < ~3 s after delivery, HEAD requests, datacenter IP ranges, known scanner UAs, all-links-clicked-instantly patterns. Store raw events but exclude bot-flagged ones from headline metrics. |
| **Spam complaints** | Not available. Zoho Mail exposes no FBL to mailbox customers. | Out of scope; document as limitation. Watch reply/inbound for manual complaints. |
| **Read receipts** | MDN read receipts are widely ignored/blocked by clients. | Do not rely on them; pixel opens are the primary open signal. Optional per-send toggle only. |

These limitations are inherent to *every* pixel-based tracker (including
Mailchimp/Brevo); the dashboard should present open/click data as directional,
not absolute.

### 2.3 Should Zoho APIs or IMAP/POP3 also be integrated?

**Yes — IMAP is required, not optional**, because bounce detection depends on it
(2.5). Recommended integration set:

1. **SMTP (v1, required):** outbound sending. `smtp.zoho.com`, TLS, app password.
2. **IMAP (v1, required):** `imap.zoho.com:993`. Poll (or IMAP IDLE) each sender
   account's Inbox for: (a) bounce/NDR messages addressed to the account, and
   (b) replies to tracked emails (match via `In-Reply-To`/`References` headers
   against stored `Message-ID`s) → powers **reply tracking**.
3. **Zoho Mail REST API (v2, optional):** OAuth2; folder/thread reading, richer
   sync, sending without storing app passwords.
4. **POP3:** not recommended (destructive/stateless vs IMAP; no benefit).

### 2.4 Tracking pixel & click-tracking architecture

```
                         ┌────────────────────────────┐
  Compose & Send         │   App Server (API + UI)    │
  ───────────────►       │  - render template + merge │
                         │  - inject pixel            │
                         │  - rewrite links           │
                         │  - enqueue send job        │
                         └─────┬──────────────────────┘
                               │ queue (Redis)
                         ┌─────▼──────────┐   SMTP    ┌──────────┐
                         │  Send Worker    ├──────────►│ Zoho Mail│──► Recipient
                         │  rate-limited   │           └────┬─────┘
                         └────────────────┘                 │ NDR / replies
                         ┌────────────────┐    IMAP         │
                         │ Inbound Worker  │◄───────────────┘
                         │ bounce+reply    │
                         └────────────────┘
  Recipient opens ──► GET https://track.example.com/o/{token}.gif ─► 1×1 GIF + event
  Recipient clicks ─► GET https://track.example.com/c/{token}     ─► 302 → original URL + event
```

Design rules:

- **Custom tracking domain**: a dedicated subdomain of the sending domain (e.g.
  `track.yourdomain.com`) with HTTPS. Links matching the From domain look
  legitimate to spam filters and recipients.
- **Tokens**: opaque, unguessable (≥128-bit random, base62), unique **per
  message** for the pixel and **per link per message** for clicks. Never encode
  raw IDs or emails in URLs. Look up token → (message, link) server-side.
- **Pixel endpoint** (`GET /o/{token}.gif`): always return the GIF with
  `Cache-Control: no-store, private` in <50 ms; write the event asynchronously
  (queue). Record timestamp, IP, User-Agent; derive device/OS/browser (UA
  parsing) and coarse geo (IP → country/city via local GeoIP DB).
- **Click endpoint** (`GET /c/{token}`): validate token, enqueue event, `302` to
  the stored original URL. **Never redirect to a URL taken from the request** —
  only to the URL stored at send time (prevents open-redirect abuse). Unknown or
  expired token → redirect to the site homepage.
- **Link rewriting** at send time parses the final HTML, replaces each `<a href>`
  with the tracking URL, and stores `(message_id, original_url, position, token)`.
  `mailto:`, anchors (`#`), and the unsubscribe link's *List-Unsubscribe header
  copy* are left untracked or handled specially.
- **First-open inference**: a click without a prior open event implies an open
  (image-blocking client) — record a synthetic "open (inferred)".
- **Idempotency & ordering**: events are append-only; uniqueness/first-open
  logic is computed at read time or via counters updated transactionally.

### 2.5 Delivery status & bounce detection (accurate design)

There is no webhook from Zoho Mail, so bounces must be harvested from the
mailbox:

1. Every outbound message stores its SMTP response and its `Message-ID`.
2. The **Inbound Worker** polls each account via IMAP (60 s interval, or IMAP
   IDLE) and inspects new messages:
   - **DSN detection**: `Content-Type: multipart/report; report-type=delivery-status`,
     `From: MAILER-DAEMON@…` / `postmaster@…`, subjects like "Delivery Status
     Notification (Failure)".
   - **Correlation**: extract the original `Message-ID` (from the returned
     `message/rfc822` part) or the failed recipient from the
     `message/delivery-status` part; match against sent messages.
   - **Classification** (RFC 3463 status codes): `5.x.x` ⇒ **hard bounce**
     (bad address, rejected) — mark address suppressed; `4.x.x` ⇒ **soft bounce**
     (mailbox full, greylisting, temp failure) — mark soft; 3 soft bounces on
     the same address within 30 days ⇒ escalate to suppressed.
3. **State machine per message**:
   `queued → sending → sent (250 OK) → delivered (no bounce after 48 h, displayed as "Delivered*") | bounced (hard/soft) | failed (SMTP rejected)`
4. **Suppression list**: hard-bounced and unsubscribed addresses are blocked at
   compose time with a clear warning; sending to them requires an admin override
   (and is logged).
5. **Reply tracking** rides on the same IMAP worker: match `In-Reply-To` /
   `References` to stored `Message-ID`s ⇒ mark message **Replied** with timestamp.

### 2.6 Recommended technology stack

Chosen for a small team, one product, self-hosted, with real-time needs:

| Layer | Choice | Rationale |
|---|---|---|
| Backend | **Node.js + TypeScript (NestJS)** | One language across stack; first-class `nodemailer` (SMTP), `imapflow`/`mailparser` (IMAP), BullMQ workers; structured DI for services/workers. |
| Frontend | **Next.js + TypeScript + Tailwind** | Dashboard UI, SSR for fast loads, mobile-responsive, dark mode via CSS variables. |
| Database | **PostgreSQL 16** | Relational integrity for messages/events, JSONB for flexible custom fields & event metadata, window functions for analytics. |
| Queue/cache | **Redis + BullMQ** | Send queue with per-account rate limiting, retries with backoff, scheduled sends (delayed jobs), async event ingestion. |
| Realtime | **Server-Sent Events (SSE)** (WebSocket if needed later) | Push new tracking events to the dashboard. |
| Email libs | `nodemailer`, `imapflow`, `mailparser`, `juice` (CSS inlining), `cheerio` (link rewriting), `ua-parser-js`, MaxMind GeoLite2 | Proven, self-hosted, no external tracking dependency. |
| Deploy | **Docker Compose** (app, worker, Postgres, Redis, reverse proxy w/ TLS) | Single-VM friendly; scale-out path exists (2.8). |

*(If the team prefers Python, the equivalent stack is FastAPI + Celery + the same
Postgres/Redis design; the ERD and tasks are stack-agnostic.)*

### 2.7 Database design

See **[ERD.md](./ERD.md)** for the full entity-relationship design. Headline
decisions:

- `email_messages` is the central fact table (one row per recipient per send);
  `tracking_events` is an append-only event stream partitioned by month.
- Denormalized counters (`open_count`, `click_count`, `first_opened_at`, …) on
  `email_messages` keep the list view fast; the event table remains the source
  of truth.
- Templates are versioned (snapshot stored on each send) so analytics remain
  accurate after template edits.
- Suppression, unsubscribe, bounce, and audit data are first-class tables.

### 2.8 Scalability considerations

Realistic volume (5 accounts × Zoho limits) is **≤ ~2,500 emails/day** — small.
The design should be *correct first*, with clean scale-out seams:

- **Stateless web/API tier** behind a reverse proxy; scale horizontally.
- **Workers separated from web** (send worker, inbound worker, event ingester) —
  already separate processes in Docker Compose; can move to separate hosts.
- **Tracking endpoints** are the only latency-sensitive, unauthenticated,
  internet-facing surface: keep them dependency-light (token lookup in Redis
  cache → enqueue → respond), so they survive traffic spikes and scanner storms.
- **`tracking_events` partitioned by month** + rollup/aggregate tables for
  analytics so dashboards never scan raw events for year views.
- **Rate limiting** on tracking endpoints (per-IP) and API (per-user).
- Growth path: if volume outgrows Zoho Mail, swap the send worker's transport
  for ZeptoMail/SES per sender account — the queue/worker seam makes this a
  contained change.

### 2.9 Security best practices

- **Credentials**: Zoho app passwords encrypted at rest (AES-256-GCM via a
  KMS-style envelope key kept outside the DB); never logged; masked in UI.
- **AuthN/AuthZ**: session or JWT auth with refresh rotation; RBAC enforced
  server-side per endpoint; optional TOTP 2FA for dashboard users.
- **Tracking endpoints**: unguessable tokens, no PII in URLs, strict 302
  allowlist (stored URL only), per-IP rate limits, no cookies set.
- **Input handling**: template HTML sanitized (allowlist) before storage and
  preview; merge-field values HTML-escaped at render; CSP on the dashboard.
- **Transport**: TLS everywhere (dashboard, tracking domain, SMTP/IMAP with
  certificate verification).
- **Secrets & config**: environment/secret manager, not the repo.
- **Audit log**: append-only record of logins, sends, template changes,
  suppression overrides, exports, permission changes.
- **Backups**: automated Postgres backups with tested restore; tracking-event
  retention policy (see 2.10).

### 2.10 Privacy & legal compliance

- **Lawful basis / notice (GDPR)**: tracking pixels + IP collection = personal
  data processing. Include a processing notice in the email footer (e.g. "We
  use tracking to understand engagement — see our privacy policy"), document
  legitimate interest assessment, and honor objections (per-recipient
  **tracking opt-out flag** that disables pixel/link rewriting for that
  contact).
- **Data minimization**: store coarse geo (country/city), not precise location;
  configurable **IP retention** (default: truncate/hash IPs after 30 days,
  purge raw events after a configurable window, keep aggregates).
- **CAN-SPAM / unsubscribe**: every email includes the sender's physical
  address and an unsubscribe link (+ `List-Unsubscribe` and
  `List-Unsubscribe-Post` headers for one-click). Unsubscribes are honored
  immediately via the suppression list. (Quotation emails are transactional,
  but follow-ups/reminders can be treated as commercial — safest to include it
  everywhere.)
- **Right to erasure/access**: admin tools to export or delete all data for a
  given customer email.
- **Data residency**: single-region hosting; document where data lives.
- **Consent for cookies**: tracking endpoints set **no cookies**, keeping the
  system outside most cookie-consent regimes.

---

## 3. Functional requirements

### 3.1 Sender account management

- FR-1.1 Connect up to N Zoho Mail accounts (5 initially) with display name,
  email, SMTP/IMAP credentials (app password), and signature.
- FR-1.2 Verify connection (SMTP login + IMAP login test) before activation.
- FR-1.3 Per-account send quotas (daily/hourly) with live usage display.
- FR-1.4 Enable/disable accounts; credentials editable by Admin only.

### 3.2 Customer (contact) management

- FR-2.1 CRUD customers: name, company, email(s), phone, tags, notes, custom
  fields (typed key-value).
- FR-2.2 Import/export CSV.
- FR-2.3 Customer profile shows full communication history (sent emails,
  opens/clicks/replies timeline, engagement score).
- FR-2.4 Per-customer flags: unsubscribed, suppressed (bounced), tracking
  opt-out.

### 3.3 Template management

- FR-3.1 CRUD templates with: name, category (Quotation, Follow-up, Invoice,
  Reminder, Welcome, Payment Reminder, Thank You, custom categories), subject,
  HTML body, plain-text body, status (draft/active/archived).
- FR-3.2 Rich HTML editor with source view; plain-text auto-generation with
  manual override.
- FR-3.3 Merge fields with `{{placeholder}}` syntax: customer.name,
  customer.company, customer.email, customer.phone, quotation.number,
  product.name, price, sender.name, sender.signature, and any custom field;
  insertable from a picker; validated at save (unknown placeholder = warning).
- FR-3.4 Duplicate, edit, archive/delete, preview (with sample or real customer
  data), test-send to self.
- FR-3.5 Default template per category; template versioning (snapshot per send).

### 3.4 Compose & send

- FR-4.1 Compose flow: pick sender account → pick customer(s) → pick template
  (or blank) → personalize (merge preview per recipient) → attach files →
  send or schedule.
- FR-4.2 Merge-field resolution per recipient with per-field fallback values;
  hard-fail with warning if a required field is empty.
- FR-4.3 Automatic pixel injection + link rewriting (per 2.4), with a per-send
  "disable tracking" toggle and automatic disable for opted-out contacts.
- FR-4.4 Attachments (size limit per Zoho: 25 MB total), stored and linked to
  the message record.
- FR-4.5 Scheduled sending (date/time, sender's timezone) with cancel/edit
  before dispatch.
- FR-4.6 Drafts: save/resume compose state.
- FR-4.7 Send queue honors per-account rate limits; failures retry with
  exponential backoff (3 attempts) then mark Failed with the SMTP error shown.
- FR-4.8 Compose-time guard: warn/block for suppressed or unsubscribed
  recipients.

### 3.5 Tracking

- FR-5.1 Record open events: timestamp, IP (per retention policy), UA-derived
  device/OS/browser, coarse geo, proxy/bot flags.
- FR-5.2 Record click events per link: everything above + link URL/label.
- FR-5.3 Bounce processing per 2.5 (hard/soft classification, suppression).
- FR-5.4 Reply detection per 2.5.
- FR-5.5 Unsubscribe endpoint: one-click page, confirmation, immediate
  suppression, reason (optional).
- FR-5.6 Bot filtering per 2.2; bot events stored but excluded from headline
  metrics (toggle to include).

### 3.6 Email activity dashboard (per-message)

- FR-6.1 Sent-mail list with columns: recipient name/email, sender account,
  subject, template, sent at, status (Queued/Sent/Delivered*/Bounced/Failed),
  opens (count), clicks (count), replied, and quick filters (status, account,
  template, date range, tag) + full-text search on recipient/subject.
- FR-6.2 Message detail: rendered content snapshot, full event timeline (sends,
  opens with device/geo, clicks with link, bounce detail, reply), first/last
  open time, per-link click table.
- FR-6.3 Real-time updates (SSE) — new events appear without refresh.

### 3.7 Analytics dashboard

- FR-7.1 KPI tiles: sent, delivered, delivery rate, unique/total opens, open
  rate, unique/total clicks, CTR, CTOR, bounce rate, reply rate — for a
  selected period with comparison vs previous period.
- FR-7.2 Time-series charts: daily/weekly/monthly/yearly activity (sent,
  opens, clicks).
- FR-7.3 Leaderboards: top templates (by open rate/CTR), most-opened emails,
  most-clicked links, most-engaged customers.
- FR-7.4 Comparisons: template vs template; sender account vs sender account.
- FR-7.5 Best-time-to-send heatmap (opens by weekday × hour).
- FR-7.6 Export: CSV/Excel and PDF for any report; scheduled email reports (v2).

### 3.8 Platform features

- FR-8.1 Multi-user access with RBAC roles per §1.5; invitation flow.
- FR-8.2 Notification center: in-app (and optional email) alerts for first
  opens, clicks, replies, and bounces on your sends (per-user preferences).
- FR-8.3 Audit log (Admin view) per 2.9.
- FR-8.4 REST API (token-auth) covering send, templates, customers, message
  status, and analytics; OpenAPI spec.
- FR-8.5 Outbound webhooks: subscribe URLs to events (sent, opened, clicked,
  bounced, replied, unsubscribed) with HMAC signatures and retries.
- FR-8.6 Dark mode + fully mobile-responsive dashboard.
- FR-8.7 Follow-up reminders: "remind me if no reply/open within X days" →
  notification + one-click follow-up compose from a follow-up template.
- FR-8.8 Tags/labels on emails and customers; saved filters.

---

## 4. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Tracking endpoints p95 < 100 ms; dashboard pages p95 < 1.5 s; event visible in dashboard < 5 s after occurrence. |
| Reliability | No email lost: queued sends survive restarts (Redis persistence + DB state); at-least-once event ingestion with dedupe. |
| Availability | Tracking endpoints independent of dashboard deploys; target 99.9%. |
| Data | Daily automated backups; 35-day point-in-time recovery window; raw event retention configurable (default 12 months → aggregates kept indefinitely). |
| Compatibility | Emails render in Gmail, Outlook (desktop + web), Apple Mail, Zoho Mail; dashboard supports evergreen browsers. |
| Accessibility | Dashboard WCAG 2.1 AA. |

---

## 5. Success metrics

- 100% of outbound quotation emails sent through the platform within 1 month of launch.
- Bounce detection accuracy ≥ 95% (audited against Zoho mailbox NDRs).
- Time to answer "did the customer open my quote?" < 10 seconds from dashboard.
- Zero deliverability regression (emails keep landing in inbox — monitored via seed-list spot checks).

---

## 6. Rollout plan

1. **Phase 1 – Core send + track (MVP):** accounts, customers, basic templates,
   compose/send via SMTP, pixel + click tracking, sent-mail dashboard, bounce
   detection. *(Tasks 1–12)*
2. **Phase 2 – Analytics & engagement:** analytics dashboard, reply tracking,
   real-time updates, notifications, follow-up reminders. *(Tasks 13–18)*
3. **Phase 3 – Platform hardening:** RBAC/multi-user, unsubscribe & compliance
   tooling, audit logs, exports, REST API + webhooks, dark mode polish.
   *(Tasks 19–24)*

The detailed, one-by-one executable task list lives in **[TASKS.md](./TASKS.md)**.
