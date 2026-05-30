# Project Context: Sneaky Social (Points Shop)

## 🚀 Tech Stack & Infrastructure
- **Frontend:** React (Vite SPA, Tailwind CSS with native `dark:` theme mode support). Progressive Web App (PWA) handled via `public/sw.js` and `public/manifest.webmanifest`.
- **Backend:** Node.js / Express API. Uses a modular, feature-driven folder structure inside `backend/src/modules/` co-locating repos and routing files.
- **Database:** PostgreSQL. Managed sequentially via raw SQL scripts inside `db/init/` (from `001_schema.sql` up to `063_story_views.sql`).
- **Deployment:** Containerized multi-service architecture (`docker-compose.yml` for local, `docker-compose.prod.yml` for production) sitting behind a Caddy reverse proxy on a Hetzner Cloud Ubuntu VPS.

---

## 📂 Project Architecture Map

### 1. Backend Core & Feature Modules (`backend/src/modules/`)
- **Accounts & Auth:** `accounts/`, `auth/`, `settings/`. Manages user sessions, profile details, theme selections, and the centralized user **Points Balance** ledger.
- **E-Commerce Shop:** `products/`, `basket/`, `discounts/`, `orders/`, `delivery/`. Core logic matching items to baskets, processing discount codes, checking inventory, and firing transactional receipts via `orders/emails.js`.
- **Engagement & Social:** * `chat/` & `audio/`: Real-time text messaging and audio notes featuring emoji reactions and inline message replies (`chat_reply_to_message.sql`).
  * `stories/`: Handles interactive Instagram-style stories with sticker metadata (`SliderSticker.jsx`), algorithmic content streams, and custom highlight configurations (`reels.repo.js`). Includes `backfill_thumbnails.js` utility.
  * `reviews/`, `notifications/`, `surveys/`, `tod/`: Community tools powering text/audio user reviews, localized web-push notifications (`push.js`), contextual user polling banners, and a Truth or Dare game module.
- **Interactive & Group Tools:** `rewatch/` modules integrated with external TVDB APIs to organize shared watchlists and handle invite authorization states.

### 2. Gamification Suite (`backend/src/modules/games/` & `wheel/`)
*All mini-games must tightly bind payout or loss actions directly to the centralized database points ledger using isolated transactional blocks.*
- **Ducky Derby:** Driven by `ducky.routes.js`. Features dynamic fraction/odds generation logic, dynamic bank/buoy color mapping, sinking flags, and recent history form lists.
- **Wheel of Misfortune:** Driven by `wheel/` backend files. Highly database-customizable engine tracking user spins, segment text opacity, custom pegs, and subtitle displays.
- **Shut The Box (STB):** Driven by `games/stb.repo.js`. Manages state and settings rules for a 3D-rendered dice game, exposing custom hidden tile messages as numbers clear.
- **Giftsweeper:** Driven by `games/giftsweeper.routes.js`. A specialized layout mapping hidden point payouts or items onto a classic matrix grid.
- **Tic-Tac-Face:** Implements webcam/facial tracking match matches recorded inside sequential migration logs.

### 3. Frontend Architecture (`frontend/src/`)
- **`pages/`:** Direct view states corresponding to individual features (e.g., `DuckyDerbyPage.jsx`, `WheelOfFortunePage.jsx`, `ShutTheBoxPage.jsx`, `AdminPage.jsx`).
- **`components/`:** Reusable UI components split cleanly by scope (e.g., specific subdirectories like `components/stories/` for uploader/viewer components).
- **`lib/`:** Central state engines and contexts (`AuthContext.jsx`, `BasketContext.jsx`, `ThemeContext.jsx`, `SettingsContext.jsx`) and the central Axios/Fetch baseline instance (`api.js`).

---

## 🚢 Deployment & Workflow Blocks
When providing completed code updates, bug fixes, or database migrations, **always generate the final terminal deployment instructions** at the bottom of the answer using these two exact blocks:

### 1. Mac Git Push Execution
```bash
cd /Users/davidbell/Documents/projects/development/points-shop
git add -A
git commit -m "[Feature/Bug Name]: [Brief list of changes]"
git push

### 2. Hetzner VPS Git Pull & Build Execution
(Note: Only inject the database pipe block if a new .sql script is introduced)
cd ~/points-shop
git pull

# Run this block if database migrations are required:
set -a; source .env; set +a
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /dev/stdin < db/init/[migration_file_name].sql

# Rebuild and restart affected production services:
docker compose -f docker-compose.prod.yml build --no-cache backend caddy
docker compose -f docker-compose.prod.yml up -d backend caddy

---

## 🛠️ AI Prompting Guidelines
1. Scope Efficiency: Never attempt to read the postgres-data/ binary directory or node_modules/. Refer exclusively to SQL scripts inside db/init/ for database definitions.
2. Atomic State Mutations: All point balance edits from mini-games or checking out must use isolated database transactions to prevent race conditions or exploits.
3. Tailwind Syntax: Adhere strictly to utility classes and natively support dark mode via the dark: prefix.