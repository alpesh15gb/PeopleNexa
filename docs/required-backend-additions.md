# Required backend additions

These are proposed contracts for the capabilities that the local UI cannot establish from current records. Implementations require separate review. No database migration or handler for these contracts is included in this revamp.

## Access and write semantics

Derive tenant, actor and employee self-service identity from the session. Enforce the applicable module, role, assigned location or branch and employee visibility on every read and write. Return 401 for an expired session, 403 for a forbidden operation, 404 for an inaccessible object, 409 for a stale version or lifecycle conflict, and 422 for field errors. Use opaque IDs. All money fields below use a currency code and integer minor units. Return dates as YYYY-MM-DD in the workspace calendar and instants as ISO UTC. Record actor, operation and timestamp for each successful write. Replayed idempotency keys must return the original result for the identical request.

## Onboarding and personnel

| Proposed operation | Input and permission | Success response and persistence | Current workflow |
| --- | --- | --- | --- |
| POST /api/onboarding/invitations | HR with employee write scope sends employeeId, email and Idempotency-Key | 201 with invitationId, expiresAt and deliveryStatus. Persist only a token digest, expiry, employee and delivery outcome. Reissue revokes prior unclaimed tokens. | HR creates or resets a temporary credential and shares it privately. |
| POST /api/onboarding/invitations/accept | Recipient supplies one-time token and password | 200 with employeeId and acceptedAt. Atomically consume token and activate credentials. Invalid, expired or replayed tokens reveal no employee details. | Standard first sign-in and required password change. |
| POST /api/onboarding/evidence and PATCH /api/onboarding/evidence/{id}/review | Employee submits kind and an authorized uploadId. Independent HR reviewer submits decision (verified or returned), expectedVersion and returnNote for returns. | 201/200 with evidenceId, kind, state, version and reviewedAt. Bind private file to its owner, enforce file policy and retain review history. | Profile, authorized documents and checklist progress remain separate. |
| POST /api/onboarding/signature-requests and GET /api/onboarding/signature-requests/{id} | HR supplies employeeId and documentVersionId. Recipient or assigned HR can read. | 201/200 with id, state, expiresAt, signedAt and evidenceId. Verify provider callbacks, deduplicate events and bind the signature to a document hash. | HR arranges signatures separately. |
| GET /api/people/directory?q=&cursor= and GET /api/me/team?cursor= | Enabled employee directory or supervisor with explicit reporting scope | 200 with items containing employeeId, displayName, jobTitle and permitted team label, plus nextCursor. Enforce field visibility independent of payroll access. | Authorized administrators can search the existing employee directory from the launcher. |
| GET /api/employees/{id}/timeline?cursor= | Authorized employee-record reader | 200 with ordered items containing kind, at, permitted summary and a scoped source reference, plus nextCursor. Apply each source module's authorization. | Employee record shows events available to the current role. |

## Time, leave and devices

| Proposed operation | Input and permission | Success response and persistence | Current workflow |
| --- | --- | --- | --- |
| Extend GET /api/leaves/preview?typeId=&from=&to=&halfDay= | Employee supplies their existing type, dates and duration parameters. HR on-behalf requires its existing employee scope. | Add balanceBefore, reservedDays, projectedBalanceAfter, effectivePolicyId, asOf and overlapVisibility. Include allocationId, effectiveFrom, effectiveTo and a balance version. Return null with a reason when a date-effective allocation cannot be calculated. Half-day conflicts can be compared by date only until requests persist an AM/PM slot. Use the submission policy and payroll-lock rules. | Drawer shows the server's chargeable days and explicitly labels the balance estimate. |
| GET /api/leaves/team-availability?from=&to= | Authenticated employee with a configured team-sharing policy | 200 with permitted overlap dates and counts, optional display names only when permitted, and visibility. Never include reasons, document links or sensitive leave types. | Manager decisions show approved overlaps in their permitted scope. |
| GET /api/devices/{id}/ingestion?cursor= | Device administrator with fleet scope | 200 with lastHeartbeatAt, lastSuccessfulImportAt, processedThrough, unmatchedCount, permitted unresolved log summaries and nextCursor. Keep unavailable measures null. | Fleet heartbeat, observed logs and recorded eBioserver pulls are distinct signals. |
| GET /api/shifts/conflicts?employeeId=&from=&to= | Authorized roster planner | 200 with scheduleVersion and conflicts containing day, shiftId and conflicting time ranges across midnight. Assignment writes must revalidate scheduleVersion. | Existing roster and assignment checks apply. |

## Payroll and employee self-service

| Proposed operation | Input and permission | Success response and persistence | Current workflow |
| --- | --- | --- | --- |
| POST /api/payroll/preflight | Scoped preparer supplies locationId, month, cohort selection and source. Read-only. | 200 with inputVersion, checkedAt, counts and issue codes with severity, permitted employeeIds and suggested remediation. Resolve locks, policy, pay method and jurisdiction for the exact cohort. | Input checks and existing generation/review server checks remain available. |
| PATCH /api/payroll/adjustments/{id} and POST /api/payroll/runs/{id}/quote | Preparer in an editable draft sends expectedVersion, label, type and amount. Quote accepts changes without persisting. | 200 with audited updated adjustment and revision, or projected gross, deductions and net. Reject system-owned reimbursements, stale or locked runs. | Editable drafts use existing add/remove operations and explicit server recalculation. |
| POST /api/payroll/runs/{id}/disburse | Independent approved run, payout authority, expectedVersion, approved provider account and Idempotency-Key | 202 with disbursementId and providerStatus. Persist provider reference, verify signed callbacks and reconcile before recording settlement. Duplicate submission must not transfer twice. | Bank export and external payment evidence remain the settlement workflow. |
| Payslip publication event on existing publish transition | Server emits one event per newly visible employee statement | Transactional outbox keyed by run, employee, publication revision and channel. Persist delivery status and retry without repeating publication. | Employee vault lists published statements. Delivery is not attested. |
| POST /api/tax/declarations/{id}/proofs | Declaration owner supplies an authorized private uploadId and category; HR review follows declaration scope. | 201 with proofId, status and version. Persist file ownership and retention policy. | Employees submit supported declaration values and receive reviewer notes. |
| GET /api/me/tax/comparison?financialYear= and GET /api/me/tax/forms?financialYear= | Authenticated employee for an enabled jurisdiction | 200 with versioned regime estimates, currency, tax year and assumptions; forms returns only issued documents with formId and scoped download link. Missing inputs or unissued forms return an explicit unavailable state. | ESS shows recorded deductions, declaration status and authorized documents. |

## Additional handoffs

* **Employment communications.** A future POST /api/employees/{id}/messages would require an authorized sender, subject, body, channel and idempotency key, returning messageId and deliveryStatus. Active organizational announcements are available today. Birthdays and anniversaries on employee home require a visibility policy and consent before exposing personal dates.
* **Onboarding progress.** A future GET /api/onboarding/employees/{id}/progress should return invitedAt, invitationState, completedTasks, submittedEvidence, outstandingReviews, signatureState and activatedAt for the employee or assigned HR scope. Keep these independently recorded facts. A completed checklist alone cannot change employment status.
* **Payroll audit and locking.** For a hard input freeze before draft generation, POST /api/payroll/input-locks with locationId, month, cohortHash and preflight inputVersion should return lockId, expiresAt and snapshotHash. Require a preparer authorized for the cohort, reject stale input versions with 409, and bind generation to that snapshot. Existing lifecycle controls continue to enforce review and approval independence.

## Notifications and preferences

Extend the notification read model with an optional eventCategory, permitted source reference and stable eventId. Producers set the category when creating new notifications. Keep historical entries uncategorized. Current filters use read status and recorded warning/danger types. For users who need settings across browsers, GET/PUT /api/me/preferences/directory can store validated filters and field visibility per user and tenant with optimistic versioning. The present directory saves preferences in the current browser.
