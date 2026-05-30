# Coding & Deployment Instructions

## 🚢 Deployment & Workflow Blocks
Always generate the final terminal deployment instructions at the bottom of your answers using these two exact execution blocks:

### 1. Mac Git Push Execution
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