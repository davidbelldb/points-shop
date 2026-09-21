# Sneaky Social — native iOS app

A fully native SwiftUI client for the three features being rebuilt off the web
app: **Ducky Derby**, the **Crow tracker / forecast scroll** and **Messages**.
It talks to the same Fastify backend at `https://sneakypoints.com` and signs in
with the same `sneaky_session` cookie, so nothing server-side changes.

This is a **separate app** from the Capacitor build in `../frontend/ios` — its own
bundle id (`com.david.sneakysocial`), its own TestFlight record. The Capacitor app
is untouched and keeps working.

| | |
|---|---|
| Bundle id | `com.david.sneakysocial` |
| Team | `799WF8VK5C` |
| Minimum iOS | 26.0 |
| Devices | iPhone only, portrait (13 mini → 17 Pro) |

## Build

The Xcode project is **generated** — don't edit `.xcodeproj` by hand, and don't
commit it. Change `project.yml` and regenerate.

```bash
cd /Users/davidbell/Documents/projects/development/points-shop/ios-native
xcodegen generate
open SneakySocial.xcodeproj
```

Then pick a simulator (or your phone) and hit Run. Tests: `Cmd-U`.

From the command line:

```bash
cd /Users/davidbell/Documents/projects/development/points-shop/ios-native
xcodegen generate
xcodebuild -project SneakySocial.xcodeproj -scheme SneakySocial \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
xcodebuild -project SneakySocial.xcodeproj -scheme SneakySocial \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test
```

## What's here (phase 1)

```
SneakySocial/
  App/       SneakySocialApp, RootView (loading → login → tabs)
  Core/
    Networking/  APIClient (cookie session, retries, media absolutizing)
                 SessionStore (@Observable, /auth/me + login/logout)
    Models/      Account
    Design/      Theme (palette + hex init), Haptics
  Features/
    Auth/        LoginView
    Shell/       Placeholder tabs — each calls its feature's real endpoint as a
                 connectivity check
Tests/         Swift Testing suite for decoding + media paths
```

Sign in with the same username/password as the web app. Each tab runs one live
API call on appear, so if all three show green the session, TLS and decoding are
all good and phase 2 can start.

## Roadmap

See `../NATIVE_IOS_PLAN.md`.
