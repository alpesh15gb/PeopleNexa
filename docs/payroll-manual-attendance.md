# Manual payroll attendance

The existing automatic payroll workflow remains available. The Payroll page has
a collapsed **Manual attendance upload** section for administrators and location
managers, scoped to the selected location and month.

## Workflow

1. Select the payroll location and month. Download the standard attendance
   template, complete it, and save the `.xlsx` file in PeopleNexa (maximum 10 MB).
   Choose the attendance worksheet. Recognized month labels and daily columns
   must agree with the selected period.
2. Preview matches, daily marks, and work days. Standard attendance uses employee
   numbers from PeopleNexa. Store employee numbers with leading zeros as text in Excel.
3. Exclude unmatched, duplicate, hourly, or otherwise invalid rows with a reason,
   or correct and upload a new workbook. No employees are created. Inactive
   employees, name mismatches, workbook summary differences and approved app leave
   require an explicit review reason. Blank days require an explicit unpaid
   decision or exclusion. Days before joining are omitted from payroll totals.
4. Confirm that the sheet belongs to the chosen month/location, then confirm the
   review. Reviewed inputs are immutable and retain reviewer and reason evidence.
5. Generate payroll. Requests process one employee at a time with visible progress.
   Keep the page open. If interrupted, reload the selected location/month, open its
   draft, and resume the saved upload; existing draft employees are skipped.
6. Review, approve and finalize through the existing payroll workflow. All
   included upload employees must have payslips before review. A run uses one
   attendance source. To replace a workbook, cancel the draft with a reason, upload
   the correction and create a replacement run. Finalized runs remain immutable.

## Standard attendance marks

| Mark | Payroll treatment |
| --- | --- |
| `P`, `OD` | One day worked |
| `A` | Absence |
| `HL` | Half day worked and half day unpaid |
| `PL` | Paid leave for monthly employees |
| `UL` | Unpaid leave |
| `WO`, `H` | Weekly off and holiday |

Leave balances follow the configured leave workflows. Standard attendance uploads
supply day marks for the selected payroll run. The published payroll policy
determines the divisor, components, deductions, and rounding. Use time-based
attendance for hourly payroll. Record overtime in the payroll system.

New workspaces use rostered and assigned shift weekly offs in system-attendance
payroll. An unworked weekly off does not count as an absence. Work and approved
leave still follow their recorded rules. Each payslip stores the off dates it
used so draft review and regeneration use the same calendar after a shift edit.
Existing workspaces retain their system-attendance calculation. The standard
workbook supports an explicit `WO` mark in any workspace.

## Legacy attendance format

Choose **Legacy attendance with earned-leave credits** to review the historical
workbook format. This format recognizes the old employee-code alias with `/`
replaced by a literal `0`. If both codes point to different employees, the row
requires correction. Uploaded and reviewed workbooks retain their original format.

`P` and `OD` each count as one worked day. `L` is unpaid. Salary and effective
approved salary revisions come from PeopleNexa. Enable unpaid-day deductions in
the published payroll policy before generating manual payroll with unpaid days.

Earned leave is calculated from worked days: fewer than 14 = 0, 14–24 = 1,
25 or more = 2. It becomes available on the first day of the following month
in IST, for all employees. The workbook's Leaves column is earned credit, not
paid leave consumed in the current payroll.

Before finalizing a run with positive earned credits, employees must have an
eligible worked-day **Earned Leave / EL** policy-period allocation covering the
source month and location. Configure/allocate this through the existing leave
policy tools. Finalization reports missing allocations rather than losing credits.
Credits replace automatic accrual for the same month, never top it up; other leave
types retain their configured accrual. Policy-period boundaries are respected.
Reversing a paid run deactivates its credits; a replacement can reuse the unique
employee/month ledger entry without double-crediting.

## Storage and deployment

Original files are stored under
`$UPLOADS_DIR/private-payroll-attendance/<uuid>.xlsx`, outside public media routes.
Authenticated downloads verify tenant, location and month. Database records retain
the original filename, SHA-256, sheet, preview, reviewed inputs and actor stamps.
Back up the uploads volume together with the database.

The change includes migration
`20261013000000_payroll_attendance_import`. The current Docker entrypoint runs
`prisma migrate deploy` before application startup. Deploy the rebuilt app image
normally after taking the usual database/volume backup. No seed operation is needed.

## Validation

`npm run test:payroll-attendance-import` covers the standard template, both
formats, exact and alias matching, collisions, duplicates, month mismatch, blank
decisions, pay modes, legacy next-month credits, idempotent finalization, and
reversal and replacement.

Production database migration and an authenticated browser import must be checked
in the deployment environment before using the feature for live payroll.
