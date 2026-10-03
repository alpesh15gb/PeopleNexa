# YLR September 2026 generation diagnostic

The supplied response reports 0 created, 212 failed, 41 skipped and an
automatically cancelled run. Every attempted employee has PostgreSQL SQLSTATE
25P02 (in_failed_sql_transaction) at a payslip lookup. That is a follow-on error:
the response does not expose the first statement that aborted the transaction.
Pending migrations or a schema mismatch are possibilities, not confirmed causes.

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
