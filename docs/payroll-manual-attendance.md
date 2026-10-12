# Manual payroll attendance

The existing automatic payroll workflow remains available. The Payroll page has
a collapsed **Manual attendance upload** section for administrators and location
managers, scoped to the selected location and month.

## Workflow

1. Select the payroll location and month. Save the client's original `.xlsx` file
   (maximum 10 MB), then choose the exact worksheet. The filename does not decide
   the location or month. Recognized month labels and daily columns must agree
   with the selected period.
2. Preview matches, daily marks, calculated work days and earned leave. Exact
   employee numbers are matched first; the verified YLR convention replaces `/`
   with a literal `0`, preserving all digits. If the two codes belong to different
   employees, the row is blocked. Device codes and employee master IDs never change.
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

## Calculation and leave

P and OD each count as one worked day. L is unpaid. No punch records, clocked hours
or overtime are fabricated. Salary and effective approved salary revisions come
only from PeopleNexa; workbook salary is ignored. The published payroll policy
still determines the divisor, components, deductions and rounding. A policy that
disables unpaid-day deductions cannot generate manual payroll with unpaid days.

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

`npm run test:payroll-attendance-import` covers exact/alias matching, collisions,
duplicates, month mismatch, blank decisions, inactive/hourly staff, unpaid L days,
next-month IST availability, idempotent finalization, reversal/replacement, and
manual accrual replacing biometric accrual. If the supplied client workbook exists
locally, it also verifies its actual September worksheet without committing any
employee data.

Production database migration and an authenticated browser import must be checked
in the deployment environment before using the feature for live payroll.
