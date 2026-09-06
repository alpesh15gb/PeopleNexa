# Native apps (TWA + iOS PWA)

PWA is the ship vehicle. Play Store ships as a TWA wrapper; iOS uses Add-to-Home Screen until native is justified. No binary assets are checked in.

## 1. PWA icon gap (do this first)

`app/manifest.ts` intentionally references only `/icon.svg` + `/icon-maskable.svg`.
Maskable 192/512 PNGs don't exist yet — never add manifest entries for missing files.

Generate from `public/icon.svg` + `public/icon-maskable.svg` (any SVG→PNG tool):

- `public/icon-192.png` (192×192), `public/icon-512.png` (512×512, maskable padding)
- Add both to `icons[]` in `app/manifest.ts`, then re-run Lighthouse PWA audit.
- Screenshots (`screenshots[]`) stay omitted until real captures exist.

## 2. Play Store via TWA (Bubblewrap)

1. Deploy PWA to production HTTPS origin first; verify manifest + SW (`/manifest.webmanifest`, `/sw.js`).
2. `npm i -g @bubblewrap/cli && bubblewrap init --manifest https://<prod>/manifest.webmanifest`
3. Set package (e.g. `com.peoplenexa.app`), app name, theme colors; keep `startUrl /employee`.
4. `bubblewrap build` → signs with a new keystore — back it up (loss = new listing).
5. Host Digital Asset Links at `https://<prod>/.well-known/assetlinks.json` with the SHA-256 from step 4, then verify in Play Console → address bar must disappear.
6. Upload the `.aab` to Play Console (internal track first), complete listing below.

## 3. iOS notes

- No TWA on iOS: user installs via Share → Add to Home Screen (`appleWebApp` is set in `app/layout.tsx`).
- Push on iOS: Web Push works only for installed Home-Screen PWAs on iOS 16.4+ with permission prompt; background sync/periodic sync unavailable.
- Offline works via SW; test on real device (private mode disables SW persistence).

## 4. What genuinely needs native later

- Face-match attendance (liveness), background GPS tracking/geofence enforcement.
- Reliable background uploads, biometric keystore auth, native push reliability/SLA.
- Until then: PWA + TWA covers clock-in/out, payslips, leaves, approvals.

## 5. Store listing checklist

- [ ] 512 PNG icon, feature graphic (1024×500), ≥2 phone screenshots per track
- [ ] Privacy policy URL + in-app link, data-safety form (location, employment data)
- [ ] Package name frozen, signing key backed up, assetlinks verified (no URL bar)
- [ ] Offline smoke test: airplane mode on `/employee`, `/admin`, `/superadmin/login`
- [ ] Lighthouse PWA: installable, offline fallback, maskable icon, theme-color pass
