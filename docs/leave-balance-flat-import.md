# Leave Balance Flat CSV

Use this canonical one-row-per-employee, one-cutoff-month CSV for leave balance reconciliation imports. It is a snapshot, not a running ledger.

The headers and their order must be exactly:

`schema_profile,employee_code,employee_name,designation,joining_date,opening_balance,through_month,worked_days,credited,availed,available,source_row`

`schema_profile` must be `peoplenexa-leave-balance-flat-v1`. `employee_code` is matched case-insensitively to an active, non-login employee in the selected tenant. `employee_name`, `designation`, and `joining_date` are source evidence and are not used to create or modify employees. `joining_date` is `YYYY-MM-DD` or blank.

`through_month` is `YYYY-MM`, must be identical on every row, and must match the cutoff selected in the import UI. `source_row` is the positive row number from the source file. All numeric values are non-negative decimal values. Each row must reconcile exactly within 0.001:

`opening_balance + credited - availed = available`

`opening_balance` is the balance immediately before `through_month`, not the balance at the start of the calendar year. `worked_days` is retained as source evidence and is not part of the balance equation.

Upload the CSV, select the mapped leave type and matching cutoff month, then run the mandatory dry run. It reports ready and excluded rows by missing employee, inactive employee, ambiguous employee code, immutable-snapshot conflict, policy conflict, and invalid/reconciliation error. Download the complete exceptions CSV before deciding what to do; it contains every exception and source-row evidence, not just the on-screen preview.

Strict import is the default and blocks every exception. An admin may instead select reviewed-exceptions import only when there are ready active employees, no structural workbook errors, and they affirm the exact excluded-row count shown beside the downloaded report. This imports only ready active employees. It never creates or reactivates employees, and exclusions are stored with the batch and audit trail. Each batch records attempted, accepted, and excluded counts, decision, source hash, and actor. The server hashes the original bytes with SHA-256 and treats an already-imported `(tenant, source hash, leave type, cutoff)` as idempotent. A changed source for the same cutoff is re-evaluated; existing immutable snapshots are reported as conflicts and are excluded in reviewed-exceptions mode.

Use `npx tsx scripts/export-leave-ledger-csv.ts "Leave 2026.xlsx" imports 2026-08` to extract the recognized workbook without changing it. The generated accepted CSV, rejected CSV, and README are ignored by Git because they contain employee data.
