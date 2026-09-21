# Sneaky Social — Native iOS App Plan

A **fully native SwiftUI app** recreating three features from the web app:
**Ducky Derby**, the **Crow forecast scroll** (tracker + reader + scheduled forecast)
and **Crow messaging**. Built as a separate Xcode project alongside the existing
Capacitor shell, talking to the same Fastify/Postgres backend on the Hetzner VPS.

| Decision | Choice |
|---|---|
| Project shape | Separate new Xcode project (`ios-native/`), Capacitor app untouched |
| Rendering (derby) | SwiftUI `Canvas` + `TimelineView` |
| Map (crow tracker) | Google Maps iOS SDK (keeps the Marauder's Map style JSON) |
| Minimum iOS | 26.0 |
| Devices | iPhone 13 mini → iPhone 17 Pro (design to 375pt, scale up) |
| Backend origin | `https://sneakypoints.com` |

---

## 1. What the native app has to reproduce

### 1.1 Ducky Derby
The server is the source of truth; the client is a **deterministic replay engine**.

| Endpoint | Returns |
|---|---|
| `GET /api/games/ducky/config` | colours, race_duck_count, buoy/iceberg settings, banners, phrases, commentary, intro (+ night variants) |
| `GET /api/games/ducky/form` | per-duck runs/wins/recent placings (1 = won, 0 = DNF) |
| `POST /api/games/ducky/lineup` | `lineup_id`, `ducks[]` (ord, name, colours, odds_num/den), balance |
| `POST /api/games/ducky/race` | `winner_ord`, `finish_ms{}`, `whirlpools{}` (obstacle list per duck), `sink`, stake/payout/won, balance |

Obstacles are an `at`-sorted list per duck: `whirl` (circular drift, `loops`),
`buoy` (bump, `durationMs`), `pad` (lily-pad leap, `boost`/`boostMs`) and
`iceberg` (`outcome: drown | boost`). Pauses and leaps are **baked into `finishMs`**,
so `duckState(elapsed, finishMs, obstacles)` and its inverse `progressToTime()`
port to Swift essentially line for line.

Presentation to preserve: side-scrolling camera anchored on the leader
(`COURSE_LEN 2.5`, `ANCHOR 0.4`, `SPREAD 235`), 3-2-1-GO countdown, photo-finish
slow-mo (`SLOW 0.4` when 1st and 2nd are within 650ms) with camera flash,
confetti, sinking duck, bread lure on a wire, pole banners, scrolling grass,
speech bubbles, a two-line commentary ticker with `{duck}` token substitution,
day/night palettes, and the form guide.

### 1.2 Crow forecast scroll
* `backend/src/modules/scrolls/forecast.js` fetches Open-Meteo and renders a fixed
  3-line, ≤70-char body (`Forecast Today: Overcast` / `H:26, L:16, Uv:8` / `0%`).
  Scheduler runs server-side every 60s against `forecast_settings`. **No client work** —
  the forecast simply arrives as a scroll.
* Flights: haversine distance → `flight_seconds` (crow_speed_kmh × speed_multiplier,
  clamped). `GET /api/scrolls/active-flight` every 5s; position is interpolated from
  `started_at`/`arrives_at` against a local 100ms clock, so motion stays smooth between polls.
* `GET /api/scrolls/perch-scrolls` — scrolls held by perched crows, grouped by
  destination, pooled into one crow per location with a count badge.
* Reader: parchment sprite, `scroll_font` (Cinzel), from/sent header, body, destination
  + distance footer, wax-seal close. Reading a message scroll deletes it; the forecast perches all day.
* Compose: Nominatim geocoding client-side, flight-time preview, `POST /api/scrolls`.

### 1.3 Crow messaging
`GET /api/messages` polled at 8s (no sockets — keep polling, add push for arrival).
Message kinds are encoded in the body string:

| Body | Kind |
|---|---|
| `__poll__:{"question","options"}` | poll with `PUT /:id/vote` |
| `__secret__:…` | tap-to-reveal (`PUT /:id/reveal`, recipient only) |
| `__nudge__` | screen shake + haptic |
| `__rain_twirl__` / `__rain_popcorn__` / `__rain_duck__` | 3D rain overlay |
| `/media/…` or `https://…` | photo / audio note |

Plus reactions (whitelist: `heart 😂 💜 🍆 🫦 😲`), sparkle, typing indicator
(`PUT /api/messages/typing`), edit, delete, story replies and slider responses.

### 1.4 Auth
`sneaky_session` httpOnly cookie from `POST /api/auth/login`. Maps directly onto
`URLSession` + `HTTPCookieStorage` — **no backend auth changes needed**.

---

## 2. Project layout

```
points-shop/ios-native/
  project.yml                     # XcodeGen — regenerates the .xcodeproj
  SneakySocial/
    App/          SneakySocialApp.swift, RootView.swift, AppEnvironment.swift
    Core/
      Networking/ APIClient.swift, Endpoints.swift, Session.swift
      Models/     Account, Duck, Race, Obstacle, Scroll, Flight, Message
      Design/     Theme.swift, Fonts.swift, Haptics.swift, Sounds.swift
    Features/
      Derby/      DerbyView, DerbyViewModel, RaceEngine, TrackCanvas,
                  BettingSheet, CommentaryTicker, FormGuideView
      Crow/       CrowTrackerView, GoogleMapView (UIViewRepresentable),
                  FlightAnimator, ScrollReaderView, ScrollComposeView
      Messages/   MessagesView, MessageRow, Composer, MessageKind,
                  ReactionBar, TypingIndicator
  Resources/      duck + night_duck sprites, /scrolls art, Cinzel + Imperial fonts,
                  Knock.caf / Doorbell.caf, map style JSON
```

`RaceEngine.swift` is pure value-type Swift with no UIKit import, so the race
maths is unit-testable without a simulator.

---

## 3. Phases

**Phase 0 — prerequisites (David)**
1. Xcode 26 + command line tools.
2. `brew install xcodegen`.
3. New bundle id (proposed `com.david.sneakysocial`) in the Apple Developer portal
   and App Store Connect, same team `799WF8VK5C`.
4. Google Maps iOS SDK API key restricted to the new bundle id.

**Phase 1 — shell** · XcodeGen spec, APIClient with cookie session, login screen,
tab shell, points-balance header, theme + fonts. Verified against the live API.

**Phase 2 — Ducky Derby** · `RaceEngine` port + unit tests against known fixtures,
then `TimelineView`/`Canvas` track, betting sheet, countdown, obstacles, sink,
photo finish, confetti, commentary, form guide, day/night.

**Phase 3 — Crow** · Google Maps wrapper with the Marauder's style, flight
interpolation, perched crows with count badges, scroll reader, composer with
Nominatim + flight preview. Forecast scrolls render through the same reader.

**Phase 4 — Messaging** · list + composer, all body kinds, reactions, sparkle,
typing, edit/delete, media. (Rain overlay deferred — SpriteKit particles later.)

**Phase 5 — push + Live Activities** · Register APNs for the new bundle id,
port `CrowActivityAttributes` / `CrowWidgetLiveActivity` into a widget extension.

**Phase 6 — device matrix** · iPhone 13 mini (375pt, no Dynamic Island),
standard iPhone, 17 Pro (120Hz ProMotion, Dynamic Island).

---

## 4. Backend changes required

Small, and only from phase 5 onwards. The backend currently assumes **one iOS app**:

* `backend/src/config.js:26` — `apns.bundleId` is a single value
  (`APNS_BUNDLE_ID`, default `com.david.sneakystuff`) used as the `apns-topic`
  for alerts (`apns.js:334`, `:398`), for the Live Activity topic
  (`apns.js:171`) and in the broadcast-channel paths (`apns.js:213`, `:244`, `:278`).
  A second bundle id means making that per-app rather than global.
* `db/init/130_apns_tokens.sql` — `apns_tokens` has no app column, and
  `apns.js:316`/`:376` select `ORDER BY updated_at DESC LIMIT 1`. With both apps
  installed, **whichever registered last would receive every push** and the other
  would go silent. Needs an `app` column and per-app token selection.
* `scrolls` Live Activity `la_channel_id` is a per-app broadcast channel, so the
  native app needs its own.

Phases 1-4 need **no backend changes at all** — every endpoint already exists.

## 5. Risks / watch items

* **`context.md` says Express; the backend is Fastify.** Worth correcting there.
* Canvas image drawing needs `context.resolve(Image(...))` cached outside the draw
  loop, or the derby will drop frames with 10 ducks plus scenery.
* Google Maps SDK adds ~10MB to the binary and needs its own key — MapKit is the
  fallback if that's unwelcome, at the cost of the parchment style.
* Two apps on one device both holding a `sneaky_session` cookie is fine (separate
  cookie jars), but impersonation/admin state won't be shared between them.
* iPhone 13 mini at 375pt is the binding constraint for the derby track height
  (10 lanes × 15pt gap + banks) — lane gap may need to shrink below 10 ducks.

---

## Status — 21 Sep 2026

### Done
- **Phase 1 — shell.** XcodeGen project in `ios-native/`, `APIClient` on the shared
  cookie jar (`sneaky_session`), login, tab shell, points badge. Verified against
  the live API on a simulator.
- **Phase 2 — Ducky Derby.** `RaceEngine` port (deterministic replay, photo-finish
  slow-mo), `Canvas` + `TimelineView` track with obstacles, sinking, confetti,
  commentary ticker, speech bubbles, form guide, day/night. 29 unit tests.
- **Derby admin plane.** Every setting from `AdminDuckySection.jsx`: colours,
  counts, iceberg sizing, per-duck name/colours/odds/bench, and all seven text
  lists. Lives in an admin-only tab.
- **Race feel.** Event-keyed haptics (bump, sink, shutter, win/lose) built from
  the same determined result. `SoundPlayer` wired; only `caw.mp3` exists so far —
  drop `race_start` / `quack` / `splash` / `cheer` / `groan` into
  `ios-native/SneakySocial/Resources/` and they play with no code change.
- **Betting.** Quick-stake chips, remembered stake, tappable form guide.
- **Accessibility.** Reduce Motion, VoiceOver commentary announcements,
  Dynamic Type on the picker.
- **Dark mode toggle.** App-wide, remembered on device, drives the night scene.
- **Multi-user (backend + web).** Explicit recipients for messages and scrolls,
  `GET /api/messages/partners`, notification fan-out to everyone, web
  conversation picker. `findOtherUser` kept as the no-recipient fallback.

### Deliberately not done
- Icebergs are night-only **client-side**; the server still generates their
  effects in daylight, so a duck can sink with no visible cause. Proper fix is a
  `night` flag on `POST /api/games/ducky/lineup`.
- Four 1:1 features still pair you with Katie and ignore George: WebRTC game
  netplay (`rtc.routes.js`), the On My Way live viewer, the Dirdle widget's
  partner status, and the "Invite {name}" labels on calendar and notes. Each
  needs a pick-a-person decision rather than fan-out.

### Next
1. **Kid-friendly derby variant.** Decided: derby only for now; keeps the points
   staking exactly as-is; content scoped by a `variant` column
   (`'original'` / `'kids'`) on the ducky content tables, with the native app
   requesting `kids`, the web app defaulting to `original`, and a variant
   switcher in the admin plane.
2. **Phase 3 — Crow tracker.** Needs the Google Maps iOS SDK as a Swift Package
   and an API key restricted to `com.david.sneakysocial`.
3. **Phase 4 — Messages.** Build against the new partner-aware endpoints.

### Working notes
- `xcodegen generate` after any change that **adds** a file — a new file is
  invisible to Xcode until then.
- The Linux VM Claude works in can't run Xcode, Swift, or the frontend build
  (macOS native binaries in `node_modules`).
