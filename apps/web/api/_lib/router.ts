import {
  telegramAuthSchema,
  uuidParamSchema
} from "@system-hunter/shared";
import { requireSession, signSession, validateTelegramInitData } from "./auth.js";
import { handleTelegramWebhook, setupTelegramWebhook, verifyTelegramWebhookSecret } from "./bot.js";
import { optionalEnv } from "./env.js";
import { supabase, supabaseUrl } from "./db.js";
import { notFound, readBody, sendData, sendError, unauthorized, type ApiRequest, type ApiResponse } from "./http.js";
import { hunterService } from "./hunter.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  try {
    const result = await dispatch(req);
    sendData(res, result.data, result.status);
  } catch (error) {
    sendError(res, error);
  }
}

async function dispatch(req: ApiRequest): Promise<{ data: unknown; status?: number }> {
  const method = (req.method ?? "GET").toUpperCase();
  const segments = getPathSegments(req);
  const path = segments.join("/");

  if (method === "GET" && path === "health") {
    return {
      data: {
        ok: true,
        service: "system-hunter-vercel",
        mode: "mini-app-api-webhook"
      }
    };
  }

  if ((method === "GET" || method === "POST") && path === "telegram/setup") {
    verifySetupSecret(req);
    return { data: await setupTelegramWebhook(req) };
  }

  if (method === "GET" && path === "debug/supabase") {
    verifySetupSecret(req);
    return { data: await diagnoseSupabase() };
  }

  if (method === "POST" && path === "telegram/webhook") {
    if (!verifyTelegramWebhookSecret(req)) throw unauthorized("Invalid Telegram webhook secret");
    await handleTelegramWebhook(await readBody(req), req);
    return { data: { ok: true } };
  }

  if (method === "POST" && path === "auth/telegram") {
    const body = telegramAuthSchema.parse(await readBody(req));
    const telegramUser = validateTelegramInitData(body.initData);
    const bundle = await hunterService.syncTelegramUser({
      telegramId: telegramUser.id,
      username: telegramUser.username ?? null,
      firstName: telegramUser.first_name ?? null
    });

    return {
      data: {
        token: signSession(bundle.profile.id, bundle.profile.telegramId),
        profile: bundle.profile,
        stats: bundle.stats
      }
    };
  }

  const session = requireSession(req);

  if (method === "GET" && path === "me") {
    return { data: await hunterService.getDashboard(session.userId) };
  }

  if (method === "GET" && path === "profile") {
    return { data: await hunterService.getProfileBundle(session.userId) };
  }

  if (method === "GET" && path === "stats") {
    const bundle = await hunterService.getProfileBundle(session.userId);
    return { data: bundle.stats };
  }

  if (method === "GET" && path === "quests/today") {
    return { data: await hunterService.getTodayQuests(session.userId) };
  }

  if (method === "POST" && path === "quests/generate") {
    return { data: await hunterService.generateQuest(session.userId), status: 201 };
  }

  if (method === "POST" && segments[0] === "quests" && segments[2] === "complete") {
    const params = uuidParamSchema.parse({ id: segments[1] });
    return { data: await hunterService.completeQuest(session.userId, params.id) };
  }

  if (method === "POST" && segments[0] === "quests" && segments[2] === "skip") {
    const params = uuidParamSchema.parse({ id: segments[1] });
    return { data: await hunterService.skipQuest(session.userId, params.id) };
  }

  if (method === "GET" && path === "boss/current") {
    return { data: await hunterService.getCurrentBoss(session.userId) };
  }

  if (method === "POST" && segments[0] === "boss" && (segments[2] === "progress" || segments[2] === "complete")) {
    const params = uuidParamSchema.parse({ id: segments[1] });
    return { data: await hunterService.progressBoss(session.userId, params.id) };
  }

  if (method === "GET" && path === "achievements") {
    return { data: await hunterService.getAchievements(session.userId) };
  }

  throw notFound("Route not found");
}

function getPathSegments(req: ApiRequest) {
  const rawRoute = req.query?.route;
  if (Array.isArray(rawRoute)) return rawRoute.flatMap(splitSegment).filter(Boolean);
  if (typeof rawRoute === "string") return splitSegment(rawRoute).filter(Boolean);

  const rawPath = req.query?.path;
  if (Array.isArray(rawPath)) return rawPath.flatMap(splitSegment).filter(Boolean);
  if (typeof rawPath === "string") return splitSegment(rawPath).filter(Boolean);

  const url = req.url ? new URL(req.url, "https://local.test") : null;
  return splitSegment(url?.pathname.replace(/^\/api\/?/, "") ?? "").filter(Boolean);
}

async function diagnoseSupabase() {
  const tables = [
    { table: "users", columns: "id,telegram_id,username,created_at" },
    { table: "user_stats", columns: "id,user_id,strength,focus" },
    { table: "quest_templates", columns: "id,title,category" },
    { table: "quests", columns: "id,user_id,title,status" },
    { table: "weekly_bosses", columns: "id,user_id,name,status" },
    { table: "achievements", columns: "id,user_id,key,title" }
  ];
  const checks = await Promise.all(
    tables.map(async ({ table, columns }) => {
      const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
      const { data: sample, error: sampleError } = await supabase.from(table).select(columns).limit(1);
      return {
        table,
        ok: !error && !sampleError,
        count: count ?? null,
        sampleCount: sample?.length ?? null,
        error: error || sampleError
          ? {
              code: (error || sampleError)?.code,
              message: (error || sampleError)?.message,
              hint: (error || sampleError)?.hint,
              details: (error || sampleError)?.details
            }
          : null
      };
    })
  );
  const failed = checks.filter((check) => !check.ok);

  return {
    ok: failed.length === 0,
    supabaseHost: safeSupabaseHost(),
    normalizedSupabaseUrl: supabaseUrl,
    checks,
    recommendation: failed.length === 0
      ? "Supabase tables are reachable. If Mini App still fails, clear Telegram WebView cache and reopen from the bot."
      : "Supabase tables are not reachable. Run supabase/migrations/20260518000000_init_system_hunter.sql and supabase/seed.sql in the same Supabase project used by Vercel, then redeploy."
  };
}

function safeSupabaseHost() {
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return "invalid SUPABASE_URL";
  }
}

function splitSegment(value: string) {
  return value.split("/").map((segment) => segment.trim()).filter(Boolean);
}

function verifySetupSecret(req: ApiRequest) {
  const expected = optionalEnv("WEBHOOK_SETUP_SECRET");
  if (!expected) return;

  const url = req.url ? new URL(req.url, "https://local.test") : null;
  const provided = url?.searchParams.get("secret") ?? getHeader(req, "x-setup-secret");
  if (provided !== expected) throw unauthorized("Invalid webhook setup secret");
}

function setCorsHeaders(res: ApiResponse) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,authorization,x-setup-secret");
}

function getHeader(req: ApiRequest, name: string) {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
