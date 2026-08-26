# PeopleNexa HRMS Revamp Direction

## Product character

PeopleNexa should feel like a calm, trustworthy HR workspace used every day by real people. The interface will move away from a generic dark SaaS look toward a warm, editorial enterprise system: soft paper-like backgrounds, ink-colored type, restrained indigo as an action color, green/amber/red used only for operational status, and human-readable copy that explains what is happening.

## System changes

The shared shell will gain grouped navigation, a clearer workspace identity, contextual page titles, a stronger mobile header, and a compact “today” context strip. Cards will use quieter borders and more consistent padding. Buttons will use solid action colors instead of luminous gradients except for brand moments. Inputs will have explicit focus and error states. Tables and empty states will prioritize decision-making, not decoration.

## Screen families

| Family | Main experience | Revamp emphasis |
|---|---|---|
| Authentication | Marketing reassurance plus focused form | More human copy, stronger trust cues, better field affordances |
| Admin dashboard | Daily operating picture | Action-oriented overview, attention queue, readable metrics |
| Employee dashboard | Personal workday hub | Clock status, next action, leave/pay visibility |
| Directory and master data | Find and maintain people/org data | Search-first layouts, filters, bulk-friendly tables |
| Time and attendance | Monitor presence and resolve exceptions | Operational density, clear status semantics, auditability |
| Leave, payroll, expenses | Review, approve, and track money/time | Stronger workflow status, totals, and next-step actions |
| Employee self-service | Submit requests and access records | Plain-language guidance, progress, and feedback |
| Settings/integrations | Configure systems safely | Grouped sections, warning states, test/save affordances |
| Superadmin | Operate the PeopleNexa platform | Separate platform tone, tenant health, license clarity |

## Implementation order

First update global tokens and shared primitives. Then update the authenticated shell and auth framing. Next improve the two dashboards and high-traffic list/detail components. Finally align remaining screens through shared primitives, preserving route contracts and existing data fetching.
