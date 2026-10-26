# Automatic shift fallback and overnight ownership

An unmatched automatic shift still uses canonical punch ownership. For example,
with an 08:00 morning shift and a 20:00 night shift, a previous night's 06:00
closing punch must stay on that previous workday even when today's 18:30 scan
does not match the saved one-hour early-start window.

The fallback previously skipped ownership filtering when no shift matched and
could copy that closing punch into today's calendar-day attendance. Reconciliation
now routes every automatic-shift punch before pairing. A shortened fallback
window filters that routed list instead of reading the unfiltered ledger again.
Configured start windows are unchanged; unmatched work remains under review.

This code change does not reopen finalized attendance or override manual decisions
and locked payroll. Existing allocation errors require separately reviewed,
bounded corrections. Out-of-window scans stay in the source ledger and must not
be converted into paid attendance simply to eliminate an audit exception.

`scripts/test-attendance-automatic-boundary-integration.ts` reproduces the failure
against a disposable PostgreSQL lab. It checks unmatched fallback, retry ownership,
matched overnight pairs, false next-day attendance, ordinary calendar attendance,
explicit new-day IN versus a nearby prior-night OUT, and unchanged shift policy.
It refuses any database other than the network-isolated `peoplenexa_working` lab.
The lab bundler includes this suite alongside recovery and report integration tests.

The read-only investigation of an uploaded backup can be replayed locally without
executing proposed attendance writes. A successful local simulation is evidence
for reviewing a correction plan; it is not confirmation of a production deployment
or authorization to alter a client's shift timings.
