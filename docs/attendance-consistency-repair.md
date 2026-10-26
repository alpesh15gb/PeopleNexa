# Attendance consistency repair

This change separates observed scans, assessed attendance and payroll calculations. It does not automatically repair historical attendance or change employee/device access.

The guarded, review-only historical repair and live-ingestion verification workflow is documented in [attendance-historical-repair.md](attendance-historical-repair.md). It requires a fresh production preview and preserves yesterday/today by default.

## Behavior

- A normalized source punch and its durable reconciliation job commit together. A duplicate source event still retries unfinished reconciliation.
- The bounded scheduler drains pending/failed jobs, reclaims expired worker leases and retains readable failure reasons. Authorization changes increment the job generation so an old worker cannot acknowledge newer work.
- Reconciliation reads and writes through one serializable transaction. Shift/policy helpers share that transaction, avoiding a second connection per in-flight calculation. Both Prisma and PostgreSQL adapter serialization/deadlock errors receive bounded retries with jitter.
- Finalized decisions and reviewed/approved/finalized/paid payroll are protected. Legacy paid payslips are protected too. New evidence remains retained and blocked for authorized review. Protected old rows do not consume every finalization batch.
- Attendance GET requests are read-only. Device/network pull failures do not prevent independent recovery of punches already stored.
- Routine raw-log recovery remains limited to seven days. Older retained logs require an explicit historical recovery request; deployment does not silently backfill them.
- Exact device codes are preserved, including leading zeros. Recovery never activates employees.

## Reports and employee attendance

Daily scan presence is a calendar-day observation, not an entitlement to a full paid day. The adjacent assessed attendance column uses the same assessment as the monthly, matrix, work-summary and performance reports. Employee attendance uses the same classification.

| Display | Meaning |
| --- | --- |
| P / ½P | Assessed full/half attendance; manual decisions remain authoritative |
| Pending | Authorized punches or retained device source events without a calculated day, or today without a completed record |
| Review | Flagged, invalid or implausible pair; excluded from verified work/overtime totals |
| Upcoming | Date after the report's IST cutoff; excluded from absence |
| — | Before joining; excluded from absence |
| L / H / WO | Approved leave, holiday or configured weekly off, subject to assessed/manual decisions |

Clocks remain evidence even on Review days. `(+1d)` explicitly identifies a next-morning clock. Punch Details includes complete IST dates and uses the same assessment and verified-hours rule. It remains an employee/workday report, not a raw source-event export.

Performance's former “paid days” display is labelled **Attendance units (excluding leave)**. It is full/half assessed attendance only, not the payroll payable-days calculation. No payroll salary, leave-credit or deduction calculation is changed here.

Reports include active staff plus staff with attendance or authorized scans during the selected period, excluding login-only accounts. Thus a whole-month population can differ from one day's population. Counts should only be compared for the same population, period, cutoff and measure.

Location scope includes employees in an assigned branch and branchless employees explicitly assigned to that location. Branch membership takes precedence over a legacy employee location. Search conditions cannot override location restrictions. Managers without an assignment receive no reporting scope. Master exports include the branchless employee's location name.

Retained source events awaiting normalization produce Pending rather than an assumed absence, and a source-recovery warning is visible. They do not grant work hours.

Excel exports include Report Notes explaining status, population, cutoff, clock offsets and outstanding recovery jobs. Existing report layouts are retained; Work Summary gains an Attendance column.

## Local verification

Do not load the VPS application's environment files or start its compose stack in the lab. Keep an unchanged baseline database and a separate working clone. Block outbound connectivity before running copied integrations.

The integration tests require `ATTENDANCE_LAB=isolated`, database name `peoplenexa_working` and PostgreSQL `listen_addresses=''`. They create and remove named QA fixtures only. The report test replaces the session boundary; report handlers, database queries and Excel writers are the application implementations.

```powershell
node scripts/build-attendance-lab-tests.cjs D:/PATH/TO/PRIVATE-LAB
```

Run the resulting `recovery-test.mjs` and `report-test.mjs` with a compatible Linux Node runtime inside the isolated PostgreSQL container, using its Unix socket connection and the explicit lab acknowledgement. The report fixture targets the restored audit tenant/location and freezes the assessment date to 25 October 2026. `ATTENDANCE_SOURCE_JSON` can point to the previously parsed source rows for exact-code/timestamp coverage checks.

Coverage includes atomic rollback, interrupted device/realtime retries, duplicate identity, concurrent events/workers, expired leases, failed retries, stale authorization generations, held/approved/declined mobile evidence, manual decisions, payroll protection, finalization fairness, legacy payslips and simultaneous employee calculations.

The report test compares every employee/day across monthly, matrix, work summary and performance, compares daily assessment/clocks and the attendance API for 1–25 October, round-trips the five report Excel writers and checks Punch Details, master, inactive and mobile exports. Synthetic mobile rows verify GPS/approval fields and searched location isolation. Source coverage is exact code/timestamp coverage; it does not prove device serial identity where the supplied workbook contains names only.

Additional regression checks:

```powershell
pnpm exec tsx scripts/test-attendance-assessment.ts
pnpm run test:attendance
pnpm run test:attendance-financial-safety
pnpm run test:automatic-shifts
pnpm run test:report-month-range
pnpm exec tsx scripts/test-device-daily-presence.ts
pnpm run test:attendance-tally
pnpm run test:attendance-drilldown
pnpm run test:mobile-attendance
pnpm run test:employee-master-list
pnpm run test:inactive-employee-report
pnpm run test:employee-status
pnpm run test:employee-status-batch
pnpm run test:payroll
pnpm run test:payroll-attendance-import
pnpm run test:leave-payroll-controls
pnpm run typecheck
pnpm run build
```

Use sanitized environment values and a separate build folder for the build. Compare full-row fingerprints as well as row counts of every original public table after lab fixtures are removed.

The browser component preview exercises real report components and read-only handlers against the isolated clone, with a supplied manager session. Full login, hardware delivery, live GPS/selfie capture and VPS throughput are outside that preview's coverage.

## Historical review

The preview command has no apply mode. It executes its database work in a read-only repeatable-read transaction and writes a private JSON report:

```powershell
# Supply a local DATABASE_URL explicitly; the script does not load .env.
pnpm exec tsx scripts/preview-attendance-repair.ts TENANT_ID 2026-10-01 2026-10-25 D:/PRIVATE-LAB/historical-preview.json MNP
```

It lists authorized punch-days without Attendance, review-required records, retained device events without their immutable normalized event key, proposed calendar-day pairs and protection reasons. Assignment-pending, inactive, pre-joining, manual and payroll-protected cases require separate decisions. Another source may represent the same physical scan; check that before appending events.

Calendar-day candidates are not approved historical outcomes. Confirm the historical shift/roster and effective policy before applying any repair. Keep manual choices and locked payroll unchanged. The older cross-day repair script now excludes declined punches and manual overrides, but is not a substitute for reviewing this complete preview, especially missing Attendance rows.

## Rollout gate

No production migration, push, deployment or historical backfill was performed by the local verification workflow.

1. Review the code, report examples and historical exception list. Agree the historical shift and missing-punch rules separately.
2. Take a fresh VPS database/application/uploads backup and record the deployed revision.
3. Apply the additive `AttendanceReconcileJob` migration **before** starting code that writes punches or reads the new job table. Use the normal Prisma migration deployment workflow; do not reset or push the schema.
4. Deploy the reviewed application and verify the existing scheduler calls the cron endpoint. Queue recovery depends on that scheduler running.
5. Confirm one controlled test account's IN/OUT, review decisions, reports and Excel export. Check the queue and source timestamps. Do not change ordinary employees to perform this test.
6. Monitor queue failures/blocked work and ingest freshness. Approve any historical repair as a separately scoped operation with before/after evidence.

For rollback, restore the prior application image/revision. Leave the additive job table and its retained evidence in place; do not drop data as an application rollback step. Database restoration requires a separate decision because post-backup punches may have arrived.
