# Payroll and leave controls — 4 October 2026

## Implemented

- Leave settings expose calendar-day, working-day and enclosed sandwich counting. Weekly offs are explicitly selected per policy; company holidays include recurring and half-day holidays. Existing policies keep legacy behavior unless an administrator chooses a new counting rule, applies it and allocates the period.
- Each new calendar-governed request retains its day fractions and non-working fractions. Payroll reads the saved fractions, rather than reinterpreting later holiday edits. Half-day holidays do not create an extra absence deduction.
- Employee leave submission previews the applicable start-date policy's calculated days through a read-only endpoint. Submission still validates policy, allocations, overlap, balance, eligibility and payroll locks inside its transaction.
- Optional minimum service, advance notice, mandatory reason and maximum request length are available in Leave settings. No probation or weekly-off pattern is assumed for existing clients.
- Approved leave cancellation requires a reason and independent review. It stays approved and reserves its balance while cancellation is pending. Cancellation approval restores the balance by removing the original commitment, without adding a duplicate credit. Rejection retains approved leave. Request, decision and audit writes are atomic.
- Leave creation and approval reject changes to months where the employee belongs to reviewed, approved, finalized or paid payroll. Closed payroll needs separately reviewed adjustments.
- Payroll review, approval and finalization check pending leave/cancellation decisions and compare current attendance/leave totals with generated payslip inputs. Stale payslips require regeneration. Failures remain visible on the payroll screen.
- Reviewed and approved payroll can return to draft with a mandatory reason. Review/approval actors and dates are cleared; a fresh approval is required. Finalized and paid payroll cannot return to draft.
- Exit leave encashment uses the applicable period ledger, with imported balances as a fallback, reserves pending commitments and retains fractional days. Worked-day accrual is calculated as of the settlement cutoff without rewriting current allocations. The settlement retains per-type balance provenance. Unlimited leave is not encashed.
- Leave type setup exposes exit encashment eligibility. Its approval checkbox now submits the selected value correctly.
- Manual attendance status changes require reasons, block self-edits, and retain atomic audit records. Punch corrections cannot be self-reviewed. Manual attendance/punch mutation paths check payroll locks inside their mutation transaction.

## Database change

`20261004000000_leave_cancellation_review` adds three nullable columns to `LeaveRequest`. It does not delete records, reset balances, regenerate payslips or modify existing policy payloads. Deploy it before serving the new application code. An ordinary production backup and staging migration check remain necessary.

## Verification

All 27 payroll, leave, attendance, salary-revision and policy-workspace suites passed, along with TypeScript checks, the production build and `git diff --check`.

The new functional regression suite exercises calendar counting, recurrence, half-day holidays, eligibility, invalid policy inputs, payroll treatment, stale attendance comparisons, payroll locks, cancellation self-review and duplicate-review protection, period/import balance precedence, fractional encashment and return-to-draft restrictions.

Run:

```sh
npm run typecheck
npm run test:leave-payroll-controls
npm run test:payroll-leave-audit
npm run build
```

Local compilation and mocked/pure calculation tests cannot certify PostgreSQL concurrency, production tenant permissions, authenticated UI behavior or bank acceptance. This checkout has no configured test database. No production records were changed.

## Staging acceptance before live salary processing

Use a restored, access-controlled copy of production rather than an active paid run:

1. Deploy the migration; check existing requests, balances, history and payslips remain unchanged.
2. Apply and allocate a working-day policy with the client's actual weekly offs. Preview a Friday–Monday request, recurring holiday, half-day holiday and policy-period boundary. Compare employee preview, approval, balance and payroll register.
3. Submit leave on behalf of an employee; prove both employee and submitter cannot approve it. Prove managers cannot see or change employees outside their scope.
4. Request approved-leave cancellation; verify the balance and payroll remain unchanged until independent approval. Reject once, request again, approve once and reject a duplicate review.
5. Generate payroll, change draft-period attendance/leave, and attempt review. It must require regeneration. Pending leave or cancellation must block review.
6. Return reviewed/approved payroll to draft with a reason; verify the old approval is removed. Regenerate affected slips and repeat independent approval.
7. Finalize a test run. Try leave creation, approval, cancellation, manual attendance changes, punch addition/deletion and correction approval for an included employee. Verify rejection and retained payslip snapshots.
8. Verify exit encashment against the current ledger, including imported opening balances, pending leave, half-days, earned leave, another location's allocation and an old policy period.
9. Exercise simultaneous approvals and a simulated audit write failure against PostgreSQL. Confirm either one atomic success or a retriable conflict, without duplicate credits or unlogged changes.

## Remaining enterprise capabilities — not represented as completed

- Configurable multi-stage leave approval/escalation and evidence attachments.
- Compensatory-off earning, approval, expiry and consumption; OD approval separate from leave.
- Full P/A/L/OD import with preview, independent approval, source preservation and payroll-impact review. Existing direct admin overrides are audited and scoped, but are not a complete maker/checker import workflow.
- Scheduled leave-year rollover, expiry/lapse, monthly/time-based accrual alternatives and employee-specific weekly-off calendars outside leave requests.
- Fully reconciled exit payroll based on actual attendance, statutory treatment, already-paid salary, approved recoveries and encashment valuation policy. The existing exit salary estimate still uses calendar days up to last working day.
- FY/YTD TDS, prior-employer income/TDS, category-specific exemptions/caps and authoritative tax-year rules. Current monthly annualization is not a complete production tax engine.
- Verified state/establishment-specific statutory eligibility, rates and employer contributions. Existing LWF hardcodes require correction/verification; custom Staff Welfare must not be presented as statutory LWF.
- Filing-ready statutory outputs, salary holds, individual failed/partial bank payments, automatic arrears and complete reimbursement/variable-pay workflows.

These are substantial product work, not cosmetic UI tasks. Do not describe the application as fully comparable to Keka, Zoho or greytHR or certify live payroll merely because local tests pass.

## Research references

- Keka leave plans: https://help.keka.com/hc/en-us/articles/39946715159953-Creating-a-Leave-Plan
- Zoho leave types: https://www.zoho.com/in/payroll/help/employer/leave-and-attendance/leave-types.html
- greytHR automated comp-off: https://product-updates.greythr.com/en/tired-of-manually-calculating-overtime-payout-or-comp-off-requests
- Income Tax Department Section 192 (estimated annual salary and previous employer details): https://wmstatic-prd.incometaxindia.gov.in/web/guest/w/section-192-3
- Telangana Labour Welfare Fund Act: https://www.indiacode.nic.in/bitstream/123456789/8665/1/act_34_of_1987.pdf
