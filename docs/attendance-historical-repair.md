# Scoped attendance repair while new punches continue

This tool repairs selected historical evidence into **Review**, not an approved paid day. It never replaces the production database. The previous calendar-day simulation is a comparison scenario, not a payable-attendance instruction.

## What changes

`scripts/attendance-historical-repair.ts` follows every linked saved snapshot/clock from the selected employee-days. Each connected component commits atomically. Existing Attendance IDs and unrelated fields remain intact. Exact retained device events can be normalized with a unique `device-log:ID` key; the original device/user/time/serial must match. Raw content stays intact and its previous processing error is retained in the audit. New reconciliation jobs are blocked for authorized historical review.

Every repaired day is finalized with `reviewStatus=needs_review`. Its clocks and complete scan snapshot are observations; verified work/overtime and attendance units remain withheld by the shared assessment. Existing location/shift metadata is preserved; new rows use the current branch for visibility. No historical shift, late penalty, payable day, employee activation, leave or salary decision is guessed.

Yesterday, today and future dates are excluded. Connected components touching those dates are excluded in full. The cutoff is checked again at apply. Current ingestion/recovery continues independently: ordinary recent recovery can legitimately change derived recent attendance, so fresh production evidence is required even when historical repair excludes those dates.

The tool also excludes manual decisions, inactive/login-only/assignment-pending staff, pre-joining dates, night/automatic workdays needing a separate allocation plan, conflicting source identities and saved evidence missing from the authorized ledger. Historical shift reconstruction must have a consistent audit chain. Reviewed/approved/finalized/paid payroll and legacy paid slips are checked inside every write transaction.

## Fresh evidence comes before production writes

The October 25 laboratory backup cannot certify October 26 production. First take a new custom PostgreSQL dump, application/uploads backup, checksums and deployed revision. Verify the dump's archive directory and restore it to an isolated disposable database for the fresh comparison. Keep the original backup unchanged.

The production deployment needs a measured cutover. A one-container `compose up` restarts the app; it is not zero downtime. To preserve availability, inspect the actual nginx upstream first, build/start a second app instance on an unused loopback port, apply only compatible additive migrations, health-check the new instance, then validate and gracefully reload nginx to it. Keep the old instance available until in-flight requests drain. Do not stop the database or discard its volumes. Actual host paths, ports and old-image rollback must be verified on the VPS before issuing cutover commands.

After cutover, capture a fresh read-only preview while ingestion continues. Never apply the laboratory manifest directly to production.

## Selection and CLI

Keep the selection and generated manifests in a private directory outside Git. They contain employee attendance evidence. A selection is deliberately exact:

```json
{
  "tenantId": "EXACT_TENANT_ID",
  "days": [{ "employeeId": "EXACT_EMPLOYEE_ID", "day": "2026-10-06" }],
  "sourceLogIds": ["EXACT_RETAINED_DEVICE_LOG_ID"]
}
```

No command loads `.env`. Supply the intended `DATABASE_URL` explicitly in a local lab; a running app container already receives its production connection. Never run these commands from the lab against a production URL.

```sh
# Read-only preview. NEW_MANIFEST.json must not already exist.
node node_modules/tsx/dist/cli.mjs scripts/attendance-historical-repair.ts \
  preview PRIVATE_SELECTION.json NEW_MANIFEST.json

# Read-only recent receipt -> normalized ledger -> saved allocation coverage.
# FROM_IST_DAY must be within the last 32 days. Report files cannot be overwritten.
node node_modules/tsx/dist/cli.mjs scripts/attendance-historical-repair.ts \
  recent EXACT_TENANT_ID FROM_IST_DAY NEW_RECENT_REPORT.json

# Only after inspecting the exact fresh preview, its holds and Review changes.
# SHA256 is the manifest's own hash printed by preview, not a guessed value.
# A batch includes at most 25 components here. nextOffset is printed in output.
node node_modules/tsx/dist/cli.mjs scripts/attendance-historical-repair.ts \
  apply FRESH_MANIFEST.json SHA256 25 0
```

Apply uses short serializable transactions, a 750 ms database lock timeout, optimistic row versions and exact evidence/context fingerprints. A new relevant scan, boundary link, source update, employee edit, roster or configuration change invalidates the affected component. It is skipped, not merged automatically. A commit conflict retries at most twice and revalidates the original preview; permanent changes stay skipped. Each committed component keeps full before/after attendance and evidence images in `AuditLog`, with employee code/name and the manifest hash. Reruns do not repeat applied components. Use the printed offset to move past held/skipped groups rather than silently broadening the selection.

Inspect every batch's `failed`, `skipped`, `held` and `already_applied` results. A skipped component requires a new preview and review. Do not interpret a successful process exit as every employee being repaired. Hold all payroll calculations affecting unresolved Review days for the appropriate business review.

## Verify after each batch

- Compare immutable raw and normalized event IDs/timestamps; no original punch is removed.
- Compare the full stored contents of attendance outside the component, especially yesterday/today. Separate legitimate concurrent ingestion from repair changes.
- Check raw events without ledger coverage, authorized scans without a saved allocation, duplicate snapshot allocations and reconciliation-job states. Coverage is not entitlement or proof that hardware delivered all punches.
- Compare daily/monthly/matrix/work summary/performance, employee attendance and punch details for the same scope/cutoff, and round-trip the corresponding Excel exports. Review clocks are retained but do not become verified work hours.
- Use device receipt/latest-punch times and queue progress to verify continued live ingestion. The local snapshot cannot demonstrate current VPS receipt freshness.

## Guarded attendance rollback

```sh
node node_modules/tsx/dist/cli.mjs scripts/attendance-historical-repair.ts \
  rollback FRESH_MANIFEST.json SHA256 25 0
```

Rollback only restores the attendance records changed by that component, using the audited before images. It refuses any component with subsequent punches, changed attendance/context or protected payroll. Recovered raw/normalized punch evidence and audit entries are **retained**, not deleted. Newly created attendance rows are removed only if the complete audited state is still unchanged. A rolled-back operation cannot be reapplied with the same manifest; prepare a new reviewed operation. No whole-database restoration is part of this rollback.

## Isolated validation

`test-attendance-historical-repair.ts` requires `ATTENDANCE_LAB=isolated`, database `peoplenexa_repair_20261026` and socket-only PostgreSQL. It creates/removes its own QA tenant and rejects other database identities. It includes a deliberately injected post-insert failure and an arrival released between the repair transaction's reads and writes.

The report integration test permits that same database only with the additional `ATTENDANCE_REPAIR_LAB=isolated` acknowledgement. Otherwise its original `peoplenexa_working` guard remains unchanged.

The local October 26 rehearsal changed 1,145 day projections into Review, preserving 606 existing IDs and creating 539 rows. It recovered 15 older events; 19 recent source events and both invalid joining-date components remained held. All 125,316 unaffected original attendance rows and all October 25-onward attendance/punch/raw rows were identical to the baseline. This is evidence about that rehearsal, not a promise about a newer production snapshot.
