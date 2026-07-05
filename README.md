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

📋 Planning phase — no application code yet. Implementation begins with
[Task 1: Project scaffolding](./docs/TASKS.md#-task-1--project-scaffolding--infrastructure-m).

## Proposed stack

Node.js + TypeScript (NestJS API, Next.js dashboard) · PostgreSQL 16 ·
Redis + BullMQ workers · Docker Compose. Rationale in
[PRD §2.6](./docs/PRD.md#26-recommended-technology-stack).
