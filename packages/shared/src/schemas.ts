import { z } from "zod";

const questCategorySchema = z.enum(["strength", "intelligence", "vitality", "discipline", "focus", "charisma"]);
const difficultySchema = z.enum(["easy", "medium", "hard"]);

export const telegramAuthSchema = z.object({
  initData: z.string().min(1, "Telegram initData is required"),
  timezone: z.string().trim().min(1).max(80).optional().nullable(),
  timezoneOffset: z.coerce.number().int().min(-840).max(840).optional().nullable()
});

export const telegramUserSyncSchema = z.object({
  telegramId: z.coerce.number().int().positive(),
  username: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  timezone: z.string().trim().min(1).max(80).optional().nullable(),
  timezoneOffset: z.coerce.number().int().min(-840).max(840).optional().nullable()
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

export const keyParamSchema = z.object({
  key: z.string().trim().min(2).max(80).regex(/^[a-z0-9_-]+$/)
});

export const telegramIdParamSchema = z.object({
  telegramId: z.coerce.number().int().positive()
});

export const userSettingsUpdateSchema = z.object({
  primaryGoal: z.enum(["sport", "discipline", "study", "focus", "health", "charisma"]).optional(),
  desiredDifficulty: difficultySchema.optional(),
  questsPerDay: z.coerce.number().int().min(1).max(7).optional(),
  wakeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
  sleepTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
  allowPhysicalQuests: z.boolean().optional(),
  preferredCategories: z.array(questCategorySchema).max(6).optional(),
  onboardingCompleted: z.boolean().optional()
});

export const squadCreateSchema = z.object({
  name: z.string().trim().min(2).max(40)
});

export const squadJoinSchema = z.object({
  code: z.string().trim().min(4).max(16).regex(/^[A-Za-z0-9_-]+$/)
});
