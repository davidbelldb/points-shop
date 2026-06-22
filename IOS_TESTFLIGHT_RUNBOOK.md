# Sneaky Social — iOS / TestFlight Runbook (Capacitor, bundled assets)

Native iOS shell wrapping the existing Vite/React app. The compiled `dist/` is
bundled **inside** the app binary; the client talks to the Node/Postgres backend
on the Hetzner VPS over HTTPS (and WebRTC for game netplay).

- **App ID (bundle id):** `com.david.sneakystuff`
- **Display name:** Sneaky Social
- **Backend origin (native):** `https://sneakypoints.com`

---

## What I already changed in the repo

| File | Change |
|------|--------|
| `frontend/capacitor.config.ts` | New. `appId`, `appName`, `webDir: dist`, `iosScheme: https` (secure context for camera/mic/WebRTC), `CapacitorHttp` enabled (native cookie auth). |
| `frontend/src/lib/api.js` | API base → `https://sneakypoints.com/api` on native (relative on web). All responses + uploads run through `absolutizeMedia()` so `/media/...` paths become absolute. |
| `frontend/src/main.jsx` | Service worker registration skipped in the native shell. |
| `frontend/package.json` | Added `@capacitor/core`, `@capacitor/ios`, `@capacitor/cli`; added `cap:sync` / `cap:open` / `ios` scripts. |

All native branches are guarded by `Capacitor.isNativePlatform()`, so the web
build behaves exactly as before.

---

## Prerequisites (one-time, on your Mac)

1. **Xcode** (latest) + command-line tools: `xcode-select --install`
2. **CocoaPods:** `sudo gem install cocoapods` (or `brew install cocoapods`)
3. Apple Developer account — done. App created in App Store Connect with bundle
   id `com.david.sneakystuff` — done.

> Note: you ran the first `npm install @capacitor/core @capacitor/cli` in the
> repo **root**. The canonical setup now lives in `frontend/`. You can remove the
> root copy to avoid confusion: `rm -rf node_modules package.json package-lock.json`
> at the repo root (optional — it's harmless if left).

---

## Step 1 — Install deps + add the iOS platform

```bash
cd /Users/davidbell/Documents/projects/development/points-shop/frontend
npm install
npm run build          # produces dist/
npx cap add ios        # creates frontend/ios/ (runs pod install)
npx cap sync ios       # copies dist/ into the native app + installs plugins
```

## Step 2 — Add iOS permission strings (required or the app crashes on camera/mic)

Open `frontend/ios/App/App/Info.plist` and add these keys (the app uses the
webcam for Tic-Tac-Face, the mic for audio notes / WebRTC calls, the camera for
the ZXing barcode scanner, and the photo library for uploads):

```xml
<key>NSCameraUsageDescription</key>
<string>Sneaky Social uses the camera for the Tic-Tac-Face game and barcode scanning.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Sneaky Social uses the microphone for voice notes and calls.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Sneaky Social lets you attach photos to stories, chats and your profile.</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Sneaky Social can save images you create or receive.</string>
```

## Step 3 — Open Xcode and configure signing

```bash
npx cap open ios
```

In Xcode, select the **App** target → **Signing & Capabilities**:
- **Team:** your Apple Developer team.
- **Bundle Identifier:** `com.david.sneakystuff` (must match App Store Connect).
- Leave **Automatically manage signing** on.
- Under **General**, set **Version** (e.g. `1.0.0`) and **Build** (e.g. `1`).

## Step 4 — Archive and upload to TestFlight

1. Top device selector → **Any iOS Device (arm64)**.
2. Menu **Product → Archive**.
3. When the Organizer opens → **Distribute App → App Store Connect → Upload**.
4. Accept the defaults (automatic signing) → **Upload**.

## Step 5 — Internal testing

1. App Store Connect → your app → **TestFlight**. Wait for the build to finish
   **Processing** (a few minutes).
2. You may get an **Export Compliance** prompt — the app uses standard HTTPS
   only, so answer accordingly (no proprietary encryption).
3. **Internal Testing** group → add yourself → install the **TestFlight** app on
   your iPhone and accept the invite. Internal testing needs **no** Apple Beta
   App Review, so it's available immediately.
4. Once you're happy, add **Katie** to the internal group (she needs to be an
   App Store Connect user, or use an external group later).

---

## On-device smoke test (do these first)

These are the spots most likely to behave differently in the native shell:

- **Login** → confirm the session sticks after closing/reopening (validates
  `CapacitorHttp` native cookie jar).
- **Images** → product thumbnails, hero carousel, stories, chat photos load
  (validates `/media` absolutization).
- **Uploads** → post a story / voice note / profile photo. ⚠️ See caveat below.
- **Camera/mic** → Tic-Tac-Face webcam + a voice note (validates the `https`
  scheme secure context).
- **Game netplay** → start an online Streets-of-Rage match (validates WebRTC +
  `/api` signaling reaching the VPS).

### ⚠️ Known caveat to watch: file uploads

`CapacitorHttp` patches `fetch`, and multipart `FormData` uploads through the
patched fetch have historically been flaky on some Capacitor versions. Your
uploads (`api.upload`) use `FormData`. If story/voice/photo uploads fail on
device while everything else works, that's this issue. Fixes, in order of
preference:
1. Update to the latest Capacitor 8 patch and re-test.
2. Use `@capacitor/filesystem` + the native uploader for the upload path only.
3. As a last resort, disable `CapacitorHttp` and switch session auth to a
   token (Authorization header) instead of cookies.

Tell me which way you want to go if it bites.

---

## Phase 2 (later, not needed for first TestFlight)

- **Native push (APNs):** add `@capacitor/push-notifications`, register the
  device token with your backend, and send via APNs instead of web-push. The
  web-push `PushToggle` will simply show "unsupported" on device until then.
- **App icon / splash:** `@capacitor/assets` to generate from a single source.
- **Status bar / safe areas:** fine out of the box (CSS already uses
  `env(safe-area-inset-*)`), tweak `@capacitor/status-bar` if desired.

---

## Re-deploying after any web change

Whenever you change the React/Vite app, refresh the native bundle and re-archive:

```bash
cd /Users/davidbell/Documents/projects/development/points-shop/frontend
npm run cap:sync     # build + cap sync ios
npx cap open ios     # then bump Build number, Archive, upload
```
