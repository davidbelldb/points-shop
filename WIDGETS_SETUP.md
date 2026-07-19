# Sneaky Widgets — Xcode integration runbook

Everything code-side is written. This covers the Xcode/Apple-Developer steps
that can only be done in the IDE (target membership, the App Group capability,
signing). Do these once; after that, `npx cap sync ios` + Archive is the loop.

## What was added

**Backend (already live)**
- Bearer auth on the `onRequest` hook (accepts `Authorization: Bearer <token>`).
- `POST /api/widget/token` — mints a 400-day session token (reuses `sessions`).
- `GET /api/widget/calendar`, `GET /api/widget/dirdle` — compact widget payloads.

**Web app**
- `src/lib/widgetBridge.js` — mints the token on native login and hands it to
  the plugin; `reloadWidgets()` / `clearWidgetCredentials()` helpers.
- Wired into the native-login effect in `main.jsx`.

**Native (needs the Xcode steps below)**
- `ios/App/App/WidgetBridgePlugin.swift` — Capacitor plugin (app target).
- `ios/App/CrowWidget/SneakyWidgetShared.swift` — models, API client, theme.
- `ios/App/CrowWidget/SneakyCalendarWidgets.swift` — small + medium + lock.
- `ios/App/CrowWidget/SneakyDirdleWidget.swift` — Dirdle lock widget.
- `CrowWidgetBundle.swift` now vends `SneakyCalendarWidget` + `SneakyDirdleWidget`.
- `MainViewController.swift` registers `WidgetBridgePlugin`.

## Data bridge — note

I used an **App Group + shared `UserDefaults`** (group `group.com.david.sneakystuff`)
to pass the token from app → widget, rather than the Keychain I first mentioned.
It's the same one-capability setup on both targets but far simpler and less
error-prone, and the token is a revocable, read-only session token, so it's a
fine place for it. If you'd rather it live in the Keychain later, we can switch.

## Steps in Xcode

1. **Open the workspace**
   `cd frontend && npx cap sync ios && npx cap open ios`

2. **Add the new files to the right targets** (Xcode won't auto-pick them up if
   they were added on disk). In the Project navigator, right-click → *Add Files
   to "App"…*, select each file, and set **Target Membership** (File Inspector,
   right pane) exactly:
   - `WidgetBridgePlugin.swift` → **App** target only.
   - `SneakyWidgetShared.swift`, `SneakyCalendarWidgets.swift`,
     `SneakyDirdleWidget.swift` → **CrowWidgetExtension** target only.
   (If they already appear in the navigator after `cap sync`, just verify the
   Target Membership checkboxes match the above.)

3. **Add the App Group capability to BOTH targets**
   - Select the **App** target → *Signing & Capabilities* → **+ Capability** →
     **App Groups** → add `group.com.david.sneakystuff`.
   - Select the **CrowWidgetExtension** target → same thing, tick the **same**
     group `group.com.david.sneakystuff`.
   Both `.entitlements` files should now list that group. The string must match
   the constant in `SneakyWidgetShared.swift` and `WidgetBridgePlugin.swift`.

4. **Signing**
   With automatic signing on, Xcode registers the App Group with your team on
   first build. If you sign manually, add the App Group to the App IDs in the
   Apple Developer portal and regenerate the provisioning profiles.

5. **Deployment target**
   The widget extension is iOS 16.1 — good for the lock-screen (accessory)
   families. The one iOS-17-only API (`containerBackground`) is already guarded
   with `#available`, so it builds and runs on 16.1.

6. **Build & run on a real device (or iOS 16+ simulator)**
   - Log in to the app first — that's what mints and stores the token. Without a
     logged-in session the widgets show their empty/placeholder state.
   - Home screen: long-press → **+** → search "Sneaky Calendar" → add the
     medium (4×2) and/or small (2×2).
   - Lock screen: edit the lock screen → **Add widgets** → the rectangular slot
     → add "Sneaky Calendar" and "Sneaky Dirdle".

## Deep links

The widgets open `https://sneakypoints.com/calendar` and
`/games/dirty-wordle` via `widgetURL`. Your app already has
`applinks:sneakypoints.com` (associated domains). Verify your
`apple-app-site-association` file covers those paths so taps open the app rather
than Safari. If AASA doesn't cover them, the simplest fix is a custom scheme
(e.g. `sneaky://calendar`) handled in `AppDelegate` — say the word and I'll wire
it.

## Optional: instant refresh

Timelines refresh hourly (calendar) / half-hourly (dirdle) and at midnight, and
on login. For instant updates you can call `reloadWidgets()` from
`src/lib/widgetBridge.js` right after:
- creating/editing a calendar event (in `CalendarPage`/`BasketContext` flow), and
- saving a Dirdle result (`DirtyWordlePage`).
Tell me and I'll add those two one-line hooks.

## Token hygiene

Widget tokens are rows in `sessions` with a 400-day expiry. Revoke by deleting
the row. On logout the app calls `clearWidgetCredentials()` to drop the shared
copy (add that call to your logout handler if you want the widgets to blank on
sign-out — currently only wired on login).
