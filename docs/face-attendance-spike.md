# Face Attendance Spike — PagarBook Lens parity

Goal: stop buddy-punching on selfie clock-in/out without hurting low-end Android UX. Today `clock-card.tsx` captures a selfie (data URL, capped 500KB in `app/api/attendance/clock/route.ts`, stored on `AttendanceEvent.selfie`). No match, no liveness — any face passes.

## 1. Options analysis

| # | Option | How | Pros | Cons | Verdict |
|---|--------|-----|------|------|---------|
| A | Server-side verify (Phase 1 pick) | Keep PWA capture; verify on server (InsightFace embedding + cosine match, blur/single-face gates) | Zero native work, works on every phone, one model to update, full audit trail | Server GPU/CPU cost, ~1–3s latency, selfie upload size | **Do first** |
| B | On-device Android (ML Kit / TFLite) | Native wrapper (Capacitor/Cordova plugin or Trusted Web Activity) runs Face Detection + MobileFaceNet, sends embedding only | Offline-capable, private (no photo leaves phone), fast | PWA cannot call it — needs native shell; model/version drift across devices; iOS extra work | **Do second** |
| C | Vendor API (AWS Rekognition / Luxand) | POST selfie to vendor CompareFaces | Fastest to build, good accuracy | Per-call ₹0.08–0.25, biometric data leaves India boundary, DPDP risk, vendor lock-in | Fallback only |

PagarBook Lens = option B UX (on-device liveness + blink) with A as fallback. We mirror that end-state via hybrid: B when native shell exists, else A.

## 2. Recommended phased approach

**Phase 0 — Quality gates on existing PWA (0.5 sprint, no ML).** Client: single-face check via lightweight blur/luma heuristics + file-size floor (reject <15KB blanks), prompt "move to light / remove mask". Server: reject missing/oversize selfie, log quality score. Stub in `lib/face.ts` (`faceMatchConfig`, `isFaceEnrollmentValid`, `faceAuditEntry`).
**Phase 1 — Enrollment set + server match + liveness heuristics (~2 sprints).** New `FaceEnrollment` table (employeeId, embedding float[], consentVersion, capturedAt); enroll 3 samples/employee (front, slight-left, slight-right). Match: cosine ≥ 0.62 accept, 0.50–0.62 manual review queue, < 0.50 reject. Liveness heuristics: blink/challenge-frame delta + texture glare check (photo-of-photo reject). Reuse punch review UI for the gray zone. Interface `FaceMatcher.verify()` in `lib/face.ts` is the plug point.
**Phase 2 — On-device TFLite/ML Kit via native wrapper (~3–4 sprints).** Capacitor plugin: ML Kit face detection → MobileFaceNet embedding → match locally → POST `{embedding, livenessPassed}` only. Server re-checks threshold + audit. PWA without shell keeps Phase 1 path. Needs model versioning (`modelVersion` in enrollment row) and forced re-enroll on major bump.

## 3. Privacy & consent (India DPDP Act 2023)

- Explicit opt-in per employee before enrollment: purpose ("attendance identity check"), what is stored (face embedding + 3 reference photos), retention, right to withdraw. No punch penalty for declining — fallback to supervisor-approved manual punch.
- Store embeddings, not raw photos, long-term; raw enrollment photos auto-delete after 30 days; punch selfies auto-delete after 90 days.
- Deletion on exit: purge embeddings + photos within 7 days of separation (hook into existing exit flow); export audit log only (match score, timestamp — no biometrics).
- Access control: enrollments readable only by admin/HR role + employee self; audit log immutable; consent receipts versioned (`consentVersion`).

## 4. Accuracy / FAR targets

- Target FAR ≤ 0.1% (1 in 1000 impostors accepted), FRR ≤ 2% on field data ( shaded outdoor, low-end 5MP front cams). Threshold 0.62 is the starting point; tune on 500-pair pilot set.
- Spoof resistance: printed-photo attack blocked ≥ 95% (glare + challenge delta); no 3D-mask guarantee at this tier — document as limitation.
- Fairness check: pilot must include ≥ 30% female staff, indoor + outdoor, spectacles/hijab/turban cases; per-group FRR spread ≤ 1.5×.

## 5. Cost estimate (INR, rough)

- Phase 0: ~0 infra, 3–4 eng-days.
- Phase 1 self-hosted (1× 4vCPU/16GB + InsightFace ONNX, ~50k verifies/mo): ₹6–9k/mo infra + ~10 eng-days. Vendor alternative: ₹4–12k/mo at 50k punches + DPDP review.
- Phase 2: ~15–20 eng-days (native plugin + QA across 10 device models), negligible marginal infra.
- Recommendation: self-host Phase 1; revisit vendor only if FRR misses target.

## 6. Test plan

1. Unit (`lib/face.ts`): validator rejects <3 samples, stale/old consent, low-quality; audit formatter stable strings.
2. Offline pilot (500 enrolled pairs + 200 impostor pairs): report FAR/FRR curve, pick threshold.
3. Field pilot (2 sites × 25 staff × 2 weeks): measure FRR in sun/shade/night-shift, latency p95 < 3s on 4G.
4. Spoof set: printed photo, phone-replay video, sunglasses — must reject ≥ 95%.
5. Regression: consent-declined and camera-denied paths still punch via supervisor approval; exit flow purges biometrics.

## 7. Decision needed

- Approve self-hosted Phase 1 over vendor API? (Recommended: yes.)
- Approve 90-day punch-selfie / 30-day enrollment-photo retention windows?
- Green-light Capacitor native shell for Phase 2, or stay PWA-only?
