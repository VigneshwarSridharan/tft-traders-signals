# RBAC permission matrix

| | |
|---|---|
| **Document version** | 1.0 |
| **Related docs** | [PRD.md](./PRD.md) §1.5 · [TASKS.md](./TASKS.md) Task 19 |

Four roles, enforced server-side on every mutating endpoint via `@Roles()` +
`RolesGuard` (`apps/api/src/auth/guards/roles.guard.ts`), and reflected in the
dashboard UI (nav items and action buttons hidden per role). An endpoint with
no `@Roles()` decorator is open to any authenticated user regardless of role
— that's an explicit choice for read-only, non-sensitive resources (e.g. tag
list, template list), not an oversight.

- **Admin** — full access to everything below.
- **Manager** — send emails, manage templates/customers/tags, view all
  analytics. Cannot manage users, sender accounts, suppressions, custom
  field definitions, or template categories.
- **Agent** — send emails using existing templates; sees and manages only
  the sent mail, scheduled sends, and messages *they* sent. No template,
  customer, or tag management; no org-wide analytics (see note below).
- **Viewer** — read-only across dashboards and reports. Cannot send, cannot
  mutate anything.

## Matrix

| Resource / action | Admin | Manager | Agent | Viewer |
|---|:---:|:---:|:---:|:---:|
| Users — read/manage, invitations | ✅ | ❌ | ❌ | ❌ |
| Sender accounts — read/manage/verify | ✅ | ❌ | ❌ | ❌ |
| Suppressions — read/manage | ✅ | ❌ | ❌ | ❌ |
| Custom field defs — read | ✅ | ✅ | ✅ | ✅ |
| Custom field defs — create/update/delete | ✅ | ❌ | ❌ | ❌ |
| Template categories — read | ✅ | ✅ | ✅ | ✅ |
| Template categories — create/update/delete | ✅ | ❌ | ❌ | ❌ |
| Templates — read/preview/merge-fields | ✅ | ✅ | ✅ | ✅ |
| Templates — create/update/duplicate/version/test-send/delete | ✅ | ✅ | ❌ | ❌ |
| Customers — read/export | ✅ | ✅ | ❌ | ❌ |
| Customers — read (list/get/timeline) | ✅ | ✅ | ✅ | ✅ |
| Customers — create/update/delete/import/tag | ✅ | ✅ | ❌ | ❌ |
| Tags — read | ✅ | ✅ | ✅ | ✅ |
| Tags — create/update/delete | ✅ | ✅ | ❌ | ❌ |
| Compose / send / test-send | ✅ | ✅ | ✅ (creates own) | ❌ |
| Scheduled sends — read/reschedule/cancel | ✅ (all) | ✅ (all) | ✅ (**own only**) | ❌ |
| Sent mail — list/detail | ✅ (all) | ✅ (all) | ✅ (**own only**) | ✅ (all, read-only) |
| Sent mail — tag/untag | ✅ | ✅ | ✅ (**own only**) | ❌ |
| Message detail / follow-up draft | ✅ (all) | ✅ (all) | ✅ (**own only**) | — (no route in nav; API allows read like sent-mail) |
| Analytics — KPIs/timeseries/leaderboards/heatmap | ✅ | ✅ | ❌ (see note) | ✅ |
| Notifications — own inbox/preferences | ✅ | ✅ | ✅ | ✅ |
| Realtime SSE stream — own events | ✅ | ✅ | ✅ | ✅ |
| Public tracking pixel/click redirect | n/a — unauthenticated by design | | | |

"Own only" is enforced in the service layer (not just the controller): an
agent requesting another user's message/scheduled-send by ID gets a 404,
not a 403, so existence isn't leaked; agent-scoped list endpoints filter
`sent_by = currentUser.id` at the SQL layer.

## Note: agents and analytics

The PRD says agents should "view own sent mail and its analytics." The
per-message analytics (opens, clicks, bounce status, timeline) are available
to agents today via the ownership-filtered sent-mail list/detail — that
satisfies "its analytics" for an individual send.

The *aggregate* analytics dashboard (KPI tiles, time series, leaderboards,
heatmap) is a different case: it's served entirely from the `daily_stats`
rollup table, whose only dimensions are `day × sender_account_id ×
template_id` (see `apps/api/migrations/1783325182379_tracking-events-and-daily-stats.sql`)
— there is no per-user dimension. Adding one would mean a rollup-table
migration and a rewrite of `DailyStatsRepository.rollupRange()`'s grouping
sets, which is out of scope for this hardening pass. Until that lands,
agents don't get the aggregate analytics dashboard at all (403), rather than
either seeing everyone's numbers or an incorrectly-scoped subset. Tracked as
follow-up backlog, not silently dropped.

## Test coverage

Endpoint-level role coverage lives in `apps/api/test/rbac.e2e-spec.ts`,
using the shared `loginAsRole()` helper in `apps/api/test/helpers/auth.ts`
(extended to all four roles). It asserts, per resource: the allowed roles
get through, the disallowed roles get 403, and agents get 404 (not another
agent's data) when reaching across ownership boundaries.
