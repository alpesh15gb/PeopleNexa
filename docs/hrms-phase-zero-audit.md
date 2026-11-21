# PeopleNexa product and frontend audit

November 21, 2026 · baseline `9b08d18` · Phase 0

The main friction is the handoff between tasks. A reviewer sees a count, opens a queue and then looks elsewhere for the context needed to decide. A payroll operator can prepare a draft but must leave the workflow to investigate adjustments or compare periods. Design the next increment around completing a decision with its supporting information in view.

## Baseline and inventory

The app uses Next.js 16.3 App Router, React 19.2, TypeScript, Tailwind CSS 4, CSS variables, locally hosted Inter, Lucide icons and custom React primitives. Server Components load scoped Prisma/PostgreSQL data. Client components use React state, effects, fetch, URL search parameters and router refresh. Session checks, role and module gates, and handler-level authorization govern access. There are 173 route-handler files under `app`, including device ingestion. The web app has PWA support. [Package manifest](../package.json) · [Access gates](../proxy.ts) · [Shared components](../components/ui)

The [screen ledger](screen-revamp-ledger.md) lists the exact path and existing workflow of **every page**. Its 71 paths match the App Router files one-for-one, including two compatibility redirects. Query-selected screens such as employee details, a missing-salary worklist, correction requests and team calendars are additional states of those routes.

| Surface | Pages | Main journeys |
| --- | ---: | --- |
| Public and workspace access | 4 | Landing → register or sign in → required password change → role landing |
| Platform administration | 3 | Separate sign-in → tenant directory → tenant plan, access and modules |
| Tenant administration | 47 | Dashboard and approvals, directory and employment changes, workplace services, time and leave operations, payroll and finance, reports, settings and integrations |
| Employee self-service | 16 | Clock and correct time, apply for leave, manage documents and declarations, download statements, submit expenses, complete onboarding and reviews, use workplace services |
| Notifications | 1 | Read scoped activity, filter unread items, follow a destination |

**Role implications.** Platform superadmins manage workspaces. HR admins operate within a tenant. Location managers act on assigned locations and can run scoped payroll. Branch managers have a narrower directory, time and leave remit. Supervisors have limited review and attendance access. Employees use personal records and self-service. Designation grants, enabled modules, assignment and login-only accounts also affect reachability. The proposed Manager preset must derive each action from those permissions. An administrative workspace switch changes navigation context only.

## Ten usability bottlenecks

| # | Current experience and impact | Change to validate |
| --- | --- | --- |
| 1 | HR home leads with service cards. Approvals groups counts and links to separate queues. A reviewer cannot see the request and decide from home. | Start with the individual case, subject, reason, scope and allowed action. Preserve reviewer independence and required reasons. |
| 2 | The command palette searches page/action names. Notifications default to all/unread. On phones, frequent employee destinations still compete with the menu and service selector. | Add role-specific quick actions, scoped person lookup, notification categories and a compact mobile navigation bar. |
| 3 | Shared tables provide horizontal scrolling. Search, page navigation, bulk selection, loading and empty states vary by module. Saved views and column controls have no shared contract. | Pilot one list pattern on the directory and approvals. Expose bulk writes only where an existing operation supports the selected records. |
| 4 | Employee creation, credential setup, checklist tasks, documents and verification are separate. A completed checklist cannot establish that HR verified a document. | Build an explicit employee/HR handoff, with distinct invited, submitted, verified and active states where the backend supports them. |
| 5 | An employee record stacks detail cards. Assets, time, documents and audit history have different routes and access rules. | Establish an employee 360 view with scoped sections and a stable return path. Preserve masking and attachment authorization in every section. |
| 6 | Monthly attendance entries lack a visual punch timeline. Correction forms prefill the date, leaving users to reconstruct the missing interval. Device health exposes heartbeat and errors separately from the roster. | Open a correction drawer from the affected day using recorded punches. Distinguish missing, unverified and absent. Label the last observed sync and refresh time accurately. |
| 7 | Leave preview computes chargeable days, but employees cannot see the resulting balance and managers cannot see team overlap beside their decision. The calendar shows approved leave. | Add a server-calculated balance preview and permission-scoped overlap. Use the same policy calculator for preview and submission. |
| 8 | Monthly payroll has preparation, scope and handoff controls, but exact source validation comes after draft creation. Adjustments and completed-period variance live outside the draft review. | Guide the operator from inputs through adjustments, variance and disbursement, retaining independent server transitions and a recoverable draft. |
| 9 | Payslips, declarations, policies and documents are separate ESS destinations. A personal PDF exists; the administrative Form 16 CSV cannot serve as an employee-issued certificate. | Group pay and tax by employee task. Show documents only when issued and accessible. Use existing snapshot values for the payslip breakdown. |
| 10 | The theme inherits OS dark mode on first visit. Inter and tabular numerals already exist, but contrast, dense mobile forms, dialogs and focus return lack a single verified baseline. | Start with explicit light defaults, measured text and control contrast, keyboard tests, responsive drawers and one primary action per state. |

## Seven core flows and backend boundaries

| Flow | Reusable today | Dependency or decision before promising the full flow |
| --- | --- | --- |
| Dashboards and inbox | Scoped queues, review mutations, ESS clock, roster, leave activity, payslip and feed reads | Compose individual cases with their allowed decisions. Payroll cutoff needs an authoritative schedule or an unavailable state. Treat high-consequence decisions as pending until the server confirms. |
| Onboarding and employee 360 | Employee creation, credential reset, checklist assignment/completion, profile, documents, transfer and status operations | Expiring invitations, delivery, prehire verification, e-sign evidence and a scoped cross-module timeline need explicit contracts. Existing org chart is admin-only. Define direct-report access before adding a Team Hub or ESS directory. |
| Time, shifts and devices | Monthly entries, raw punches, corrections, held-punch review, shift assignments and device heartbeat | Anomaly day drilldowns and reliable freshness need suitable scoped reads. Cross-day roster conflicts and unmatched-device identity tracking require additional rules or evidence. Never infer a successful sync from a heartbeat. |
| Leave | Preview and submit already enforce policy rules. Submission checks employee overlap and payroll locks. Existing manager decisions are scoped. | Extend preview with date-effective balance impact and permitted team conflicts. Define team membership and overlap disclosure. Calendar-day, working-day and sandwich policies must retain their own rules; half-day records have no AM/PM slot. |
| Payroll | Recorded/workbook sources, immutable run inputs where recorded, adjustment creation/deletion, draft recalculation, independent approval, bank export, publication and external payment evidence | Stage 1 needs a non-mutating check for the exact cohort. Stage 2 needs scoped adjustment reads, audited edits and authoritative calculation previews. Stage 3 needs current draft versus prior completed run and percentage/statutory deltas. Stage 4 needs once-only publication notifications. Linked reimbursements stay system-owned. Treat bank/PAN gaps according to payout method and policy. Actual fund transfer requires a provider. |
| ESS pay, tax and documents | Personal payslip PDF/history, declarations with return notes, authorized attachments and published policies | Proof upload, employee-issued Form 16, regime comparison and letter acknowledgement need separate approval and access rules. Salary breakdown must use recorded payslip values. |
| Mobile | Existing mobile shell, attendance cards, responsive payroll selector and role-scoped links | Reuse the same permissions for bottom destinations and drawer actions. Test focus, long names, date inputs and a full task at 390 px using populated fixtures. |

Source anchors: [shell](../components/shell.tsx), [launcher](../components/workspace-launcher.tsx), [approvals](../lib/approval-workspace.ts), [leave rules](../lib/leave-calendar.ts), [payroll preparation](../app/(portal)/admin/payroll/page.tsx), [run transitions](../app/api/payroll/runs/%5Bid%5D/route.ts), [onboarding API](../app/api/onboarding/route.ts), [theme](../lib/theme.ts).

## Proposed delivery order

1. **Design system.** Establish verified color and semantic states, tabular data, drawer focus behavior and shared list/wizard primitives. Prove them with keyboard and contrast checks on populated, empty, loading and failure states.
2. **Shell and navigation.** Ship permission-derived employee, supervisor, branch, location, HR and platform navigation. Verify direct URLs, scoped actions, mobile destinations and return paths for each role.
3. **Inbox and dashboards.** Ship one real leave decision and one attendance review from the HR/manager inbox. Verify decisions remove resolved items, denied actions stay denied and retry cannot double-apply. Then compose employee home from available personal data.
4. **Core flows.** Deliver employee onboarding/360, time and corrections, leave preview/calendar, the four-stage payroll wizard, and the ESS vault in individually reviewable increments. Obtain separate approval for contracts or persistence changes. For unavailable capabilities, show a truthful unavailable state or omit the action.
5. **Polish and release.** Check mobile, keyboard, contrast, existing deep links, role boundaries, slow/error states and large datasets. For every increment run typecheck, a production build and relevant regression/browser workflows locally. The package currently has no lint script; define the lint baseline in Phase 1. Provide exact routes and screenshots for acceptance before deployment.

This audit uses repository evidence and earlier local visual verification. It makes no new compliance or production-validation claim. Phase 1 requires approval.
