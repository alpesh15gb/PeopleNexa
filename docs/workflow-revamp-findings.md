# PeopleNexa workflow revamp

## Observed behavior

The signed-in Zoho People workspace presents personal activity separately from team and organization work. Its home surface links the work schedule, attendance, leave, profile, and approvals. Attendance uses a date range and dated entries. Leave has separate summaries and request history. A searchable quick-action menu offers forms from across services.

REA captured the Operations page and the organization report library from the selected Chrome tab. Operations groups administration by HR service and has a dedicated approvals entry. The report library distinguishes personal, team, and organization reports and categorizes reports by subject.

| Observation | REA evidence |
| --- | --- |
| Selected signed-in Zoho People tab | `ev_bdb51ee76235c24e2091b66f65d6d20e9331b8f93f3631f195515188b1e2467d` |
| Operations navigation and services | `ev_393648c45adb793aa631b534d73b29c817a62f681497d094df3ec733755b97ca` |
| Organization report library and its categories | `ev_aed67cf1d0f8b516c45411e18131834cfda6a097606676db2f6425850837e374` |

The account views establish navigation, visible controls, and grouping. PeopleNexa implements the workflow using its own data, policy, and authorization model.

## Client logic investigation

The signed-in browser exposed a candidate onboarding list with an onboarding status, personal leave summary and request paths, and a leave form with a type, a date range, and a reason. The investigation opened controls and closed the form without saving records.

REA observed 155 scripts with the Zoho People and first-party CDN origins allowed. It partially analyzed 55 script chunks and reported 89 endpoint candidates. A focused analysis parsed both the loaded leave and attendance JavaScript bundles. Its incoming traces associated a common leave action with the leave bundle and an attendance report action with the attendance bundle. A source check showed a leave flow requesting attendance information for an employee and date, and an attendance view passing a period to a report action and rendering returned month or week details. The analysis identified client request construction and rendering. Zoho's server-side permissions, accrual formulas, approval transactions, and storage rules remain unobserved.

| Evidence | REA reference |
| --- | --- |
| Signed-in bundle summary | `ev_31cd5431c0a9a714c5eccca3a8ada5299a14c8c8e8ba6afd4cb4f21e3614731b` |
| Focused leave and attendance artifact analysis | `ev_ff4adda69a08457f01bd4a796846320914f289e24eaa4f242683aea0233408d3` |
| Incoming leave action trace | `ev_192f8cea9972522ac3de666ef66c88ef6b7a69ace045171eab50d977bbddc265` |
| Incoming attendance report trace | `ev_4b4ea60d24ba59362d22443f85d0cb67429a05fbd0cc6465b54e16b81f5b319b` |

PeopleNexa uses its own server rules for leave eligibility, date intervals, attendance reconciliation, scope checks and financial records. The source review and local verification status are tracked in [Full revamp verification](full-revamp-verification.md).

## Payroll, attendance and leave flow comparison

| Signed-in observation | PeopleNexa workflow | REA evidence |
| --- | --- | --- |
| Attendance Operations separates employee-specific operations, biometric ID mapping, and punch import and export. | Keep the employee clock, daily entries, correction review and workspace setup in distinct views. | `ev_f417ac41592a83c536691888d6c72f949e6dc4ce0964d7a7bdf2bd55de23c00e` |
| Leave Operations separates requests, holidays, balance customization and policy customization. | Start employees with their balance and rules, give reviewers a scoped decision queue, and keep cancellation outcomes in request history. | `ev_798b59bef0d82903d68b54a71741ae6a6fee0084eb0d89abca19a08b12077f` |
| The Compensation service presents getting started, salary packages, revisions and historical reporting. | Start payroll in a location and period, make the attendance source explicit, guide the run through review and payment, and publish personal payslip history. | `ev_427cd9a160d51e49fb07150419045a7167c07c2f65718a546a1eaa239e9c34a9` |

The signed-in reference exposed Compensation setup. The actual PeopleNexa pay run and approval rules below were exercised using its own source and test records.

## PeopleNexa implementation

- **Portal shell** gives managers a switch between personal work and administration, with contextual service navigation and a keyboard-accessible launcher for enabled pages and forms.
- **Employee home** surfaces the personal schedule, current attendance, open requests and relevant leave information. Leave and attendance have direct links to their forms and history.
- **Approvals** summarizes reviewable work across leave, corrections, expenses and exits. Each queue opens its existing review surface with the correct filters and permissions.
- **Reports** starts with a subject-based library. Existing report links still open the requested report. Workforce movement uses employee joining dates and completed exit records, scoped by the viewer's assignment.
- **Payroll** puts monthly payroll, the work queue, history, salary changes, and policy settings in one workspace. The queue groups open runs by their current stage and links to the specific run, location, and pay month.
- **Device administration** organizes the attendance fleet by connection type. Device inventory and health are separate views, and location managers see their assigned inventory and supported actions.
- **Settings** groups administrative tools by HR service. The directory leads to focused editors for workspace and location profiles, dashboard layouts, ID cards, and existing integration settings.
