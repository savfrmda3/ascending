import {
  customQuestTemplateSchema,
  customQuestTemplateUpdateSchema,
  keyParamSchema,
  squadCreateSchema,
  squadJoinSchema,
  telegramAuthSchema,
  userSettingsUpdateSchema,
  uuidParamSchema
} from "@system-hunter/shared";
import { requireSession, signSession, validateTelegramInitData } from "./auth.js";
import { handleTelegramWebhook, setupTelegramWebhook, verifyTelegramWebhookSecret } from "./bot.js";
import { optionalEnv } from "./env.js";
import { supabase, supabaseUrl } from "./db.js";
import {
  notFound,
  readBody,
  sendData,
  sendError,
  tooManyRequests,
  unauthorized,
  type ApiRequest,
  type ApiResponse
} from "./http.js";
import { hunterService } from "./hunter.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setSecurityHeaders(res);
  setCorsHeaders(req, res);

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
    if (isProduction() && optionalEnv("ENABLE_SUPABASE_DEBUG") !== "true") {
      throw notFound("Route not found");
    }
    verifySetupSecret(req);
    return { data: await diagnoseSupabase() };
  }

  if (method === "POST" && path === "telegram/webhook") {
    if (!verifyTelegramWebhookSecret(req)) throw unauthorized("Invalid Telegram webhook secret");
    await handleTelegramWebhook(await readBody(req), req);
    return { data: { ok: true } };
  }

  if (method === "POST" && path === "auth/telegram") {
    rateLimit(req, "auth:telegram", 12, 60_000);
    const body = telegramAuthSchema.parse(await readBody(req));
    const telegramUser = validateTelegramInitData(body.initData);
    const bundle = await hunterService.syncTelegramUser({
      telegramId: telegramUser.id,
      username: telegramUser.username ?? null,
      firstName: telegramUser.first_name ?? null,
      timezone: body.timezone ?? null,
      timezoneOffset: body.timezoneOffset ?? null
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

  if (method === "GET" && path === "settings") {
    return { data: await hunterService.getSettings(session.userId) };
  }

  if (method === "POST" && path === "settings") {
    rateLimit(req, `settings:update:${session.userId}`, 10, 60_000);
    const body = userSettingsUpdateSchema.parse(await readBody(req));
    return { data: await hunterService.updateSettings(session.userId, body) };
  }

  if (method === "GET" && path === "quests/today") {
    return { data: await hunterService.getTodayQuests(session.userId) };
  }

  if (method === "DELETE" && segments[0] === "quests" && segments.length === 2) {
    rateLimit(req, `quests:delete:${session.userId}`, 12, 60_000);
    const params = uuidParamSchema.parse({ id: segments[1] });
    return { data: await hunterService.deleteTodayCustomQuest(session.userId, params.id) };
  }

  if (method === "POST" && path === "quests/generate") {
    rateLimit(req, `quests:generate:${session.userId}`, 8, 60_000);
    return { data: await hunterService.generateQuest(session.userId), status: 201 };
  }

  if (method === "POST" && segments[0] === "quests" && segments[2] === "complete") {
    rateLimit(req, `quests:complete:${session.userId}`, 20, 60_000);
    const params = uuidParamSchema.parse({ id: segments[1] });
    return { data: await hunterService.completeQuest(session.userId, params.id) };
  }

  if (method === "POST" && segments[0] === "quests" && segments[2] === "skip") {
    rateLimit(req, `quests:skip:${session.userId}`, 20, 60_000);
    const params = uuidParamSchema.parse({ id: segments[1] });
    return { data: await hunterService.skipQuest(session.userId, params.id) };
  }

  if (method === "POST" && segments[0] === "quests" && segments[2] === "replace") {
    rateLimit(req, `quests:replace:${session.userId}`, 8, 60_000);
    const params = uuidParamSchema.parse({ id: segments[1] });
    return { data: await hunterService.replaceQuest(session.userId, params.id), status: 201 };
  }

  if (method === "GET" && path === "boss/current") {
    return { data: await hunterService.getCurrentBoss(session.userId) };
  }

  if (method === "POST" && segments[0] === "boss" && (segments[2] === "progress" || segments[2] === "complete")) {
    rateLimit(req, `boss:progress:${session.userId}`, 12, 60_000);
    const params = uuidParamSchema.parse({ id: segments[1] });
    return { data: await hunterService.progressBoss(session.userId, params.id) };
  }

  if (method === "GET" && path === "achievements") {
    return { data: await hunterService.getAchievements(session.userId) };
  }

  if (method === "GET" && path === "progress/history") {
    return { data: await hunterService.getProgressHistory(session.userId) };
  }

  if (method === "GET" && path === "custom-quests") {
    return { data: await hunterService.getCustomQuests(session.userId) };
  }

  if (method === "POST" && path === "custom-quests") {
    rateLimit(req, `custom-quests:create:${session.userId}`, 10, 60_000);
    const body = customQuestTemplateSchema.parse(await readBody(req));
    return { data: await hunterService.createCustomQuest(session.userId, body), status: 201 };
  }

  if (segments[0] === "custom-quests" && segments[1] && method === "PATCH") {
    rateLimit(req, `custom-quests:update:${session.userId}`, 20, 60_000);
    const params = uuidParamSchema.parse({ id: segments[1] });
    const body = customQuestTemplateUpdateSchema.parse(await readBody(req));
    return { data: await hunterService.updateCustomQuest(session.userId, params.id, body) };
  }

  if (segments[0] === "custom-quests" && segments[1] && segments[2] === "disable" && method === "POST") {
    rateLimit(req, `custom-quests:disable:${session.userId}`, 20, 60_000);
    const params = uuidParamSchema.parse({ id: segments[1] });
    return { data: await hunterService.disableCustomQuest(session.userId, params.id) };
  }

  if (segments[0] === "custom-quests" && segments[1] && segments[2] === "enable" && method === "POST") {
    rateLimit(req, `custom-quests:enable:${session.userId}`, 20, 60_000);
    const params = uuidParamSchema.parse({ id: segments[1] });
    return { data: await hunterService.enableCustomQuest(session.userId, params.id) };
  }

  if (segments[0] === "custom-quests" && segments[1] && method === "DELETE") {
    rateLimit(req, `custom-quests:delete:${session.userId}`, 20, 60_000);
    const params = uuidParamSchema.parse({ id: segments[1] });
    return { data: await hunterService.deleteCustomQuest(session.userId, params.id) };
  }

  if (method === "GET" && path === "systems") {
    return { data: await hunterService.getSystemsOverview(session.userId) };
  }

  if (method === "POST" && segments[0] === "skills" && segments[2] === "unlock") {
    rateLimit(req, `skills:unlock:${session.userId}`, 8, 60_000);
    const params = keyParamSchema.parse({ key: segments[1] });
    return { data: await hunterService.unlockSkill(session.userId, params.key) };
  }

  if (method === "POST" && path === "squad/create") {
    rateLimit(req, `squad:create:${session.userId}`, 4, 60_000);
    const body = squadCreateSchema.parse(await readBody(req));
    return { data: await hunterService.createSquad(session.userId, body.name), status: 201 };
  }

  if (method === "POST" && path === "squad/join") {
    rateLimit(req, `squad:join:${session.userId}`, 8, 60_000);
    const body = squadJoinSchema.parse(await readBody(req));
    return { data: await hunterService.joinSquad(session.userId, body.code) };
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
  if (!expected) {
    if (isProduction()) throw unauthorized("Webhook setup secret is not configured");
    return;
  }

  const url = req.url ? new URL(req.url, "https://local.test") : null;
  const provided = url?.searchParams.get("secret") ?? getHeader(req, "x-setup-secret");
  if (provided !== expected) throw unauthorized("Invalid webhook setup secret");
}

function setCorsHeaders(req: ApiRequest, res: ApiResponse) {
  const origin = getHeader(req, "origin");
  const allowedOrigins = allowedCorsOrigins(req);
  const allowOrigin = origin && allowedOrigins.has(origin) ? origin : allowedOrigins.values().next().value;

  if (allowOrigin) res.setHeader("access-control-allow-origin", allowOrigin);
  res.setHeader("vary", "origin");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,authorization,x-setup-secret,x-telegram-bot-api-secret-token");
}

function setSecurityHeaders(res: ApiResponse) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("x-frame-options", "SAMEORIGIN");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
}

function getHeader(req: ApiRequest, name: string) {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function allowedCorsOrigins(req: ApiRequest) {
  const origins = new Set<string>();
  const miniAppUrl = optionalEnv("MINI_APP_URL");
  const publicOrigin = getRequestOrigin(req);

  if (miniAppUrl) {
    try {
      origins.add(new URL(miniAppUrl).origin);
    } catch {
      // Invalid env values should not open CORS wider than intended.
    }
  }
  if (publicOrigin) origins.add(publicOrigin);

  return origins;
}

function getRequestOrigin(req: ApiRequest) {
  const proto = getHeader(req, "x-forwarded-proto") || "https";
  const host = getHeader(req, "x-forwarded-host") || getHeader(req, "host");
  return host ? `${proto}://${host}` : null;
}

function isProduction() {
  return optionalEnv("NODE_ENV") === "production";
}

function rateLimit(req: ApiRequest, bucket: string, limit: number, windowMs: number) {
  const key = `${clientIp(req)}:${bucket}`;
  const now = Date.now();
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  current.count += 1;
  if (current.count > limit) throw tooManyRequests("Rate limit exceeded");
}

function clientIp(req: ApiRequest) {
  const forwarded = getHeader(req, "x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || getHeader(req, "x-real-ip") || "unknown";
}

const globalRateLimit = globalThis as typeof globalThis & {
  __systemHunterRateLimit?: Map<string, { count: number; resetAt: number }>;
};
const rateLimitStore = globalRateLimit.__systemHunterRateLimit ?? new Map<string, { count: number; resetAt: number }>();
globalRateLimit.__systemHunterRateLimit = rateLimitStore;
