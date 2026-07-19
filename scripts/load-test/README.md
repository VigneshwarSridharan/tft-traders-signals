# Load testing

Two scenarios, matching docs/TASKS.md Task 24's acceptance criteria: the
public tracking endpoints under a scanner-storm, and the send queue's
enqueue→terminal-status throughput.

Run these against a local or staging copy of the stack
(`docker compose up --build`) — never against production, and never with
`tracking.js` pointed at real customer tracking domains, since it hammers
the endpoints on purpose.

## Tracking endpoints (scanner storm)

```sh
node scripts/load-test/tracking.js --url http://localhost:3000 --duration 30 --connections 50
```

No setup required — `/o/:token.gif` and `/c/:token` respond regardless of
whether the token is real, which is also the realistic shape of the
scenario being simulated (a scanner/bot probing with garbage tokens at
volume). Reports p50/p97.5/p99 latency; the acceptance target is p95 <
100ms (autocannon doesn't expose an exact p95 bucket, so p97.5 — a stricter
bound — is used as the pass/fail proxy).

## Send queue throughput

Requires a running stack with the `greenmail` fake-SMTP service (the
default local `docker-compose up`), plus:

1. A sender account pointed at GreenMail (see README's "Run with Docker
   Compose" section — the seed data or dashboard can create one).
2. At least one customer.
3. An API key (Dashboard → API Keys) with the `send` and `read:messages`
   scopes.

```sh
TFT_API_URL=http://localhost:3000 \
TFT_API_KEY=sk_... \
TFT_SENDER_ACCOUNT_ID=<uuid> \
TFT_CUSTOMER_ID=<uuid> \
node scripts/load-test/send-queue.js --count 200 --concurrency 20
```

Enqueues `--count` sends via the public API (`POST /v1/send`), then polls
`GET /v1/messages/:id` until every message reaches a terminal status
(`sent`/`delivered`/`bounced`/`failed`) or `--poll-timeout-ms` elapses.
Reports enqueue throughput, drain time, and a status breakdown; any message
stuck past the timeout is flagged as a possible sign the send worker is
falling behind under load.

**Never point `TFT_SENDER_ACCOUNT_ID` at a real Zoho (or other real) sender
account** — this generates real outbound mail at volume.
