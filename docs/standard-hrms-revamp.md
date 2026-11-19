# PeopleNexa standard HRMS revamp

## Product baseline

A new company can set up its organization, add employees, configure schedules and leave, approve requests, and run payroll after publishing its payroll policy. Employees can keep their profile current and use the self-service features enabled for their company. Device integrations and former-customer imports are optional. Tenant and location settings govern the workflows that vary by employer.

The baseline follows common HRIS capabilities across employee records, self-service, attendance, and leave. [Zoho People features](https://www.zoho.com/en-us/people/features.html) · [BambooHR time and attendance](https://www.bamboohr.com/platform/time-and-attendance/)

## Implementation

| Area | Standard workflow | Acceptance check |
| --- | --- | --- |
| Workspace setup | Create a default location, branch, shift, and editable leave types through either signup path. Organize navigation by HR task and show company settings based on enabled modules. | Create a fresh workspace, sign out, sign in on the root host and tenant host, and open the enabled admin areas. An explicitly disabled module stays disabled. |
| Dashboard | Show daily attendance and leave in the workspace's time zone. Published widget order applies across the dashboard. Load a previous layout into the editor to change its order, visibility, or size. | Check desktop and mobile, publish an alternate order, and compare location-manager counts with the in-scope attendance and leave records. |
| People and self-service | Search and filter employee records by scoped organization data. Use the standard employee CSV to import. Employees see quick actions and personal records for enabled modules. | Add and import employees, search across pages, and verify that a manager only sees employees in their assigned scope. A tenant admin can enable or disable the YLR workbook under **Employees → Import employees**. |
| Time and leave | Choose weekly days off for attendance reports, handle recurring and half-day holidays, search for employees when filing on their behalf, and import balances from a standard CSV for any supported period. | Verify weekly offs in reports, manager scope in leave and attendance, and preview and confirm a balance import without duplicate entries. |
| Payroll | New workspaces publish a policy for the selected location and month. Existing tenants can preview attendance-day differences and publish an effective-month shift weekly-off policy in Payroll Settings. System-attendance runs retain their weekly-off method and dates. | Check that the preview makes no writes, prior periods and old drafts retain their method, and a replacement draft uses the effective policy. |
| Lifecycle | Start onboarding from editable general HR tasks. Scope team onboarding and offboarding to the manager's assignment, and keep each employee's self-service history personal. | Assign onboarding tasks, process a resignation from request through completion, and verify history and cross-location permissions. |
| Documents and expenses | Staff can download authorized employee documents and follow their own expense claims. Managers review records within their assigned location. Both lists use 50 records per page and show totals for the full scope. Approved claims produce one payroll reimbursement. | Traverse 301 documents and 201 claims without duplicates, verify totals and role boundaries, and confirm only one reimbursement across approval and settlement. |
| Performance and policies | Managers review staff in their scope. Retired KPIs remain visible in older reviews. Employees see their own reviews and can submit feedback during an open peer review. | Submit a self-review concurrently, complete a manager review, and check that other peers cannot read the feedback. |

## Compatibility and rollout

- Deploy the additive shift migration before serving the new code. Existing Sunday-off settings will be copied to the weekly-off list.
- Enter the workspace slug when signing in from the root address. A tenant subdomain supplies the slug automatically. For local development, the workspace slug can also be supplied through its `.localhost` subdomain.
- Review each company's starter shift and leave allowances before employees start using them. Publish payroll settings for the periods and locations that will run payroll.
- Use the explicit legacy format if you need to re-import a former-customer leave ledger or payroll attendance workbook. The YLR employee workbook also requires the tenant opt-in.
- Validate against a staging copy with representative existing tenant configurations before a production rollout. Check role access, saved dashboard layouts, historical reports, approved payroll totals, and integration behavior.
- The regional settings guide explains the supported attendance time zones, historical-data constraints, and statutory payroll coverage. [Regional settings and payroll coverage](regional-payroll-and-timezones.md)

## Local staging verification

Build the application in production mode and apply migrations to a separate local PostgreSQL database. Set up synthetic historical and new workspaces before checking payroll activation and regeneration, dashboard layout and location scope, daylight-saving time boundaries, and pagination with more than 300 documents and 200 claims.

## Remaining release work

1. Compare a representative full payroll period before publishing a schedule-aware policy for a live tenant. The preview shows differences in attendance days before salary and deductions.
2. Validate statutory rules and filing formats for each new country before adding its payroll support. Company Settings records the region and currency, and new statutory calculation remains limited to India with INR. Workspaces with attendance history need a dated migration to change their operational time zone.
3. Verify real vendor integrations and tenant-specific settings on representative staging data before a production release.
