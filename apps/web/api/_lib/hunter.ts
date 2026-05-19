import {
  DEFAULT_QUEST_TEMPLATES,
  STAT_KEYS,
  XP_REWARDS,
  applyXp,
  classForStats,
  rankForLevel,
  xpToNextLevel,
  type Achievement,
  type BossProgressResult,
  type DashboardSummary,
  type Difficulty,
  type HunterGoal,
  type Quest,
  type QuestCategory,
  type QuestCompletionResult,
  type QuestTemplate,
  type StatKey,
  type UserSettings,
  type UserStats,
  type WeeklyBoss
} from "@system-hunter/shared";
import { supabase } from "./db.js";
import { addDaysToDateString, getWeekRange, normalizeTimezoneOffset, todayDateString } from "./dates.js";
import { badRequest, conflict, notFound } from "./http.js";

interface TelegramUserInput {
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
  timezone?: string | null;
  timezoneOffset?: number | null;
}

const DAILY_GENERATED_QUEST_LIMIT = 3;
let timezoneColumnsAvailable: boolean | null = null;
let userSettingsTableAvailable: boolean | null = null;

const ACHIEVEMENTS: Record<string, { title: string; description: string }> = {
  first_quest: { title: "Первый квест", description: "Выполни первый ежедневный квест." },
  streak_3: { title: "Серия 3 дня", description: "Выполняй квесты три дня подряд." },
  streak_7: { title: "Серия 7 дней", description: "Выполняй квесты семь дней подряд." },
  first_level_up: { title: "Первое повышение", description: "Получи новый уровень впервые." },
  boss_slayer: { title: "Победитель босса", description: "Победи первого недельного босса." },
  focus_hunter: { title: "Охотник фокуса", description: "Выполни 10 квестов фокуса." },
  discipline_initiate: { title: "Адепт дисциплины", description: "Выполни 10 квестов дисциплины." }
};

const USER_COLUMNS =
  "id,telegram_id,username,first_name,level,xp,rank,streak,hp,energy,current_title,created_at,updated_at";
const USER_STATS_COLUMNS =
  "id,user_id,strength,intelligence,vitality,discipline,focus,charisma,created_at,updated_at";
const QUEST_COLUMNS =
  "id,user_id,title,description,type,category,difficulty,xp_reward,stat_reward_key,stat_reward_value,status,due_date,completed_at,created_at";
const BOSS_COLUMNS =
  "id,user_id,name,description,objective,progress,target,xp_reward,stat_reward_key,stat_reward_value,status,starts_at,ends_at,completed_at,created_at";
const ACHIEVEMENT_COLUMNS = "id,user_id,key,title,description,unlocked_at";
const USER_SETTINGS_COLUMNS =
  "id,user_id,primary_goal,desired_difficulty,quests_per_day,wake_time,sleep_time,allow_physical_quests,preferred_categories,onboarding_completed,created_at,updated_at";
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

export class HunterService {
  async syncTelegramUser(input: TelegramUserInput) {
    const user = await this.createOrUpdateUser(input);
    await this.ensureStats(user.id);
    await this.ensureSettings(user.id);
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
    const { data, error } = await supabase
      .from("quests")
      .select(QUEST_COLUMNS)
      .eq("user_id", userId)
      .eq("due_date", today)
      .order("created_at", { ascending: true });

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

  async generateQuest(userId: string) {
    return this.createGeneratedQuest(userId);
  }

  async generateQuestByTelegramId(telegramId: number) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.generateQuest(user.id);
  }

  async replaceQuest(userId: string, questId: string) {
    const quest = await this.getQuest(userId, questId);
    if (quest.status !== "active") throw conflict("Only active quests can be replaced");

    const prepared = await this.prepareGeneratedQuest(userId);
    const { data: replaced, error: replaceError } = await supabase
      .from("quests")
      .update({ status: "replaced" })
      .eq("id", questId)
      .eq("user_id", userId)
      .eq("status", "active")
      .select(QUEST_COLUMNS)
      .maybeSingle();

    if (replaceError) throw badRequest("Unable to replace quest", replaceError);
    if (!replaced) throw conflict("Quest is not active");

    return this.insertGeneratedQuest(userId, prepared.template, prepared.today);
  }

  async completeQuest(userId: string, questId: string): Promise<QuestCompletionResult> {
    const quest = await this.getQuest(userId, questId);
    if (quest.status !== "active") throw conflict("Quest is not active");

    const { data, error } = await supabase
      .from("quests")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", questId)
      .eq("user_id", userId)
      .eq("status", "active")
      .select(QUEST_COLUMNS)
      .maybeSingle();

    if (error) throw badRequest("Unable to complete quest", error);
    if (!data) throw conflict("Quest is not active");

    const levelUp = await this.award(userId, quest.xp_reward, quest.stat_reward_key, quest.stat_reward_value);
    const streak = await this.calculateStreak(userId);
    await supabase.from("users").update({ streak, updated_at: new Date().toISOString() }).eq("id", userId);

    const bossProgress = await this.syncBossProgress(userId);
    const unlockedAchievements = [
      ...(await this.evaluateAchievements(userId, { leveledUp: levelUp.leveledUp })),
      ...(bossProgress?.unlockedAchievements ?? [])
    ];
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
    if (quest.status !== "active") throw conflict("Only active quests can be skipped");

    const { data, error } = await supabase
      .from("quests")
      .update({ status: "skipped" })
      .eq("id", questId)
      .eq("user_id", userId)
      .eq("status", "active")
      .select(QUEST_COLUMNS)
      .maybeSingle();

    if (error) throw badRequest("Unable to skip quest", error);
    if (!data) throw conflict("Quest is not active");
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

  async progressBossByTelegramId(telegramId: number, bossId: string) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.progressBoss(user.id, bossId);
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

  private async ensureDailyQuests(userId: string) {
    const { today } = await this.getDateContext(userId);
    const { data, error } = await supabase
      .from("quests")
      .select("id")
      .eq("user_id", userId)
      .eq("due_date", today)
      .limit(1);

    if (error) throw badRequest("Unable to inspect quests", error);
    if ((data ?? []).length > 0) return;

    const settings = await this.getSettings(userId);
    const templates = await this.getPersonalizedQuestTemplates(userId, settings);
    const rows = pickRandomUniqueTemplates(templates, settings.questsPerDay, new Set()).map((template) => ({
      user_id: userId,
      title: template.title,
      description: template.description,
      type: "daily",
      category: template.category,
      difficulty: template.difficulty,
      xp_reward: template.xpReward,
      stat_reward_key: template.statRewardKey,
      stat_reward_value: template.statRewardValue,
      due_date: today
    }));

    if (rows.length === 0) throw badRequest("No quest templates are available");
    const { error: insertError } = await supabase.from("quests").insert(rows);
    if (insertError) throw badRequest("Unable to create quests", insertError);
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
        category: template.category,
        difficulty: template.difficulty,
        xp_reward: template.xpReward,
        stat_reward_key: template.statRewardKey,
        stat_reward_value: template.statRewardValue,
        due_date: today
      })
      .select(QUEST_COLUMNS)
      .single();

    if (error?.code === "23505") throw conflict("Quest already exists today");
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
      .select(QUEST_COLUMNS)
      .eq("id", questId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw badRequest("Unable to load quest", error);
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
    const [completed, focusCompleted, disciplineCompleted, bossesDefeated, user] = await Promise.all([
      this.countCompletedQuests(userId),
      this.countCompletedQuests(userId, "focus"),
      this.countCompletedQuests(userId, "discipline"),
      this.countCompletedBosses(userId),
      this.getUser(userId)
    ]);
    const keys: string[] = [];

    if (completed >= 1) keys.push("first_quest");
    if (user.streak >= 3) keys.push("streak_3");
    if (user.streak >= 7) keys.push("streak_7");
    if (event.leveledUp) keys.push("first_level_up");
    if (event.bossDefeated || bossesDefeated >= 1) keys.push("boss_slayer");
    if (focusCompleted >= 10) keys.push("focus_hunter");
    if (disciplineCompleted >= 10) keys.push("discipline_initiate");

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
    status: row.status,
    dueDate: row.due_date,
    completedAt: row.completed_at,
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

function normalizeTime(value: string | null | undefined) {
  return value ? value.slice(0, 5) : null;
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

function difficultyScore(actual: Difficulty, desired: Difficulty) {
  if (actual === desired) return 2;
  if (desired === "hard" && actual === "medium") return 1;
  if (desired === "easy" && actual === "hard") return -2;
  return 0;
}

function sumRewards(rows: any[] | null) {
  return (rows ?? []).reduce((total, row) => total + Number(row.xp_reward ?? 0), 0);
}
