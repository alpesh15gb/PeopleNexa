# Typography and theme review — 2 October 2026

Inter now supplies UI typography, including public pages, authentication, admin,
employee and superadmin screens. The four bundled weights (400, 500, 600, 700)
are self-hosted through next/font. Numeric values use tabular digits.

Theme initialization runs before body paint. One root provider owns toggles,
saved preference, operating-system preference changes and cross-tab updates.
Blocked storage falls back to the system preference; toggling still works in memory.

Shared fixes cover native select options and optgroups, date controls, autofill,
input/error borders, placeholders, semantic statuses and action-button foregrounds.
Report tables follow the screen theme and use white paper/black text when printing.
The global border reset now sits in the base layer so component utilities work.

## Verification

- All 40 existing and new regression scripts pass, including payroll, leaves,
  attendance, reports, employee workflows and the theme initialization/contrast checks.
- TypeScript and the production build pass.
- Actual Next.js login and registration pages were checked in dark mode; login
  was also checked in light mode. Browser checks confirmed local Inter loading,
  persistence after reload and theme-color metadata.
- Actual payroll settings, leave settings, shared controls/dialogs and report
  components were rendered with sample data. Visible text contrast checks passed
  in light and dark themes. Native dropdown group colors were inspected visually.
- Mobile checks covered login, leave settings and the report table, with no page
  overflow. Multiple toggles and storage-event updates stayed synchronized.

This checkout has no configured database. Authenticated component checks used
sample data, not live tenant data. These checks establish the shared theme behavior
and representative screens; they do not certify every authenticated state or browser.
