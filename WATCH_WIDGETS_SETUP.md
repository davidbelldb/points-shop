# Sneaky Watch Widgets — Xcode runbook

Adds Apple Watch versions of the rectangular widgets. They show as **Smart Stack
tiles** (swipe up on the face) and can be pinned to a **watch face** as a large
rectangular complication — same `accessoryRectangular` widget either way.

The Watch can't run the Capacitor app, so this is native SwiftUI. All the code is
written; the target creation below is the part only Xcode can do.

## What was added (code)

**iOS side**
- `ios/App/App/WatchTokenBridge.swift` — sends the widget token to the watch over
  WatchConnectivity.
- `WidgetBridgePlugin.swift` — now also forwards the token to the watch whenever
  it's set (already wired into the login sync; no JS change).

**Watch side**
- `ios/App/SneakyWatch/SneakyWatchApp.swift` — minimal watch app; receives the
  token and writes it to the watch's App Group.
- `ios/App/SneakyWatchWidget/SneakyWatchWidgets.swift` — the two rectangular
  widgets (calendar next-event + partner Dirdle).
- Reuses `ios/App/CrowWidget/SneakyWidgetShared.swift` (models / API / theme) —
  this file must also be a member of the **watch widget** target.

## Data flow

Phone mints the token on login → `WidgetBridgePlugin` stores it (iOS App Group)
**and** hands it to `WatchTokenBridge` → WatchConnectivity delivers it to
`SneakyWatchApp` → it writes it into the **watch** App Group → the watch widgets
read it and call the API themselves (over the watch's connection / relayed via
the phone). No separate watch login.

## Steps in Xcode

1. **Create the watchOS App target**
   File → New → **Target…** → watchOS → **App** (name it `SneakyWatch`).
   - Interface: SwiftUI, Language: Swift.
   - When asked, embed it in the iOS **App** target.
   - Delete the auto-generated `ContentView.swift` / `…App.swift` for the watch
     (we provide `SneakyWatchApp.swift`), or leave them and instead add ours and
     remove the `@main` from the generated one — there must be exactly one `@main`
     in the watch app target.

2. **Create the watch Widget Extension target**
   File → New → **Target…** → watchOS → **Widget Extension** (name it
   `SneakyWatchWidget`). Uncheck "Include Live Activity". Embed in the
   `SneakyWatch` watch app when prompted. Remove its auto-generated widget
   `@main`/sample file (we provide `SneakyWatchWidgets.swift`, which has the
   `@main` bundle).

3. **Add our files to the right targets** (File Inspector → Target Membership)
   - `SneakyWatchApp.swift` → **SneakyWatch** (watch app) only.
   - `SneakyWatchWidgets.swift` → **SneakyWatchWidget** (watch widget) only.
   - `SneakyWidgetShared.swift` → tick **SneakyWatchWidget** in addition to its
     existing CrowWidgetExtension membership. (It's platform-agnostic — models,
     URLSession API client, theme.)
   - `WatchTokenBridge.swift` → **App** (iOS) only.

4. **App Group on the watch targets**
   Add capability **App Groups → `group.com.david.sneakystuff`** to BOTH
   `SneakyWatch` and `SneakyWatchWidget`. (Same identifier string as iOS; on the
   watch it's a separate physical container, which is fine.)

5. **WatchConnectivity** needs no capability — just make sure the iOS **App**
   target and the watch app both build. `WatchTokenBridge` and the watch app's
   delegate handle activation.

6. **Deployment target**: set the watch targets to watchOS 10+ (accessory
   widgets + Smart Stack). watchOS 26 is fine.

7. **Build & run the watch scheme** onto the paired Apple Watch (or the paired
   simulator). Then:
   - On the **iPhone**, open the app while logged in — that pushes the token to
     the watch. (Give it a few seconds; WatchConnectivity delivers in the
     background.)
   - **Smart Stack:** swipe up on the watch face → the Sneaky tiles appear (you
     may need to scroll / let the Smart Stack surface them, or add via the
     watch's widget picker).
   - **Watch face:** long-press the face → Edit → a rectangular complication slot
     → pick "Sneaky Calendar" or "Sneaky Dirdle".

## Notes / gotchas

- **Token timing:** the watch widgets show their empty state until the phone has
  delivered the token at least once. Opening the logged-in iPhone app triggers
  it. If they stay blank, confirm the App Group id matches in all three places
  (`WatchTokenBridge` uses application-context; the watch app writes to
  `group.com.david.sneakystuff`; the widget reads the same via
  `SneakyWidget.appGroup`).
- **Deep links:** taps open `sneakypoints.com/calendar` /
  `/games/dirty-wordle`. On the watch these hand off to the iPhone. Same
  universal-link caveat as the phone widgets — if it opens the browser instead of
  the app, we switch to a `sneaky://` scheme.
- **First compile is the real test** — I can't build watchOS here, so if Xcode
  flags anything (most likely an API availability nit), paste it and I'll fix it.
- The iOS phone widgets are unaffected by any of this.
