# Piles! — Build Plan & Prompt

A real-time, two-player set-collection card game for Sneaky Points, recreating *Piles!* (Lost Boy Entertainment, as on Board Game Arena) with an Indian clothing theme. This file is the full spec. Section 0 is the prompt for the build thread.

---

## 0. Prompt for the build thread

> Read `PILES_PLAN.md` in the repo root in full. It is the spec for a new game, **Piles!**. Don't rely on `context.md` for the backend: it's out of date (the backend is **Fastify 5**, not Express, and migrations now go past `183_…`). Read the code instead.
>
> **Before writing any code**, inspect and report back on:
> 1. How `backend/src/index.js` and `modules/routes.js` register route modules, and how `req.user` is populated from the session cookie (`findSession`).
> 2. How the two-player games are notification-driven: Tic-Tac-Face (`games.routes.js` `notify()` → `notifications` row + `sendPush`; `TicTacFacePage` polls state every 3 s) and Giftsweeper (same pattern, 4 s poll). Also `notifications/push.js` (web push + APNs) and `lib/nativePush.js` (tap → deep link).
> 3. How Cambs Rage does live PvP: the challenge ring (`cambs-rage.routes.js`, in-memory `pendingChallenges`, push to `?join=1`), the `/api/rtc/signal` relay, and `game/engine/NetplayManager.js` (WebRTC DataChannel, host-authoritative). §5.2 explains why Piles takes the challenge ring but not the DataChannel.
> 4. How `getPlayersFor` (`games.repo.js`) resolves me/opponent, and how admin impersonation works (`/api/admin/impersonate`, `effectiveAccountId` vs `actualAccountId`).
> 5. How the Tic-Tac-Face and Dirty Wordle leaderboards are built, so Piles' leaderboard follows the same pattern.
> 6. How Plinko is kept URL-only and admin-gated (`main.jsx` route, `PlinkoPage.jsx`, `plinko.routes.js`).
>
> Confirm or correct the assumptions in §2, then build in the order given in §11. Follow `CLAUDE.md`: complete files, and Tailwind with `dark:` support. **Every answer that changes the repo ends with three blocks:** (1) the Mac git push, (2) the Hetzner VPS pull and rebuild, with the migration pipe whenever a `.sql` file is added, and (3) the iOS block below whenever anything under `frontend/` changes, because the Capacitor app bundles the frontend:
>
> ```bash
> cd /Users/davidbell/Documents/projects/development/points-shop/frontend
> npm run cap:sync      # vite build + npx cap sync ios
> npx cap open ios      # Xcode: bump Build number → Product → Archive → Distribute → TestFlight
> ```
> No art: use the placeholder system in §8 until assets arrive.

---

## 1. Decisions (settled)

| Topic | Decision |
|---|---|
| Players | Exactly two: **Bad Goose** (David) and **Squishy** (Katie). The opponent is always the other account, resolved with `getPlayersFor` (as every other game does). |
| Invite | Same as Cambs Rage: "Play Piles" sends the opponent a push (`/piles?join=1`), and both land in the lobby. |
| Access | Hosted at **`/piles`**. No links in menus, the Games page, or the iOS app. **Only David (admin)** can open it, by direct link, for now. |
| Points | **None.** Piles doesn't touch `points_ledger`. Leaderboard stats only. |
| Extra features | Deferred. Build the base game only. |
| Theme | Indian clothing. All art, sprites and music are supplied later. Placeholders until then. |
| Ready-up | Both players must tap **Ready** in a lobby. Either can un-ready until both are ready. |
| Start | Both ready → server deals → **3-2-1 countdown** (can't be cancelled) → centre revealed → play. No actions are allowed during the countdown. |
| Backgrounding | Allowed. Nothing happens as long as the connection stays up. |
| Leaving | Explicit leave (Leave button, or navigating away from `/piles` in the app) → **immediate forfeit**. |
| Connection drop | No contact from a player's app for about **15 s** → **forfeit**. A short grace absorbs network blips. iOS will usually suspend the web view soon after backgrounding, so in practice long backgrounding will forfeit. That's accepted. |
| Lobby idle | If one player never readies, the lobby just stays open. No penalty. |
| Wrong declares | 3-second lockout from all actions, plus a visual penalty. |
| Game over | The server decides. **All remaining piles are revealed to both players** at `gameOver` (config flag `revealAllOnGameOver`, default `true`). |

---

## 2. What exists today (verified, re-confirm in the build thread)

- **Backend:** Fastify 5, ESM, `pg`. Modules live in `backend/src/modules/`, and games in `modules/games/`. No test runner is configured.
- **Auth:** `getEffectiveAccountId(req)` gives the account being played as, `getActualAccountId(req)` gives the real one, and `isAdmin(req)` checks `req.user.actualRole === 'admin'`. Admins can impersonate other accounts.
- **Two-user world:** `getPlayersFor(accountId)` in `games.repo.js` returns `{ me, other }` (with `name`, `photo_url`, `role`). `GET /api/games/players` exposes it.
- **Turn-based games are notification-driven.** On each move, Tic-Tac-Face and Giftsweeper write a `notifications` row and call `sendPush` (web push to the PWA + APNs to the iOS app, respecting mute). Tapping the push deep-links into the game through `lib/nativePush.js`. While the page is open, it polls its `/state` endpoint (3 s and 4 s) and calls `mark-read`.
- **Live PvP exists in Cambs Rage.** A challenge ring keeps an in-memory `pendingChallenges` map (60 s TTL) and pushes "Tap to Fight!" to `?join=1`. The two phones then handshake over the `/api/rtc/signal` REST relay (polled at 400 ms) and play over a **WebRTC DataChannel**, with the host phone running the simulation (`NetplayManager.js`). SneakyTime calls use the same relay.
- **There's no WebSocket or SSE server**, and Piles doesn't add one (see §5.2).
- **Leaderboards:** each game has its own (e.g. `GET /api/games/dirty-wordle/leaderboard`, `GET /api/games/tic-tac-face/leaderboard`). There's no shared leaderboard module.
- **Caddy:** `/api/*` is proxied to `backend:3001`. The basic-auth guard only covers `/admin*` and `/journal*`, so `/piles` isn't affected. A global `onRequest` hook already enforces admin on `/api/admin/*`.
- **Native networking:** on iOS, `api.js` calls `${PROD_ORIGIN}/api` through CapacitorHttp with the session cookie, so ordinary authenticated requests work as they do for every other game.
- **Precedent for gating:** Plinko is URL-only (`<Route path="plinko">`) and admin-gated both in the page and in its routes.

---

## 3. Rules (2 players)

### 3.0 Version 1: shapes deck
- **V1 uses 13 shapes, each in 4 colours, for 52 cards.** That's exactly one 2-player deck, so every game uses the whole catalogue and no selection is needed.
- A set is **4 cards of the same shape**, one in each colour. Colour is decoration only, so colour-blindness doesn't affect play.
- V1 shapes, in lookalike groups: **circle / oval**, **square / diamond** (narrow rhombus, not a rotated square), **pentagon / hexagon / octagon**, **5-point star / 6-point star**, **triangle**, **heart**, **crescent**, **plus**.
- V1 colours: 4 clearly distinct colours, chosen in the art.
- The shapes can be drawn as inline SVG, so V1 is fully playable with no supplied art. David's PNGs can replace them later through the same asset keys.
- The variant (§3.2) needs a 14th type, so it's **disabled in V1**.
- The Indian clothing catalogue below replaces the shapes in a later version. The engine must not care which catalogue it gets.

### 3.1 Cards & catalogue (later versions)
- The catalogue is a list of clothing types. Each type is a set of 4 cards: the same garment in 4 colourways.
- Some types are deliberate **lookalikes** grouped into families (e.g. kurta / kurti, jutti / mojari, salwar / churidar / patiala, sherwani / achkan / bandhgala). Telling them apart is the core skill.
- Entry shape: `{ typeId, family, label, assets: [a0, a1, a2, a3] }`. The catalogue lives in a JSON file so it can grow without code changes.

### 3.2 Deck
- Each game uses **13 types** (6 per player + 1). If the catalogue has exactly 13 types (V1), use them all. Otherwise selection should favour lookalike families: pick whole families first (when a family has ≥2 types), then fill with singles. The weighting is configurable.
- **Variant (config flag, off by default):** +1 type (14) and **8** cards in the centre instead of 4.

### 3.3 Deal
- Shuffle the 52 cards (or 56 with the variant). Each player gets **6 face-down piles of 4**. The remaining 4 (or 8) go to the centre, face-down.
- Re-shuffle if any pile starts as a complete set.
- The deal happens when both players are ready. The countdown then runs, and the centre is revealed at zero.

### 3.4 Play (simultaneous, no turns)
- **Hold:** a player holds at most one pile. They can only pick up a pile when holding none.
- **Put down:** only when the held pile has exactly 4 cards.
- **Discard:** move one card from the held pile to the centre, face-up. Only when the held pile has 4 cards.
- **Take:** move one centre card into the held pile. Only when the held pile has 3 cards.
- Discard and take are **separate actions**. A swap is a discard followed by a take, and the opponent can grab the discarded card in between.
- **No direct transfer between your own piles.** It goes through the centre: discard from A → take a replacement → put A down → pick up B → discard from B → take the card back.
- Players can never touch the opponent's piles.
- **Contention:** the server processes actions in the order it receives them. If both players take the same centre card, the first wins and the second gets `rejected: card_gone`. Their held pile stays at 3, so they take something else.
- **Centre invariant:** `centre.length === baseCentre + (number of players holding a 3-card pile)`. The centre always has 4–6 cards (8–10 with the variant), so a take is always possible. This must be a tested invariant.

### 3.5 Declare a set
- While holding a 4-card pile, the player taps **Complete**.
  - **Valid** (all 4 cards share a `typeId`): the pile is locked face-up, becomes public, and leaves play. The player's hand is now empty.
  - **Invalid:** a **3 s lockout** (every action rejected with `locked` until `lockedUntil`), a visual penalty, and the player keeps holding the pile.
- Completion is **never** auto-detected.

### 3.6 Win / end
- The **first player whose 6th set is validated wins** (`reason: 'sets'`).
- The opponent forfeits on an explicit leave (`reason: 'forfeit_left'`) or a dropped connection (`reason: 'forfeit_disconnect'`).
- The client never asserts a win.

---

## 4. Architecture

```
backend/src/modules/piles/
  engine/
    rules.js        # pure: (state, action, now) -> { state, events } | { rejection }
    deck.js         # catalogue selection, shuffle (injectable RNG), deal, re-deal check
    view.js         # viewFor(state, playerId) -> projected view; projectEvent(event, playerId)
    ids.js          # opaque per-game card tokens
    config.js       # tunables (lockout ms, presence timeout, poll hold, variant, revealAllOnGameOver, metrics)
    __tests__/      # node:test unit tests
  catalogue.json    # V1 shapes catalogue (see §3.0, §8)
  rooms.js          # in-memory GameRoom manager (one live game per pair), per-player event logs, long-poll waiters, presence sweep
  piles.routes.js   # REST: challenge ring, state snapshot, action, events (long-poll), leave, leaderboard, history
  piles.repo.js     # SQL for results/leaderboard
db/init/184_piles.sql
frontend/src/pages/PilesPage.jsx
frontend/src/components/piles/   # Board, PileRow, HandArea, CentrePile, Card, Lobby, Countdown, ResultModal, Leaderboard
frontend/src/lib/piles/          # long-poll client, optimistic reducer, assets map
```

### 4.1 Rules engine (pure)
- No Fastify, no DB, no timers, no `Date.now()`. Time is passed in as `now` so lockouts are testable.
- Signature: `apply(state, action, now) → { ok: true, state, events } | { ok: false, rejection: { code, clientSeq } }`.
- The state is treated as immutable (return new objects). The room may freeze state in dev to catch accidental mutation.
- Rejection codes: `not_playing`, `locked`, `already_holding`, `not_holding`, `bad_pile`, `pile_completed`, `wrong_count`, `card_not_in_hand`, `card_gone`, `not_your_pile`.

### 4.2 Server state model (true state, server only)

```js
{
  gameId, phase: 'lobby'|'countdown'|'playing'|'finished',
  config,                          // snapshot of config.js at deal time
  players: {
    [accountId]: {
      ready: false, connected: true,
      piles: [ { cards: [cardId…], completed: false } ×6 ],
      holding: null | pileIndex,
      lockedUntil: 0,
      stats: { swaps: 0, discards: 0, takes: 0, declaresOk: 0, declaresFailed: 0 }
    }
  },
  centre: [cardId…],               // face-up once playing
  cards: { [cardId]: { typeId, asset } },   // identity table, NEVER sent wholesale
  countdownEndsAt, startedAt, endedAt,
  winner, endReason, seq            // seq increments per accepted action
}
```

### 4.3 Actions (client → server)
`ready`, `unready`, `pickUp { pileIndex }`, `putDown`, `discard { cardId }`, `take { cardId }`, `declare`, `leave`. Each carries a `clientSeq` for optimistic rollback.

### 4.4 Events
- **Public** (sent to both players, then projected): `lobby { readyStates }`, `countdown { endsAt }`, `started { centre }`, `discarded { playerId, cardId, card }`, `taken { playerId, cardId }`, `pickedUp { playerId, pileIndex }`, `putDown { playerId, pileIndex }`, `setCompleted { playerId, pileIndex, cards[4] }`, `penalty { playerId, lockedUntil }`, `gameOver { winner, reason, reveal? }`.
- **Private** (owner only): `pileRevealed { pileIndex, cards[4] }` on pickup, and `accepted { clientSeq, seq }` / `rejected { clientSeq, code }`.

---

## 5. Information hiding & transport

### 5.1 Per-player projection
The server holds the true state. **Every** outbound message goes through `viewFor(state, playerId)` / `projectEvent(event, playerId)`. A client must never receive the identity of a card it isn't currently allowed to see, because Web Inspector and proxies can read the whole payload.

| What | Owner sees | Opponent sees |
|---|---|---|
| Centre cards | Face-up | Face-up |
| Held pile | Face-up | Hidden: card count and "holding pile N" |
| Other piles | Hidden (count only) | Hidden (count only) |
| Completed sets | Face-up | Face-up |
| At `gameOver` | Everything (if `revealAllOnGameOver`) | Everything (if `revealAllOnGameOver`) |

- Card IDs are **opaque random per-game tokens** (e.g. `c_8f3a`), never `shorts_tan_2`. `typeId`/`asset` are attached only when the card is visible to that player.
- Hidden piles are sent as `{ count, completed: false }` with **no card IDs**.
- When a pile is put down, the client drops its contents. On pickup, the server re-sends them with `pileRevealed`.
- `discarded` carries the card face (it's now public). `taken` carries only `cardId` (both players already saw it in the centre).
- **Required test:** for a full random game, serialise every message sent to player B and assert it contains no `typeId`/`asset` for any card B couldn't see at that moment.

### 5.2 Transport: reuse the existing patterns, server-authoritative
Piles follows the app's existing patterns. **Invites** use push notifications, as Tic-Tac-Face, Giftsweeper and Cambs Rage do. **Live play** uses ordinary authenticated REST plus **long-polling**, so updates arrive as soon as they happen.

**Why not Cambs Rage's WebRTC DataChannel?** It's host-authoritative. The host phone would hold the true state, every card in both players' piles, where Web Inspector can read it. That breaks the information-hiding rule in §5.1. The host would also always win contested centre cards, because its own actions have no network delay. Piles needs the server as referee.

**Why long-polling rather than a new WebSocket server?** It uses the same cookie-authenticated `api.js` path as every other endpoint (CapacitorHttp on iOS), needs no new dependency or ticket auth, and passes through Caddy unchanged. With only two players, the cost is negligible.

Endpoints (all under `/api/piles`, all gated by `canAccessPiles(req)`):

| Endpoint | Purpose |
|---|---|
| `POST /challenge` | Invite the opponent: store a pending challenge (in-memory, 60 s TTL, same as Cambs Rage) and `sendPush(other, { title: 'Piles! challenge from …', url: '/piles?join=1', tag: 'piles-challenge' })`. Also write a `notifications` row like `notify()` in `games.routes.js`. |
| `GET /challenge` · `POST /challenge/answer` · `POST /challenge/cancel` | Same shape as Cambs Rage. |
| `GET /state` | The full `viewFor(me)` snapshot plus the current `seq`. Used on page load, on rejoin and on resync. |
| `POST /action` | `{ type, …, clientSeq }`. Applied immediately in arrival order. Returns `{ accepted, seq, events }` (my projected events) or `{ rejected, code, clientSeq }`. |
| `GET /events?since=<seq>` | **Long-poll.** Returns my projected events after `since` straight away if there are any. Otherwise holds for up to `pollHoldMs` (20 s) and returns the moment a new event is written. Empty response on timeout, and the client re-polls immediately. If `since` is older than the retained log, returns `{ resync: true }` and the client calls `/state`. |
| `POST /leave` | Explicit leave (see §5.4). |
| `GET /leaderboard` · `GET /history` | §7. |

- **Gate:** `canAccessPiles(req)` returns `isAdmin(req)` for now (actual role). Since the gate checks the real account, David can test both sides: one device as himself, a second device as David impersonating Squishy. **The player identity is the effective account** (`getEffectiveAccountId`). Opening it to Squishy later is a one-line change.
- Check the CapacitorHttp request timeout on native. `pollHoldMs` must stay below it, and below any Caddy or Fastify timeout, which currently default to none.

### 5.3 Rooms, ordering, resync
- One `GameRoom` per pair (keyed by the sorted account-ID pair), held in memory like Cambs Rage's `pendingChallenges`. The backend is a single Node process, so actions are applied one at a time in arrival order. That gives the contention rule for free.
- Each room keeps a **per-player log of already-projected events** (ring buffer, e.g. the last 500) with the room `seq`, plus the list of open long-poll waiters. Writing an event wakes the waiters.
- **Rejoin:** `GET /state` gives the full snapshot, then the client resumes `/events?since=seq`.
- A backend restart loses live games. That's acceptable. Any unfinished game is discarded and not recorded.

### 5.4 Presence & forfeits
- A player is **present** while they have a long-poll open or have made any Piles request in the last `presenceTimeoutMs` (15 s). Since the client is always either polling or re-polling, an open game is never idle for long.
- A room sweep runs every 5 s. If a player isn't present:
  - `lobby`: mark not-ready and show "opponent offline". No penalty.
  - `countdown` / `playing`: **forfeit** (`forfeit_disconnect`).
- `POST /leave` (Leave button, or the page unmounting when navigating elsewhere in the app) → immediate forfeit (`forfeit_left`) if the game is in `countdown`/`playing`. In the lobby it just clears ready.
- iOS: don't send `leave` on `appStateChange` to background. Presence alone decides. If the web view is suspended, polls stop and the 15 s timeout applies.

---

## 6. Client

- **Route:** `<Route path="piles" element={<PilesPage />} />` in `main.jsx`, lazy-loaded, next to Plinko, with a comment saying it's URL-only and admin-gated. Not linked anywhere. The page shows a polite "not available" screen for non-admins (copy Plinko's pattern).
- **Renders the projected view only.** A local reducer applies your own actions **optimistically**, keyed by `clientSeq`, and rolls back on `rejected` (snap the card back, play a short shake, haptic error).
- **Layout (BGA-style, detailed layout from David's wireframes):** centre pile at the top (fanned cards over a cloth heap), then the opponent's row (6 slots, name, held-pile indicator), then my row (6 slots with an empty slot where the held pile came from), then my **hand area** with the held pile face-up and the **Complete** button.
- **Interactions (tap-first, drag later):** tap my pile → pick up. Tap a hand card → discard. Tap a centre card → take. Tap the empty slot → put down. Complete → declare. Disabled states follow the rules (e.g. Take is disabled unless the hand has 3 cards).
- **Feedback:** use the existing `lib/haptics.js` (take, set complete, penalty). The penalty shows a red overlay and a 3 s countdown ring on the hand. Opponent actions animate (card flies to/from the centre, their slot shows "holding").
- **Screens:** Lobby (both avatars, ready toggles, leaderboard link) → Countdown (3-2-1) → Board → Result modal (winner, reason, time, swaps, full reveal, rematch, which goes back to the lobby with both unready).
- Tailwind utilities with `dark:` variants throughout.

---

## 7. Leaderboard & persistence

`db/init/184_piles.sql`:

```sql
CREATE TABLE IF NOT EXISTS piles_games (
  id            UUID PRIMARY KEY,
  started_at    TIMESTAMPTZ NOT NULL,
  ended_at      TIMESTAMPTZ NOT NULL,
  winner_id     UUID NOT NULL REFERENCES accounts(id),
  loser_id      UUID NOT NULL REFERENCES accounts(id),
  end_reason    TEXT NOT NULL CHECK (end_reason IN ('sets','forfeit_left','forfeit_disconnect')),
  duration_ms   INTEGER NOT NULL,           -- from centre reveal to end
  stats         JSONB NOT NULL,             -- { [accountId]: { swaps, discards, takes, declaresOk, declaresFailed, sets } }
  config        JSONB NOT NULL              -- variant flags etc. at deal time
);
CREATE INDEX IF NOT EXISTS piles_games_ended_idx ON piles_games (ended_at DESC);
```

- Write once, at `gameOver`, in a single insert. **No points.**
- `GET /api/piles/leaderboard` returns per account: wins, losses, forfeits, best time to win (by `sets` only), average swaps per win, average failed declares. Plus head-to-head and the last 10 games.
- **Metrics are configurable:** `config.js` lists which stats appear and how they're labelled and ranked. Everything raw is stored in `stats` JSONB, so new metrics don't need a migration.
- A "swap" = one completed discard→take by the same player (count takes).

---

## 8. Assets & theme (placeholders)

- **Don't invent art.** All art is referenced through `lib/piles/assets.js`: a map from asset key to URL. Until real PNGs arrive, each key renders a placeholder card: a neutral rounded card with the garment `label`, a colourway swatch (index 0–3), and the key in small text.
- Asset key convention: `piles/cards/<typeId>_<0-3>.png`, `piles/ui/<name>.png`, `piles/bg/<name>.png`, `piles/sfx/<name>.mp3`, `piles/music/<name>.mp3`.
- **V1 `catalogue.json` = the 13 shapes in §3.0**, with `family` set for the lookalike groups and `assets` keyed `piles/cards/<shape>_<0-3>.png`. Render each card as an inline SVG of the shape in its colour until a PNG exists for that key.
- Later catalogue (not V1): about 20 Indian garment types in lookalike families (kurta, kurti, sherwani, achkan, bandhgala, salwar, churidar, patiala, dhoti, lungi, saree, lehenga, dupatta, nehru jacket, jutti, mojari, kolhapuri, bangles, etc.). David will replace or extend it with the real catalogue and art.
- Music and sound effects: hook points only (lobby loop, countdown, take, set complete, penalty, win/lose), muted by default and silently skipped while missing.

---

## 9. Config (`engine/config.js`)

```js
export default {
  typesPerGame: 13,
  centreBase: 4,
  variant: false,            // true → +1 type, centreBase 8 (needs ≥14 types; off in V1)
  countdownMs: 3000,
  lockoutMs: 3000,
  presenceSweepMs: 5000,
  presenceTimeoutMs: 15000,
  pollHoldMs: 20000,         // long-poll hold; keep below native/proxy timeouts
  eventLogSize: 500,
  challengeTtlMs: 60000,
  revealAllOnGameOver: true,
  familyWeighting: 0.7,      // share of types drawn from lookalike families
  leaderboardMetrics: ['wins','losses','bestTimeMs','avgSwaps','avgDeclaresFailed'],
};
```

---

## 10. Tests (`node:test`, no new test dependencies)

Add a `"test": "node --test src/modules/piles/engine/"` script to `backend/package.json`.

- **Catalogue-agnostic:** the engine passes the same suite with the 13-shape catalogue and with a larger 20-type fixture catalogue.
- **Deal:** 13 types × 4 = 52 unique cards; 6×4 per player + 4 centre; no pile starts complete; deterministic with a seeded RNG; the variant gives 14 types and 8 centre cards.
- **Legal flow:** pick up → discard → take → put down; swap counting.
- **Illegal actions:** every rejection code in §4.1, at least once.
- **Contention:** A and B both `take` the same card → first ok, second `card_gone`, B's hand stays at 3, and B can then take another card.
- **Centre invariant:** holds after every action in a random-play fuzz of 1,000 games.
- **Declare:** valid → completed, public, hand empty. Invalid (lookalike pile) → `penalty`, every action `locked` until `now ≥ lockedUntil`, then allowed again.
- **Win:** the 6th valid set → `gameOver { reason: 'sets' }`, and every later action → `not_playing`.
- **Forfeits:** a `leave` during play → `forfeit_left`. A disconnect handled by the room → `forfeit_disconnect`. A disconnect in the lobby → no game over.
- **Rooms (with an injected clock):** a player not present for `presenceTimeoutMs` during play → `forfeit_disconnect`, and in the lobby → only unready. A long-poll waiting on `/events` is woken by the opponent's action. A `since` older than the log → `resync`.
- **No countdown actions:** every play action during `countdown` → `not_playing`.
- **Projection leak test** (§5.1).

---

## 11. Build order

1. Report on §0 items 1–5 and confirm or correct §2.
2. Engine (`deck.js`, `rules.js`, `view.js`, `ids.js`, `config.js`) plus the full test suite, green.
3. `184_piles.sql`, `piles.repo.js`, leaderboard and history routes, all gated by `canAccessPiles`.
4. `rooms.js` and the live routes: challenge ring + push, `/state`, `/action`, `/events` long-poll, `/leave`, presence sweep, forfeits.
5. Frontend: long-poll client (`/events?since=` loop with resync), optimistic reducer, `PilesPage` with SVG shape cards and Lobby → Countdown → Board → Result. Handle `/piles?join=1` from the push deep link.
6. Two-device test: David on device 1, David impersonating Squishy on device 2, on web and iOS.

## 12. Out of scope (for now)
The Indian clothing catalogue and art (V1 is shapes), the 8-card variant, extra game features, points stakes, menu/Games/iOS links, opening access to Squishy, push notifications for "your opponent is ready", spectators, more than 2 players.
