# PeopleNexa screen revamp ledger

The [Zoho People REA findings](workflow-revamp-findings.md) informed the division between personal work, HR operations, service configuration and reporting. PeopleNexa uses its own layouts, HR data model and approval rules.

The ledger lists all 71 App Router pages. Each row names the changed workflow or the contract of a legacy redirect. Browser verification exercises representative actions across the sections. The route sweep checks that the pages open for the appropriate local test account. The release results distinguish these checks from production validation.

## Entry, platform and shared screens

| Route | Workflow |
| --- | --- |
| `/` | Shows supported workflows by role and sends signed-in users to their role’s portal or required password setup. |
| `/login` | Identifies the workspace, associates credential labels with inputs and uses the server’s role-specific destination. |
| `/register` | Checks the current workspace address and lets the creation API resolve availability when the lookup is pending or unavailable. |
| `/change-password` | Explains required initial setup or a regular password change and returns the account to its role’s portal. |
| `/superadmin/login` | Provides distinct platform sign-in and a visible link to workspace sign-in. |
| `/superadmin` | Separates the paginated workspace directory from plan pricing. Includes name, address, code and renewal filters. |
| `/superadmin/tenants/[id]` | Shows the current plan, access, seats and expiry before subscription and module changes. |
| `/notifications` | Keeps the inbox in My work and supports scoped unread navigation and marking items read. |
| `/admin` | Presents current operations, review counts and branch-aware drilldowns. Switching branches resets the attendance page, branch drilldowns carry the dashboard date, and the layout editor follows the selected location. |
| `/admin/module-unavailable` | Explains why the service is unavailable and leads to an authorized workspace destination. |
| `/employee/module-unavailable` | Gives employees a My work recovery path from unavailable services. |

## People and workplace services

| Route | Workflow |
| --- | --- |
| `/admin/employee-master` | Locates employee records and exposes the add-employee workflow and scoped directory actions. |
| `/admin/employees` | Preserves supported filters and actions when redirecting old directory links. |
| `/admin/branches` | Searches branch inventory and replaces a staff manager atomically, with conflict feedback when two administrators edit the same assignment. |
| `/admin/departments` | Finds departments, shows their usage and preserves form state after validation errors. |
| `/admin/designations` | Searches role titles and keeps additions, edits and existing assignments understandable. |
| `/admin/locations` | Shows location inventory and access appropriate to a location manager’s assignment. |
| `/admin/org-chart` | Searches the reporting tree without losing parent and team context. |
| `/admin/id-cards` | Reports successful and skipped issues per employee and keeps failed selections actionable. |
| `/admin/documents` | Filters scoped documents and retains those filters during paging and document changes. |
| `/admin/onboarding` | Shows checklist progress and keeps administrative setup and checklist assignment accessible. |
| `/admin/exits` | Separates reviewable resignations from later steps and completed records. |
| `/admin/performance` | Guides review assignment, receipt of the employee’s self-review and the manager’s next steps. |
| `/admin/policies` | Supports searchable, versioned policy edits with stale-write feedback. |
| `/admin/helpdesk` | Shows the next available action for a selected ticket and its current assignment. |
| `/admin/assets` | Searches inventory and explains when no asset matches the current selection. |
| `/employee` | Prioritizes clocking in, shortcuts and outstanding tasks. Groups available personal services and links pending leave and cancellation counts to the corresponding queue. |
| `/employee/profile` | Groups personal and employment records and keeps the password setting reachable. |
| `/employee/documents` | Filters visible files with scoped server-side pages. |
| `/employee/expenses` | Filters personal claim history and restores the claim editor after a rejected submission. |
| `/employee/exits` | Explains a resignation’s current state and shows the actions available at that stage. |
| `/employee/feed` | Pages organization updates and announcements, preserves the selected feed during replies, and keeps failed replies recoverable. |
| `/employee/helpdesk` | Starts or resumes a personal ticket from its status and conversation. |
| `/employee/onboarding` | Shows checklist progress and the next unfinished task. |
| `/employee/performance` | Opens the correct assigned review and submits the employee’s self-assessment against its assigned KPIs. |
| `/employee/policies` | Provides a searchable library of active policies and their versions. |

## Attendance, leave, devices and reporting

| Route | Workflow |
| --- | --- |
| `/admin/attendance` | Opens the daily register with actionable attendance counts, correction and held-punch queues. Mobile cards show named employee actions, shift and punch times. Search stays available when no records match. |
| `/admin/regularization` | Filters pending and reviewed corrections or held punches by work date and branch. |
| `/admin/leaves` | Splits requests, calendar, balances and policy tools. Pages authorized requests and carries branch selection to the calendar. |
| `/admin/leaves/policies` | Distinguishes active, scheduled and draft rules. |
| `/admin/holidays` | Separates upcoming holidays and prior years, including recurring dates. |
| `/admin/shifts` | Explains shift schedules and protects shifts in use by a roster from deletion. |
| `/admin/rosters` | Uses the workspace calendar for weekly navigation and returns only authorized employee records. |
| `/admin/devices` | Finds inventory by connection type, device or serial number. |
| `/admin/device-health` | Surfaces pending logs and opens the matching device inventory. |
| `/admin/journeys` | Replays retained routes in workspace time and displays the latest eligible location for each active employee, including when another employee reports hundreds of pings. |
| `/admin/reports` | Keeps reporting dates when opening categorized reports. |
| `/admin/reports/punch-details` | Applies the same date, search and access scope to displayed detailed punches and exports. |
| `/admin/approvals` | Offers held-punch review alongside request queues with the reviewer’s scope. |
| `/employee/attendance` | Shows personal time entries and punch review status through dedicated filters. |
| `/employee/face-id` | Displays availability and enrollment status before verification, with matching API access. |
| `/employee/leaves` | Opens the relevant summary or request workflow and pages scoped request history. |

## Compensation and workspace setup

| Route | Workflow |
| --- | --- |
| `/admin/payroll` | Carries location and period through the monthly workflow and directs the operator to the next payroll action. |
| `/admin/payroll/queue` | Gives the operator a period-aware view of pay runs needing attention. |
| `/admin/payroll/configuration` | Opens policy configuration for the requested payroll month. |
| `/admin/payroll/variance` | Keeps comparison context and explains unavailable or invalid periods. |
| `/admin/payroll/salary-revisions` | Filters revisions by location and blocks approval or reversal when the change would invalidate an open run. Links directly to the conflicting run. |
| `/admin/payroll/process` | Redirects old links to monthly payroll and preserves supported scope. |
| `/admin/loans` | Keeps loan form changes in place when a save needs to be retried. |
| `/admin/cashbook` | Opens the ledger for the actual entry month after saving. |
| `/admin/expenses` | Pages expense records in the selected status and checks whether payroll reimbursements are available. |
| `/admin/tax` | Gives reviewers a return-for-correction flow with a note visible to the employee. |
| `/admin/audit` | Interprets day filters in the workspace time zone and preserves them across pages. |
| `/admin/ai` | Helps users start with supported questions and keeps answer columns aligned to data. |
| `/admin/settings` | Shows which device and notification actions can run with the saved connection settings. |
| `/admin/configuration` | Routes to specific editors and opens the location-scoped dashboard layout when requested. |
| `/admin/configuration/company-settings` | Finds settings by service, with separate region and workspace editors. |
| `/admin/webhooks` | Makes event selection explicit and shows the signing secret after creation. |
| `/admin/whatsapp` | Shows the configured message types and stores settings while delivery is disabled. |
| `/employee/payslips` | Filters personal statements by year and status, keeps the newest period visible when reversed and opens the selected document on narrow screens. |
| `/employee/tax` | Shows the reviewer’s return note and lets the employee correct the declaration. |

## End-to-end workflow checks

- Employee attendance corrections return to the originating day or filtered month after submission or cancellation. Leave requests preserve the history filters and page, and employees can open the confirmation for the request they just submitted.
- Two simultaneous administrators replacing a branch manager produce one saved change and one conflict. The affected staff sessions are invalidated; dedicated manager logins retain access.
- Feed verification used 121 posts and included a reply on an older page. Performance verification used 105 reviews and included filtered manager results and personal history beyond the previous limit.
- Local payroll verification covered salary-revision approval and reversal against open runs, recalculation using the revised salary, and the required explanation when returning a tax declaration.
- Daily and monthly report verification covered overnight shifts, the New York daylight-saving transition, scoped manager exports and an Excel download.

## November 24 workflow redesign

The portal prioritizes frequent role-scoped destinations and groups other tools by purpose. The phone layout uses one navigation dock. HR and employee home surface actionable work earlier, and the public homepage offers a direct choice between creating a workspace and signing in.

* **Onboarding and people records.** HR can assign tasks, manage sign-in and follow saved progress for the selected employee. First password setup leads employees to an assigned checklist when tasks are pending. Employees can open the relevant documents and return to the same checklist. Formal verification and signing use the existing HR process.
* **Attendance, leave and approvals.** The dashboard and review queues use a shared drawer. A decision retains the originating branch, date or search filters. Employees return to their day after requesting a punch correction and can find a newly filed leave request in history.
* **Payroll and tax.** Operators explicitly open a payroll location and month. The four-stage workflow presents the next available action after showing the stage’s information. The payslip summary offers a direct PDF download, and tax declarations show review status and HR feedback in place.
* **Other workflows.** Reports are searchable. Workspace connections have separate views. Device connection status and its settings link appear together. Team expenses use one status strip with filtered counts. Employee support opens in a drawer, and the admin queue opens on tickets requiring work. Platform plan settings focus on plan pricing and feature limits.

Typecheck, lint, the production build and all 63 regression scripts passed. Browser checks against the local standalone build rendered all 71 routes at desktop and phone widths and captured 142 route screenshots. Additional tests completed onboarding with real synthetic credentials, a dashboard approval, all four payroll stages with simulated payment, a tax declaration, and a support ticket through closure. Attendance and leave fixtures covered submission, persistence, payroll locks and role restrictions. The walkthroughs used synthetic local data.

## November 21 revamp verification

The November 21 run checked every listed route at 1440 px and 390 px on the local standalone production build. Detailed module changes, task-level browser checks and the limits of that coverage are in the [phase checkpoints](hrms-revamp-checkpoints.md). The [backend contracts](required-backend-additions.md) describe pending capabilities.

## Earlier local validation

The standalone production build passed against local PostgreSQL. The authenticated sweep opened 64 portal routes, including the legacy redirects. Browser workflows covered the other seven routes. All 63 regression scripts passed. The integrated payroll scenario submitted and approved a leave request, detected stale payroll inputs, recalculated and finalized the run, recorded simulated payment, downloaded a payslip, then verified the reversal in personal history.

The browser scenarios use synthetic workspaces, recorded punches and simulated payment evidence. They cover desktop and 390 px layouts, workspace signup and temporary passwords, role and location scope, approval handoffs, payroll draft invalidation and generation, employee payslip PDFs, policy publication, document filtering, support conversations and platform subscription controls.

The production rollout still needs real vendor and device checks, external delivery and settlement, and validation against representative historical data. Daily and monthly device reports display workspace-local time. Device timestamps without a supplied timezone retain their legacy IST input contract. Built-in payroll generation currently requires an India workspace configured for INR.
