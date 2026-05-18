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
NODE_ENV=production
```

`MINI_APP_URL` is the public Vercel URL of this same project, for example:

```txt
https://ascending.vercel.app
```

`BACKEND_URL` is not required for the Vercel setup because the Mini App calls same-origin endpoints like `/api/me`.

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

If `WEBHOOK_SETUP_SECRET` is empty, the setup URL works without `?secret=...`, but keeping the secret is safer.

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
- `supabase/seed.sql`

The app uses `SUPABASE_SERVICE_ROLE_KEY` only inside Vercel serverless functions. Do not expose it to browser-side code.

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

The production Mini App requires Telegram `initData`, so it must be opened from the bot or Telegram menu button. Opening the URL directly in a browser can show a locked/auth state.

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
- `GET /api/boss/current`
- `POST /api/boss/:id/progress`
- `GET /api/achievements`
- `POST /api/telegram/webhook`
- `GET /api/telegram/setup?secret=...`

## Notes

- Telegram WebApp auth validates `initData` with `BOT_TOKEN`.
- User sessions are signed with `JWT_SECRET`.
- XP to next level: `Math.round(100 * Math.pow(level, 1.35))`.
- The UI uses original System Hunter terminology and does not use copyrighted assets.
