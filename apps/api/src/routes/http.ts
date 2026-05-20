import { Router } from "express";
import jwt from "jsonwebtoken";
import {
  botBossProgressSchema,
  completeBotQuestSchema,
  telegramAuthSchema,
  telegramIdParamSchema,
  telegramUserSyncSchema,
  userSettingsUpdateSchema,
  uuidParamSchema
} from "@system-hunter/shared";
import { env } from "../config/env.js";
import { authenticate, requireBotToken } from "../middleware/auth.js";
import { asyncHandler, badRequest } from "../lib/errors.js";
import { validateTelegramInitData } from "../lib/telegram.js";
import { hunterService } from "../services/hunter.service.js";

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ data: { ok: true, service: "system-hunter-api" } });
});

router.post(
  "/api/auth/telegram",
  asyncHandler(async (req, res) => {
    const body = telegramAuthSchema.parse(req.body);
    const telegramUser = validateTelegramInitData(body.initData, env.BOT_TOKEN);
    const result = await hunterService.syncTelegramUser({
      telegramId: telegramUser.id,
      username: telegramUser.username ?? null,
      firstName: telegramUser.first_name ?? null,
      timezone: body.timezone ?? null,
      timezoneOffset: body.timezoneOffset ?? null
    });

    const token = jwt.sign(
      {
        telegramId: result.profile.telegramId
      },
      env.JWT_SECRET,
      {
        subject: result.profile.id,
        expiresIn: "30d"
      }
    );

    res.json({
      data: {
        token,
        profile: result.profile,
        stats: result.stats
      }
    });
  })
);

router.get(
  "/api/me",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw badRequest("Missing auth context");
    res.json({ data: await hunterService.getDashboard(req.auth.userId) });
  })
);

router.get(
  "/api/profile",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw badRequest("Missing auth context");
    res.json({ data: await hunterService.getProfileBundle(req.auth.userId) });
  })
);

router.get(
  "/api/stats",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw badRequest("Missing auth context");
    res.json({ data: await hunterService.getStats(req.auth.userId) });
  })
);

router.get(
  "/api/settings",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw badRequest("Missing auth context");
    res.json({ data: await hunterService.getSettings(req.auth.userId) });
  })
);

router.post(
  "/api/settings",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw badRequest("Missing auth context");
    const body = userSettingsUpdateSchema.parse(req.body);
    res.json({ data: await hunterService.updateSettings(req.auth.userId, body) });
  })
);

router.get(
  "/api/quests/today",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw badRequest("Missing auth context");
    res.json({ data: await hunterService.getTodayQuests(req.auth.userId) });
  })
);

router.post(
  "/api/quests/generate",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw badRequest("Missing auth context");
    res.status(201).json({ data: await hunterService.generateQuest(req.auth.userId) });
  })
);

router.post(
  "/api/quests/:id/complete",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw badRequest("Missing auth context");
    const params = uuidParamSchema.parse(req.params);
    res.json({ data: await hunterService.completeQuest(req.auth.userId, params.id) });
  })
);

router.post(
  "/api/quests/:id/skip",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw badRequest("Missing auth context");
    const params = uuidParamSchema.parse(req.params);
    res.json({ data: await hunterService.skipQuest(req.auth.userId, params.id) });
  })
);

router.post(
  "/api/quests/:id/replace",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw badRequest("Missing auth context");
    const params = uuidParamSchema.parse(req.params);
    res.status(201).json({ data: await hunterService.replaceQuest(req.auth.userId, params.id) });
  })
);

router.get(
  "/api/boss/current",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw badRequest("Missing auth context");
    res.json({ data: await hunterService.getCurrentBoss(req.auth.userId) });
  })
);

router.post(
  "/api/boss/:id/progress",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw badRequest("Missing auth context");
    const params = uuidParamSchema.parse(req.params);
    res.json({ data: await hunterService.progressBoss(req.auth.userId, params.id) });
  })
);

router.post(
  "/api/boss/:id/complete",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw badRequest("Missing auth context");
    const params = uuidParamSchema.parse(req.params);
    res.json({ data: await hunterService.completeBoss(req.auth.userId, params.id) });
  })
);

router.get(
  "/api/achievements",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw badRequest("Missing auth context");
    res.json({ data: await hunterService.getAchievements(req.auth.userId) });
  })
);

router.get(
  "/api/progress/history",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw badRequest("Missing auth context");
    res.json({ data: await hunterService.getProgressHistory(req.auth.userId) });
  })
);





router.post(
  "/api/bot/user/sync",
  requireBotToken,
  asyncHandler(async (req, res) => {
    const body = telegramUserSyncSchema.parse(req.body);
    res.json({ data: await hunterService.syncTelegramUser(body) });
  })
);

router.post(
  "/api/bot/quest/complete",
  requireBotToken,
  asyncHandler(async (req, res) => {
    const body = completeBotQuestSchema.parse(req.body);
    res.json({ data: await hunterService.completeQuestByTelegramId(body.telegramId, body.questId) });
  })
);

router.post(
  "/api/bot/quest/skip",
  requireBotToken,
  asyncHandler(async (req, res) => {
    const body = completeBotQuestSchema.parse(req.body);
    res.json({ data: await hunterService.skipQuestByTelegramId(body.telegramId, body.questId) });
  })
);

router.post(
  "/api/bot/quest/generate",
  requireBotToken,
  asyncHandler(async (req, res) => {
    const body = telegramIdParamSchema.parse(req.body);
    res.status(201).json({ data: await hunterService.generateQuestByTelegramId(body.telegramId) });
  })
);

router.get(
  "/api/bot/profile/:telegramId",
  requireBotToken,
  asyncHandler(async (req, res) => {
    const params = telegramIdParamSchema.parse(req.params);
    res.json({ data: await hunterService.getProfileByTelegramId(params.telegramId) });
  })
);


router.get(
  "/api/bot/boss/:telegramId",
  requireBotToken,
  asyncHandler(async (req, res) => {
    const params = telegramIdParamSchema.parse(req.params);
    res.json({ data: await hunterService.getCurrentBossByTelegramId(params.telegramId) });
  })
);

router.post(
  "/api/bot/boss/progress",
  requireBotToken,
  asyncHandler(async (req, res) => {
    const body = botBossProgressSchema.parse(req.body);
    res.json({ data: await hunterService.progressBossByTelegramId(body.telegramId, body.bossId) });
  })
);

router.post(
  "/api/bot/quests/generate-daily",
  requireBotToken,
  asyncHandler(async (_req, res) => {
    res.json({ data: await hunterService.ensureDailyQuestsForAllUsers() });
  })
);

router.get(
  "/api/bot/quests/active-summary",
  requireBotToken,
  asyncHandler(async (_req, res) => {
    res.json({ data: await hunterService.usersWithActiveQuests() });
  })
);

router.get(
  "/api/bot/quests/:telegramId",
  requireBotToken,
  asyncHandler(async (req, res) => {
    const params = telegramIdParamSchema.parse(req.params);
    res.json({ data: await hunterService.getTodayQuestsByTelegramId(params.telegramId) });
  })
);
