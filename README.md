# System Hunter

Telegram Bot + Telegram Mini App MVP for a dark RPG self-development system.

The recommended deployment is now one Vercel project:

- `apps/web` builds the Vite Mini App.
- `apps/web/api` contains Vercel Serverless Functions for the API and Telegram webhook.
- Supabase remains the database.
- The old `apps/api` and `apps/bot` packages are kept for local/standalone development, but Vercel does not need separate Railway/Render services.

## Vercel Project Settings

Create one Vercel project from this repository and set:

```txt
Framework Preset: Vite
Root Directory: apps/web
Install Command: npm ci --include=dev
Build Command: npm run build
Output Directory: dist
```

Add these environment variables in Vercel Project Settings:

```env
BOT_TOKEN=
MINI_APP_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
JWT_SECRET=
WEBHOOK_SETUP_SECRET=
TELEGRAM_WEBHOOK_SECRET=
ENABLE_SUPABASE_DEBUG=false
ADMIN_TELEGRAM_IDS=
NODE_ENV=production
```

`MINI_APP_URL` is the public Vercel URL of this same project, for example:

```txt
https://ascending.vercel.app
```

`BACKEND_URL` is not required for the Vercel setup and is ignored by the Mini App build because the app calls same-origin endpoints like `/api/me`.
Only set `VITE_BACKEND_URL` if you intentionally want the browser to call a separate API domain.

## Telegram Setup

1. Create the bot in `@BotFather` with `/newbot`.
2. Put the token into Vercel env `BOT_TOKEN`.
3. Deploy the Vercel project.
4. Put the final Vercel URL into `MINI_APP_URL`.
5. Open this URL once after deploy:

```txt
https://YOUR-VERCEL-DOMAIN/api/telegram/setup?secret=YOUR_WEBHOOK_SETUP_SECRET
```

This sets:

- Telegram webhook: `https://YOUR-VERCEL-DOMAIN/api/telegram/webhook`
- Bot commands
- Telegram Menu Button / Web App button URL

In production `WEBHOOK_SETUP_SECRET` is required. If it is empty, the setup endpoint refuses to run.

In BotFather, the Menu Button / Web App URL should be the same value as `MINI_APP_URL`.

## Supabase Setup

Run the migration and seed:

```bash
supabase link --project-ref your-project-ref
supabase db push
supabase db execute --file supabase/seed.sql
```

Without the Supabase CLI, run these files in Supabase SQL Editor:

- `supabase/migrations/20260518000000_init_system_hunter.sql`
- `supabase/migrations/20260519000000_p0_progression_safety.sql`
- `supabase/migrations/20260519010000_user_settings_onboarding.sql`
- `supabase/migrations/20260519020000_product_expansion_systems.sql`
- `supabase/seed.sql`

The app uses `SUPABASE_SERVICE_ROLE_KEY` only inside Vercel serverless functions. Do not expose it to browser-side code. The `/api/debug/supabase` endpoint is disabled in production unless `ENABLE_SUPABASE_DEBUG=true` is set intentionally.

## Local Development

Install and check everything:

```bash
npm install
npm run typecheck
npm run build
```

Run the old standalone services locally:

```bash
npm run dev:api
npm run dev:bot
npm run dev:web
```

For the Vercel-style local flow from `apps/web`, use:

```bash
cd apps/web
npm run dev
```

The production Mini App uses Telegram `initData` when it is opened from the bot or Telegram menu button. Opening the public URL directly in a browser shows a safe demo preview so ChatGPT and reviewers can inspect the full interface without Telegram auth.

For external review by ChatGPT or a regular browser, open the same public app URL:

```txt
https://YOUR-VERCEL-DOMAIN
```

These explicit preview links also work:

```txt
https://YOUR-VERCEL-DOMAIN/preview
https://YOUR-VERCEL-DOMAIN/?demo=1
```

This mode loads the full Mini App UI with demo data only. It does not expose real Telegram users or Supabase data.

## Personalization

On first real Telegram launch the Mini App asks the user to configure goal, difficulty, daily quest count, day rhythm, physical-task limits, and preferred categories. These values are stored in `user_settings` and influence daily/generated quest selection. If the new migration has not been applied yet, the app falls back to default settings so the current production deploy keeps opening, but settings cannot be saved until the table exists.

## Progress History

The Mini App has a progress journal with a 30-day quest calendar, current weekly recap, recent quest history, and a locked/unlocked achievement collection. It is built from existing `quests`, `weekly_bosses`, and `achievements` tables, so this stage does not require a new migration.

## Expanded RPG Systems

The current product stage adds skill tree, inventory, season progress, squads, and an admin overview for Telegram IDs listed in `ADMIN_TELEGRAM_IDS`. Apply `20260519020000_product_expansion_systems.sql` before relying on these systems in production.

Rewards now affect more than XP:

- hard quests spend energy;
- generated quests spend energy;
- skipped/replaced quests reduce HP;
- vitality quests restore HP/energy;
- boss victory and selected achievements can grant inventory items.

The standalone bot also has `/systems` and `/settings`. In the recommended Vercel setup the webhook bot commands are configured by `/api/telegram/setup`.

## Main Endpoints

- `GET /api/health`
- `POST /api/auth/telegram`
- `GET /api/me`
- `GET /api/profile`
- `GET /api/stats`
- `GET /api/quests/today`
- `POST /api/quests/generate`
- `POST /api/quests/:id/complete`
- `POST /api/quests/:id/skip`
- `POST /api/quests/:id/replace`
- `GET /api/boss/current`
- `POST /api/boss/:id/progress`
- `GET /api/achievements`
- `GET /api/progress/history`
- `GET /api/systems`
- `POST /api/skills/:key/unlock`
- `POST /api/squad/create`
- `POST /api/squad/join`
- `POST /api/telegram/webhook`
- `GET /api/telegram/setup?secret=...`

## Notes

- Telegram WebApp auth validates `initData` with `BOT_TOKEN`.
- User sessions are signed with `JWT_SECRET`.
- XP to next level: `Math.round(100 * Math.pow(level, 1.35))`.
- The UI uses original System Hunter terminology and does not use copyrighted assets.
