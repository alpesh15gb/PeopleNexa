# YLR September 2026 generation diagnostic

The supplied response reports 0 created, 212 failed, 41 skipped and an
automatically cancelled run. Every attempted employee has PostgreSQL SQLSTATE
25P02 (in_failed_sql_transaction) at a payslip lookup. That is a follow-on error:
the response does not expose the first statement that aborted the transaction.
The later employee-level response exposes the original failure: payslip creation
violates uniqueness on employeeId/month. The baseline created that rule as a
standalone unique index, but the payroll-run foundation migration attempted only
DROP CONSTRAINT. The old index therefore remained and blocked new/replacement
run payslips for employees with an existing slip in the same month.

The new migration 20261003000000_remove_obsolete_payslip_month_index removes
both possible forms of that obsolete rule and retains run/employee uniqueness.
It does not delete or update payslip rows. Historical migration files are unchanged.

Run these checks from the updated application repository on the app server,
with its existing DATABASE_URL loaded:

```sh
npm run diagnose:payroll-db
npx prisma migrate status
```

The diagnostic compares generated payroll fields with the database, checks the
old and new payslip indexes, lists recent migration statuses, and tries standalone
and read-only Serializable payslip lookups. It creates no records and prints no
employee rows, salaries, SQL parameters or connection strings.

After deploying the repair, the diagnostic must report the run-scoped index
present and the obsolete employee/month index absent. Then retry the empty
September run; the missing-salary employees remain skipped until their salary
data is completed. Do not delete existing payslips to bypass the old index.

If the schema checks pass, find the FIRST PostgreSQL error in the server logs
for the generation request, before 25P02. Do not delete the cancelled run or
weaken transaction isolation to make generation proceed.

The UI now preserves per-employee failure and skip reasons from the API,
counts engine skips accurately, and stores generation issues in the run audit.
Empty generation retains automatic cancellation and cannot advance to review.

Validation: TypeScript passes; all 15 payroll/policy regression scripts pass;
production build passes. A sample-data browser check confirms failed and skipped
reasons appear, no review action is offered for an empty run, and the issue table
does not cause page overflow on mobile. Live database checks require the server.

The repair SQL was also executed in an isolated PGlite PostgreSQL engine using
scripts/test-payroll-index-migration.sql: the pre-repair duplicate error is
reproduced, a paid legacy row remains unchanged, separate runs succeed, duplicate
employees within one run remain blocked, and the constraint-backed and repeated
migration cases pass. The fixture uses only a temporary Payslip table.
