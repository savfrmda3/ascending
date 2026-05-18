import { z } from "zod";

export const telegramAuthSchema = z.object({
  initData: z.string().min(1, "Telegram initData is required")
});

export const telegramUserSyncSchema = z.object({
  telegramId: z.coerce.number().int().positive(),
  username: z.string().optional().nullable(),
  firstName: z.string().optional().nullable()
});

export const completeBotQuestSchema = z.object({
  telegramId: z.coerce.number().int().positive(),
  questId: z.string().uuid()
});

export const botBossProgressSchema = z.object({
  telegramId: z.coerce.number().int().positive(),
  bossId: z.string().uuid()
});

export const uuidParamSchema = z.object({
  id: z.string().uuid()
});

export const telegramIdParamSchema = z.object({
  telegramId: z.coerce.number().int().positive()
});
