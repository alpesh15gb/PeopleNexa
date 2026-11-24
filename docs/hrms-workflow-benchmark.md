# HRMS workflow benchmark

24 November 2026

## Zoho People observed with REA

The signed-in Zoho People workspace displayed sample data. I opened Home, Onboarding, Attendance and Leave Tracker and inspected the visible pages with REA. In Leave Tracker I opened an unfilled request form. The evidence below records the interface and entry points. Approvals, submissions, payroll transitions and private server-side logic were outside the observed sequence.

| Workflow | Observed behavior | REA evidence |
| --- | --- | --- |
| Home | My Space includes Activities, Feeds, Approvals and check-in. Team and Operations offer distinct entry points. Quick Actions is available in the header. | `ev_0efd5c550e42dd1b26ba6b98bfdb8dca1e08959297dba2fe68a15c598dbcdbfb` |
| Onboarding | The main Onboarding entry opens a candidate list with Add Candidate and Filter. Zoho documents a separate employee onboarding trigger and tracking workflow. | `ev_6d237002c340447682db44bad2af62fc4cd987684accd799051b646a784d930c` · [Onboarding operations](https://help.zoho.com/portal/en/kb/people/administrator-guide/onboarding-service/articles/onboarding-operations) |
| Attendance | The service opens Attendance Summary under My Data. Team is a separate tab. The employee guide documents record details, audit history and regularization with the date, time and explanation. | `ev_acdc5b4d97c0f57b0b8bef9e74d79e18614e1d3044fb3eaf8ee31a653aad9182` · [Attendance guide](https://help.zoho.com/portal/en/kb/people/employee-handbook-5-0/attendance/articles/attendance) |
| Leave | My Data leads to Leave Summary with available and booked balances, requests, holidays and an Apply Leave action. The form opens from that view and asks for leave type, date and reason. Team is a separate tab. | `ev_baf000c863c0cc66ca9913cf27cfdac14c0b89d066a4d6afed763c32a3845a93` · `ev_e8a98c86a09ea1bdf20cd2189eb008362a6ef1c1a7545dd6d38ac35520b26817` |

## Keka, Gusto and BambooHR documented workflows

Keka's public browser session reached a security verification screen in REA (evidence `ev_397d4d1edc58f0f5ef0f907ab6a1e1f091c6c8d87b48a6378327cd7307aabf71`). The peer findings below use official guides. They describe supported workflows and can vary with role, subscription and configuration.

| Product | Workflow pattern |
| --- | --- |
| Keka | Preboarding gives HR separate offer, document and employee setup tasks. Submission can route to a verifier and a declined document can return to the candidate for resubmission. Regularization starts from the affected date. The payroll sequence handles unresolved attendance and leave, adjustments, statutory review, finalization and payslip release. Maker-checker approval and held payslips have their own statuses. [Preboarding](https://help.keka.com/hc/en-us/articles/39946667555857-Preboarding-Overview) · [Document handoff](https://help.keka.com/hc/en-us/articles/39946753229457-Pre-Boarding-FAQ-s) · [Regularization](https://help.keka.com/hc/en-us/articles/39946870714385-How-to-apply-WFH-OD-Partial-day-Regularization) · [Payroll](https://help.keka.com/hc/en-us/articles/39946563404561-Running-payroll-on-Keka) · [Maker-checker](https://help.keka.com/hc/en-us/articles/41388353533073-Approval-Workflow-Maker-Checker-for-Payroll-Finalisation) |
| Gusto | Admins track checklist and invitation progress. A payroll awaiting approval is locked for editing. Variance alerts identify the affected employee or item and point to the correction. [Onboarding checklists](https://support.gusto.com/article/210728175340400/view-and-complete-onboarding-checklists-for-admins) · [Payroll approval](https://support.gusto.com/article/240829150046240/set-up-approvals-for-payroll-for-admins) · [Variance alerts](https://support.gusto.com/article/260112145935220/review-changes-to-your-regular-payroll-with-helpful-alerts-for-admins) |
| BambooHR | HR can preview and adjust onboarding tasks before importing a template. The payroll review exposes gross pay, cash requirements, taxes, deductions and employee paystubs before approval. [Onboarding templates](https://www.bamboohr.com/product-updates/new-import-tasks-modal) · [Payroll review](https://www.bamboohr.com/product-updates/run-payroll-in-bamboohr) |

## PeopleNexa implications

These are design conclusions from the comparison and the current local source.

| Priority | PeopleNexa already supports | Next improvement and acceptance check |
| --- | --- | --- |
| 1. Show who acts next | Saved onboarding tasks, due dates, progress, temporary credentials, first-password routing to the employee checklist. | Show the responsible role and the next action beside each handoff. Derive status from recorded facts. HR should see that credentials were issued and which tasks remain. A worker should see where to submit a document and who reviews it. Invitation delivery, verification and signatures require their own recorded states. |
| 2. Resolve exceptions in place | Dated attendance calendar, punch correction, scoped decision drawer, leave balance estimates and approved team overlap. | Link from the dated exception to the review or correction while preserving scope and date. A reviewer should see recorded versus requested punches, or leave dates and permitted overlap, before choosing a decision. After saving, show the persisted state and return to the same filters. |
| 3. Make payroll blockers actionable | Four-stage run, independent approval, missing salary and bank-detail recovery, variance, finalization and external payment recording. | For each blocker show the affected employee or input and the precise fix. Label unusual variance separately as a review item. Clearly show approved, finalized with payslips published, and payment recorded. Keep the existing finalization/publication relationship until separate publication has a supporting contract. |

Suggested acceptance cases include first sign-in with an overdue task, a manager reviewing a correction opened from a filtered day, and a payroll preparer fixing a missing input then returning to the same location, month and stage. The [backend contracts](required-backend-additions.md) cover proposed capabilities that require new state or integrations.

## Applied and verified locally

* Onboarding now shows the next responsible role on the HR checklist and on the dashboard task list. The employee sees what to do on first sign-in, who provides document submission instructions, and who reviews the submission. Browser testing covered an overdue task, the HR-to-employee handoff, saved progress, the Documents return and denied access to HR screens.
* Daily attendance rows open the exact correction in the shared review drawer. The drawer compares punches at submission with the current record and the requested change. Attendance and leave show a saved decision after returning, including on reload. Browser testing covered a decision directly from the dashboard and a correction from date-, branch-, status- and search-filtered attendance. Additional fixtures exercised approved outcomes, leave overlap, payroll locks and branch or location isolation.
* Payroll distinguishes blocking input issues from warnings and links to the affected request, payslip or employee editor. Remediation preserves the location, month, run and stage. The existing preflight response now includes typed issue details alongside the original messages. Payment account details are copied into the draft when it is created, so changing the employee record requires a replacement draft to use updated details. Browser testing covered salary, PAN and primary bank saves, stale adjustment recalculation, resolving pending leave, independent approval, finalization, Excel and simulated external payment. A separate bank fixture verified that the original snapshot stayed intact and the replacement draft picked up the corrected account while retaining the cancelled run in history.

Typecheck, lint, the standalone production build and all 63 regression scripts passed. Browser checks rendered all 71 routes at desktop and phone widths, with 142 route screenshots and no reported page errors or horizontal overflow. Verification used synthetic local workspaces and a loopback PostgreSQL instance.
