# System Hunter

Telegram Bot + Telegram Mini App MVP for an original dark RPG self-development system. The bot is the entry point, the Mini App is the mobile interface, and the API owns the game logic.

## Stack

- Telegram Bot: Node.js, TypeScript, Telegraf
- Mini App: React, Vite, TypeScript, Tailwind CSS
- Backend API: Node.js, TypeScript, Express
- Database: Supabase PostgreSQL
- Auth: Telegram WebApp `initData` validation + API JWT
- Deploy targets: Vercel for `apps/web`, Railway/Render/Fly.io for `apps/api` and `apps/bot`

## Project Structure

```txt
system-hunter/
  apps/
    api/      Express API and game services
    bot/      Telegraf bot with inline buttons and cron notifications
    web/      Telegram Mini App
  packages/
    shared/   Shared types, zod schemas, RPG formulas, quest templates
  supabase/
    migrations/
    seed.sql
  .env.example
  package.json
```

## Create Telegram Bot

1. Open Telegram and start `@BotFather`.
2. Run `/newbot`, choose a name and username.
3. Copy the token into `BOT_TOKEN`.
4. Run `/setcommands` and add:

```txt
start - Запустить System Hunter
menu - Главное меню
profile - Профиль Hunter
quests - Квесты на сегодня
stats - Характеристики
boss - Босс недели
help - Помощь
```

5. Use `/setmenubutton` or BotFather Web App settings to point the Menu Button to `MINI_APP_URL`.

## Environment

Copy `.env.example` to `.env` in the `system-hunter` root:

```bash
cp .env.example .env
```

Fill:

```env
BOT_TOKEN=123:telegram-token
MINI_APP_URL=https://your-mini-app.vercel.app
BACKEND_URL=http://localhost:4000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=replace-with-a-long-random-secret
NODE_ENV=development
PORT=4000
```

Only the API uses `SUPABASE_SERVICE_ROLE_KEY`. Do not expose it in Vercel frontend variables.

## Supabase Setup

Apply the migration and seed data:

```bash
supabase link --project-ref your-project-ref
supabase db push
supabase db execute --file supabase/seed.sql
```

If you do not use the Supabase CLI, run `supabase/migrations/20260518000000_init_system_hunter.sql` and then `supabase/seed.sql` in the Supabase SQL Editor.

The migration enables RLS and revokes `anon` / `authenticated` table access. The app talks to Supabase only through the backend service role.

## Install And Run

```bash
npm install
npm run build -w @system-hunter/shared
npm run dev:api
npm run dev:bot
npm run dev:web
```

Useful scripts:

```bash
npm run dev        # api + bot + web together
npm run build      # shared, api, bot, web
npm run typecheck  # all workspaces
```

Local URLs:

- API: `http://localhost:4000/health`
- Mini App dev server: `http://localhost:5173`

Outside Telegram, the Mini App shows a development preview when run with Vite dev mode. In production it requires Telegram `initData`.

## API Endpoints

Auth:

- `POST /api/auth/telegram`
- `GET /api/me`

User:

- `GET /api/profile`
- `GET /api/stats`

Quests:

- `GET /api/quests/today`
- `POST /api/quests/generate`
- `POST /api/quests/:id/complete`
- `POST /api/quests/:id/skip`

Boss:

- `GET /api/boss/current`
- `POST /api/boss/:id/progress`
- `POST /api/boss/:id/complete`

Achievements:

- `GET /api/achievements`

Bot internal endpoints use `x-bot-token: BOT_TOKEN`.

## Deploy

Mini App on Vercel:

```bash
cd apps/web
vercel
```

Set `BACKEND_URL` in Vercel environment variables.

API on Railway/Render/Fly.io:

```bash
npm run build -w @system-hunter/shared
npm run build -w @system-hunter/api
npm run start -w @system-hunter/api
```

Bot on Railway/Render/Fly.io:

```bash
npm run build -w @system-hunter/shared
npm run build -w @system-hunter/bot
npm run start -w @system-hunter/bot
```

After deploy:

1. Set `BACKEND_URL` to the deployed API URL.
2. Set `MINI_APP_URL` to the deployed Vercel URL.
3. Update BotFather Menu Button/Web App URL.
4. Restart bot and API services.

## Notes

- The project uses original `System Hunter` terminology and custom dark RPG styling.
- Telegram WebApp auth validates `hash`, `auth_date`, payload integrity, and expiry.
- XP to next level: `Math.round(100 * Math.pow(level, 1.35))`.
- Ranks: E, D, C, B, A, S by level ranges.
- Cron notifications run at 09:00 and 20:00 Europe/Minsk time.
