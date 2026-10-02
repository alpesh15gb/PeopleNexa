# Payroll and leave UI refresh

Research reviewed on 2 October 2026. This review uses public product pages and help documentation; authenticated competitor screens were not inspected.

| Reference | Observed pattern | Applied to PeopleNexa |
| --- | --- | --- |
| [Gusto payroll](https://gusto.com/product/how-gusto-works) | Review payroll information before submission. | Visible Prepare → Review → Approve → Finalize → Payment progress and one next action. |
| [Zoho Payroll dashboard](https://www.zoho.com/en-sa/payroll/help/employer/dashboard.html) | Payroll summary and actionable tasks in a central dashboard. | Payout and employee summaries, a dedicated issues list, and visible downloads. |
| [Gusto leave approvals](https://support.gusto.com/article/100395028100000/turn-on-and-manage-employee-time-off-requests-for-admins) | Requests, approvals, and available balances are connected. | Pending requests appear first; approvals, balances, and team calendar are the primary leave views. |
| [Rippling time and attendance](https://www.rippling.com/products/hr/time-and-attendance) | Time off, timesheets, approvals, and payroll form a connected workflow. | An operational leave overview with pending approvals, employees away today, and upcoming approved requests. |
| [Gusto time-off policies](https://support.gusto.com/article/999756591000000/set-up-and-manage-time-off-policies-for-admins) | Policy setup separates basic settings, accrual rules and employee enrollment. | A dedicated leave workspace for allowances, approvals, worked-day earning rules and explicit allocation of balances. |
| [Gusto pay schedules](https://support.gusto.com/article/100758806100000/add-change-or-remove-a-pay-schedule-for-admins) | Pay schedules have a focused setup and editing workflow. | Payroll settings grouped by pay schedule, salary structure, deductions/contributions, company/tax, and review/history. |
| [Zoho salary components](https://www.zoho.com/in/payroll/help/employer/settings/set-salary-components.html) | Earnings and deductions are configured as salary components. | Salary structure is a primary settings section; existing component formulas and employee assignments are preserved. |
| [Rippling policies](https://www.rippling.com/en-CA/platform/policies) | Central policy administration connects workforce rules to their workflows. | Dedicated payroll and leave settings replace duplicate policy creation forms in general configuration. |

The design choices are an interpretation of these patterns, adapted to the existing PeopleNexa lifecycle and location permissions.

## Changes

- Payroll: guided progress, plain-language next steps, salary breakdowns, employee search, issue filtering, visible downloads, and structured payment/finalization/cancellation dialogs.
- Leave administration: searchable requests with pending requests first, focused navigation, policies/imports under setup tools, and calendar day drill-down.
- Employee leave: available balance first, used/pending days, expandable balance details, request status filtering, and a prominent request action.
- Mobile: employee salary cards and leave request cards keep totals and approval actions visible without scrolling a table horizontally.
- Payroll settings: one saved working copy for each company/location scope; unchanged saves do not create a new record. Save and apply are explicit actions. No user-facing version picker or publish/deactivate controls.
- Policy history: internal audit versions remain. Applying a future change closes overlapping earlier settings at the correct boundary rather than deactivating all earlier settings. Payroll snapshots remain frozen.
- Leave settings: edit all included leave types together, retain supported extra payload fields, configure paid/unpaid treatment, half days, approval, carry forward, fixed/unlimited allowances and worked-day accrual. Preview allocations before explicitly allocating a period.
- Leave balance protection: applying changed rules on or before an already allocated period is rejected. Repeating allocation for the same policy remains idempotent. No migration deletes historical versions or resets employee balances.
- Salary changes: a focused creation dialog, current/new salary comparison, approval status filters, activity, and explicit transition dialogs; own changes cannot be approved from the UI.
- History/reports: month comparison with search and changed-only filter, mobile employee cards, usable manager scope, and a correct December reference when comparing January.
- Employee payslips: latest net pay, year filtering, visible PDF downloads, earnings/deductions details, and correct finalized/payment-pending wording.
- Tax declarations/review: clearer declaration summary, removal of the misleading client-side taxable-income estimate, pending-first reviews, search/filter and a required correction note when returning a declaration.
- Loans/advances: employee search, active/closed filters, mobile repayment cards, a confirmation before closing deductions and instalment inputs shown only for loans.

The salary calculation engine and request lifecycle remain in place. Policy persistence, application timelines and leave setting administration are changed as described above. This is a UI and policy-workflow redesign, not a tax-law update.

## Verification

- TypeScript check passed.
- Existing payroll workspace, selected-membership, and revamp safety checks passed.
- Existing leave lifecycle and balance checks passed.
- Browser checks used the actual edited components in an isolated sample-data harness, with navigation and API responses mocked. Verified employee search, pending-request filtering, calendar day drill-down, and the payment evidence payload. The payment form requires acknowledgement before submitting.
- Desktop and 390px mobile layouts were inspected. Live authenticated workflows and database processing require a configured application environment.
- Added regression tests for repeated edits/saves/applies, no-op saves, object-key ordering, optional fields, preserved earlier/future effective periods and stale draft selection.
- Payroll configuration, policy resolution, LOP, reporting, register, workspace, membership, revamp, configurable proration and field mapping checks passed. Leave policy, policy-period, balance, lifecycle, type safeguards, on-behalf and import checks passed. Salary revision checks passed.
- Browser verification of actual components: payroll save twice retains one working record and the latest divisor; refresh restores the saved values; apply sends the complete policy. Leave save retains all leave types and earned-day rules; apply, allocation confirmation and allocation preview payloads verified. Salary change creation dialog and self-approval restriction verified. Payslip detail sections verified. No page overflow on checked mobile screens and no browser errors detected.
- Production build passed with `next build --webpack`. Four pre-existing unsupported route exports were corrected: document expiry helper moved to a library, and unused runtime exports in onboarding, face settings and iClock routes made local. Their behavior is unchanged.
- Database URL used for build was a non-production placeholder. No live database mutations, migration, deployment, commit or push were performed. Policy concurrency and allocation changes require integration verification against a configured test database before release.
