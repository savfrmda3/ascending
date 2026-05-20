import { z } from "zod";

const questCategorySchema = z.enum(["strength", "intelligence", "vitality", "discipline", "focus", "charisma"]);
const difficultySchema = z.enum(["easy", "medium", "hard"]);
const recurrenceTypeSchema = z.enum(["once", "daily", "weekly", "weekdays"]);
const weekdaySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7)
]);
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const notificationSettingsUpdateSchema = z.object({
  morningEnabled: z.boolean().optional(),
  morningTime: timeSchema.optional(),
  eveningEnabled: z.boolean().optional(),
  eveningTime: timeSchema.optional(),
  sleepEnabled: z.boolean().optional(),
  bedtime: timeSchema.optional().nullable(),
  sleepRemindBeforeMinutes: z.coerce.number().int().min(15).max(120).optional(),
  questRemindersEnabled: z.boolean().optional(),
  activeQuestRemindersEnabled: z.boolean().optional(),
  bossRemindersEnabled: z.boolean().optional(),
  streakWarningEnabled: z.boolean().optional(),
  progressNotificationsEnabled: z.boolean().optional(),
  quietHoursStart: timeSchema.optional().nullable(),
  quietHoursEnd: timeSchema.optional().nullable(),
  maxDailyNotifications: z.coerce.number().int().min(1).max(12).optional()
});

export const squadCreateSchema = z.object({
  name: z.string().trim().min(2).max(40)
});

export const squadJoinSchema = z.object({
  code: z.string().trim().min(4).max(16).regex(/^[A-Za-z0-9_-]+$/)
});

const customQuestTemplateBaseSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(80),
  description: z.string().trim().max(300).optional().default(""),
  category: questCategorySchema,
  difficulty: difficultySchema,
  recurrenceType: recurrenceTypeSchema,
  weekdays: z.array(weekdaySchema).max(7).optional().default([]),
  startsAt: dateStringSchema.optional().nullable(),
  endsAt: dateStringSchema.optional().nullable(),
  isActive: z.boolean().optional()
});

export const customQuestTemplateSchema = customQuestTemplateBaseSchema
  .superRefine((value, ctx) => {
    if (value.recurrenceType === "weekdays" && value.weekdays.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Weekdays must not be empty",
        path: ["weekdays"]
      });
    }
  });

export const customQuestTemplateUpdateSchema = customQuestTemplateBaseSchema.partial().superRefine((value, ctx) => {
  if (value.recurrenceType === "weekdays" && (!value.weekdays || value.weekdays.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Weekdays must not be empty",
      path: ["weekdays"]
    });
  }
});
