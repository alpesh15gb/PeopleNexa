# PeopleNexa ESS PWA

ESS is distributed as a home-screen PWA, not an APK. Android browser Install app/Add to Home screen and Safari Share → Add to Home Screen are supported entry points. Installation requires HTTPS; browser controls vary. Admin/HR remain web interfaces. Manifest scope includes login to keep sign-in inside the installed window, but the app launches only `/employee` and installation is offered only in ESS.

Journey tracking is disabled. Employee dashboard/attendance pages do not mount a GPS collector, and `/api/location` POST returns 410 even for stale clients. GPS and selfie evidence are collected only during clock-in/out. Historical journey records are retained.

The service worker caches only public app icons. It purges earlier PeopleNexa caches and does not cache employee pages, APIs, payslips, or selfies. Offline launches show a reconnect screen; attendance is not submitted offline.

## Provisioning ESS

Admin → Employee Master → Edit → Create/reset ESS login. Employee must be active, assigned a branch, and have an unambiguous employee code. Enter a chosen temporary password (any non-empty password, at most 72 UTF-8 bytes), or leave the field blank to generate a random one. The issued password is shown once; share it privately. This does not activate anyone or alter device codes. Real emails are preserved; missing/legacy device emails receive a stable internal `@employees.peoplenexa.invalid` identifier, not a mailbox.

Login accepts the employee code (case insensitive, workspace scoped) or existing email. No slash/zero aliasing is performed at login. Ambiguous employee codes are rejected. Initial temporary credentials and admin password resets require a new password before any portal/API access. Passwords are hashed; audit records never include passwords. Reset/change increments session version and invalidates old sessions.

Existing accounts with no prior login and an existing password are marked for first-login password change by the migration. Existing established accounts retain access. Imported employees without a password remain unprovisioned until the admin explicitly creates ESS credentials. Assignment Pending and inactive employees cannot sign in.

## Deployment verification

Build and restart app; startup applies migration `20261015010000_ess_login`. Do not seed.

1. Provision an active test employee; confirm temporary credentials appear and real email/device code/status are unchanged.
2. Log in by employee code on the correct tenant. Confirm password-change screen and API/portal restrictions before changing.
3. Change password; old temporary password and old sessions must fail. Verify duplicate/cross-workspace codes do not authenticate.
4. Install from an Android browser and iPhone Safari. Launch from icon; confirm ESS opens and notifications fit mobile screen.
5. Clock in/out with fresh selfies and location; verify review/report evidence. No periodic location requests or new LocationPing rows should occur while browsing.
6. Lock/reopen phone: ESS requires no continuous tracking. Offline launch must show reconnect, never another user's cached data.
