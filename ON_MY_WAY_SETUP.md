# "On My Way" (OMW) — setup & runbook

A second Live Activity, built alongside the crow scroll one but as a **separate
ActivityKit type** so it can't regress scrolls. It tracks a traveller's **live
GPS progress** toward a fixed destination and shows a pixel cycling sprite at
each end of a dashed 3-node trail.

**v1 is an admin-only self-test.** Triggering loops the activity back to your own
device, so you can watch your own banner advance as you move. Katie sees nothing
until we flip the recipient later.

Copy shown on the banner:
- Title: **"{name} is on his way and will be with you soon"**
- Subtitle: **"Wait and save? I think not."**

---

## What was written (code — all done)

**Database**
- `db/init/149_on_my_way.sql` — `omw_destinations` (per-user target),
  `omw_trips` (live trip state), `omw_activity_tokens` (OMW push tokens, kept
  separate from the scroll `live_activity_tokens`). Seeds David → Blinco Grove.

**Backend**
- `src/modules/omw/omw.repo.js` — destinations, trips, GPS progress
  (`progress = 1 − remaining/total`), push-to-start + broadcast-channel updates,
  arrival + stale-trip sweep. Reuses the APNs helpers.
- `src/modules/omw/omw.routes.js` — `/api/omw/*` (destinations, my-destination,
  live-activity-token, trips start/ping/end). Registered in `modules/routes.js`.
- `src/modules/notifications/apns.js` — added `omwContentState()` and an
  `attributesType` param to `sendLiveActivityPush()` (defaults to the crow type,
  so scrolls are untouched).

**Web app**
- `src/lib/omwActivity.js` — token bridge + geolocation tracker (native
  background pings + foreground `watchPosition` fallback).
- `src/lib/api.js` — `api.omw.*`.
- `src/components/omw/OmwTestPanel.jsx` — the panel on `/new-chat` **below the
  scrolls area**. Handles the `?omw=start` quick-action deep link.
- `src/pages/AdminOmwSection.jsx` + `AdminPage.jsx` — the **On My Way** admin
  block to set each person's destination (Nominatim search, same as forecast).
- `src/main.jsx` — `enableOmwPush()` wired into the native-login effect.

**Native (needs the Xcode steps below)**
- `ios/App/App/OmwActivityAttributes.swift` — shared contract (App **and**
  widget targets).
- `ios/App/App/OmwActivityPlugin.swift` — Capacitor plugin: push-token capture +
  `CLLocationManager` background location, emitting `omwPing` events.
- `ios/App/CrowWidget/OmwLiveActivity.swift` — the widget (reuses `DashedLine` /
  `WaypointNodes` from the crow widget file).
- Registered in `CrowWidgetBundle.swift`, `MainViewController.swift`,
  `AppDelegate.swift`.
- `Info.plist` — `location` background mode, always-location usage string, and an
  **"On My Way"** Home-screen quick action → `/new-chat?omw=start`.
- `ios/App/CrowWidget/Assets.xcassets/david_cycle_00.imageset/` — empty image
  set scaffold; **drop your sprite PNG in (see step 4).**

---

## Steps in Xcode (the parts only the IDE can do)

1. **Sync + open**
   `cd frontend && npx cap sync ios && npx cap open ios`

2. **Add the new Swift files to the right targets** (File Inspector → Target
   Membership — Xcode won't auto-add on-disk files):
   - `OmwActivityAttributes.swift` → **App** *and* **CrowWidgetExtension** (both,
     exactly like `CrowActivityAttributes.swift`).
   - `OmwActivityPlugin.swift` → **App** only.
   - `OmwLiveActivity.swift` → **CrowWidgetExtension** only.

3. **Background Location capability**
   - App target → *Signing & Capabilities* → **+ Capability → Background Modes**
     → tick **Location updates**. (The `Info.plist` already lists the mode and the
     usage strings; the capability just flips the entitlement.)

4. **Drop in the cycling sprite(s)**
   In the Project navigator open **CrowWidget → Assets.xcassets →
   `david_cycle_00`** and drag your pixel cycling PNG into the image well (or add
   more image sets and rename the `cycleLeft` / `cycleRight` constants at the top
   of `OmwLiveActivity.swift` if you want a distinct departing vs waiting frame).
   Until a PNG is present the sprite simply renders blank — nothing breaks.

5. **Build & run on a real device** (background GPS + Live Activities need
   hardware; the Simulator works for the UI via *Features → Location → City
   Bicycle Ride*).
   - Log in (mints the OMW push-to-start token).
   - iOS will prompt for Location — choose **Allow While Using**, then when it
     asks again after a trip starts, **Change to Always** so it keeps advancing
     with the app closed.

---

## How to test end-to-end

1. **Admin → On My Way**: confirm your destination (Blinco Grove) — nudge the
   coordinates if the seed isn't spot-on. Set Katie's (Bishops Court) too.
2. Open **/new-chat** → the **On My Way · Test Harness** panel (below scrolls) →
   tap **"I'm on my way"** (or long-press the app icon → **On My Way**).
3. The Live Activity appears on your lock screen / Dynamic Island. As your
   location changes, the trail fills and the three nodes pop; within ~80 m of the
   destination it flips to **"{name} has arrived"** and dismisses after a few
   seconds.
4. No bike? Point your destination somewhere within a few hundred metres, or use
   the Simulator bicycle route.

---

## Next steps (after the self-test signs off)

- **Two travellers / send to Katie.** Flip `viewer_id` off the self-loop in
  `omw.repo.js` (`startTrip`) so David's trip pushes to Katie's device, and add
  the traveller-selecting **"David — OMW" / "Katie — OMW"** quick actions.
- **Siri / Apple Watch phrase.** Add an **App Intent** (`OmwIntent`) so "Hey
  Siri, I'm on my way" starts a trip from the watch. This is a native App Intents
  target — a follow-up once the core flow is proven.
- **Colour + sprite polish.** Tweak `omwBg` and the sprite constants in
  `OmwLiveActivity.swift`.
