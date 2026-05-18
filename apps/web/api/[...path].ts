import {
  telegramAuthSchema,
  uuidParamSchema
} from "@system-hunter/shared";
import { requireSession, signSession, validateTelegramInitData } from "./_lib/auth.js";
import { handleTelegramWebhook, setupTelegramWebhook, verifyTelegramWebhookSecret } from "./_lib/bot.js";
import { optionalEnv } from "./_lib/env.js";
import { notFound, readBody, sendData, sendError, unauthorized, type ApiRequest, type ApiResponse } from "./_lib/http.js";
import { hunterService } from "./_lib/hunter.js";

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
