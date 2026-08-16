# HRMS & Attendance — Research, Gap Analysis & Build Plan

**Date:** 2026-08-16
**Competitors studied:** Attendo (attendo.io), StaffKhata (staffkhata.com), PagarBook (pagarbook.com), Zoho People (zoho.com/people), 247HRM (247hrm.com)

---

## 1. What a "proper" HRMS/attendance system is (reference model)

Every serious product we studied converges on one core data flow:

```
Attendance capture ──▶ Validation / Reconciliation ──▶ Payroll inputs
       │                          │                          │
       ├─ device/biometric        ├─ auto punch-out          ├─ salary structure
       ├─ web clock (IP)          ├─ late / OT rules         ├─ advances & loans
       ├─ mobile GPS/geofence     ├─ leave & holiday mapping ├─ statutory (PF/ESIC/PT/LWF/TDS)
       └─ selfie / face           └─ corrections workflow    └─ arrears / manual adj.
                                                                    │
                                            ┌───────────────────────┤
                                            ▼                       ▼
                                      Disbursement          Compliance outputs
                                      (bank CSV / UPI)      (ECR, Form 16, Form 24Q,
                                                             registers, challans)
```

Beyond that spine, mature products (Zoho especially) add a **full employee lifecycle**:

`Recruit → Onboard → Core HR (records, docs, org) → Work (attendance, shifts, timesheets, expense) → Grow (performance, OKR, LMS, engagement) → Compensate (payroll, statutory, tax decl.) → Offboard (clearance, exit interview, F&F) → Analytics at every stage`

And every product that wins in India pairs that with **mobile-first capture, WhatsApp/notification reach, and statutory filing outputs** — not just calculations.

### Capability matrix

| Capability | PeopleNexa | Attendo | StaffKhata | PagarBook | Zoho People | 247HRM |
|---|---|---|---|---|---|---|
| **Attendance capture** | | | | | | |
| Web clock-in/out | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mobile GPS clock (geofence) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Selfie attached to punch | ✅ (photo only) | ❌ | ✅ | ✅ (face-verified) | ✅ (facial recog) | ✅ |
| Face recognition / liveness check | ❌ | ❌ | ✅ | ✅ (Lens) | ✅ | ✅ |
| Biometric device integration | ✅ (module) | ✅ (RFID/bio) | ✅ | ✅ (iD 8.0) | ✅ | ✅ |
| IP-restricted clock | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Offline queue (no signal) | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Auto punch-out | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Shifts & scheduling** | | | | | | |
| Shift definitions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Weekly rosters / bulk assign | ✅ | ✅ | ✅ (drag-drop) | ❌ | ✅ (rotation) | ✅ |
| Clash alerts / sandwich rule | ✅ (clash only) | ❌ | ✅ | ❌ | ✅ | ❌ |
| Break rules (payable vs non-payable) | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Smart shift recognition | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Leaves & absence** | | | | | | |
| Leave types / requests / balances | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Half-day / bulk import | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Team calendar / log on behalf | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| WFH / flexible PTO / absence templates | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Leave encashment | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Payroll** | | | | | | |
| Salary structure (Basic/HRA/…) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| PF / ESIC / PT / TDS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| LWF + state-wise config | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gratuity | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| OT pay + late fines | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Advances / loans auto-deduct | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Daily / weekly / hourly / work-basis pay | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Arrears / manual adjustments | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Tax declarations (investment proofs) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Form 16 / Form 24Q / ECR exports | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Bank CSV for bulk salary | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Online payment (bulk UPI/bank API) | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Field workforce** | | | | | | |
| GPS journey tracking | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Live map (10–60s, clustered pins, battery) | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Auto-detected stops → expense claims | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Trip KPIs + Excel export | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Planned-route deviation | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Road-snapped routes (map API) | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **People ops & engagement** | | | | | | |
| Org chart | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Onboarding checklist | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Exit mgmt + F&F | ✅ | ❌ | ✅ | ❌ | ✅ (clearance+interview) | ✅ |
| Performance / KPI / 360° | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| OKR / 9-box | ❌ | ❌ | ❌ | ❌ | ✅ (OKR) | ✅ (9-box) |
| Recruitment / ATS | ❌ | ❌ | ✅ (ATS) | ❌ | ✅ | ✅ |
| Timesheets (project/billable) | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| LMS / training | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| eNPS / engagement surveys | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| HR helpdesk SLA + knowledge base | ❌ (tickets only) | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Platform & reach** | | | | | | |
| Multi-tenant SaaS + superadmin | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Module gating / licensing | ✅ | ❌ | ✅ (plans) | ✅ | ✅ | ✅ |
| Priced plans (₹/user) | ❌ (keys only) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hindi i18n | ✅ | ❌ | ❌ | ✅ (10+ langs) | ✅ | ✅ |
| WhatsApp notifications | ❌ (hook only) | ❌ | ✅ | ✅ | ❌ | ✅ |
| Webhooks / REST API | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Tally / bank integrations | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Access control (zones, event logs) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 2. What we're missing — grouped by strategic value

### A. Statutory & payroll completeness (the compliance moat — 247HRM's whole pitch)
1. **LWF (Labour Welfare Fund)** — all five compute it; we do PF/ESIC/PT/TDS/gratuity but not LWF.
2. **State-wise statutory configuration** — 247HRM configures PF/ESI/PT/LWF per state and keeps rules current. We have one global config.
3. **Tax declarations** — investment proofs (80C, HRA, 80D) collected from employees and applied to TDS. Form 16 can't exist without it.
4. **Compliance outputs** — ECR files, Form 16, Form 24Q, statutory registers/challans. This is what "compliance software" sells; we calculate but can't file.
5. **Arrears & manual adjustments** — salary revisions, back-pay, one-off adjustments. No way to do this today.
6. **Pay modes beyond monthly** — PagarBook handles daily/weekly/hourly/work-basis staff; we're monthly-only. This is a huge SME segment.
7. **Leave encashment** — needed at F&F and year-end; we have F&F but no encashment calc.

### B. Attendance depth (the core product every buyer demos)
8. **Face verification on punches** — we already *capture* a selfie at clock-in/out (data URL stored). Adding server-side face match/liveness is the difference between "selfie attendance" and "fakeable selfie attendance". PagarBook/StaffKhata/Zoho all market this.
9. **WFH & absence management** — Attendo's absence templates/vacation planning/flexible PTO and Zoho's WFH tracking. We treat every absence as leave only.
10. **Break rules** — lunch/break windows that exclude time, payable vs non-payable items (Zoho/Attendo). Our OT math assumes continuous shift span.
11. **IP-restricted clock** (Attendo/Zoho) — for office staff where GPS is overkill.
12. **Smart shift recognition** (Attendo) — auto-predict which shift a punch belongs to when an employee works multiple shifts.
13. **Overtime rules engine** — caps, min-block rounding, differentials (1.5x/2x), approval gates. We compute simple extra-hours.

### C. Field workforce depth (StaffKhata's differentiator)
14. **Auto-detected stops** (dwell-time clustering on our pings) with notes/duration → link to expense claims. Their cleverest journey feature.
15. **Trip KPIs + Excel export** — per-trip distance, stop counts, durations, exportable.
16. **Live map polish** — 30–60s refresh, clustered pins, battery telemetry, online status. All cheap, no external API.
17. **Offline queue** — punches + claims + notes queued locally, synced when signal returns. PagarBook and StaffKhata both have it; we're online-only.
18. **Planned-route deviation** — needs a routing API; defer.
19. **Road-snapped polylines** — needs paid map API (Mapbox/Google); optional paid tier.

### D. People ops & engagement (Zoho/247HRM parity)
20. **Recruitment/ATS** — job postings, application tracking, interview scheduling, offer letters. A second product; decide deliberately.
21. **Timesheets** — project/client-based time logging + billing. Big for agencies; irrelevant for retail/factory (our core).
22. **OKR + 9-box** — we have KPI appraisals; adding OKR alignment and 9-box grid is incremental on the same data.
23. **eNPS / engagement surveys** — cheap to build, strong retention signal, Zoho markets it heavily.
24. **LMS basics** — policy acknowledgment + training certifications; pairs with our policy engine.
25. **Helpdesk SLA + knowledge base** — we have tickets; SLA timers + a KB would complete it.
26. **Exit interviews + clearance workflow** — we have resignations/F&F; Zoho adds structured exit interview + access-revocation checklist.

### E. Distribution, reach & monetization
27. **Priced plans** — PlanDef has keys but no price; the superadmin can't sell. StaffKhata: ₹10/user/mo flat tiers; 247HRM: ₹2,499–4,999/mo; Attendo: per-user; Zoho: ₹40–₹225/user/mo. We need price fields + billing readiness.
28. **WhatsApp gateway** — notifications for punches, approvals, payslips, reminders (PagarBook sends attendance/late-fine/payment alerts). We have webhooks only.
29. **More languages** — PagarBook: 10+; we have Hindi. Gujarati/Marathi/Tamil are the SMB differentiators.
30. **Bulk online payment (UPI/bank API)** — we export CSV; PagarBook/StaffKhata pay in-app. CSV is the safe v1; API is a partnership/RA business decision.
31. **Tally integration** — accountants live in Tally; export journal entries so the product fits the existing workflow.
32. **Access control** (Attendo) — zone-based entry, event logs, alarms. Hardware-adjacent; low priority for our target.

---

## 3. Build plan (prioritized waves)

### Wave 1 — Compliance & payroll completeness *(sellable statutory story; closes 247HRM's whole pitch)*
**Why first:** payroll is our strongest module; these additions make it *complete* for Indian statutory sales. Small schema changes, big demo value.

1. **LWF + per-state statutory config** — add `lwf` to payroll config, state field on tenant, state-wise PT/LWF tables with defaults for top-10 states.
2. **Tax declarations module** — employee investment-proof form (80C/80D/HRA/LTA), admin verification, TDS recompute in payroll run. (Employee + admin pages; ~1 module.)
3. **Compliance exports** — ECR (PF) CSV, Form 16 draft, Form 24Q quarterly summary, statutory register report. Mostly report/export code over existing payroll data.
4. **Arrears & manual adjustments** — per-employee payroll adjustment lines (positive/negative, with reason + approval), included in the run.
5. **Pay modes: daily/weekly/hourly/work-basis** — extend employee pay type + payroll engine to compute on attendance days rather than fixed monthly; payslip reflects mode.
6. **Leave encashment** — config per leave type, auto-computed at F&F and at year-end runs.

**Rough size:** 4–6 weeks of focused work. Highest ROI in the list.

### Wave 2 — Attendance depth *(the product core buyers demo first)*
7. **Selfie face verification** — keep capture, add optional server-side face-match (embedding comparison; liveness later). Configurable per tenant: off / capture-only / verify. Honest DPDP framing stays.
8. **Break rules in shifts** — break start/duration, unpaid breaks excluded from work hours, OT computed on payable time only.
9. **WFH mode** — WFH request type, WFH punches flagged (no geofence), WFH report.
10. **IP-restricted clock** — tenant-configured allowed office IPs; clock allowed from IP or geofence.
11. **Smart shift recognition** — when an employee has multiple shifts, assign the punch to the shift whose window best contains it (configurable on/off).
12. **OT rules engine** — per-tenant caps, rounding (min block), multipliers, approval requirement; feeds payroll OT.

**Rough size:** 3–4 weeks. Builds directly on reconcile/payroll we already have.

### Wave 3 — Field workforce parity *(StaffKhata's demo features, on top of our existing journey tracker)*
13. **Stops detection** — cluster pings by dwell time (e.g., ≥5 min within ~150m); show stops on map with duration; one-click "attach bill" → creates expense claim linked to the stop.
14. **Trip KPIs + Excel export** — per-day/per-trip distance (haversine), stops, active minutes; export button on journeys page.
15. **Live map v2** — 30–60s polling, marker clustering (simple grid or supercluster), battery level telemetry if the PWA can read it, online/offline status.
16. **Offline queue** — service-worker/localStorage queue for punches + claims; flush on reconnect. PWA work; medium effort.
17. *(Optional/defer)* **Road-snapped routes + planned-route deviation** — paid map API; gate behind a paid plan.

**Rough size:** 4–5 weeks. Our journey module is already the base.

### Wave 4 — People ops & engagement *(Zoho/247HRM "full HRMS" credibility)*
18. **Exit interviews + clearance** — extend exit module: structured interview form, clearance checklist (assets, access, documents), all-gates-met → F&F finalize.
19. **OKR + 9-box** — add OKR model (company → team → individual) and a 9-box talent grid view over existing KPI/appraisal data.
20. **eNPS surveys** — anonymous survey (2 questions + comments), admin dashboard with trends.
21. **LMS-lite** — policy acknowledgment + short training courses with certificates, tracking completion.
22. **Helpdesk SLA + knowledge base** — SLA targets on priorities, escalation timer, KB articles.
23. **Timesheets** *(decision point — build only if we target agencies/IT; skip for retail/factory)* — daily/weekly time logs, client/project tags, admin approval, export.

**Rough size:** 4–6 weeks (or 2–3 weeks without timesheets).

### Wave 5 — Monetization & reach *(turns the product into revenue)*
24. **Priced plans** — add price fields to PlanDef (₹/user/mo, annual %, trial length), superadmin plan editor, seat counting vs active employees, overage warning. Billing (Razorpay) only when ready to accept payments.
25. **WhatsApp gateway** — pluggable provider (e.g., WhatsApp Business API / Gupshup) + templates (punch, approval, payslip, late fine, reminder); triggered via our existing webhook/event system. Also adds vendor notifications (PagarBook parity).
26. **More languages** — i18n pipeline for Gujarati/Marathi/Tamil; start with Gujarati (PagarBook's home market).
27. **Tally export** — journal/ledger CSV compatible with Tally import; accountants adopt us because Tally stays.
28. **Bulk payment API** *(strategic)* — integrate a payment aggregator for bulk UPI/bank transfers; keep CSV as fallback. Requires vendor partnership and RBI-compliance thinking; do last.

### Explicitly deferred / never
- **Desktop monitoring** (screenshots, idle tracking) — DPDP exposure, StaffKhata sells it as an add-on; skip unless a large client pays.
- **Native iOS/Android apps** — PWA covers capture; native only if store presence becomes a sales blocker.
- **Full ATS** — only build Wave-4-lite recruitment (application intake + pipeline) if buyers demand it; a full job-board product is a separate roadmap.
- **e-signatures** — outsource to a 3rd party (Zoho does the same).
- **Access control hardware** (Attendo-style door zones) — not our market.

---

## 4. Sequencing rationale

1. **Wave 1 first** because payroll is our strongest module and statutory completeness is the single most common "why not you?" objection in Indian HRMS sales. It also de-risks the compliance positioning before we scale field/marketing.
2. **Wave 2 next** because attendance is the module every demo starts with, and face-verify + breaks + WFH are the three features buyers probe most.
3. **Wave 3** capitalizes on our one feature StaffKhata doesn't fully answer cheaply: we already have work-hours-only journey tracking; stops→claims is the differentiator that makes it competitive.
4. **Wave 4** is breadth for "full HRMS" credibility — cheap individually, big collectively.
5. **Wave 5** should start *in parallel* from day one (pricing fields are tiny); the notification/language work is a pure growth multiplier on everything else.

**Suggested immediate next build:** Wave 1 items 1–4 (LWF + state config, tax declarations, compliance exports, arrears) — one coherent "statutory completeness" sprint that makes the payroll module demo-able against 247HRM.
