# Payroll and leave flow audit — 2 October 2026

The redesigned screens cover payroll setup, employee selection, generation, review, approval, finalization, payment, exports, salary changes, adjustments, loans and tax declarations. Leave screens cover policy setup, allocations, imported balances, requests, approval/rejection, withdrawal, balances and calendar views.

This follow-up audit corrected backend defects:

- Policy-period balances took precedence over imported snapshots, but the employee and admin balance displays still added both. Displays now use the same precedence as leave submission and approval.
- Branchless employees could miss their location allocation. Another location's allocation could incorrectly supply an admin balance. Scope selection now handles both cases.
- Searching the admin balance ledger replaced the location-manager access filter. Search now intersects the access scope.
- Approved half-day leave was counted as a whole payroll day. The remaining half now comes from attendance; a half-day attendance record does not create a second absence deduction.
- Earned-leave allocations did not refresh after allocation. They now accumulate monthly attendance within the policy period, exclude future work, respect joining-month deferral, and refresh before balance reads and request/approval transactions. Fractional worked days use the appropriate whole-day tier.
- Carry-forward used lifetime leave-type defaults instead of the previous period/import. It now uses the prior balance less its matching approved and pending commitments. Preview also uses prior balances.
- Policy selection could miss the first day because stored effective dates and IST midnight differed. Leave period selection now resolves the intended IST calendar day. New requests crossing allocated policy-period boundaries must be split.
- Payroll transitions validated stale payslips outside their transaction. Validation, run locking, loan reversal, document status and audit writes now share a serializable transaction.
- Regeneration could use changed employee salary inputs or ignore statutory opt-outs. It now retains saved salary, structure, pay mode, rate, joining date and statutory applicability when present. Older snapshots retain fallbacks for fields they never stored.
- Regeneration distributed restored loan deductions by EMI order. It now restores the recorded loan IDs and amounts, rejecting missing, inconsistent or later-month allocations. Generation records salary structure and rate for future regeneration.
- Generation read loans outside its transaction, updated stale balances and reported deductions for duplicate generation. Reads and conditional loan writes now occur inside its serializable transaction; duplicates report zero newly applied loans.
- Empty-generation cancellation and member counts could race with another employee addition. Completion now locks the draft and cancels only an actually empty new run.
- Salary approval could bypass the UI's administrator restriction. The API now enforces it, uses conditional transitions and prevents concurrent duplicate drafts through serializable transactions.
- Cancelled/reversed payroll history blocked replacement-run adjustments. Only active locked lifecycle states block edits. Adjustment changes share the draft run lock and use serializable transactions.

## Verification

All 22 payroll, leave, salary-revision and policy-workspace test scripts passed. These include pure calculation tests, existing source-contract checks and new mocked transaction/attendance scenarios in `scripts/test-payroll-leave-audit.ts`. TypeScript checks, whitespace checks and the production build passed.

The new regression scenarios exercise imported-balance precedence, location selection, half-day paid/unpaid leave and remaining attendance, accumulated/deferred earned leave, closed periods, exact loan restoration, saved generation inputs and duplicate generation.

No live or disposable PostgreSQL database is configured in this checkout. Transaction isolation, database migrations, concurrent API requests, authenticated flows and real payout/import/export fixtures still require database-backed staging verification. The tests do not certify those production behaviours. The production build uses a placeholder database URL solely for compilation; it does not run payroll or change data.

All changes are local. No GitHub push or deployment was performed.
