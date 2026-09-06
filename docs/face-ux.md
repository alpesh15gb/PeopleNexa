# Face Attendance UX Copy (EN + HI)

## Enrollment (one-time, ~1 min)
1. Intro: "Punch in with your face — 3 quick photos." / "चेहरे से पंच करें — 3 फ़ोटो।"
2. Consent: "We store face codes (not selfies) to check punches."
3. "Auto-deleted if you leave. Declining never blocks pay. [I agree] [Not now]"
4. Capture guidance: "Face in oval / More light / Remove sunglasses / Hold still."
5. Retake: "Photo 2 blurry — retake." / "फ़ोटो धुंधली है — फिर से लें।"
6. Done: "Face added. Daily punch takes ~2 seconds."

## Daily punch
7. Prompt: "Look at the camera to punch in." / "पंच करने के लिए कैमरे में देखें।"
8. Checking: "Checking… don't move." (spinner, <3s, offline-safe copy)
9. Success: "Punched in 09:31 — have a good shift!"
10. Soft fail: "Couldn't match — try better light, then retry."
11. Hard fail: "Still no match? [Retry] [Supervisor approve]. Pay is never blocked."
12. No-face: "No face found — move to light, remove mask, fill the oval."
13. Camera denied: "Camera off — punch without face check (manager reviews)."
14. Privacy footnote: "Punch photos auto-delete in 90 days. Codes deleted if you leave."

## Manager review queue
15. "Low match 0.55 for {name} at 09:31 — [Approve] [Reject]."
16. "Photo vs. enrolled set side-by-side; score only, no biometric export."
17. Re-enroll nudge: "Face data is 6 months old — retake 3 photos."

## Tone rules
- Second person, ≤12 words per prompt; every error names the fix + escape hatch.
- Mirror clock-card keys (`clock.addSelfie`) — add `face.*` keys, EN + HI.
- Never show raw scores to staff; scores only in manager review + audit log.
- Accessibility: full flow works with TalkBack labels; oval has 3:1 contrast minimum.
