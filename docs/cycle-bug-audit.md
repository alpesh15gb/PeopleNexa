
# PeopleNexa Critical-Cycle Bug Audit

## Authenticated smoke tests

The seeded admin login `admin@apex.com` successfully created a session and redirected to `/admin`. The admin dashboard rendered tenant-scoped data for Apex Integrations, including six employees, today’s attendance, pending leave requests, and the full navigation tree. This confirms the seeded login-to-admin path works against a live local PostgreSQL database.

The protected route boundary also returns `401` for unauthenticated attendance, correction, reporting, and payroll API requests. Workspace slug availability now returns `503` with a clear error when the database is unavailable rather than a raw `500`.

## Attendance cycle

The seeded admin attendance screen rendered six active employees and correctly displayed the seeded night-shift record for Amit Desai as `21:55 → 06:26`. Opening the correction modal showed both punches with the expected IST display and an add-punch action. The corrected mutation paths now reopen finalized derived rows before re-reconciliation, and direct attendance edits no longer allow raw punch-time changes outside the punch ledger.

## Reporting cycle

The live admin reports page rendered the daily summary for 2026-08-01 through 2026-08-31 and exposed all report modes and CSV export controls. The attendance-percentage view also rendered for all six employees. The server-side report calculations were corrected so permission records are included in marked attendance rather than treated as absent; the API daily response now also exposes a `halfDay` count.

## Confirmed bugs fixed

The audit identified and corrected five production-impacting issues. The workspace slug availability route now fails closed with HTTP 503 on database failure. Admin attendance status edits are recorded as finalized manual overrides, while punch-time edits are forced through the immutable punch ledger; adding or deleting punches and approving corrections now reopens finalized derived rows before re-reconciliation. Reconciled attendance now stores the rostered shift identity rather than always storing the employee default shift. Payroll attendance summaries now use IST Sunday detection, exclude days before joining, and use roster-specific overtime thresholds. Payslips now persist `basicSalary`, and admin/employee views plus PF ECR output use that value rather than mislabeling total base salary as the PF wage base. Compliance exports now calculate the correct Indian FY and Q4 periods, and Form 16 uses persisted net salary. Payroll and payout exports reject malformed month keys.

## Live payroll checks

Against a seeded local PostgreSQL database, admin login returned HTTP 200, attendance and daily reports returned HTTP 200, bulk payroll generation created six payslips, and a second run created zero additional payslips. The bank export total matched the stored net payroll total at ₹529,337.48. The Tally journal debits and credits both reconciled to ₹573,009.98. Employee login returned HTTP 200, employee payslips returned HTTP 200, and the employee was denied access to the admin payroll overview with HTTP 401. Logout returned HTTP 200 and subsequent protected access returned HTTP 401.

## Payroll UI cycle

After live generation, the admin payroll screen rendered six payslips with gross ₹562,210, deductions ₹32,873, and net pay ₹529,337. Opening a payslip detail showed the corrected basic salary, allowances, statutory deductions, attendance inputs, and net pay. The data matched the persisted payroll record and the API totals.
