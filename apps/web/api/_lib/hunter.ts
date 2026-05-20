import {
  DEFAULT_QUEST_TEMPLATES,
  STAT_KEYS,
  XP_REWARDS,
  applyXp,
  classForStats,
  customQuestRewards,
  rankForLevel,
  xpToNextLevel,
  type AdminOverview,
  type Achievement,
  type AchievementCollectionItem,
  type AchievementRarity,
  type BossProgressResult,
  type DashboardSummary,
  type Difficulty,
  type CustomQuestInput,
  type CustomQuestProgress,
  type CustomQuestTemplate,
  type HabitDayStatus,
  type HabitHealthStatus,
  type HabitProgressDay,
  type HunterGoal,
  type InventoryCatalogItem,
  type InventorySummary,
  type NotificationTickResult,
  type NotificationType,
  type ProgressDay,
  type ProgressHistory,
  type Quest,
  type QuestCategory,
  type QuestCompletionResult,
  type QuestTemplate,
  type SeasonSummary,
  type SkillNode,
  type SkillNodeProgress,
  type SkillTreeSummary,
  type SkillUnlockResult,
  type SquadSummary,
  type StatKey,
  type SystemsOverview,
  type UserNotificationSettings,
  type UserSettings,
  type UserStats,
  type Weekday,
  type WeeklyRecap,
  type WeeklyBoss
} from "@system-hunter/shared";
import { supabase } from "./db.js";
import { addDaysToDateString, getWeekRange, normalizeTimezoneOffset, todayDateString } from "./dates.js";
import { optionalEnv } from "./env.js";
import { badRequest, conflict, notFound } from "./http.js";

interface TelegramUserInput {
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
  timezone?: string | null;
  timezoneOffset?: number | null;
}

const DAILY_GENERATED_QUEST_LIMIT = 3;
const GENERATE_QUEST_ENERGY_COST = 8;
const HARD_QUEST_ENERGY_COST = 15;
const SKIP_HP_PENALTY = 6;
const REPLACE_HP_PENALTY = 2;
const DAILY_RECOVERY_ENERGY = 18;
const DAILY_RECOVERY_HP = 5;
let timezoneColumnsAvailable: boolean | null = null;
let userSettingsTableAvailable: boolean | null = null;
let expansionTablesAvailable: boolean | null = null;
let customQuestTablesAvailable: boolean | null = null;
let notificationTablesAvailable: boolean | null = null;

interface AchievementCatalogItem {
  title: string;
  description: string;
  rarity: AchievementRarity;
  target: number;
  metric: keyof AchievementMetrics;
}

interface AchievementMetrics {
  completedQuests: number;
  streak: number;
  level: number;
  bossesDefeated: number;
  focusCompleted: number;
  disciplineCompleted: number;
  strengthCompleted: number;
  vitalityCompleted: number;
  intelligenceCompleted: number;
  charismaCompleted: number;
}

const ACHIEVEMENTS: Record<string, AchievementCatalogItem> = {
  first_quest: {
    title: "Первый квест",
    description: "Выполни первый ежедневный квест.",
    rarity: "common",
    target: 1,
    metric: "completedQuests"
  },
  streak_3: {
    title: "Серия 3 дня",
    description: "Выполняй квесты три дня подряд.",
    rarity: "common",
    target: 3,
    metric: "streak"
  },
  streak_7: {
    title: "Серия 7 дней",
    description: "Выполняй квесты семь дней подряд.",
    rarity: "rare",
    target: 7,
    metric: "streak"
  },
  streak_14: {
    title: "Серия 14 дней",
    description: "Удержи дисциплину две недели подряд.",
    rarity: "epic",
    target: 14,
    metric: "streak"
  },
  streak_30: {
    title: "Серия 30 дней",
    description: "Закрой месяц без потери ежедневного ритма.",
    rarity: "legendary",
    target: 30,
    metric: "streak"
  },
  first_level_up: {
    title: "Первое повышение",
    description: "Получи новый уровень впервые.",
    rarity: "rare",
    target: 2,
    metric: "level"
  },
  boss_slayer: {
    title: "Победитель босса",
    description: "Победи первого недельного босса.",
    rarity: "rare",
    target: 1,
    metric: "bossesDefeated"
  },
  focus_hunter: {
    title: "Охотник фокуса",
    description: "Выполни 10 квестов фокуса.",
    rarity: "epic",
    target: 10,
    metric: "focusCompleted"
  },
  discipline_initiate: {
    title: "Адепт дисциплины",
    description: "Выполни 10 квестов дисциплины.",
    rarity: "epic",
    target: 10,
    metric: "disciplineCompleted"
  },
  strength_path: {
    title: "Путь силы",
    description: "Выполни 10 квестов силы.",
    rarity: "rare",
    target: 10,
    metric: "strengthCompleted"
  },
  vitality_path: {
    title: "Путь восстановления",
    description: "Выполни 10 квестов здоровья.",
    rarity: "rare",
    target: 10,
    metric: "vitalityCompleted"
  },
  intelligence_path: {
    title: "Путь разума",
    description: "Выполни 10 квестов интеллекта.",
    rarity: "rare",
    target: 10,
    metric: "intelligenceCompleted"
  },
  charisma_path: {
    title: "Путь голоса",
    description: "Выполни 10 квестов харизмы.",
    rarity: "rare",
    target: 10,
    metric: "charismaCompleted"
  }
};

const USER_COLUMNS =
  "id,telegram_id,username,first_name,level,xp,rank,streak,hp,energy,current_title,created_at,updated_at";
const USER_STATS_COLUMNS =
  "id,user_id,strength,intelligence,vitality,discipline,focus,charisma,created_at,updated_at";
const QUEST_COLUMNS =
  "id,user_id,title,description,type,category,difficulty,xp_reward,stat_reward_key,stat_reward_value,status,due_date,completed_at,created_at";
const QUEST_RUNTIME_COLUMNS =
  `${QUEST_COLUMNS},source,custom_template_id,reason,started_at,cancelled_at,deleted_at`;
const CUSTOM_QUEST_INSTANCE_COLUMNS =
  QUEST_RUNTIME_COLUMNS;
const CUSTOM_QUEST_COLUMNS =
  "id,user_id,title,description,category,difficulty,xp_reward,stat_reward_key,stat_reward_value,recurrence_type,weekdays,starts_at,ends_at,is_active,deleted_at,created_at,updated_at";
const BOSS_COLUMNS =
  "id,user_id,name,description,objective,progress,target,xp_reward,stat_reward_key,stat_reward_value,status,starts_at,ends_at,completed_at,created_at";
const ACHIEVEMENT_COLUMNS = "id,user_id,key,title,description,unlocked_at";
const USER_SETTINGS_COLUMNS =
  "id,user_id,primary_goal,desired_difficulty,quests_per_day,wake_time,sleep_time,allow_physical_quests,preferred_categories,onboarding_completed,created_at,updated_at";
const NOTIFICATION_SETTINGS_COLUMNS =
  "id,user_id,morning_enabled,morning_time,evening_enabled,evening_time,sleep_enabled,bedtime,sleep_remind_before_minutes,quest_reminders_enabled,active_quest_reminders_enabled,boss_reminders_enabled,streak_warning_enabled,progress_notifications_enabled,quiet_hours_start,quiet_hours_end,max_daily_notifications,created_at,updated_at";
const QUEST_TEMPLATE_COLUMNS =
  "id,title,description,category,difficulty,xp_reward,stat_reward_key,stat_reward_value,is_active";

const GOAL_CATEGORY: Record<HunterGoal, QuestCategory> = {
  sport: "strength",
  discipline: "discipline",
  study: "intelligence",
  focus: "focus",
  health: "vitality",
  charisma: "charisma"
};

const DEFAULT_SETTINGS = {
  primaryGoal: "focus" as HunterGoal,
  desiredDifficulty: "medium" as Difficulty,
  questsPerDay: 5,
  wakeTime: null,
  sleepTime: null,
  allowPhysicalQuests: true,
  preferredCategories: [] as QuestCategory[],
  onboardingCompleted: false
};

const DEFAULT_SKILL_NODES: SkillNode[] = [
  { key: "focus_i", title: "Focus I", description: "Базовая защита от отвлечений.", statKey: "focus", tier: 1, cost: 1, bonusText: "+1 FOC при открытии" },
  { key: "focus_ii", title: "Focus II", description: "Глубокие блоки даются легче.", statKey: "focus", tier: 2, cost: 2, bonusText: "+2 FOC при открытии" },
  { key: "focus_iii", title: "Focus III", description: "Система чаще предлагает focus-квесты.", statKey: "focus", tier: 3, cost: 3, bonusText: "+3 FOC при открытии" },
  { key: "discipline_i", title: "Discipline I", description: "Ритм дня становится стабильнее.", statKey: "discipline", tier: 1, cost: 1, bonusText: "+1 DSC при открытии" },
  { key: "discipline_ii", title: "Discipline II", description: "Пропуски меньше ломают темп.", statKey: "discipline", tier: 2, cost: 2, bonusText: "+2 DSC при открытии" },
  { key: "discipline_iii", title: "Discipline III", description: "Планирование усиливает серию.", statKey: "discipline", tier: 3, cost: 3, bonusText: "+3 DSC при открытии" },
  { key: "vitality_i", title: "Vitality I", description: "Восстановление энергии ускоряется.", statKey: "vitality", tier: 1, cost: 1, bonusText: "+1 VIT при открытии" },
  { key: "vitality_ii", title: "Vitality II", description: "Здоровье держится устойчивее.", statKey: "vitality", tier: 2, cost: 2, bonusText: "+2 VIT при открытии" },
  { key: "vitality_iii", title: "Vitality III", description: "Тяжелые дни легче пережить.", statKey: "vitality", tier: 3, cost: 3, bonusText: "+3 VIT при открытии" },
  { key: "charisma_i", title: "Charisma I", description: "Социальные квесты становятся проще.", statKey: "charisma", tier: 1, cost: 1, bonusText: "+1 CHA при открытии" },
  { key: "charisma_ii", title: "Charisma II", description: "Коммуникация получает инерцию.", statKey: "charisma", tier: 2, cost: 2, bonusText: "+2 CHA при открытии" },
  { key: "charisma_iii", title: "Charisma III", description: "Голос охотника звучит увереннее.", statKey: "charisma", tier: 3, cost: 3, bonusText: "+3 CHA при открытии" }
];

const DEFAULT_INVENTORY_CATALOG: InventoryCatalogItem[] = [
  { key: "streak_shield", title: "Щит серии", description: "Одноразовая защита серии для будущей механики восстановления.", type: "shield", rarity: "rare", effectKey: "streak_protection", effectValue: 1 },
  { key: "focus_booster", title: "Фокус-ускоритель", description: "Награда за победу над боссом фокуса.", type: "booster", rarity: "epic", effectKey: "focus_bonus", effectValue: 1 },
  { key: "iron_frame", title: "Железная рамка", description: "Косметическая рамка профиля за стабильный прогресс.", type: "frame", rarity: "common", effectKey: null, effectValue: 0 },
  { key: "season_title_token", title: "Жетон сезонного титула", description: "Открывает сезонный титул после завершения сезона.", type: "title", rarity: "legendary", effectKey: "title_unlock", effectValue: 1 }
];

const DEFAULT_SEASON = {
  key: "awakening-2026-05",
  title: "Сезон пробуждения",
  description: "Первый сезон System Hunter: закрепи ритм и победи давление.",
  startsAt: "2026-05-01",
  endsAt: "2026-05-31",
  bossName: "Архонт инерции",
  rewardTitle: "Пробужденный охотник"
};

export class HunterService {
  async syncTelegramUser(input: TelegramUserInput) {
    const user = await this.createOrUpdateUser(input);
    await this.ensureStats(user.id);
    await this.ensureSettings(user.id);
    await this.ensureNotificationSettings(user.id);
    await this.ensureDailyQuests(user.id);
    await this.ensureWeeklyBoss(user.id);
    return this.getProfileBundle(user.id);
  }

  async getDashboard(userId: string): Promise<DashboardSummary> {
    const { profile, stats } = await this.getProfileBundle(userId);
    const [settings, todayQuests, boss, achievements] = await Promise.all([
      this.getSettings(userId),
      this.getTodayQuests(userId),
      this.getCurrentBoss(userId),
      this.getAchievements(userId)
    ]);

    return { profile, stats, settings, todayQuests, boss, achievements };
  }

  async getProfileBundle(userId: string) {
    const user = await this.getUser(userId);
    const timezone = await this.getUserTimezone(userId);
    const stats = toStats(await this.ensureStats(userId));
    const [totalXp, completedQuestsCount] = await Promise.all([
      this.totalXp(userId),
      this.countCompletedQuests(userId)
    ]);

    return {
      profile: {
        id: user.id,
        telegramId: Number(user.telegram_id),
        username: user.username,
        firstName: user.first_name,
        level: user.level,
        xp: user.xp,
        xpToNextLevel: xpToNextLevel(user.level),
        rank: user.rank,
        streak: user.streak,
        hp: user.hp,
        energy: user.energy,
        timezone: timezone.timezone,
        timezoneOffset: timezone.timezone_offset,
        className: classForStats(stats),
        currentTitle: user.current_title,
        totalXp,
        completedQuestsCount,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      stats
    };
  }

  async getProfileByTelegramId(telegramId: number) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.getProfileBundle(user.id);
  }

  async getTodayQuests(userId: string) {
    await this.ensureDailyQuests(userId);
    const { today } = await this.getDateContext(userId);
    let query = supabase
      .from("quests")
      .select(customQuestTablesAvailable === false ? QUEST_COLUMNS : CUSTOM_QUEST_INSTANCE_COLUMNS)
      .eq("user_id", userId)
      .eq("due_date", today);

    if (customQuestTablesAvailable !== false) {
      query = query.is("deleted_at", null);
    }

    const { data, error } = await query.order("created_at", { ascending: true });

    if (error && isMissingCustomQuestSchema(error)) {
      customQuestTablesAvailable = false;
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("quests")
        .select(QUEST_COLUMNS)
        .eq("user_id", userId)
        .eq("due_date", today)
        .order("created_at", { ascending: true });
      if (fallbackError) throw badRequest("Unable to load today's quests", fallbackError);
      return (fallbackData ?? []).map(toQuest);
    }
    if (error) throw badRequest("Unable to load today's quests", error);
    return (data ?? []).map(toQuest);
  }

  async getTodayQuestsByTelegramId(telegramId: number) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.getTodayQuests(user.id);
  }

  async getSettings(userId: string): Promise<UserSettings> {
    return this.ensureSettings(userId);
  }

  async updateSettings(userId: string, input: Partial<UserSettings>): Promise<UserSettings> {
    if (userSettingsTableAvailable === false) throw badRequest("Settings storage is not ready");

    const { data, error } = await supabase
      .from("user_settings")
      .update({
        ...(input.primaryGoal ? { primary_goal: input.primaryGoal } : {}),
        ...(input.desiredDifficulty ? { desired_difficulty: input.desiredDifficulty } : {}),
        ...(typeof input.questsPerDay === "number" ? { quests_per_day: input.questsPerDay } : {}),
        ...(input.wakeTime !== undefined ? { wake_time: input.wakeTime } : {}),
        ...(input.sleepTime !== undefined ? { sleep_time: input.sleepTime } : {}),
        ...(typeof input.allowPhysicalQuests === "boolean" ? { allow_physical_quests: input.allowPhysicalQuests } : {}),
        ...(input.preferredCategories ? { preferred_categories: input.preferredCategories } : {}),
        ...(typeof input.onboardingCompleted === "boolean" ? { onboarding_completed: input.onboardingCompleted } : {}),
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId)
      .select(USER_SETTINGS_COLUMNS)
      .maybeSingle();

    if (error) {
      if (isMissingSettingsTable(error)) {
        userSettingsTableAvailable = false;
        throw badRequest("Settings storage is not ready", error);
      }
      throw badRequest("Unable to update settings", error);
    }

    if (!data) {
      await this.ensureSettings(userId);
      return this.updateSettings(userId, input);
    }

    userSettingsTableAvailable = true;
    return toSettings(data);
  }

  async getNotificationSettings(userId: string): Promise<UserNotificationSettings> {
    return this.ensureNotificationSettings(userId);
  }

  async updateNotificationSettings(userId: string, input: Partial<UserNotificationSettings>): Promise<UserNotificationSettings> {
    if (notificationTablesAvailable === false) throw badRequest("Notification settings storage is not ready");

    const { data, error } = await supabase
      .from("user_notification_settings")
      .update({
        ...(typeof input.morningEnabled === "boolean" ? { morning_enabled: input.morningEnabled } : {}),
        ...(input.morningTime !== undefined ? { morning_time: input.morningTime } : {}),
        ...(typeof input.eveningEnabled === "boolean" ? { evening_enabled: input.eveningEnabled } : {}),
        ...(input.eveningTime !== undefined ? { evening_time: input.eveningTime } : {}),
        ...(typeof input.sleepEnabled === "boolean" ? { sleep_enabled: input.sleepEnabled } : {}),
        ...(input.bedtime !== undefined ? { bedtime: input.bedtime } : {}),
        ...(typeof input.sleepRemindBeforeMinutes === "number" ? { sleep_remind_before_minutes: input.sleepRemindBeforeMinutes } : {}),
        ...(typeof input.questRemindersEnabled === "boolean" ? { quest_reminders_enabled: input.questRemindersEnabled } : {}),
        ...(typeof input.activeQuestRemindersEnabled === "boolean" ? { active_quest_reminders_enabled: input.activeQuestRemindersEnabled } : {}),
        ...(typeof input.bossRemindersEnabled === "boolean" ? { boss_reminders_enabled: input.bossRemindersEnabled } : {}),
        ...(typeof input.streakWarningEnabled === "boolean" ? { streak_warning_enabled: input.streakWarningEnabled } : {}),
        ...(typeof input.progressNotificationsEnabled === "boolean" ? { progress_notifications_enabled: input.progressNotificationsEnabled } : {}),
        ...(input.quietHoursStart !== undefined ? { quiet_hours_start: input.quietHoursStart } : {}),
        ...(input.quietHoursEnd !== undefined ? { quiet_hours_end: input.quietHoursEnd } : {}),
        ...(typeof input.maxDailyNotifications === "number" ? { max_daily_notifications: input.maxDailyNotifications } : {}),
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId)
      .select(NOTIFICATION_SETTINGS_COLUMNS)
      .maybeSingle();

    if (error) {
      if (isMissingNotificationTable(error)) {
        notificationTablesAvailable = false;
        throw badRequest("Notification settings storage is not ready", error);
      }
      throw badRequest("Unable to update notification settings", error);
    }
    if (!data) {
      await this.ensureNotificationSettings(userId);
      return this.updateNotificationSettings(userId, input);
    }

    notificationTablesAvailable = true;
    return toNotificationSettings(data);
  }

  async getCustomQuests(userId: string): Promise<CustomQuestTemplate[]> {
    if (customQuestTablesAvailable === false) return [];

    const { data, error } = await supabase
      .from("custom_quest_templates")
      .select(CUSTOM_QUEST_COLUMNS)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingCustomQuestSchema(error)) {
        customQuestTablesAvailable = false;
        throw badRequest("Custom quests storage is not ready", error);
      }
      throw badRequest("Unable to load custom quests", error);
    }

    customQuestTablesAvailable = true;
    return (data ?? []).map(toCustomQuestTemplate);
  }

  async getCustomQuestProgressList(userId: string): Promise<CustomQuestProgress[]> {
    await this.ensureCustomQuestInstances(userId);
    const templates = await this.getCustomQuests(userId);
    return this.buildCustomQuestProgress(userId, templates);
  }

  async getCustomQuestProgress(userId: string, templateId: string): Promise<CustomQuestProgress> {
    await this.ensureCustomQuestInstances(userId);
    const template = await this.getCustomQuestTemplate(userId, templateId);
    const [progress] = await this.buildCustomQuestProgress(userId, [template]);
    if (!progress) throw notFound("Custom quest not found");
    return progress;
  }

  async createCustomQuest(userId: string, input: CustomQuestInput): Promise<CustomQuestTemplate> {
    if (customQuestTablesAvailable === false) throw badRequest("Custom quests storage is not ready");
    const prepared = await this.prepareCustomQuestInput(userId, input);

    const { data, error } = await supabase
      .from("custom_quest_templates")
      .insert({
        user_id: userId,
        title: prepared.title,
        description: prepared.description,
        category: prepared.category,
        difficulty: prepared.difficulty,
        xp_reward: prepared.xpReward,
        stat_reward_key: prepared.statRewardKey,
        stat_reward_value: prepared.statRewardValue,
        recurrence_type: prepared.recurrenceType,
        weekdays: prepared.weekdays,
        starts_at: prepared.startsAt,
        ends_at: prepared.endsAt,
        is_active: prepared.isActive
      })
      .select(CUSTOM_QUEST_COLUMNS)
      .single();

    if (error || !data) {
      if (isMissingCustomQuestSchema(error)) {
        customQuestTablesAvailable = false;
        throw badRequest("Custom quests storage is not ready", error);
      }
      throw badRequest("Unable to create custom quest", error);
    }

    customQuestTablesAvailable = true;
    const template = toCustomQuestTemplate(data);
    await this.ensureCustomQuestInstances(userId);
    return template;
  }

  async updateCustomQuest(userId: string, templateId: string, input: Partial<CustomQuestInput>): Promise<CustomQuestTemplate> {
    const current = await this.getCustomQuestTemplate(userId, templateId);
    const merged: CustomQuestInput = {
      title: input.title ?? current.title,
      description: input.description ?? current.description,
      category: input.category ?? current.category,
      difficulty: input.difficulty ?? current.difficulty,
      recurrenceType: input.recurrenceType ?? current.recurrenceType,
      weekdays: input.weekdays ?? current.weekdays,
      startsAt: input.startsAt === undefined ? current.startsAt : input.startsAt,
      endsAt: input.endsAt === undefined ? current.endsAt : input.endsAt,
      isActive: input.isActive ?? current.isActive
    };
    const prepared = await this.prepareCustomQuestInput(userId, merged);

    const { data, error } = await supabase
      .from("custom_quest_templates")
      .update({
        title: prepared.title,
        description: prepared.description,
        category: prepared.category,
        difficulty: prepared.difficulty,
        xp_reward: prepared.xpReward,
        stat_reward_key: prepared.statRewardKey,
        stat_reward_value: prepared.statRewardValue,
        recurrence_type: prepared.recurrenceType,
        weekdays: prepared.weekdays,
        starts_at: prepared.startsAt,
        ends_at: prepared.endsAt,
        is_active: prepared.isActive,
        updated_at: new Date().toISOString()
      })
      .eq("id", templateId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .select(CUSTOM_QUEST_COLUMNS)
      .maybeSingle();

    if (error) throw badRequest("Unable to update custom quest", error);
    if (!data) throw notFound("Custom quest not found");
    await this.ensureCustomQuestInstances(userId);
    return toCustomQuestTemplate(data);
  }

  async disableCustomQuest(userId: string, templateId: string) {
    return this.setCustomQuestActive(userId, templateId, false);
  }

  async enableCustomQuest(userId: string, templateId: string) {
    const template = await this.setCustomQuestActive(userId, templateId, true);
    await this.ensureCustomQuestInstances(userId);
    return template;
  }

  async deleteCustomQuest(userId: string, templateId: string) {
    const { data, error } = await supabase
      .from("custom_quest_templates")
      .update({ is_active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", templateId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .select(CUSTOM_QUEST_COLUMNS)
      .maybeSingle();

    if (error) throw badRequest("Unable to delete custom quest", error);
    if (!data) throw notFound("Custom quest not found");
    return toCustomQuestTemplate(data);
  }

  async deleteTodayCustomQuest(userId: string, questId: string) {
    const { today } = await this.getDateContext(userId);
    const { data: quest, error: loadError } = await supabase
      .from("quests")
      .select("id,user_id,type,status,due_date,custom_template_id,deleted_at")
      .eq("id", questId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (loadError) {
      if (isMissingCustomQuestSchema(loadError)) throw badRequest("Custom quests storage is not ready", loadError);
      throw badRequest("Unable to load quest", loadError);
    }
    if (!quest) throw notFound("Quest not found");
    if (quest.status === "completed") throw conflict("Cannot delete completed quest");
    if (quest.status === "in_progress") throw conflict("Cancel quest before deletion");
    if (quest.type !== "custom" || !quest.custom_template_id) throw conflict("Only custom quests can be deleted");
    if (quest.due_date !== today) throw conflict("Only today's custom quest can be deleted");
    if (quest.status !== "active" && quest.status !== "skipped") throw conflict("Only custom quests can be deleted");

    const { data, error } = await supabase
      .from("quests")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", questId)
      .eq("user_id", userId)
      .in("status", ["active", "skipped"])
      .is("deleted_at", null)
      .select(CUSTOM_QUEST_INSTANCE_COLUMNS)
      .maybeSingle();

    if (error) throw badRequest("Unable to delete today's custom quest", error);
    if (!data) throw conflict("Only custom quests can be deleted");
    return { deleted: true };
  }

  async generateQuest(userId: string) {
    return this.createGeneratedQuest(userId);
  }

  async generateQuestByTelegramId(telegramId: number) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.generateQuest(user.id);
  }

  async replaceQuest(userId: string, questId: string) {
    const quest = await this.getQuest(userId, questId);
    if (quest.deleted_at) throw notFound("Quest not found");
    if (quest.status !== "active") throw conflict("Only active quests can be replaced");

    const prepared = await this.prepareGeneratedQuest(userId);
    const { data: replaced, error: replaceError } = await supabase
      .from("quests")
      .update({ status: "skipped", cancelled_at: new Date().toISOString() })
      .eq("id", questId)
      .eq("user_id", userId)
      .eq("status", "active")
      .is("deleted_at", null)
      .select(CUSTOM_QUEST_INSTANCE_COLUMNS)
      .maybeSingle();

    if (replaceError) throw badRequest("Unable to replace quest", replaceError);
    if (!replaced) throw conflict("Quest is not active");
    await this.adjustVitals(userId, { hpDelta: -REPLACE_HP_PENALTY });

    return this.insertGeneratedQuest(userId, prepared.template, prepared.today);
  }

  async startQuest(userId: string, questId: string) {
    const quest = await this.getQuest(userId, questId);
    if (quest.deleted_at) throw notFound("Quest not found");
    if (quest.status === "in_progress") throw conflict("Quest is already in progress");
    if (quest.status !== "active") throw conflict("Only active quests can be started");

    const { today } = await this.getDateContext(userId);
    const { data: existing, error: existingError } = await supabase
      .from("quests")
      .select("id")
      .eq("user_id", userId)
      .eq("due_date", today)
      .eq("status", "in_progress")
      .is("deleted_at", null)
      .neq("id", questId)
      .limit(1)
      .maybeSingle();

    if (existingError) throw badRequest("Unable to inspect active quest", existingError);
    if (existing) throw conflict("Another quest is already in progress");

    const { data, error } = await supabase
      .from("quests")
      .update({ status: "in_progress", started_at: new Date().toISOString(), cancelled_at: null })
      .eq("id", questId)
      .eq("user_id", userId)
      .eq("status", "active")
      .is("deleted_at", null)
      .select(CUSTOM_QUEST_INSTANCE_COLUMNS)
      .maybeSingle();

    if (error) throw badRequest("Unable to start quest", error);
    if (!data) throw conflict("Only active quests can be started");
    return toQuest(data);
  }

  async cancelQuest(userId: string, questId: string) {
    const quest = await this.getQuest(userId, questId);
    if (quest.deleted_at) throw notFound("Quest not found");
    if (quest.status !== "in_progress") throw conflict("Only in-progress quests can be cancelled");

    const { data, error } = await supabase
      .from("quests")
      .update({ status: "active", cancelled_at: new Date().toISOString() })
      .eq("id", questId)
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .is("deleted_at", null)
      .select(CUSTOM_QUEST_INSTANCE_COLUMNS)
      .maybeSingle();

    if (error) throw badRequest("Unable to cancel quest", error);
    if (!data) throw conflict("Only in-progress quests can be cancelled");
    return toQuest(data);
  }

  async completeQuest(userId: string, questId: string): Promise<QuestCompletionResult> {
    const quest = await this.getQuest(userId, questId);
    if (quest.deleted_at) throw notFound("Quest not found");
    if (quest.status === "active") throw conflict("Quest must be started before completion");
    if (quest.status === "completed") throw conflict("Quest is already completed");
    if (quest.status === "skipped") throw conflict("Skipped quest cannot be completed");
    if (quest.status !== "in_progress") throw conflict("Only in-progress quests can be completed");
    if (quest.difficulty === "hard") {
      const user = await this.getUser(userId);
      if (Number(user.energy ?? 0) < HARD_QUEST_ENERGY_COST) throw conflict("Not enough energy for hard quest");
    }

    const { data, error } = await supabase
      .from("quests")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", questId)
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .is("deleted_at", null)
      .select(CUSTOM_QUEST_INSTANCE_COLUMNS)
      .maybeSingle();

    if (error) throw badRequest("Unable to complete quest", error);
    if (!data) throw conflict("Only in-progress quests can be completed");

    if (quest.difficulty === "hard") {
      await this.adjustVitals(userId, { energyDelta: -HARD_QUEST_ENERGY_COST });
    }

    const levelUp = await this.award(userId, quest.xp_reward, quest.stat_reward_key, quest.stat_reward_value);
    await this.applyQuestVitals(userId, quest);
    const streak = await this.calculateStreak(userId);
    await supabase.from("users").update({ streak, updated_at: new Date().toISOString() }).eq("id", userId);

    const bossProgress = await this.syncBossProgress(userId);
    const unlockedAchievements = [
      ...(await this.evaluateAchievements(userId, { leveledUp: levelUp.leveledUp })),
      ...(bossProgress?.unlockedAchievements ?? [])
    ];
    await this.sendProgressNotifications(userId, levelUp, unlockedAchievements).catch(() => undefined);
    const { profile, stats } = await this.getProfileBundle(userId);

    return {
      quest: toQuest(data),
      profile,
      stats,
      rewards: {
        xp: quest.xp_reward,
        statKey: quest.stat_reward_key,
        statValue: quest.stat_reward_value
      },
      levelUp: {
        leveledUp: levelUp.leveledUp,
        from: levelUp.from,
        to: levelUp.to
      },
      bossProgress,
      unlockedAchievements
    };
  }

  async completeQuestByTelegramId(telegramId: number, questId: string) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.completeQuest(user.id, questId);
  }

  async skipQuest(userId: string, questId: string) {
    const quest = await this.getQuest(userId, questId);
    if (quest.deleted_at) throw notFound("Quest not found");
    if (quest.status !== "active") throw conflict("Only active quests can be skipped");

    const { data, error } = await supabase
      .from("quests")
      .update({ status: "skipped" })
      .eq("id", questId)
      .eq("user_id", userId)
      .eq("status", "active")
      .is("deleted_at", null)
      .select(CUSTOM_QUEST_INSTANCE_COLUMNS)
      .maybeSingle();

    if (error) throw badRequest("Unable to skip quest", error);
    if (!data) throw conflict("Quest is not active");
    await this.adjustVitals(userId, { hpDelta: -SKIP_HP_PENALTY });
    return toQuest(data);
  }

  async getCurrentBoss(userId: string) {
    await this.ensureWeeklyBoss(userId);
    const { startsAt, endsAt } = await this.getDateContext(userId);
    const { data, error } = await supabase
      .from("weekly_bosses")
      .select(BOSS_COLUMNS)
      .eq("user_id", userId)
      .eq("starts_at", startsAt)
      .eq("ends_at", endsAt)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw badRequest("Unable to load weekly boss", error);
    if (!data) return null;
    const synced = await this.syncBossProgress(userId, toBoss(data));
    return synced?.boss ?? toBoss(data);
  }

  async getCurrentBossByTelegramId(telegramId: number) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.getCurrentBoss(user.id);
  }

  async progressBoss(userId: string, bossId: string) {
    const boss = await this.getBoss(userId, bossId);
    if (boss.status === "expired") throw conflict("Weekly boss has expired");

    const result = await this.syncBossProgress(userId, boss);
    if (!result) throw notFound("Weekly boss not found");
    return result;
  }

  async runNotificationTick(): Promise<NotificationTickResult> {
    if (notificationTablesAvailable === false) return { checkedUsers: 0, sent: 0, skipped: 0, errors: 0 };

    const { data, error } = await supabase
      .from("user_notification_settings")
      .select(NOTIFICATION_SETTINGS_COLUMNS)
      .limit(250);

    if (error) {
      if (isMissingNotificationTable(error)) {
        notificationTablesAvailable = false;
        return { checkedUsers: 0, sent: 0, skipped: 0, errors: 0 };
      }
      throw badRequest("Unable to load notification settings", error);
    }

    notificationTablesAvailable = true;
    const result: NotificationTickResult = { checkedUsers: data?.length ?? 0, sent: 0, skipped: 0, errors: 0 };

    for (const row of data ?? []) {
      try {
        const settings = toNotificationSettings(row);
        const user = await this.getUser(settings.userId);
        const timezone = await this.getUserTimezone(settings.userId);
        const timezoneOffset = normalizeTimezoneOffset(timezone.timezone_offset);
        const local = localClock(new Date(), timezoneOffset);
        if (isWithinQuietHours(local.minutes, settings.quietHoursStart, settings.quietHoursEnd)) {
          result.skipped += 1;
          continue;
        }

        const sentToday = await this.countNotificationsToday(settings.userId, local.date);
        if (sentToday >= settings.maxDailyNotifications) {
          result.skipped += 1;
          continue;
        }

        const dashboard = await this.getDashboard(settings.userId);
        const due = this.buildDueNotifications(settings, dashboard, local);
        let sentForUser = 0;
        for (const notification of due) {
          if (sentToday + sentForUser >= settings.maxDailyNotifications) break;
          const sent = await this.sendPlannedNotification(settings.userId, Number(user.telegram_id), notification.type, notification.text, notification.payload);
          if (sent) {
            result.sent += 1;
            sentForUser += 1;
          } else {
            result.skipped += 1;
          }
        }
      } catch {
        result.errors += 1;
      }
    }

    return result;
  }

  async progressBossByTelegramId(telegramId: number, bossId: string) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.progressBoss(user.id, bossId);
  }

  private buildDueNotifications(
    settings: UserNotificationSettings,
    dashboard: DashboardSummary,
    local: { date: string; minutes: number; time: string }
  ): Array<{ type: NotificationType; text: string; payload: Record<string, unknown> }> {
    const total = dashboard.todayQuests.length;
    const completed = dashboard.todayQuests.filter((quest) => quest.status === "completed").length;
    const unfinished = dashboard.todayQuests.filter((quest) => quest.status === "active" || quest.status === "in_progress");
    const activeQuest = dashboard.todayQuests.find((quest) => quest.status === "in_progress") ?? null;
    const recommended = dashboard.todayQuests.find((quest) => quest.status === "active") ?? activeQuest;
    const notifications: Array<{ type: NotificationType; text: string; payload: Record<string, unknown> }> = [];

    if (settings.morningEnabled && local.minutes >= timeToMinutes(settings.morningTime)) {
      notifications.push({
        type: "morning_protocol",
        payload: { date: local.date },
        text: [
          "<b>[СИСТЕМА] Ежедневный протокол активирован.</b>",
          `Сегодня доступно квестов: <b>${total}</b>.`,
          `Серия: <b>${dashboard.profile.streak}</b> дн.`,
          recommended ? `Рекомендуемый первый квест: <b>${escapeTelegramHtml(recommended.title)}</b>.` : "Дневной протокол уже закрыт."
        ].join("\n")
      });
    }

    if (settings.questRemindersEnabled && unfinished.length > 0 && local.minutes >= timeToMinutes("17:00")) {
      notifications.push({
        type: "unfinished_quests",
        payload: { date: local.date },
        text: [
          "<b>[СИСТЕМА] Остались незавершённые квесты.</b>",
          `Сегодня выполнено: <b>${completed}/${Math.max(total, 1)}</b>.`,
          "Открой протокол и выбери один следующий шаг."
        ].join("\n")
      });
    }

    if (settings.activeQuestRemindersEnabled && activeQuest?.startedAt && local.minutes >= timeToMinutes("12:00")) {
      const ageMinutes = Math.floor((Date.now() - new Date(activeQuest.startedAt).getTime()) / 60_000);
      if (ageMinutes >= 90) {
        notifications.push({
          type: "active_quest_reminder",
          payload: { date: local.date, questId: activeQuest.id },
          text: [
            "<b>[СИСТЕМА] Активный квест всё ещё в процессе.</b>",
            `<b>${escapeTelegramHtml(activeQuest.title)}</b>`,
            "Заверши, отмени или продолжи выполнение."
          ].join("\n")
        });
      }
    }

    if (settings.eveningEnabled && local.minutes >= timeToMinutes(settings.eveningTime)) {
      notifications.push({
        type: "evening_report",
        payload: { date: local.date },
        text: [
          "<b>[СИСТЕМА] Вечерняя проверка.</b>",
          `Сегодня выполнено: <b>${completed}/${Math.max(total, 1)}</b>.`,
          completed > 0 ? "Прогресс сохранён." : "Серия под угрозой: выполни хотя бы один лёгкий квест."
        ].join("\n")
      });
    }

    if (settings.sleepEnabled && settings.bedtime) {
      const reminderAt = (timeToMinutes(settings.bedtime) - settings.sleepRemindBeforeMinutes + 1440) % 1440;
      if (local.minutes >= reminderAt) {
        notifications.push({
          type: "sleep_reminder",
          payload: { date: local.date },
          text: [
            "<b>[СИСТЕМА] Ночной протокол скоро начнётся.</b>",
            "Рекомендуется завершить дела и подготовиться ко сну.",
            "Сон влияет на восстановление энергии."
          ].join("\n")
        });
      }
    }

    if (settings.streakWarningEnabled && completed === 0 && local.minutes >= timeToMinutes("21:00")) {
      notifications.push({
        type: "streak_warning",
        payload: { date: local.date },
        text: [
          "<b>[СИСТЕМА] Серия под угрозой.</b>",
          "Выполни хотя бы один лёгкий квест, чтобы сохранить прогресс."
        ].join("\n")
      });
    }

    if (settings.bossRemindersEnabled && dashboard.boss?.status === "active" && dashboard.boss.progress < dashboard.boss.target && local.minutes >= timeToMinutes("18:00")) {
      notifications.push({
        type: "boss_reminder",
        payload: { date: local.date, bossId: dashboard.boss.id },
        text: [
          "<b>[СИСТЕМА] Испытание недели ещё активно.</b>",
          `Прогресс: <b>${dashboard.boss.progress}/${dashboard.boss.target}</b>.`,
          `Осталось выполнить focus-квестов: <b>${dashboard.boss.target - dashboard.boss.progress}</b>.`
        ].join("\n")
      });
    }

    return notifications;
  }

  private async sendPlannedNotification(
    userId: string,
    telegramId: number,
    type: NotificationType,
    text: string,
    payload: Record<string, unknown>
  ) {
    const date = String(payload.date ?? todayDateString());
    if (await this.wasNotificationSent(userId, type, date)) return false;
    return this.sendTelegramSystemMessage(userId, telegramId, type, text, payload);
  }

  private async sendProgressNotifications(
    userId: string,
    levelUp: { leveledUp: boolean; from: number; to: number },
    achievements: Achievement[]
  ) {
    const settings = await this.ensureNotificationSettings(userId);
    if (!settings.progressNotificationsEnabled) return;
    const user = await this.getUser(userId);

    if (levelUp.leveledUp) {
      await this.sendTelegramSystemMessage(
        userId,
        Number(user.telegram_id),
        "level_up",
        `<b>[СИСТЕМА] Повышение уровня.</b>\nУровень <b>${levelUp.from}</b> → <b>${levelUp.to}</b>.\nПрогресс сохранён.`,
        { date: todayDateString(), level: levelUp.to }
      );
    }

    for (const achievement of achievements) {
      await this.sendTelegramSystemMessage(
        userId,
        Number(user.telegram_id),
        "achievement",
        `<b>[СИСТЕМА] Достижение открыто.</b>\n<b>${escapeTelegramHtml(achievement.title)}</b>\n${escapeTelegramHtml(achievement.description)}`,
        { date: todayDateString(), achievementKey: achievement.key }
      );
    }
  }

  private async sendTelegramSystemMessage(
    userId: string,
    telegramId: number,
    type: NotificationType,
    text: string,
    payload: Record<string, unknown>
  ) {
    const token = optionalEnv("BOT_TOKEN");
    if (!token) {
      await this.logNotification(userId, type, payload, "error");
      return false;
    }

    const replyMarkup = miniAppReplyMarkup();
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        parse_mode: "HTML",
        reply_markup: replyMarkup
      })
    });
    const data = await response.json().catch(() => null) as { ok?: boolean } | null;
    const status = response.ok && data?.ok ? "sent" : "error";
    await this.logNotification(userId, type, payload, status);
    return status === "sent";
  }

  private async logNotification(userId: string, type: NotificationType, payload: Record<string, unknown>, status: "sent" | "skipped" | "error") {
    if (notificationTablesAvailable === false) return;
    const { error } = await supabase.from("notification_logs").insert({ user_id: userId, type, payload, status });
    if (error && isMissingNotificationTable(error)) notificationTablesAvailable = false;
  }

  private async wasNotificationSent(userId: string, type: NotificationType, date: string) {
    if (notificationTablesAvailable === false) return true;
    const { data, error } = await supabase
      .from("notification_logs")
      .select("id,payload")
      .eq("user_id", userId)
      .eq("type", type)
      .eq("status", "sent")
      .gte("sent_at", `${date}T00:00:00.000Z`)
      .limit(20);

    if (error) {
      if (isMissingNotificationTable(error)) notificationTablesAvailable = false;
      return true;
    }

    return (data ?? []).some((row: any) => String(row.payload?.date ?? "") === date);
  }

  private async countNotificationsToday(userId: string, date: string) {
    if (notificationTablesAvailable === false) return 0;
    const { count, error } = await supabase
      .from("notification_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "sent")
      .gte("sent_at", `${date}T00:00:00.000Z`);

    if (error) {
      if (isMissingNotificationTable(error)) notificationTablesAvailable = false;
      return 0;
    }
    return count ?? 0;
  }

  async getAchievements(userId: string) {
    const { data, error } = await supabase
      .from("achievements")
      .select(ACHIEVEMENT_COLUMNS)
      .eq("user_id", userId)
      .order("unlocked_at", { ascending: false });

    if (error) throw badRequest("Unable to load achievements", error);
    return (data ?? []).map(toAchievement);
  }

  async getProgressHistory(userId: string): Promise<ProgressHistory> {
    const { today, startsAt, endsAt } = await this.getDateContext(userId);
    const since = addDaysToDateString(today, -29);
    const [historyResponse, recentResponse, achievementCollection] = await Promise.all([
      supabase
        .from("quests")
        .select(QUEST_COLUMNS)
        .eq("user_id", userId)
        .gte("due_date", since)
        .lte("due_date", today)
        .order("due_date", { ascending: true }),
      supabase
        .from("quests")
        .select(QUEST_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      this.getAchievementCollection(userId)
    ]);

    if (historyResponse.error) throw badRequest("Unable to load progress history", historyResponse.error);
    if (recentResponse.error) throw badRequest("Unable to load recent quests", recentResponse.error);

    const historyQuests = (historyResponse.data ?? []).map(toQuest);
    const recentQuests = (recentResponse.data ?? []).map(toQuest);
    const weeklyQuests = historyQuests.filter((quest) => quest.dueDate >= startsAt && quest.dueDate <= endsAt);

    return {
      calendar: buildProgressCalendar(historyQuests, since, today),
      recentQuests,
      weeklyRecap: buildWeeklyRecap(weeklyQuests, startsAt, endsAt),
      achievementCollection
    };
  }

  async getSystemsOverview(userId: string): Promise<SystemsOverview> {
    const [skills, inventory, season, squad, admin] = await Promise.all([
      this.getSkillTree(userId),
      this.getInventory(userId),
      this.getSeasonSummary(userId),
      this.getSquadSummary(userId),
      this.getAdminOverview(userId)
    ]);

    return { skills, inventory, season, squad, admin };
  }

  async getSystemsByTelegramId(telegramId: number): Promise<SystemsOverview> {
    const user = await this.getUserByTelegramId(telegramId);
    return this.getSystemsOverview(user.id);
  }

  async unlockSkill(userId: string, key: string): Promise<SkillUnlockResult> {
    const tree = await this.getSkillTree(userId);
    const node = tree.nodes.find((item) => item.key === key);
    if (!node) throw notFound("Skill node not found");
    if (node.unlocked) throw conflict("Skill already unlocked");
    if (!node.canUnlock) throw conflict("Skill requirements are not met");
    if (tree.availablePoints < node.cost) throw conflict("Not enough skill points");

    const { error } = await supabase
      .from("user_skills")
      .insert({ user_id: userId, skill_key: key });

    if (error) {
      if (isMissingExpansionTable(error)) {
        expansionTablesAvailable = false;
        throw badRequest("Expansion systems storage is not ready", error);
      }
      if (error.code === "23505") throw conflict("Skill already unlocked");
      throw badRequest("Unable to unlock skill", error);
    }

    await this.increaseStat(userId, node.statKey, node.tier);
    const [{ profile, stats }, skills] = await Promise.all([
      this.getProfileBundle(userId),
      this.getSkillTree(userId)
    ]);

    return { skills, profile, stats };
  }

  async createSquad(userId: string, name: string) {
    const existing = await this.getSquadSummary(userId);
    if (existing) return existing;

    const { data: squad, error } = await supabase
      .from("squads")
      .insert({ owner_user_id: userId, name })
      .select("id,name,code,created_at")
      .single();

    if (error || !squad) {
      if (isMissingExpansionTable(error)) {
        expansionTablesAvailable = false;
        throw badRequest("Expansion systems storage is not ready", error);
      }
      throw badRequest("Unable to create squad", error);
    }

    const { error: memberError } = await supabase
      .from("squad_members")
      .insert({ squad_id: squad.id, user_id: userId, role: "owner" });

    if (memberError) throw badRequest("Unable to join created squad", memberError);
    return this.getSquadSummary(userId);
  }

  async joinSquad(userId: string, code: string) {
    const existing = await this.getSquadSummary(userId);
    if (existing) throw conflict("User already has a squad");

    const { data: squad, error } = await supabase
      .from("squads")
      .select("id")
      .eq("code", code.trim().toUpperCase())
      .maybeSingle();

    if (error) {
      if (isMissingExpansionTable(error)) {
        expansionTablesAvailable = false;
        throw badRequest("Expansion systems storage is not ready", error);
      }
      throw badRequest("Unable to load squad", error);
    }
    if (!squad) throw notFound("Squad not found");

    const { error: memberError } = await supabase
      .from("squad_members")
      .insert({ squad_id: squad.id, user_id: userId, role: "member" });

    if (memberError?.code === "23505") throw conflict("User already has a squad");
    if (memberError) throw badRequest("Unable to join squad", memberError);
    return this.getSquadSummary(userId);
  }

  private async getAchievementCollection(userId: string): Promise<AchievementCollectionItem[]> {
    const [unlockedAchievements, metrics] = await Promise.all([
      this.getAchievements(userId),
      this.getAchievementMetrics(userId)
    ]);
    const unlockedByKey = new Map(unlockedAchievements.map((achievement) => [achievement.key, achievement]));

    return Object.entries(ACHIEVEMENTS).map(([key, catalog]) => {
      const achievement = unlockedByKey.get(key);
      const rawProgress = Number(metrics[catalog.metric] ?? 0);
      return {
        key,
        title: catalog.title,
        description: catalog.description,
        rarity: catalog.rarity,
        unlocked: Boolean(achievement),
        unlockedAt: achievement?.unlockedAt ?? null,
        progress: Math.min(catalog.target, rawProgress),
        target: catalog.target
      };
    });
  }

  private async getAchievementMetrics(userId: string): Promise<AchievementMetrics> {
    const [user, bossesDefeated, completedQuests, ...categoryCounts] = await Promise.all([
      this.getUser(userId),
      this.countCompletedBosses(userId),
      this.countCompletedQuests(userId),
      ...STAT_KEYS.map((category) => this.countCompletedQuests(userId, category))
    ]);
    const byCategory = Object.fromEntries(
      STAT_KEYS.map((category, index) => [category, categoryCounts[index] ?? 0])
    ) as Record<StatKey, number>;

    return {
      completedQuests,
      streak: user.streak,
      level: user.level,
      bossesDefeated,
      focusCompleted: byCategory.focus,
      disciplineCompleted: byCategory.discipline,
      strengthCompleted: byCategory.strength,
      vitalityCompleted: byCategory.vitality,
      intelligenceCompleted: byCategory.intelligence,
      charismaCompleted: byCategory.charisma
    };
  }

  private async getSkillTree(userId: string): Promise<SkillTreeSummary> {
    const [nodes, unlockedRows, profile, bossesDefeated] = await Promise.all([
      this.getSkillNodes(),
      this.getUnlockedSkillRows(userId),
      this.getProfileBundle(userId).then((bundle) => bundle.profile),
      this.countCompletedBosses(userId)
    ]);
    const unlocked = new Map(unlockedRows.map((row) => [row.skill_key, row.unlocked_at]));
    const spentPoints = nodes
      .filter((node) => unlocked.has(node.key))
      .reduce((total, node) => total + node.cost, 0);
    const totalPoints = Math.max(0, Math.floor(profile.level / 2) + bossesDefeated * 2);
    const availablePoints = Math.max(0, totalPoints - spentPoints);

    return {
      totalPoints,
      spentPoints,
      availablePoints,
      nodes: nodes.map((node) => {
        const unlockedAt = unlocked.get(node.key) ?? null;
        return {
          ...node,
          unlocked: Boolean(unlockedAt),
          unlockedAt,
          canUnlock: Boolean(unlockedAt) ? false : availablePoints >= node.cost && skillPrerequisiteMet(node, unlocked)
        };
      })
    };
  }

  private async getSkillNodes(): Promise<SkillNode[]> {
    if (expansionTablesAvailable === false) return DEFAULT_SKILL_NODES;

    const { data, error } = await supabase
      .from("skill_nodes")
      .select("key,title,description,stat_key,tier,cost,bonus_text")
      .eq("is_active", true)
      .order("stat_key", { ascending: true })
      .order("tier", { ascending: true });

    if (error) {
      if (isMissingExpansionTable(error)) {
        expansionTablesAvailable = false;
        return DEFAULT_SKILL_NODES;
      }
      throw badRequest("Unable to load skill tree", error);
    }

    expansionTablesAvailable = true;
    return (data ?? []).map((row: any) => ({
      key: row.key,
      title: row.title,
      description: row.description,
      statKey: row.stat_key,
      tier: row.tier,
      cost: row.cost,
      bonusText: row.bonus_text
    }));
  }

  private async getUnlockedSkillRows(userId: string): Promise<Array<{ skill_key: string; unlocked_at: string }>> {
    if (expansionTablesAvailable === false) return [];

    const { data, error } = await supabase
      .from("user_skills")
      .select("skill_key,unlocked_at")
      .eq("user_id", userId);

    if (error) {
      if (isMissingExpansionTable(error)) {
        expansionTablesAvailable = false;
        return [];
      }
      throw badRequest("Unable to load unlocked skills", error);
    }

    expansionTablesAvailable = true;
    return data ?? [];
  }

  private async getInventory(userId: string): Promise<InventorySummary> {
    const [catalog, rows] = await Promise.all([
      this.getInventoryCatalog(),
      this.getUserInventoryRows(userId)
    ]);
    const catalogByKey = new Map(catalog.map((item) => [item.key, item]));

    return {
      catalog,
      items: rows
        .map((row) => {
          const item = catalogByKey.get(row.item_key);
          if (!item) return null;
          return { item, quantity: row.quantity, acquiredAt: row.acquired_at };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    };
  }

  private async getInventoryCatalog(): Promise<InventoryCatalogItem[]> {
    if (expansionTablesAvailable === false) return DEFAULT_INVENTORY_CATALOG;

    const { data, error } = await supabase
      .from("inventory_items")
      .select("key,title,description,type,rarity,effect_key,effect_value")
      .eq("is_active", true)
      .order("rarity", { ascending: true });

    if (error) {
      if (isMissingExpansionTable(error)) {
        expansionTablesAvailable = false;
        return DEFAULT_INVENTORY_CATALOG;
      }
      throw badRequest("Unable to load inventory catalog", error);
    }

    expansionTablesAvailable = true;
    return (data ?? []).map(toInventoryItem);
  }

  private async getUserInventoryRows(userId: string): Promise<Array<{ item_key: string; quantity: number; acquired_at: string }>> {
    if (expansionTablesAvailable === false) return [];

    const { data, error } = await supabase
      .from("user_inventory")
      .select("item_key,quantity,acquired_at")
      .eq("user_id", userId);

    if (error) {
      if (isMissingExpansionTable(error)) {
        expansionTablesAvailable = false;
        return [];
      }
      throw badRequest("Unable to load inventory", error);
    }

    expansionTablesAvailable = true;
    return data ?? [];
  }

  private async getSeasonSummary(userId: string): Promise<SeasonSummary | null> {
    const { today } = await this.getDateContext(userId);
    const season = await this.getCurrentSeason(today);
    if (!season) return null;
    const progress = await this.getSeasonProgress(userId, season.id);

    return {
      key: season.key,
      title: season.title,
      description: season.description,
      startsAt: season.starts_at,
      endsAt: season.ends_at,
      bossName: season.boss_name,
      rewardTitle: season.reward_title,
      questsCompleted: progress?.quests_completed ?? 0,
      bossesDefeated: progress?.bosses_defeated ?? 0,
      xp: progress?.xp ?? 0,
      rewardClaimed: progress?.reward_claimed ?? false
    };
  }

  private async getCurrentSeason(today: string): Promise<any | null> {
    if (expansionTablesAvailable === false) return { id: "default-season", ...toSeasonRow(DEFAULT_SEASON) };

    const { data, error } = await supabase
      .from("seasons")
      .select("id,key,title,description,starts_at,ends_at,boss_name,reward_title")
      .eq("is_active", true)
      .lte("starts_at", today)
      .gte("ends_at", today)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (isMissingExpansionTable(error)) {
        expansionTablesAvailable = false;
        return { id: "default-season", ...toSeasonRow(DEFAULT_SEASON) };
      }
      throw badRequest("Unable to load season", error);
    }

    expansionTablesAvailable = true;
    return data;
  }

  private async getSeasonProgress(userId: string, seasonId: string) {
    if (expansionTablesAvailable === false || seasonId === "default-season") return null;

    const { data, error } = await supabase
      .from("season_progress")
      .select("quests_completed,bosses_defeated,xp,reward_claimed")
      .eq("user_id", userId)
      .eq("season_id", seasonId)
      .maybeSingle();

    if (error) {
      if (isMissingExpansionTable(error)) {
        expansionTablesAvailable = false;
        return null;
      }
      throw badRequest("Unable to load season progress", error);
    }

    return data;
  }

  private async syncSeasonProgress(userId: string, event: { questXp?: number; bossDefeated?: boolean }) {
    if (expansionTablesAvailable === false) return;
    const { today } = await this.getDateContext(userId);
    const season = await this.getCurrentSeason(today);
    if (!season || season.id === "default-season") return;
    const progress = await this.getSeasonProgress(userId, season.id);
    const next = {
      season_id: season.id,
      user_id: userId,
      quests_completed: (progress?.quests_completed ?? 0) + (event.questXp ? 1 : 0),
      bosses_defeated: (progress?.bosses_defeated ?? 0) + (event.bossDefeated ? 1 : 0),
      xp: (progress?.xp ?? 0) + (event.questXp ?? 0),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from("season_progress")
      .upsert(next, { onConflict: "season_id,user_id" });

    if (error) {
      if (isMissingExpansionTable(error)) {
        expansionTablesAvailable = false;
        return;
      }
      throw badRequest("Unable to update season progress", error);
    }
  }

  private async getSquadSummary(userId: string): Promise<SquadSummary | null> {
    if (expansionTablesAvailable === false) return null;

    const { data, error } = await supabase
      .from("squad_members")
      .select("role,joined_at,squads(id,name,code,created_at)")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingExpansionTable(error)) {
        expansionTablesAvailable = false;
        return null;
      }
      throw badRequest("Unable to load squad", error);
    }
    if (!data?.squads) return null;

    const squad = Array.isArray(data.squads) ? data.squads[0] : data.squads;
    if (!squad) return null;
    const { count, error: countError } = await supabase
      .from("squad_members")
      .select("id", { count: "exact", head: true })
      .eq("squad_id", squad.id);

    if (countError) throw badRequest("Unable to count squad members", countError);
    return {
      id: squad.id,
      name: squad.name,
      code: squad.code,
      role: data.role,
      memberCount: count ?? 1,
      createdAt: squad.created_at
    };
  }

  private async getAdminOverview(userId: string): Promise<AdminOverview | null> {
    const user = await this.getUser(userId);
    if (!isAdminTelegramId(Number(user.telegram_id))) return null;
    const { today } = await this.getDateContext(userId);
    const [users, activeQuests, completedQuests, templates, bosses] = await Promise.all([
      supabase.from("users").select("id", { count: "exact", head: true }),
      supabase.from("quests").select("id", { count: "exact", head: true }).eq("due_date", today).eq("status", "active"),
      supabase.from("quests").select("id", { count: "exact", head: true }).eq("due_date", today).eq("status", "completed"),
      supabase.from("quest_templates").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("weekly_bosses").select("id", { count: "exact", head: true }).eq("status", "active")
    ]);

    for (const response of [users, activeQuests, completedQuests, templates, bosses]) {
      if (response.error) throw badRequest("Unable to load admin overview", response.error);
    }

    return {
      usersCount: users.count ?? 0,
      activeQuestsToday: activeQuests.count ?? 0,
      completedQuestsToday: completedQuests.count ?? 0,
      templatesCount: templates.count ?? 0,
      activeBossesCount: bosses.count ?? 0
    };
  }

  private async createOrUpdateUser(input: TelegramUserInput) {
    const existing = await this.findUserByTelegramId(input.telegramId);
    if (existing) {
      const { data, error } = await supabase
        .from("users")
        .update({
          username: input.username ?? existing.username,
          first_name: input.firstName ?? existing.first_name,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id)
        .select(USER_COLUMNS)
        .single();

      if (error || !data) throw badRequest("Unable to update user", error);
      await this.saveUserTimezone(existing.id, input);
      return data;
    }

    const { data, error } = await supabase
      .from("users")
      .insert({
        telegram_id: input.telegramId,
        username: input.username ?? null,
        first_name: input.firstName ?? null,
        rank: rankForLevel(1)
      })
      .select(USER_COLUMNS)
      .single();

    if (error || !data) throw badRequest("Unable to create user", error);
    await this.saveUserTimezone(data.id, input);
    return data;
  }

  private async findUserByTelegramId(telegramId: number) {
    const { data, error } = await supabase
      .from("users")
      .select(USER_COLUMNS)
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (error) throw badRequest("Unable to load user", error);
    return data;
  }

  private async getUserByTelegramId(telegramId: number) {
    const user = await this.findUserByTelegramId(telegramId);
    if (!user) throw notFound("User not found");
    return user;
  }

  private async getUser(userId: string) {
    const { data, error } = await supabase.from("users").select(USER_COLUMNS).eq("id", userId).maybeSingle();
    if (error) throw badRequest("Unable to load user", error);
    if (!data) throw notFound("User not found");
    return data;
  }

  private async ensureStats(userId: string) {
    const { data, error } = await supabase
      .from("user_stats")
      .select(USER_STATS_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw badRequest("Unable to load stats", error);
    if (data) return data;

    const { data: created, error: createError } = await supabase
      .from("user_stats")
      .insert({ user_id: userId })
      .select(USER_STATS_COLUMNS)
      .single();

    if (createError || !created) throw badRequest("Unable to create stats", createError);
    return created;
  }

  private async ensureSettings(userId: string): Promise<UserSettings> {
    if (userSettingsTableAvailable === false) return defaultSettings(userId);

    const { data, error } = await supabase
      .from("user_settings")
      .select(USER_SETTINGS_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingSettingsTable(error)) {
        userSettingsTableAvailable = false;
        return defaultSettings(userId);
      }
      throw badRequest("Unable to load settings", error);
    }

    if (data) {
      userSettingsTableAvailable = true;
      return toSettings(data);
    }

    const { data: created, error: createError } = await supabase
      .from("user_settings")
      .insert({ user_id: userId })
      .select(USER_SETTINGS_COLUMNS)
      .single();

    if (createError || !created) {
      if (isMissingSettingsTable(createError)) {
        userSettingsTableAvailable = false;
        return defaultSettings(userId);
      }
      throw badRequest("Unable to create settings", createError);
    }

    userSettingsTableAvailable = true;
    return toSettings(created);
  }

  private async ensureNotificationSettings(userId: string): Promise<UserNotificationSettings> {
    const fallback = defaultNotificationSettings(userId);
    if (notificationTablesAvailable === false) return fallback;

    const { data, error } = await supabase
      .from("user_notification_settings")
      .select(NOTIFICATION_SETTINGS_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingNotificationTable(error)) {
        notificationTablesAvailable = false;
        return fallback;
      }
      throw badRequest("Unable to load notification settings", error);
    }

    if (data) {
      notificationTablesAvailable = true;
      return toNotificationSettings(data);
    }

    const { data: created, error: createError } = await supabase
      .from("user_notification_settings")
      .insert({ user_id: userId })
      .select(NOTIFICATION_SETTINGS_COLUMNS)
      .single();

    if (createError || !created) {
      if (isMissingNotificationTable(createError)) {
        notificationTablesAvailable = false;
        return fallback;
      }
      throw badRequest("Unable to create notification settings", createError);
    }

    notificationTablesAvailable = true;
    return toNotificationSettings(created);
  }

  private async getCustomQuestTemplate(userId: string, templateId: string): Promise<CustomQuestTemplate> {
    const { data, error } = await supabase
      .from("custom_quest_templates")
      .select(CUSTOM_QUEST_COLUMNS)
      .eq("id", templateId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      if (isMissingCustomQuestSchema(error)) {
        customQuestTablesAvailable = false;
        throw badRequest("Custom quests storage is not ready", error);
      }
      throw badRequest("Unable to load custom quest", error);
    }
    if (!data) throw notFound("Custom quest not found");

    customQuestTablesAvailable = true;
    return toCustomQuestTemplate(data);
  }

  private async setCustomQuestActive(userId: string, templateId: string, isActive: boolean) {
    const { data, error } = await supabase
      .from("custom_quest_templates")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", templateId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .select(CUSTOM_QUEST_COLUMNS)
      .maybeSingle();

    if (error) throw badRequest(isActive ? "Unable to enable custom quest" : "Unable to disable custom quest", error);
    if (!data) throw notFound("Custom quest not found");
    return toCustomQuestTemplate(data);
  }

  private async buildCustomQuestProgress(userId: string, templates: CustomQuestTemplate[]): Promise<CustomQuestProgress[]> {
    if (templates.length === 0) return [];
    const { today } = await this.getDateContext(userId);
    const since = addDaysToDateString(today, -59);
    const templateIds = templates.map((template) => template.id);
    const { data, error } = await supabase
      .from("quests")
      .select(CUSTOM_QUEST_INSTANCE_COLUMNS)
      .eq("user_id", userId)
      .in("custom_template_id", templateIds)
      .gte("due_date", since)
      .lte("due_date", today)
      .order("due_date", { ascending: true });

    if (error) {
      if (isMissingCustomQuestSchema(error)) {
        customQuestTablesAvailable = false;
        throw badRequest("Custom quests storage is not ready", error);
      }
      throw badRequest("Unable to load custom quest progress", error);
    }

    const questsByTemplate = new Map<string, Quest[]>();
    for (const quest of (data ?? []).map(toQuest)) {
      if (quest.deletedAt) continue;
      const templateId = quest.customTemplateId;
      if (!templateId) continue;
      const bucket = questsByTemplate.get(templateId) ?? [];
      bucket.push(quest);
      questsByTemplate.set(templateId, bucket);
    }

    return templates.map((template) => buildHabitProgress(template, questsByTemplate.get(template.id) ?? [], since, today));
  }

  private async prepareCustomQuestInput(userId: string, input: CustomQuestInput) {
    const { today } = await this.getDateContext(userId);
    const recurrenceType = input.recurrenceType;
    const weekdays = uniqueWeekdays(input.weekdays ?? []);
    if (recurrenceType === "weekdays" && weekdays.length === 0) {
      throw badRequest("Choose at least one weekday");
    }

    const rewards = customQuestRewards(input.category, input.difficulty);
    return {
      title: input.title.trim(),
      description: (input.description ?? "").trim(),
      category: input.category,
      difficulty: input.difficulty,
      recurrenceType,
      weekdays: recurrenceType === "weekdays" ? weekdays : [],
      startsAt: input.startsAt ?? today,
      endsAt: input.endsAt ?? null,
      isActive: input.isActive ?? true,
      ...rewards
    };
  }

  private async ensureDailyQuests(userId: string) {
    const { today } = await this.getDateContext(userId);
    const { data, error } = await supabase
      .from("quests")
      .select("id,type")
      .eq("user_id", userId)
      .eq("due_date", today)
      .neq("type", "custom")
      .limit(1);

    if (error) throw badRequest("Unable to inspect quests", error);
    if ((data ?? []).length === 0) {
      await this.adjustVitals(userId, { hpDelta: DAILY_RECOVERY_HP, energyDelta: DAILY_RECOVERY_ENERGY });
      const settings = await this.getSettings(userId);
      const templates = await this.getPersonalizedQuestTemplates(userId, settings);
      const rows = pickRandomUniqueTemplates(templates, settings.questsPerDay, new Set()).map((template) => ({
        user_id: userId,
        title: template.title,
        description: template.description,
        type: "daily",
        source: "system",
        category: template.category,
        difficulty: template.difficulty,
        xp_reward: template.xpReward,
        stat_reward_key: template.statRewardKey,
        stat_reward_value: template.statRewardValue,
        due_date: today
      }));

      if (rows.length === 0) throw badRequest("No quest templates are available");
      const { error: insertError } = await supabase.from("quests").insert(rows);
      if (insertError) {
        if (isMissingCustomQuestSchema(insertError)) {
          const fallbackRows = rows.map(({ source, ...row }) => row);
          const { error: fallbackError } = await supabase.from("quests").insert(fallbackRows);
          if (fallbackError) throw badRequest("Unable to create quests", fallbackError);
        } else {
          throw badRequest("Unable to create quests", insertError);
        }
      }
    }

    await this.ensureCustomQuestInstances(userId, today);
  }

  private async ensureCustomQuestInstances(userId: string, date?: string) {
    if (customQuestTablesAvailable === false) return;
    const { today } = date ? { today: date } : await this.getDateContext(userId);
    const { data: templates, error } = await supabase
      .from("custom_quest_templates")
      .select(CUSTOM_QUEST_COLUMNS)
      .eq("user_id", userId)
      .eq("is_active", true)
      .is("deleted_at", null);

    if (error) {
      if (isMissingCustomQuestSchema(error)) {
        customQuestTablesAvailable = false;
        return;
      }
      throw badRequest("Unable to load custom quests", error);
    }

    customQuestTablesAvailable = true;
    const dueTemplates = (templates ?? []).map(toCustomQuestTemplate).filter((template) => shouldCreateCustomQuestToday(template, today));
    if (dueTemplates.length === 0) return;

    const { data: existing, error: existingError } = await supabase
      .from("quests")
      .select("custom_template_id")
      .eq("user_id", userId)
      .eq("due_date", today)
      .not("custom_template_id", "is", null);

    if (existingError) {
      if (isMissingCustomQuestSchema(existingError)) {
        customQuestTablesAvailable = false;
        return;
      }
      throw badRequest("Unable to inspect custom quests", existingError);
    }

    const existingTemplateIds = new Set((existing ?? []).map((row: any) => String(row.custom_template_id)));
    const rows = dueTemplates
      .filter((template) => !existingTemplateIds.has(template.id))
      .map((template) => ({
        user_id: userId,
        title: template.title,
        description: template.description,
        type: "custom",
        source: "custom",
        custom_template_id: template.id,
        category: template.category,
        difficulty: template.difficulty,
        xp_reward: template.xpReward,
        stat_reward_key: template.statRewardKey,
        stat_reward_value: template.statRewardValue,
        due_date: today,
        reason: customQuestReason(template)
      }));

    if (rows.length === 0) return;
    const { error: insertError } = await supabase.from("quests").insert(rows);
    if (insertError?.code === "23505") return;
    if (insertError) {
      if (isMissingCustomQuestSchema(insertError)) {
        customQuestTablesAvailable = false;
        return;
      }
      throw badRequest("Unable to create custom quests", insertError);
    }
  }

  private async ensureWeeklyBoss(userId: string) {
    const { startsAt, endsAt } = await this.getDateContext(userId);
    const { data, error } = await supabase
      .from("weekly_bosses")
      .select("id")
      .eq("user_id", userId)
      .eq("starts_at", startsAt)
      .eq("ends_at", endsAt)
      .limit(1);

    if (error) throw badRequest("Unable to inspect weekly boss", error);
    if ((data ?? []).length > 0) return;

    const { error: insertError } = await supabase.from("weekly_bosses").insert({
      user_id: userId,
      name: "Пожиратель фокуса",
      description: "Сущность давления, которая слабеет, когда ты защищаешь блоки глубокой работы.",
      objective: "Заверши 4 сессии глубокой работы.",
      target: 4,
      xp_reward: XP_REWARDS.boss,
      stat_reward_key: "focus",
      stat_reward_value: 3,
      starts_at: startsAt,
      ends_at: endsAt
    });

    if (insertError) throw badRequest("Unable to create weekly boss", insertError);
  }

  private async prepareGeneratedQuest(userId: string) {
    const { today } = await this.getDateContext(userId);
    const todayQuests = await this.getQuestsForDate(userId, today);
    const generatedCount = todayQuests.filter((quest) => quest.type === "generated").length;

    if (generatedCount >= DAILY_GENERATED_QUEST_LIMIT) {
      throw conflict("Daily generated quest limit reached");
    }

    const settings = await this.getSettings(userId);
    const existingKeys = new Set(todayQuests.map((quest) => questTemplateKey(quest.title, quest.category)));
    const template = pickRandomUniqueTemplates(
      await this.getPersonalizedQuestTemplates(userId, settings),
      1,
      existingKeys
    )[0];

    if (!template) throw conflict("No unique quest templates available today");
    return { template, today };
  }

  private async createGeneratedQuest(userId: string) {
    const prepared = await this.prepareGeneratedQuest(userId);
    await this.spendEnergy(userId, GENERATE_QUEST_ENERGY_COST, "Not enough energy to generate quest");
    return this.insertGeneratedQuest(userId, prepared.template, prepared.today);
  }

  private async insertGeneratedQuest(userId: string, template: QuestTemplate, today: string) {
    const { data, error } = await supabase
      .from("quests")
      .insert({
        user_id: userId,
        title: template.title,
        description: template.description,
        type: "generated",
        source: "generated",
        category: template.category,
        difficulty: template.difficulty,
        xp_reward: template.xpReward,
        stat_reward_key: template.statRewardKey,
        stat_reward_value: template.statRewardValue,
        due_date: today
      })
      .select(CUSTOM_QUEST_INSTANCE_COLUMNS)
      .single();

    if (error?.code === "23505") throw conflict("Quest already exists today");
    if (error && isMissingCustomQuestSchema(error)) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("quests")
        .insert({
          user_id: userId,
          title: template.title,
          description: template.description,
          type: "generated",
          category: template.category,
          difficulty: template.difficulty,
          xp_reward: template.xpReward,
          stat_reward_key: template.statRewardKey,
          stat_reward_value: template.statRewardValue,
          due_date: today
        })
        .select(QUEST_COLUMNS)
        .single();
      if (fallbackError || !fallbackData) throw badRequest("Unable to generate quest", fallbackError);
      return toQuest(fallbackData);
    }
    if (error || !data) throw badRequest("Unable to generate quest", error);
    return toQuest(data);
  }

  private async getQuestsForDate(userId: string, date: string) {
    const { data, error } = await supabase
      .from("quests")
      .select(QUEST_COLUMNS)
      .eq("user_id", userId)
      .eq("due_date", date);

    if (error) throw badRequest("Unable to inspect quests", error);
    return data ?? [];
  }

  private async getPersonalizedQuestTemplates(userId: string, settings: UserSettings) {
    const [templates, stats, recentSkippedCategories] = await Promise.all([
      this.getQuestTemplates(),
      this.ensureStats(userId).then(toStats),
      this.getRecentSkippedCategories(userId)
    ]);
    const goalCategory = GOAL_CATEGORY[settings.primaryGoal];
    const preferredCategories = new Set(settings.preferredCategories);
    const weakCategory = STAT_KEYS.reduce<StatKey>(
      (weakest, key) => (stats[key] < stats[weakest] ? key : weakest),
      "strength"
    );

    return uniqueTemplates(templates)
      .filter((template) => settings.allowPhysicalQuests || template.category !== "strength")
      .map((template) => ({
        template,
        score:
          (template.category === goalCategory ? 4 : 0) +
          (preferredCategories.has(template.category) ? 3 : 0) +
          (template.category === weakCategory ? 2 : 0) +
          difficultyScore(template.difficulty, settings.desiredDifficulty) -
          (recentSkippedCategories.has(template.category) ? 2 : 0) +
          Math.random()
      }))
      .sort((left, right) => right.score - left.score)
      .map((item) => item.template);
  }

  private async getRecentSkippedCategories(userId: string) {
    const { data, error } = await supabase
      .from("quests")
      .select("category")
      .eq("user_id", userId)
      .eq("status", "skipped")
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) throw badRequest("Unable to inspect skipped quests", error);
    const counts = new Map<QuestCategory, number>();
    for (const row of data ?? []) {
      const category = row.category as QuestCategory;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }

    return new Set([...counts.entries()].filter(([, count]) => count >= 2).map(([category]) => category));
  }

  private async syncBossProgress(userId: string, boss?: WeeklyBoss | null): Promise<BossProgressResult | null> {
    const currentBoss = boss ?? await this.getUnsyncedCurrentBoss(userId);
    if (!currentBoss) return null;

    if (currentBoss.status !== "active") {
      const { profile, stats } = await this.getProfileBundle(userId);
      return { boss: currentBoss, profile, stats, victory: false, progressed: false, unlockedAchievements: [] };
    }

    const { count, error } = await supabase
      .from("quests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("category", "focus")
      .eq("status", "completed")
      .gte("due_date", currentBoss.startsAt)
      .lte("due_date", currentBoss.endsAt);

    if (error) throw badRequest("Unable to inspect boss objective", error);

    const progress = Math.min(count ?? 0, currentBoss.target);
    const progressed = progress > currentBoss.progress;
    const victory = progress >= currentBoss.target;
    let updatedBoss = currentBoss;
    let unlockedAchievements: Achievement[] = [];

    if (progress !== currentBoss.progress || victory) {
      const { data, error: updateError } = await supabase
        .from("weekly_bosses")
        .update({
          progress,
          status: victory ? "completed" : "active",
          completed_at: victory ? new Date().toISOString() : null
        })
        .eq("id", currentBoss.id)
        .eq("user_id", userId)
        .eq("status", "active")
        .select(BOSS_COLUMNS)
        .maybeSingle();

      if (updateError) throw badRequest("Unable to update boss progress", updateError);
      if (data) {
        updatedBoss = toBoss(data);
        if (victory) {
          await this.award(userId, currentBoss.xpReward, currentBoss.statRewardKey, currentBoss.statRewardValue, "Охотник фокуса");
          unlockedAchievements = await this.evaluateAchievements(userId, { bossDefeated: true });
        }
      } else {
        updatedBoss = await this.getBoss(userId, currentBoss.id);
      }
    }

    const { profile, stats } = await this.getProfileBundle(userId);
    return {
      boss: updatedBoss,
      profile,
      stats,
      victory: victory && updatedBoss.status === "completed" && currentBoss.status === "active",
      progressed,
      unlockedAchievements
    };
  }

  private async getUnsyncedCurrentBoss(userId: string) {
    await this.ensureWeeklyBoss(userId);
    const { startsAt, endsAt } = await this.getDateContext(userId);
    const { data, error } = await supabase
      .from("weekly_bosses")
      .select(BOSS_COLUMNS)
      .eq("user_id", userId)
      .eq("starts_at", startsAt)
      .eq("ends_at", endsAt)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw badRequest("Unable to load weekly boss", error);
    return data ? toBoss(data) : null;
  }

  private async getDateContext(userId: string) {
    const timezone = await this.getUserTimezone(userId);
    const timezoneOffset = normalizeTimezoneOffset(timezone.timezone_offset);

    return {
      timezoneOffset,
      today: todayDateString(new Date(), timezoneOffset),
      ...getWeekRange(new Date(), timezoneOffset)
    };
  }

  private async getUserTimezone(userId: string): Promise<{ timezone: string | null; timezone_offset: number | null }> {
    if (timezoneColumnsAvailable === false) return { timezone: null, timezone_offset: null };

    const { data, error } = await supabase
      .from("users")
      .select("timezone,timezone_offset")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingTimezoneColumn(error)) {
        timezoneColumnsAvailable = false;
        return { timezone: null, timezone_offset: null };
      }
      throw badRequest("Unable to load user timezone", error);
    }

    timezoneColumnsAvailable = true;
    return {
      timezone: data?.timezone ?? null,
      timezone_offset: normalizeTimezoneOffset(data?.timezone_offset) ?? null
    };
  }

  private async saveUserTimezone(userId: string, input: TelegramUserInput) {
    const timezoneOffset = normalizeTimezoneOffset(input.timezoneOffset);
    const timezone = input.timezone ?? null;

    if (timezoneColumnsAvailable === false || (!timezone && timezoneOffset === null)) return;

    const { error } = await supabase
      .from("users")
      .update({
        ...(timezone ? { timezone } : {}),
        ...(timezoneOffset !== null ? { timezone_offset: timezoneOffset } : {}),
        updated_at: new Date().toISOString()
      })
      .eq("id", userId);

    if (error) {
      if (isMissingTimezoneColumn(error)) {
        timezoneColumnsAvailable = false;
        return;
      }
      throw badRequest("Unable to update user timezone", error);
    }

    timezoneColumnsAvailable = true;
  }

  private async getQuestTemplates() {
    const { data, error } = await supabase.from("quest_templates").select(QUEST_TEMPLATE_COLUMNS).eq("is_active", true);
    if (error || !data || data.length === 0) return DEFAULT_QUEST_TEMPLATES;

    return data.map((row: any) => ({
      title: row.title,
      description: row.description,
      category: row.category,
      difficulty: row.difficulty,
      xpReward: row.xp_reward,
      statRewardKey: row.stat_reward_key,
      statRewardValue: row.stat_reward_value
    }));
  }

  private async getQuest(userId: string, questId: string) {
    const { data, error } = await supabase
      .from("quests")
      .select(CUSTOM_QUEST_INSTANCE_COLUMNS)
      .eq("id", questId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingCustomQuestSchema(error)) {
        throw badRequest("Active quest storage is not ready", error);
      }
      throw badRequest("Unable to load quest", error);
    }
    if (!data) throw notFound("Quest not found");
    return data;
  }

  private async getBoss(userId: string, bossId: string) {
    const { data, error } = await supabase
      .from("weekly_bosses")
      .select(BOSS_COLUMNS)
      .eq("id", bossId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw badRequest("Unable to load boss", error);
    if (!data) throw notFound("Weekly boss not found");
    return toBoss(data);
  }

  private async spendEnergy(userId: string, cost: number, message: string) {
    const user = await this.getUser(userId);
    if (Number(user.energy ?? 0) < cost) throw conflict(message);
    await this.adjustVitals(userId, { energyDelta: -cost });
  }

  private async adjustVitals(userId: string, input: { hpDelta?: number; energyDelta?: number }) {
    const user = await this.getUser(userId);
    const hp = clampVital(Number(user.hp ?? 100) + (input.hpDelta ?? 0));
    const energy = clampVital(Number(user.energy ?? 100) + (input.energyDelta ?? 0));
    const { error } = await supabase
      .from("users")
      .update({ hp, energy, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) throw badRequest("Unable to update vitals", error);
  }

  private async applyQuestVitals(userId: string, quest: { category: QuestCategory; difficulty: Difficulty }) {
    if (quest.category === "vitality") {
      await this.adjustVitals(userId, { hpDelta: 10, energyDelta: quest.difficulty === "hard" ? 18 : 12 });
      return;
    }

    if (quest.category === "strength" && quest.difficulty === "hard") {
      await this.adjustVitals(userId, { hpDelta: 2 });
    }
  }

  private async increaseStat(userId: string, statKey: StatKey, value: number) {
    const stats = await this.ensureStats(userId);
    const currentStat = Number(stats[statKey] ?? 0);
    const { error } = await supabase
      .from("user_stats")
      .update({ [statKey]: currentStat + value, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (error) throw badRequest("Unable to update stats", error);
  }

  private async awardInventoryItem(userId: string, itemKey: string, quantity: number) {
    if (expansionTablesAvailable === false) return;
    const existing = await this.getUserInventoryRows(userId);
    const current = existing.find((item) => item.item_key === itemKey);
    const { error } = await supabase
      .from("user_inventory")
      .upsert(
        {
          user_id: userId,
          item_key: itemKey,
          quantity: (current?.quantity ?? 0) + quantity,
          acquired_at: current?.acquired_at ?? new Date().toISOString()
        },
        { onConflict: "user_id,item_key" }
      );

    if (error) {
      if (isMissingExpansionTable(error)) {
        expansionTablesAvailable = false;
        return;
      }
      throw badRequest("Unable to award inventory item", error);
    }
  }

  private async award(userId: string, xpReward: number, statKey: StatKey, statReward: number, title?: string) {
    if (!STAT_KEYS.includes(statKey)) throw badRequest("Invalid stat reward");

    const [user, stats] = await Promise.all([this.getUser(userId), this.ensureStats(userId)]);
    const xp = applyXp(user.level, user.xp, xpReward);
    const currentStat = Number(stats[statKey] ?? 0);

    const { error: statsError } = await supabase
      .from("user_stats")
      .update({ [statKey]: currentStat + statReward, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (statsError) throw badRequest("Unable to update stats", statsError);

    const { error: userError } = await supabase
      .from("users")
      .update({
        level: xp.level,
        xp: xp.xp,
        rank: xp.rank,
        current_title: title ?? user.current_title,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId);

    if (userError) throw badRequest("Unable to update XP", userError);
    return xp;
  }

  private async totalXp(userId: string) {
    const [{ data: quests }, { data: bosses }] = await Promise.all([
      supabase.from("quests").select("xp_reward").eq("user_id", userId).eq("status", "completed"),
      supabase.from("weekly_bosses").select("xp_reward").eq("user_id", userId).eq("status", "completed")
    ]);

    return sumRewards(quests) + sumRewards(bosses);
  }

  private async countCompletedQuests(userId: string, category?: string) {
    let query = supabase
      .from("quests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed");

    if (category) query = query.eq("category", category);

    const { count, error } = await query;
    if (error) throw badRequest("Unable to count completed quests", error);
    return count ?? 0;
  }

  private async countCompletedBosses(userId: string) {
    const { count, error } = await supabase
      .from("weekly_bosses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed");

    if (error) throw badRequest("Unable to count completed bosses", error);
    return count ?? 0;
  }

  private async calculateStreak(userId: string) {
    const { timezoneOffset, today } = await this.getDateContext(userId);
    const { data, error } = await supabase
      .from("quests")
      .select("completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(90);

    if (error) throw badRequest("Unable to calculate streak", error);
    const completedDates = new Set(
      (data ?? [])
        .map((row: any) => row.completed_at ? todayDateString(new Date(row.completed_at), timezoneOffset) : null)
        .filter(Boolean)
    );

    let streak = 0;
    let cursor = today;
    while (completedDates.has(cursor)) {
      streak += 1;
      cursor = addDaysToDateString(cursor, -1);
    }

    return streak;
  }

  private async evaluateAchievements(userId: string, event: { leveledUp?: boolean; bossDefeated?: boolean } = {}) {
    const metrics = await this.getAchievementMetrics(userId);
    const keys = Object.entries(ACHIEVEMENTS)
      .filter(([, catalog]) => Number(metrics[catalog.metric] ?? 0) >= catalog.target)
      .map(([key]) => key);

    if (event.leveledUp) keys.push("first_level_up");
    if (event.bossDefeated) keys.push("boss_slayer");

    return this.unlockAchievements(userId, keys);
  }

  private async unlockAchievements(userId: string, keys: string[]) {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return [];

    const { data: existing, error: existingError } = await supabase
      .from("achievements")
      .select("key")
      .eq("user_id", userId)
      .in("key", unique);

    if (existingError) throw badRequest("Unable to inspect achievements", existingError);
    const existingKeys = new Set((existing ?? []).map((row: any) => row.key));
    const rows = unique
      .filter((key) => !existingKeys.has(key))
      .map((key) => ({
        user_id: userId,
        key,
        title: ACHIEVEMENTS[key]?.title ?? key,
        description: ACHIEVEMENTS[key]?.description ?? "Достижение открыто."
      }));

    if (rows.length === 0) return [];
    const { data, error } = await supabase.from("achievements").insert(rows).select(ACHIEVEMENT_COLUMNS);
    if (error) throw badRequest("Unable to unlock achievement", error);
    return (data ?? []).map(toAchievement);
  }

  private async awardAchievementItem(userId: string, achievementKey: string) {
    const itemByAchievement: Record<string, string | undefined> = {
      streak_7: "streak_shield",
      focus_hunter: "focus_booster",
      discipline_initiate: "iron_frame",
      streak_30: "season_title_token"
    };
    const itemKey = itemByAchievement[achievementKey];
    if (itemKey) await this.awardInventoryItem(userId, itemKey, 1);
  }
}

export const hunterService = new HunterService();

function toStats(row: any): UserStats {
  return {
    id: row.id,
    userId: row.user_id,
    strength: row.strength,
    intelligence: row.intelligence,
    vitality: row.vitality,
    discipline: row.discipline,
    focus: row.focus,
    charisma: row.charisma,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toQuest(row: any): Quest {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    type: row.type,
    category: row.category,
    difficulty: row.difficulty,
    xpReward: row.xp_reward,
    statRewardKey: row.stat_reward_key,
    statRewardValue: row.stat_reward_value,
    estimatedMinutes: row.estimated_minutes ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    reason: row.reason ?? null,
    source: row.source ?? (row.type === "generated" ? "generated" : row.type === "custom" ? "custom" : "system"),
    customTemplateId: row.custom_template_id ?? null,
    status: row.status,
    dueDate: row.due_date,
    startedAt: row.started_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at
  };
}

function toBoss(row: any): WeeklyBoss {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    objective: row.objective,
    progress: row.progress,
    target: row.target,
    xpReward: row.xp_reward,
    statRewardKey: row.stat_reward_key,
    statRewardValue: row.stat_reward_value,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    completedAt: row.completed_at,
    createdAt: row.created_at
  };
}

function toAchievement(row: any): Achievement {
  return {
    id: row.id,
    userId: row.user_id,
    key: row.key,
    title: row.title,
    description: row.description,
    unlockedAt: row.unlocked_at
  };
}

function toSettings(row: any): UserSettings {
  return {
    id: row.id,
    userId: row.user_id,
    primaryGoal: row.primary_goal,
    desiredDifficulty: row.desired_difficulty,
    questsPerDay: row.quests_per_day,
    wakeTime: normalizeTime(row.wake_time),
    sleepTime: normalizeTime(row.sleep_time),
    allowPhysicalQuests: row.allow_physical_quests,
    preferredCategories: Array.isArray(row.preferred_categories) ? row.preferred_categories : [],
    onboardingCompleted: row.onboarding_completed,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toNotificationSettings(row: any): UserNotificationSettings {
  return {
    id: row.id,
    userId: row.user_id,
    morningEnabled: row.morning_enabled,
    morningTime: normalizeTime(row.morning_time) ?? "09:00",
    eveningEnabled: row.evening_enabled,
    eveningTime: normalizeTime(row.evening_time) ?? "20:00",
    sleepEnabled: row.sleep_enabled,
    bedtime: normalizeTime(row.bedtime),
    sleepRemindBeforeMinutes: row.sleep_remind_before_minutes,
    questRemindersEnabled: row.quest_reminders_enabled,
    activeQuestRemindersEnabled: row.active_quest_reminders_enabled,
    bossRemindersEnabled: row.boss_reminders_enabled,
    streakWarningEnabled: row.streak_warning_enabled,
    progressNotificationsEnabled: row.progress_notifications_enabled,
    quietHoursStart: normalizeTime(row.quiet_hours_start),
    quietHoursEnd: normalizeTime(row.quiet_hours_end),
    maxDailyNotifications: row.max_daily_notifications,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toCustomQuestTemplate(row: any): CustomQuestTemplate {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description ?? "",
    category: row.category,
    difficulty: row.difficulty,
    xpReward: row.xp_reward,
    statRewardKey: row.stat_reward_key,
    statRewardValue: row.stat_reward_value,
    recurrenceType: row.recurrence_type,
    weekdays: uniqueWeekdays(row.weekdays ?? []),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isActive: row.is_active,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function defaultSettings(userId: string): UserSettings {
  const now = new Date().toISOString();
  return {
    id: `default-${userId}`,
    userId,
    ...DEFAULT_SETTINGS,
    createdAt: now,
    updatedAt: now
  };
}

function defaultNotificationSettings(userId: string): UserNotificationSettings {
  const now = new Date().toISOString();
  return {
    id: `default-notifications-${userId}`,
    userId,
    morningEnabled: true,
    morningTime: "09:00",
    eveningEnabled: true,
    eveningTime: "20:00",
    sleepEnabled: false,
    bedtime: null,
    sleepRemindBeforeMinutes: 45,
    questRemindersEnabled: false,
    activeQuestRemindersEnabled: false,
    bossRemindersEnabled: false,
    streakWarningEnabled: false,
    progressNotificationsEnabled: true,
    quietHoursStart: null,
    quietHoursEnd: null,
    maxDailyNotifications: 4,
    createdAt: now,
    updatedAt: now
  };
}

function normalizeTime(value: string | null | undefined) {
  return value ? value.slice(0, 5) : null;
}

function timeToMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function localClock(date: Date, timezoneOffset?: number | null) {
  const safeOffset = normalizeTimezoneOffset(timezoneOffset);
  const local = safeOffset === null ? new Date(date) : new Date(date.getTime() - safeOffset * 60_000);
  const hours = local.getUTCHours();
  const minutes = local.getUTCMinutes();
  return {
    date: local.toISOString().slice(0, 10),
    minutes: hours * 60 + minutes,
    time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
  };
}

function isWithinQuietHours(currentMinutes: number, start: string | null, end: string | null) {
  if (!start || !end) return false;
  const from = timeToMinutes(start);
  const to = timeToMinutes(end);
  if (from === to) return false;
  if (from < to) return currentMinutes >= from && currentMinutes < to;
  return currentMinutes >= from || currentMinutes < to;
}

function escapeTelegramHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function miniAppReplyMarkup() {
  const url = optionalEnv("MINI_APP_URL");
  if (!url) return undefined;
  return {
    inline_keyboard: [[{ text: "Открыть System Hunter", web_app: { url } }]]
  };
}

function pickRandom<T>(items: T[], count: number) {
  return [...items].sort(() => Math.random() - 0.5).slice(0, count);
}

function pickRandomUniqueTemplates(templates: QuestTemplate[], count: number, existingKeys: Set<string>) {
  const selected: QuestTemplate[] = [];
  const seen = new Set(existingKeys);

  for (const template of templates) {
    const key = questTemplateKey(template.title, template.category);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(template);
    if (selected.length >= count) break;
  }

  return selected;
}

function uniqueTemplates(templates: QuestTemplate[]) {
  const seen = new Set<string>();
  return templates.filter((template) => {
    const key = questTemplateKey(template.title, template.category);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function questTemplateKey(title: string, category: string) {
  return `${category.trim().toLowerCase()}::${title.trim().toLowerCase()}`;
}

function uniqueWeekdays(value: unknown): Weekday[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => Number(item)).filter((item): item is Weekday => item >= 1 && item <= 7))]
    .sort((left, right) => left - right);
}

function shouldCreateCustomQuestToday(template: CustomQuestTemplate, today: string) {
  if (!template.isActive || template.deletedAt) return false;
  if (template.startsAt && today < template.startsAt) return false;
  if (template.endsAt && today > template.endsAt) return false;

  const weekday = isoWeekday(today);
  const startWeekday = isoWeekday(template.startsAt ?? today);
  switch (template.recurrenceType) {
    case "once":
      return today === (template.startsAt ?? today);
    case "daily":
      return true;
    case "weekly":
      return weekday === startWeekday;
    case "weekdays":
      return template.weekdays.includes(weekday);
    default:
      return false;
  }
}

function isoWeekday(date: string): Weekday {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return (day === 0 ? 7 : day) as Weekday;
}

function customQuestReason(template: CustomQuestTemplate) {
  const recurrenceLabels: Record<CustomQuestTemplate["recurrenceType"], string> = {
    once: "одноразовый пользовательский квест",
    daily: "ежедневная привычка",
    weekly: "еженедельная привычка",
    weekdays: "привычка по выбранным дням"
  };
  return `Пользовательский протокол: ${recurrenceLabels[template.recurrenceType]}.`;
}

function buildHabitProgress(template: CustomQuestTemplate, quests: Quest[], since: string, today: string): CustomQuestProgress {
  const questByDate = new Map(quests.map((quest) => [quest.dueDate, quest]));
  const calendar: HabitProgressDay[] = [];
  let cursor = since;

  for (let index = 0; index < 60 && cursor <= today; index += 1) {
    const due = shouldCreateCustomQuestToday(template, cursor);
    const quest = questByDate.get(cursor) ?? null;
    const status = habitDayStatus(cursor, today, due, quest);
    calendar.push({
      date: cursor,
      due,
      status,
      questId: quest?.id ?? null,
      xp: quest?.status === "completed" ? quest.xpReward : 0
    });
    cursor = addDaysToDateString(cursor, 1);
  }

  const scheduledDays = calendar.filter((day) => day.due);
  const completedCount = scheduledDays.filter((day) => day.status === "completed").length;
  const skippedCount = scheduledDays.filter((day) => day.status === "skipped").length;
  const missedCount = scheduledDays.filter((day) => day.status === "missed").length;
  const todayQuest = quests.find((quest) => quest.dueDate === today) ?? null;

  return {
    template,
    currentStreak: currentHabitStreak(scheduledDays, today),
    bestStreak: bestHabitStreak(scheduledDays),
    scheduledCount: scheduledDays.length,
    completedCount,
    skippedCount,
    missedCount,
    completionRate: scheduledDays.length > 0 ? Math.round((completedCount / scheduledDays.length) * 100) : 0,
    healthStatus: habitHealthStatus(template, scheduledDays, today),
    lastCompletedAt: [...quests]
      .filter((quest) => quest.status === "completed" && quest.completedAt)
      .sort((left, right) => String(right.completedAt).localeCompare(String(left.completedAt)))[0]?.completedAt ?? null,
    nextDueDate: nextHabitDueDate(template, today, todayQuest),
    todayQuest,
    calendar
  };
}

function habitDayStatus(date: string, today: string, due: boolean, quest: Quest | null): HabitDayStatus {
  if (!due) return "scheduled";
  if (quest?.status === "completed") return "completed";
  if (quest?.status === "skipped") return "skipped";
  if (quest?.status === "active" || quest?.status === "in_progress") return "active";
  return date < today ? "missed" : "scheduled";
}

function currentHabitStreak(days: HabitProgressDay[], today: string) {
  let streak = 0;
  for (const day of [...days].reverse()) {
    if (day.date === today && day.status === "active") continue;
    if (day.status === "completed") {
      streak += 1;
      continue;
    }
    if (day.status === "scheduled" && day.date >= today) continue;
    break;
  }
  return streak;
}

function bestHabitStreak(days: HabitProgressDay[]) {
  let best = 0;
  let current = 0;
  for (const day of days) {
    if (day.status === "completed") {
      current += 1;
      best = Math.max(best, current);
    } else if (day.status !== "scheduled") {
      current = 0;
    }
  }
  return best;
}

function habitHealthStatus(template: CustomQuestTemplate, days: HabitProgressDay[], today: string): HabitHealthStatus {
  if (!template.isActive) return "paused";
  const todayDay = days.find((day) => day.date === today);
  if (todayDay?.status === "active") return "at_risk";
  const recentDue = [...days].reverse().find((day) => day.due && day.date <= today);
  if (recentDue?.status === "missed" || recentDue?.status === "skipped") return "broken";
  return "stable";
}

function nextHabitDueDate(template: CustomQuestTemplate, today: string, todayQuest: Quest | null) {
  if (!template.isActive || template.deletedAt) return null;
  if (todayQuest?.status === "active") return today;
  for (let offset = todayQuest?.status === "completed" ? 1 : 0; offset <= 45; offset += 1) {
    const date = addDaysToDateString(today, offset);
    if (shouldCreateCustomQuestToday(template, date)) return date;
  }
  return null;
}

function isMissingTimezoneColumn(error: unknown) {
  const record = error as { code?: string; message?: string };
  return (
    record.code === "42703" ||
    record.code === "PGRST204" ||
    String(record.message ?? "").includes("users.timezone") ||
    String(record.message ?? "").includes("timezone_offset")
  );
}

function isMissingSettingsTable(error: unknown) {
  const record = error as { code?: string; message?: string };
  return (
    record.code === "42P01" ||
    record.code === "PGRST205" ||
    String(record.message ?? "").includes("user_settings")
  );
}

function isMissingNotificationTable(error: unknown) {
  const record = error as { code?: string; message?: string };
  const message = String(record.message ?? "");
  return (
    record.code === "42P01" ||
    record.code === "42703" ||
    record.code === "PGRST204" ||
    record.code === "PGRST205" ||
    message.includes("user_notification_settings") ||
    message.includes("notification_logs")
  );
}

function isMissingExpansionTable(error: unknown) {
  const record = error as { code?: string; message?: string };
  const message = String(record.message ?? "");
  return (
    record.code === "42P01" ||
    record.code === "PGRST205" ||
    ["skill_nodes", "user_skills", "inventory_items", "user_inventory", "seasons", "season_progress", "squads", "squad_members"]
      .some((table) => message.includes(table))
  );
}

function isMissingCustomQuestSchema(error: unknown) {
  const record = error as { code?: string; message?: string };
  const message = String(record?.message ?? "");
  return (
    record?.code === "42P01" ||
    record?.code === "42703" ||
    record?.code === "PGRST204" ||
    record?.code === "PGRST205" ||
    ["custom_quest_templates", "custom_template_id", "quests.source", "source", "reason", "started_at", "cancelled_at", "deleted_at"].some((item) => message.includes(item))
  );
}

function difficultyScore(actual: Difficulty, desired: Difficulty) {
  if (actual === desired) return 2;
  if (desired === "hard" && actual === "medium") return 1;
  if (desired === "easy" && actual === "hard") return -2;
  return 0;
}

function sumRewards(rows: any[] | null) {
  return (rows ?? []).reduce((total, row) => total + Number(row.xp_reward ?? 0), 0);
}

function clampVital(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function skillPrerequisiteMet(node: SkillNode, unlocked: Map<string, string>) {
  if (node.tier === 1) return true;
  const previousTier = node.tier - 1;
  const prefix = node.key.replace(/_i+$/i, "");
  return unlocked.has(`${prefix}_${"i".repeat(previousTier)}`);
}

function toInventoryItem(row: any): InventoryCatalogItem {
  return {
    key: row.key,
    title: row.title,
    description: row.description,
    type: row.type,
    rarity: row.rarity,
    effectKey: row.effect_key ?? null,
    effectValue: row.effect_value ?? 0
  };
}

function toSeasonRow(season: typeof DEFAULT_SEASON) {
  return {
    key: season.key,
    title: season.title,
    description: season.description,
    starts_at: season.startsAt,
    ends_at: season.endsAt,
    boss_name: season.bossName,
    reward_title: season.rewardTitle
  };
}

function isAdminTelegramId(telegramId: number) {
  const admins = optionalEnv("ADMIN_TELEGRAM_IDS")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return admins.includes(String(telegramId));
}

function buildProgressCalendar(quests: Quest[], since: string, today: string): ProgressDay[] {
  const days = new Map<string, ProgressDay>();
  let cursor = since;

  for (let index = 0; index < 30 && cursor <= today; index += 1) {
    days.set(cursor, {
      date: cursor,
      total: 0,
      completed: 0,
      skipped: 0,
      replaced: 0,
      xp: 0
    });
    cursor = addDaysToDateString(cursor, 1);
  }

  for (const quest of quests) {
    const day = days.get(quest.dueDate);
    if (!day) continue;

    day.total += 1;
    if (quest.status === "completed") {
      day.completed += 1;
      day.xp += quest.xpReward;
    }
    if (quest.status === "skipped") day.skipped += 1;
  }

  return [...days.values()];
}

function buildWeeklyRecap(quests: Quest[], startsAt: string, endsAt: string): WeeklyRecap {
  const completedByCategory = new Map<QuestCategory, number>();
  const missedByCategory = new Map<QuestCategory, number>();
  const recap: WeeklyRecap = {
    startsAt,
    endsAt,
    completed: 0,
    skipped: 0,
    replaced: 0,
    xp: 0,
    strongestCategory: null,
    weakestCategory: null
  };

  for (const quest of quests) {
    if (quest.status === "completed") {
      recap.completed += 1;
      recap.xp += quest.xpReward;
      completedByCategory.set(quest.category, (completedByCategory.get(quest.category) ?? 0) + 1);
    }

    if (quest.status === "skipped") {
      recap.skipped += 1;
      missedByCategory.set(quest.category, (missedByCategory.get(quest.category) ?? 0) + 1);
    }
  }

  recap.strongestCategory = topCategory(completedByCategory);
  recap.weakestCategory = topCategory(missedByCategory);
  return recap;
}

function topCategory(counts: Map<QuestCategory, number>) {
  let winner: QuestCategory | null = null;
  let highest = 0;

  for (const category of STAT_KEYS) {
    const count = counts.get(category) ?? 0;
    if (count > highest) {
      highest = count;
      winner = category;
    }
  }

  return winner;
}
