# PeopleNexa Revamp Audit

## Repository baseline

The repository is a Next.js 16 application using React 19, Tailwind CSS 4, Lucide icons, Prisma 7, and PostgreSQL. It contains admin, employee, superadmin, authentication, landing, API, biometric integration, payroll, leave, expenses, documents, performance, helpdesk, policies, reporting, and settings routes.

The baseline production build and TypeScript check pass after generating the Prisma client with a placeholder `DATABASE_URL`. Prisma generation currently requires `DATABASE_URL` to be present, but does not require a live database for generation.

## Existing product areas

Admin routes cover dashboard, attendance, regularization, employees, departments, shifts, rosters, org chart, onboarding, exits, branches, leaves, holidays, assets, devices, payroll, loans, tax, expenses, journeys, AI, documents, performance, helpdesk, policies, feed, reports, settings, and WhatsApp. Employee routes cover dashboard, attendance, onboarding, exits, leaves, payslips, tax, expenses, documents, performance, helpdesk, feed, policies, and profile. Superadmin routes cover dashboard and tenants. Authentication includes login, registration, and superadmin login.

## Visual baseline

The current login page already has a functional split layout with marketing copy on the left and a form on the right. It relies heavily on indigo/purple gradients, grid background, rounded cards, and compact typography. The visual language reads as polished SaaS but can be made more human and enterprise-oriented by introducing warmer surfaces, clearer section hierarchy, quieter gradients, better navigation grouping, more contextual page headers, and richer empty/loading/error states.

## Redesign direction

The revamp will preserve existing routes and API contracts while improving the shared shell, design tokens, reusable UI primitives, authentication framing, portal navigation, dashboard hierarchy, data tables, filters, status treatments, and responsive behavior. Logic changes will be limited to clear correctness issues discovered during audit.

## Visual verification checkpoint

The refreshed login route renders successfully in the browser. The new split layout has a stronger editorial headline, three trust cards, a quieter palette, clearer sign-in copy, and preserved login/register controls. No runtime rendering error was visible on the route.

## Logic and resilience audit checkpoint

The browser smoke test confirmed protected employee and clock APIs return 401 without a session. The local landing route initially exposed a production resilience issue: the public page crashed when plan overrides could not reach PostgreSQL. `getEffectivePlans` now falls back to cached or code-defined plans so public content can still render while the database recovers.

The auth audit also identified and fixed three flow issues: onboarding now runs inside one Prisma transaction, the admin dashboard counts explicit absent rows plus unmarked employees, and employee attendance statistics are now month-to-date instead of including future records. Session cookies now support a production-wide tenant domain when configured.

## Browser smoke-test results

The public landing route now renders successfully with default pricing even when PostgreSQL is unavailable locally. The protected `/admin` route redirects unauthenticated visitors to `/login`, and the redesigned login screen renders after the redirect. This verifies the public-to-auth entry path and the primary protection boundary in the local browser session.
