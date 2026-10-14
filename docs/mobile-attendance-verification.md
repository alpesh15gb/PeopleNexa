# Mobile clock-in and reporting

The employee dashboard captures a fresh JPEG from the front camera for both
clock-in and clock-out, then obtains a fresh high-accuracy GPS position. Camera
readiness is checked before capture. Images are resized to a maximum dimension
of 640 pixels and validated/decoded on the server with size and memory limits.
New requests require a valid image, capture timestamp, explicit IN/OUT direction,
coordinates and GPS accuracy. Captures expire after two minutes; retries preserve
the same original payload and event identity rather than creating another punch.

The capture timestamp is client-reported. This flow validates evidence and face
matching; it does not implement a cryptographic camera attestation or active
blink/challenge liveness check. Browser GPS is browser-provided location evidence.

## Approval

With Face Match enabled, automatic attendance requires an enrolled matched face
and a position whose reported GPS uncertainty fits inside the configured branch
radius. Face uncertainty, missing enrollment, outside-geofence positions, poor GPS
accuracy and missing geofence configuration are held for independent review.
Held punches are saved with their photo and location but do not count toward
attendance until approved. Disabling Face Match explicitly bypasses face matching;
it does not bypass the photo requirement. Outside-geofence attempts remain blocked
when that existing bypass setting is used.

Authorized administrators, supervisors and assigned branch/location managers can
review punches. Self-review is forbidden. Each IN and OUT is reviewed separately;
approving one punch never deletes its counterpart. Declined punches remain in the
ledger as evidence and are excluded from reconciliation and real-time presence.
Review decisions are audited and respect reviewed/finalized payroll locks.
Older eligible workdays are reconciled with their proper finalization state.

The clock card and current-attendance API use the effective attendance workday,
including overnight shifts. Pending IN and OUT punches are reflected on the card
so an employee can submit an OUT while an earlier IN awaits review.

## Reports

Open **Reports → Punch Details / Logs → Mobile punches**. The log includes recorded
mobile punches even when no derived attendance row exists. Search, date range,
approval filtering, pagination and Excel export are supported. Columns include
direction, time in IST, GPS/map link, accuracy, geofence distance/radius/check,
selfie, face score/status and authorization/reason. Photos are served on demand
through tenant and manager-scope authorization, with private no-store caching.
Existing photo retention still applies; photos already purged or punches deleted
by the previous review implementation cannot be reconstructed by this change.

Daily attendance and its Excel export identify mobile endpoint punches as
**Mobile app**, instead of attaching a machine merely because it punched nearby.
Matching requires the actual source timestamp within one second and includes
next-calendar-day events for overnight outs.

## Deployment and live checks

Migration `20261015000000_mobile_punch_evidence` adds optional evidence columns.
The existing Docker entrypoint applies migrations before application startup.
Regenerate the Prisma client and rebuild the application when deploying.

Check the deployed face backend without changing employee data:

```bash
docker compose exec -T app ./node_modules/.bin/tsx scripts/check-face-backend.ts
```

Face models are intentionally outside Git. A missing backend results in held
verification, never an automatic face match. The six required model files and
resolved directory are reported by the diagnostic command. Local model files were
absent during this review, so real matching could not be validated locally.

On a phone over HTTPS, verify camera/GPS permission denial, in-radius IN with a
fresh selfie, OUT with a second selfie, expired capture, outside/low-accuracy GPS,
unenrolled/uncertain face, manager approval/rejection, and an overnight IN/OUT.
Confirm each event appears in the mobile report and only approved/auto events
appear in attendance totals. Test a network retry to confirm it produces one
ledger event, and verify another location's manager cannot view its photo.

## Local checks

`npm run test:mobile-attendance` exercises coordinate validation, real JPEG decode,
capture freshness/retry, approval policy, mixed mobile/device attribution,
overnight pairing and excluded pending/declined presence. Existing attendance,
automatic-shift and payroll financial-safety regression checks also pass.
These checks do not substitute for a phone/VPS end-to-end test.

## Journey sharing

The employee dashboard now mounts location sharing after approved clock-in, as
does the Attendance page. Pending clock-in does not start tracking; pending
clock-out stops tracking immediately. The server uses the canonical effective
workday and roster shift, including overnight sessions, and stops collection
outside scheduled shift hours plus the existing grace period. Inactive and
login-only accounts cannot share locations.

Sharing status changes to "on" only after a successful server response. Permission
denial and failed saves are visible. Requests stop on off-duty/auth responses, and
pending callbacks are cancelled on page exit. A fresh ping is sent on returning
to the visible page; periodic pings are sent every five minutes while visible.
This is browser foreground tracking, not a native background tracking service.

Journey Tracker has a Refresh button and refreshes its Live tab every 30 seconds.
Location managers see only their assigned scope. Live markers expire after ten
minutes without a fresh ping. An old held punch without a selfie cannot acquire
one retroactively; use a new capture after deployment to test the revised flow.
