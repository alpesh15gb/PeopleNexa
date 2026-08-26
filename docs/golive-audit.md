# PeopleNexa Go-Live Audit

## Executive conclusion

PeopleNexa is materially safer to deploy after this audit, but production launch still requires the operator-owned infrastructure checklist in this document. The application now has a PostgreSQL baseline migration, production startup validation, a database-backed health probe, host-bound tenant resolution, safer seed behavior, and hardened imported-device accounts.

## Confirmed blockers fixed

| Area | Finding | Resolution |
|---|---|---|
| Database release | The committed migration was a stale SQLite-era schema using `Company` and `DATETIME`, while the application uses PostgreSQL and `Tenant`. | Replaced it with a PostgreSQL baseline generated from the current schema and added `migration_lock.toml`. A fresh database successfully applied it with `prisma migrate deploy`. |
| Production startup | The container used `prisma db push` on every boot, allowing uncontrolled schema mutation. | Production boot now runs `prisma migrate deploy`. |
| Reverse proxy | Nginx pointed at host port 3012 while Docker Compose defaults to port 3000, causing a likely 502 on the documented configuration. | Nginx now targets port 3000 consistently with Compose and the deployment runbook. |
| Runtime configuration | Missing `DATABASE_URL` could silently fall back to a local database. | Production Prisma initialization fails fast when `DATABASE_URL` is absent. |
| Secrets | JWT and eBioserver encryption helpers had permissive fallbacks. | Production JWT signing and verification require a strong configured secret; startup validates JWT, cron, encryption, and base-domain settings. |
| Tenant isolation | A client-provided `x-tenant-slug` could override the production Host-derived tenant. | The header is honored only outside production; production resolves tenant identity from the forwarded Host header. |
| Scheduled sync | Production cron could be exposed without `CRON_SECRET`. | The cron endpoint returns HTTP 503 when the production secret is missing. |
| Demo data | Production seed could wipe the database and create predictable demo credentials. | Production seed now requires explicit destructive-seed confirmation and strong configured passwords. |
| Device imports | eBioserver imports created active accounts with a shared predictable password and synthetic email. | Imported accounts receive a random password and inactive status. Admin provisioning now supports real email/password setup and blocks activation until provisioning is complete. |
| Credential leakage | An operational script contained a real-looking eBioserver URL and credentials. | The script now requires `EBIO_TENANT_SLUG`, `EBIO_URL`, `EBIO_USERNAME`, and `EBIO_PASSWORD` from the environment. |
| Helpdesk privacy | Any employee in a tenant could reply to any ticket by ID. | Employees can now reply only when they are the requester or assigned participant. |

## Verification evidence

The following checks passed after the fixes:

| Check | Result |
|---|---|
| `sh -n entrypoint.sh` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Fresh `prisma migrate deploy` | Passed on PostgreSQL 16 test database |
| `prisma migrate status` | Database up to date |
| Standalone production server `/api/health` | HTTP 200 with database up |
| Production host-based tenant login | HTTP 200 |
| Spoofed `x-tenant-slug` against production Host | Ignored; correct tenant login succeeded |
| Unknown tenant host | HTTP 404 |
| Production cron without configured secret | HTTP 503 |
| Placeholder-secret startup guard | Refused startup with status 1 |
| Docker/Nginx port consistency | Compose and Nginx both use host port 3000 by default |

## Launch checklist

Before exposing the service publicly, create `.env` and `.env.production` from the templates and replace every placeholder. Set `APP_BASE_DOMAIN`, a 32-character-or-longer `JWT_SECRET`, a 64-hex-character `EBIO_ENCRYPTION_KEY`, and a 32-character-or-longer `CRON_SECRET`. Keep the encryption key permanently stable after any eBioserver credentials are saved.

Provision wildcard DNS for the apex and tenant subdomains, obtain the wildcard TLS certificate, install `deploy/nginx.conf`, run `nginx -t`, and verify that Nginx points to the same `APP_PORT` configured in Compose. Keep the application container bound to loopback so PostgreSQL and the standalone app are not directly exposed.

For a brand-new database, run `docker compose up -d --build` and verify the app health status. For an existing database previously initialized with `prisma db push`, take a backup and compare the schema before using the documented one-time `prisma migrate resolve --applied 20260826000000_postgresql_baseline` procedure. Never run destructive seed in a real production database.

Configure an external backup schedule for PostgreSQL and test a restore before launch. Configure the five-minute eBioserver scheduler with the real `CRON_SECRET`, and monitor `/api/health`, application logs, database logs, failed device pulls, and backup freshness.

## Sandbox limitation

Docker and Nginx binaries were not available in the audit sandbox, so the container build and Nginx parser were not executed locally. The Dockerfile, Compose port wiring, entrypoint syntax, production standalone runtime, migration deploy, health probe, host-based tenant routing, and secret guards were validated statically or against the local PostgreSQL and standalone Next.js runtime.
