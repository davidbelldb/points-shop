# Sneaky Social — Native Polish & New Games Plan

**Goal:** iOS-native feel (Apple structural polish + spring physics + haptics) across three tracks: **page transitions**, **micro-interactions**, and **new games**. Built on what's already here — framer-motion 11, `lib/haptics.js`, Capacitor iOS shell — so most of this is wiring existing tools into everyday UI, not new dependencies.

**Guardrails (from CLAUDE.md):** all point mutations via isolated DB transactions; Tailwind utility classes + `dark:`; new SQL as sequential `db/init/064_…` onward; each shipped phase ends with the two deploy blocks.

---

## Cross-cutting foundation (build first — everything else leans on it)

1. **`lib/motion.js`** — a single source of iOS spring/easing tokens so nothing feels ad-hoc.
   - Springs: `snappy` (buttons), `gentle` (sheets/pages), `bouncy` (celebrations).
   - iOS cubic-bezier for CSS-only cases: `cubic-bezier(0.32, 0.72, 0, 1)` (the iOS sheet curve).
   - A `useReducedMotion()` passthrough so every animation degrades to a cross-fade.
2. **`prefers-reduced-motion`** block in `index.css` — kills transforms, keeps opacity. Accessibility + App Store good behaviour.
3. **`<Pressable>` component** (`components/Pressable.jsx`) — `motion.button` that scales to 0.96 on press with the `snappy` spring and fires `hapticTap()`. This becomes the default tappable across the app and is where "everything feels alive" comes from.

---

## Track 1 — Page transitions (iOS push/pop + sheets)

**Where:** `App.jsx` (`<Outlet/>`), `main.jsx` (router), new `components/PageTransition.jsx`.

- **Push/pop navigation.** Wrap the outlet in `AnimatePresence` keyed on `location.pathname`. Use `useNavigationType()` (PUSH/POP/REPLACE) to pick direction: forward = incoming slides in from the right while the outgoing page parallax-shifts ~20% left and dims; back = the mirror. This is the core "it feels like a real iOS app" moment.
- **Sheet-presented routes.** Detail/secondary routes (`product/:id`, `basket`, `account/*`) present as iOS sheets — slide up from the bottom over a dimmed, slightly scaled-back parent, with the iOS sheet curve and a grabber. Swipe-down-to-dismiss reusing the existing edge-swipe touch patterns in `App.jsx`.
- **Shared-element transitions.** framer-motion `layoutId` so a card morphs into its detail: games card → game page, product card → `ProductPage`, story thumb → viewer. High-end, Instagram/Apple-Photos-grade effect.
- **Reduced-motion + native back.** Honour the existing Capacitor hardware/edge-back so animated transitions never trap navigation.

---

## Track 2 — Micro-interactions (the "big-tech polish" layer)

- **Animated points balance (highest impact).** The header shows `{points} pts` statically. Make it a spring count-up on change, with a brief scale-pop + glow and `hapticSuccess()` on increase. Points are the whole app's currency — this is the single most-felt upgrade. New `components/AnimatedPoints.jsx` + a `usePrevious` diff.
- **Add-to-basket fly animation.** Product image ghosts an arc into the basket icon; badge does an iOS spring bounce; `hapticTap()`. Wire in `ProductPage` / `BasketContext`.
- **Nav selection pill.** SideNav / MenuDrawer active item uses a `layoutId` highlight that slides between items (iOS tab-bar morph) instead of a static class swap.
- **Toasts & notifiers** (`ToastHost.jsx`, `InAppNotifier.jsx`) — spring-in from top with a translucent blur backing, auto-stack, swipe-to-dismiss.
- **Pull-to-refresh** (`PullToRefresh.jsx`) — rubber-band resistance curve + iOS-style circular determinate spinner that fills with drag distance; `hapticSelect()` at the trigger threshold.
- **Skeleton shimmer** (`Skeleton.jsx`) — replace with a diagonal shimmer sweep; use it on lazy route fallbacks instead of the plain "Loading…" text in `main.jsx`.
- **Long-press context menu** — iOS peek/haptic on product & game cards (Share / Add / Favourite).
- **Sound layer** — extend `lib/sounds.js` with a small tasteful set (tap tick, success chime, coin, whoosh), respecting a mute setting; pair each with its haptic.

---

## Track 3 — New games (each: backend module + atomic ledger + migration + page + admin)

Every game follows the existing pattern: `backend/src/modules/games/<game>.routes.js` + `.repo.js` with **isolated transactional** point mutations, a `db/init/064+_*.sql` migration, a lazy-loaded `pages/<Game>Page.jsx` in `main.jsx`, and an `Admin<Game>Section.jsx`. Recommended build order by impact-to-effort:

1. **Scratchcard** *(build first — pure tactile flair, no physics).* Canvas scratch-to-reveal driven by pointer/touch, `hapticSelect()` per scratch, `hapticParty()` on a win. Backend decides the prize server-side before reveal (anti-exploit); frontend only reveals it. Daily free card + buy-with-points cards.
2. **Plinko** *(leverages existing `@react-three/rapier` + three.js already in the bundle).* Drop a chip through pegs into payout slots; server pre-rolls the outcome and the physics animates toward it. Extremely satisfying, reuses the 3D stack the games already ship.
3. **Daily Mystery Box / streak** *(retention driver).* One free box a day, escalating streak rewards, iOS spring box-open with light burst. Ties directly into the ledger and gives a reason to open the app daily.

Fast-follow ideas if you want more: **Higher-or-Lower** (swipe card game, streak multiplier), **Sneaky Slots** (3-reel spring spinner), **Memory Match** (speed-scored pairs).

---

## Suggested delivery order (each ships independently with deploy blocks)

- **Phase 0:** `lib/motion.js`, reduced-motion CSS, `<Pressable>`. *(No DB.)*
- **Phase 1:** Page transitions (push/pop + reduced-motion). *(No DB.)*
- **Phase 2:** Animated points + add-to-basket fly + nav pill + toast/PTR/skeleton polish. *(No DB, unless a sound-mute setting is added.)*
- **Phase 3:** Sheet-presented routes + shared-element transitions.
- **Phase 4+:** Scratchcard → Plinko → Mystery Box (each its own migration + deploy).

---

## Open questions for you

1. **Motion intensity** — subtle-and-fast (Apple system apps) or expressive-and-springy (consumer apps)? Affects the spring constants in `lib/motion.js`.
2. **Sound** — want an audio layer at all, or haptics-only? If yes, default on or off?
3. **New games** — happy with the Scratchcard-first order, or is there one you want prioritised?
4. **Scope of Phase 1** — roll page transitions out app-wide at once, or pilot on a few routes (Home → Product → Basket) first?
