# Native iOS Push (APNs) — Setup & Deploy

Adds native push to the Sneaky Social iOS app. Every notification your backend
already sends (chat, scrolls, calls, games, orders, scheduled/admin broadcasts)
now fans out to **both** web-push (website) and **APNs** (iOS app) through the
single `sendPush()` function — no per-feature changes needed.

## What changed in the code

| Area | File | Change |
|------|------|--------|
| DB | `db/init/130_apns_tokens.sql` | New `apns_tokens` table (device token ↔ account). |
| Backend | `src/config.js` | New `apns` config block (key id, team id, bundle id, base64 key, prod flag). |
| Backend | `src/modules/notifications/apns.js` | New. APNs sender over HTTP/2 with an ES256 JWT, built from Node built-ins only (no new dependency). Prunes dead tokens. |
| Backend | `.../notifications/push.js` | `sendPush()` now fires web-push **and** APNs (shared mute check, independent gating). |
| Backend | `.../notifications/notifications.{routes,repo}.js` | `apns-register` / `apns-unregister` endpoints + repo fns; broadcast recipients now union both device tables. |
| Backend | `src/jobs/index.js` | Scheduled-push recipients union both device tables. |
| Frontend | `src/lib/nativePush.js` | New. Requests permission, registers, sends token to backend, deep-links on tap. No-op on web. |
| Frontend | `src/main.jsx`, `AuthContext.jsx`, `api.js`, `package.json` | Mounts registration after login; unregisters token on logout; `@capacitor/push-notifications` added. |

---

## Step 1 — Create an APNs Auth Key (.p8) at Apple  *(~2 min, one-time)*

1. Go to **developer.apple.com** → **Certificates, Identifiers & Profiles** → **Keys**.
2. Click **+** (Create a key). Name it e.g. `Sneaky APNs`.
3. Tick **Apple Push Notifications service (APNs)** → **Continue** → **Register**.
4. **Download** the `.p8` file — you can only do this **once**. Keep it safe.
5. Note the **Key ID** (10 chars, shown on the key page).
6. Note your **Team ID** (top-right of the portal, 10 chars).

## Step 2 — Add the Push capability in Xcode

1. `npx cap open ios`, select the **App** target → **Signing & Capabilities**.
2. Click **+ Capability** → add **Push Notifications**. (With automatic signing,
   this enables Push on the App ID and refreshes the provisioning profile.)
3. That's it — no AppDelegate edits needed; the Capacitor plugin wires the
   native registration callbacks for you.

## Step 3 — Put the key on the server

On your Mac, base64-encode the key onto one line:

```bash
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy   # copies the one-line value
```

Then on the **VPS**, add to `~/points-shop/.env` (see `.env.prod.example`):

```
APNS_KEY_ID=<your 10-char Key ID>
APNS_TEAM_ID=<your 10-char Team ID>
APNS_BUNDLE_ID=com.david.sneakystuff
APNS_AUTH_KEY_BASE64=<the base64 string>
APNS_PRODUCTION=true
```

> TestFlight and App Store builds use Apple's **production** APNs gateway, so
> keep `APNS_PRODUCTION=true`. Use `false` only for a dev build run from Xcode.

## Step 4 — Deploy backend (migration + rebuild)

See the deploy block in chat — it runs `db/init/130_apns_tokens.sql` and rebuilds
`backend` + `caddy`.

## Step 5 — Ship a new iOS build

```bash
cd /Users/davidbell/Documents/projects/development/points-shop/frontend
npm install          # pulls @capacitor/push-notifications
npm run cap:sync     # build + cap sync ios
npx cap open ios     # bump Build to 2, then Product → Archive → Upload
```

Bump the **Build** number (e.g. `2`) before archiving, or App Store Connect will
reject a duplicate.

---

## Testing it end-to-end

1. Install the new build from TestFlight, open it, **log in**. iOS shows the
   notification-permission prompt → **Allow**. (This registers the device token
   with your backend.)
2. Easiest test: from the website admin, use the **push broadcast** tool (it now
   sends to APNs devices too). Or have the other account send you a chat message.
3. Background the app — the banner should arrive. Tapping it deep-links to the
   `url` in the payload (e.g. the chat).

### Troubleshooting
- **No prompt / no token:** make sure the Push capability is in the build (Step 2)
  and you bumped the build number.
- **Token registers but nothing arrives:** check the `.env` values and that the
  backend was rebuilt; an invalid `.p8`/IDs leaves APNs silently disabled.
- **`BadDeviceToken`:** almost always the prod/sandbox mismatch — TestFlight needs
  `APNS_PRODUCTION=true`.
