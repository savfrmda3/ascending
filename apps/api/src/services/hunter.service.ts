import {
  DEFAULT_QUEST_TEMPLATES,
  STAT_KEYS,
  XP_REWARDS,
  applyXp,
  rankForLevel,
  type Achievement,
  type BossProgressResult,
  type DashboardSummary,
  type QuestCompletionResult,
  type QuestTemplate,
  type StatKey
} from "@system-hunter/shared";
import { supabase } from "../db/supabase.js";
import { addDaysToDateString, getWeekRange, normalizeTimezoneOffset, todayDateString } from "../lib/dates.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import {
  type AchievementRow,
  type QuestRow,
  type StatsRow,
  type UserRow,
  type WeeklyBossRow,
  toAchievement,
  toBoss,
  toProfile,
  toQuest,
  toStats
} from "../lib/mappers.js";

interface TelegramUserInput {
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
  timezone?: string | null;
  timezoneOffset?: number | null;
}

const DAILY_GENERATED_QUEST_LIMIT = 3;
let timezoneColumnsAvailable: boolean | null = null;

const ACHIEVEMENTS: Record<string, { title: string; description: string }> = {
  first_quest: {
    title: "Первый квест",
    description: "Выполни первый ежедневный квест."
  },
  streak_3: {
    title: "Серия 3 дня",
    description: "Выполняй квесты три дня подряд."
  },
  streak_7: {
    title: "Серия 7 дней",
    description: "Выполняй квесты семь дней подряд."
  },
  first_level_up: {
    title: "Первое повышение",
    description: "Получи новый уровень впервые."
  },
  boss_slayer: {
    title: "Победитель босса",
    description: "Победи первого недельного босса."
  },
  focus_hunter: {
    title: "Охотник фокуса",
    description: "Выполни 10 квестов фокуса."
  },
  discipline_initiate: {
    title: "Адепт дисциплины",
    description: "Выполни 10 квестов дисциплины."
  }
};

export class HunterService {
  async syncTelegramUser(input: TelegramUserInput) {
    const user = await this.createOrUpdateUser(input);
    await this.ensureUserStats(user.id);
    await this.ensureDailyQuests(user.id);
    await this.ensureWeeklyBoss(user.id);

    return this.getProfileBundle(user.id);
  }

  async getDashboard(userId: string): Promise<DashboardSummary> {
    const { profile, stats } = await this.getProfileBundle(userId);
    const todayQuests = await this.getTodayQuests(userId);
    const boss = await this.getCurrentBoss(userId);
    const achievements = await this.getAchievements(userId);

    return {
      profile,
      stats,
      todayQuests,
      boss,
      achievements
    };
  }

  async getProfileBundle(userId: string) {
    const user = await this.getUserRow(userId);
    const stats = toStats(await this.ensureUserStats(userId));
    const [totalXp, completedQuestsCount] = await Promise.all([
      this.calculateTotalXp(userId),
      this.countCompletedQuests(userId)
    ]);

    return {
      profile: toProfile(user, stats, totalXp, completedQuestsCount),
      stats
    };
  }

  async getProfileByTelegramId(telegramId: number) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.getProfileBundle(user.id);
  }

  async getStats(userId: string) {
    return toStats(await this.ensureUserStats(userId));
  }

  async getTodayQuests(userId: string) {
    await this.ensureDailyQuests(userId);
    const { today } = await this.getDateContext(userId);
    const { data, error } = await supabase
      .from("quests")
      .select("*")
      .eq("user_id", userId)
      .eq("due_date", today)
      .order("created_at", { ascending: true });

    if (error) throw badRequest("Unable to load today's quests", error);
    return ((data ?? []) as QuestRow[]).map(toQuest);
  }

  async getTodayQuestsByTelegramId(telegramId: number) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.getTodayQuests(user.id);
  }

  async generateQuest(userId: string) {
    return this.createGeneratedQuest(userId);
  }

  async generateQuestByTelegramId(telegramId: number) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.generateQuest(user.id);
  }

  async replaceQuest(userId: string, questId: string) {
    const quest = await this.getQuestRow(userId, questId);
    if (quest.status !== "active") throw conflict("Only active quests can be replaced");

    const prepared = await this.prepareGeneratedQuest(userId);
    const { data: replaced, error } = await supabase
      .from("quests")
      .update({ status: "replaced" })
      .eq("id", questId)
      .eq("user_id", userId)
      .eq("status", "active")
      .select("*")
      .maybeSingle();

    if (error) throw badRequest("Unable to replace quest", error);
    if (!replaced) throw conflict("Quest is not active");
    return this.insertGeneratedQuest(userId, prepared.template, prepared.today);
  }

  async completeQuest(userId: string, questId: string): Promise<QuestCompletionResult> {
    const quest = await this.getQuestRow(userId, questId);
    if (quest.status !== "active") throw conflict("Quest is not active");

    const { data: updatedQuest, error: questError } = await supabase
      .from("quests")
      .update({
        status: "completed",
        completed_at: new Date().toISOString()
      })
      .eq("id", questId)
      .eq("user_id", userId)
      .eq("status", "active")
      .select("*")
      .maybeSingle();

    if (questError) throw badRequest("Unable to complete quest", questError);
    if (!updatedQuest) throw conflict("Quest is not active");

    const award = await this.awardUser(userId, quest.xp_reward, quest.stat_reward_key, quest.stat_reward_value);
    const streak = await this.calculateStreak(userId);

    await supabase
      .from("users")
      .update({
        streak,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId);

    const bossProgress = await this.syncBossProgress(userId);
    const unlockedAchievements = [
      ...(await this.evaluateAchievements(userId, {
        leveledUp: award.leveledUp
      })),
      ...(bossProgress?.unlockedAchievements ?? [])
    ];
    const { profile, stats } = await this.getProfileBundle(userId);

    return {
      quest: toQuest(updatedQuest as QuestRow),
      profile,
      stats,
      rewards: {
        xp: quest.xp_reward,
        statKey: quest.stat_reward_key,
        statValue: quest.stat_reward_value
      },
      levelUp: {
        leveledUp: award.leveledUp,
        from: award.from,
        to: award.to
      },
      bossProgress,
      unlockedAchievements
    };
  }

  async completeQuestByTelegramId(telegramId: number, questId: string) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.completeQuest(user.id, questId);
  }

  async skipQuestByTelegramId(telegramId: number, questId: string) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.skipQuest(user.id, questId);
  }

  async skipQuest(userId: string, questId: string) {
    const quest = await this.getQuestRow(userId, questId);
    if (quest.status === "completed") throw conflict("Completed quest cannot be skipped");
    if (quest.status === "skipped") throw conflict("Quest is already skipped");

    const { data, error } = await supabase
      .from("quests")
      .update({
        status: "skipped"
      })
      .eq("id", questId)
      .eq("user_id", userId)
      .eq("status", "active")
      .select("*")
      .maybeSingle();

    if (error) throw badRequest("Unable to skip quest", error);
    if (!data) throw conflict("Quest is not active");
    return toQuest(data as QuestRow);
  }

  async getCurrentBoss(userId: string) {
    await this.ensureWeeklyBoss(userId);
    const { startsAt, endsAt } = await this.getDateContext(userId);
    const { data, error } = await supabase
      .from("weekly_bosses")
      .select("*")
      .eq("user_id", userId)
      .eq("starts_at", startsAt)
      .eq("ends_at", endsAt)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw badRequest("Unable to load weekly boss", error);
    if (!data) return null;
    const synced = await this.syncBossProgress(userId, toBoss(data as WeeklyBossRow));
    return synced?.boss ?? toBoss(data as WeeklyBossRow);
  }

  async getCurrentBossByTelegramId(telegramId: number) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.getCurrentBoss(user.id);
  }

  async progressBoss(userId: string, bossId: string): Promise<BossProgressResult> {
    const boss = await this.getBossRow(userId, bossId);
    if (boss.status === "expired") throw conflict("Weekly boss has expired");

    const result = await this.syncBossProgress(userId, toBoss(boss));
    if (!result) throw notFound("Weekly boss not found");
    return result;
  }

  async progressBossByTelegramId(telegramId: number, bossId: string) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.progressBoss(user.id, bossId);
  }

  async completeBoss(userId: string, bossId: string): Promise<BossProgressResult> {
    const boss = await this.getBossRow(userId, bossId);
    if (boss.status === "completed") throw conflict("Weekly boss is already completed");
    if (boss.progress < boss.target) throw badRequest("Boss objective is not complete yet");

    return this.progressBoss(userId, bossId);
  }

  async getAchievements(userId: string) {
    const { data, error } = await supabase
      .from("achievements")
      .select("*")
      .eq("user_id", userId)
      .order("unlocked_at", { ascending: false });

    if (error) throw badRequest("Unable to load achievements", error);
    return ((data ?? []) as AchievementRow[]).map(toAchievement);
  }

  async ensureDailyQuestsForAllUsers() {
    const { data, error } = await supabase.from("users").select("id,telegram_id");
    if (error) throw badRequest("Unable to load users", error);

    const users = (data ?? []) as Pick<UserRow, "id" | "telegram_id">[];
    for (const user of users) {
      await this.ensureDailyQuests(user.id);
    }

    return users;
  }

  async usersWithActiveQuests() {
    const { data: users, error } = await supabase.from("users").select("id,telegram_id,timezone_offset");
    if (error) throw badRequest("Unable to load users", error);

    const summaries: Array<{ telegramId: number; activeCount: number }> = [];
    for (const user of (users ?? []) as Pick<UserRow, "id" | "telegram_id" | "timezone_offset">[]) {
      const today = todayDateString(new Date(), normalizeTimezoneOffset(user.timezone_offset));
      const { count, error: countError } = await supabase
        .from("quests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("due_date", today)
        .eq("status", "active");

      if (countError) throw badRequest("Unable to load active quests", countError);
      if ((count ?? 0) > 0) summaries.push({ telegramId: user.telegram_id, activeCount: count ?? 0 });
    }

    return summaries;
  }

  private async createOrUpdateUser(input: TelegramUserInput): Promise<UserRow> {
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
        .select("*")
        .single();

      if (error || !data) throw badRequest("Unable to update user", error);
      await this.saveUserTimezone(existing.id, input);
      return data as UserRow;
    }

    const { data, error } = await supabase
      .from("users")
      .insert({
        telegram_id: input.telegramId,
        username: input.username ?? null,
        first_name: input.firstName ?? null,
        rank: rankForLevel(1)
      })
      .select("*")
      .single();

    if (error || !data) throw badRequest("Unable to create user", error);
    await this.saveUserTimezone((data as UserRow).id, input);
    return data as UserRow;
  }

  private async findUserByTelegramId(telegramId: number) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (error) throw badRequest("Unable to load user", error);
    return data ? (data as UserRow) : null;
  }

  private async getUserByTelegramId(telegramId: number) {
    const user = await this.findUserByTelegramId(telegramId);
    if (!user) throw notFound("User not found");
    return user;
  }

  private async getUserRow(userId: string): Promise<UserRow> {
    const { data, error } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
    if (error) throw badRequest("Unable to load user", error);
    if (!data) throw notFound("User not found");
    return data as UserRow;
  }

  private async ensureUserStats(userId: string): Promise<StatsRow> {
    const { data, error } = await supabase
      .from("user_stats")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw badRequest("Unable to load user stats", error);
    if (data) return data as StatsRow;

    const { data: created, error: createError } = await supabase
      .from("user_stats")
      .insert({ user_id: userId })
      .select("*")
      .single();

    if (createError || !created) throw badRequest("Unable to create user stats", createError);
    return created as StatsRow;
  }

  private async ensureDailyQuests(userId: string) {
    const { today } = await this.getDateContext(userId);
    const { data, error } = await supabase
      .from("quests")
      .select("id")
      .eq("user_id", userId)
      .eq("due_date", today)
      .limit(1);

    if (error) throw badRequest("Unable to inspect daily quests", error);
    if ((data ?? []).length > 0) return;

    const templates = this.pickRandom(uniqueTemplates(await this.getQuestTemplates()), 5);
    if (templates.length === 0) throw badRequest("No quest templates are available");

    const rows = templates.map((template) => ({
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

    const { error: insertError } = await supabase.from("quests").insert(rows);
    if (insertError) throw badRequest("Unable to create daily quests", insertError);
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

    const existingKeys = new Set(todayQuests.map((quest) => questTemplateKey(quest.title, quest.category)));
    const candidates = uniqueTemplates(await this.getQuestTemplates()).filter(
      (template) => !existingKeys.has(questTemplateKey(template.title, template.category))
    );
    const template = this.pickRandom(candidates, 1)[0];

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
      .select("*")
      .single();

    if (error?.code === "23505") throw conflict("Quest already exists today");
    if (error || !data) throw badRequest("Unable to generate quest", error);
    return toQuest(data as QuestRow);
  }

  private async getQuestsForDate(userId: string, date: string) {
    const { data, error } = await supabase
      .from("quests")
      .select("*")
      .eq("user_id", userId)
      .eq("due_date", date);

    if (error) throw badRequest("Unable to inspect quests", error);
    return ((data ?? []) as QuestRow[]).map(toQuest);
  }

  private async syncBossProgress(userId: string, boss?: ReturnType<typeof toBoss> | null): Promise<BossProgressResult | null> {
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
        .select("*")
        .maybeSingle();

      if (updateError) throw badRequest("Unable to update boss progress", updateError);
      if (data) {
        updatedBoss = toBoss(data as WeeklyBossRow);
        if (victory) {
          await this.awardUser(userId, currentBoss.xpReward, currentBoss.statRewardKey, currentBoss.statRewardValue, "Охотник фокуса");
          unlockedAchievements = await this.evaluateAchievements(userId, { bossDefeated: true });
        }
      } else {
        updatedBoss = toBoss(await this.getBossRow(userId, currentBoss.id));
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
      .select("*")
      .eq("user_id", userId)
      .eq("starts_at", startsAt)
      .eq("ends_at", endsAt)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw badRequest("Unable to load weekly boss", error);
    return data ? toBoss(data as WeeklyBossRow) : null;
  }

  private async getDateContext(userId: string) {
    const user = await this.getUserRow(userId);
    const timezoneOffset = normalizeTimezoneOffset(user.timezone_offset);

    return {
      timezoneOffset,
      today: todayDateString(new Date(), timezoneOffset),
      ...getWeekRange(new Date(), timezoneOffset)
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

  private async getQuestTemplates(): Promise<QuestTemplate[]> {
    const { data, error } = await supabase
      .from("quest_templates")
      .select("*")
      .eq("is_active", true);

    if (error || !data || data.length === 0) {
      return DEFAULT_QUEST_TEMPLATES;
    }

    return (data as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      description: row.description as string,
      category: row.category as QuestTemplate["category"],
      difficulty: row.difficulty as QuestTemplate["difficulty"],
      xpReward: row.xp_reward as number,
      statRewardKey: row.stat_reward_key as StatKey,
      statRewardValue: row.stat_reward_value as number,
      isActive: row.is_active as boolean
    }));
  }

  private async getQuestRow(userId: string, questId: string): Promise<QuestRow> {
    const { data, error } = await supabase
      .from("quests")
      .select("*")
      .eq("id", questId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw badRequest("Unable to load quest", error);
    if (!data) throw notFound("Quest not found");
    return data as QuestRow;
  }

  private async getBossRow(userId: string, bossId: string): Promise<WeeklyBossRow> {
    const { data, error } = await supabase
      .from("weekly_bosses")
      .select("*")
      .eq("id", bossId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw badRequest("Unable to load weekly boss", error);
    if (!data) throw notFound("Weekly boss not found");
    return data as WeeklyBossRow;
  }

  private async awardUser(
    userId: string,
    xpReward: number,
    statKey: StatKey,
    statReward: number,
    title?: string
  ) {
    if (!STAT_KEYS.includes(statKey)) throw badRequest("Invalid stat reward");

    const [user, stats] = await Promise.all([this.getUserRow(userId), this.ensureUserStats(userId)]);
    const currentStat = Number((stats as unknown as Record<StatKey, number>)[statKey]);
    const updatedStatValue = currentStat + statReward;
    const xpResult = applyXp(user.level, user.xp, xpReward);

    const { error: statsError } = await supabase
      .from("user_stats")
      .update({
        [statKey]: updatedStatValue,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId);

    if (statsError) throw badRequest("Unable to update stats", statsError);

    const { error: userError } = await supabase
      .from("users")
      .update({
        level: xpResult.level,
        xp: xpResult.xp,
        rank: xpResult.rank,
        current_title: title ?? user.current_title,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId);

    if (userError) throw badRequest("Unable to update user XP", userError);

    return xpResult;
  }

  private async calculateTotalXp(userId: string) {
    const [{ data: questRows, error: questError }, { data: bossRows, error: bossError }] = await Promise.all([
      supabase.from("quests").select("xp_reward").eq("user_id", userId).eq("status", "completed"),
      supabase.from("weekly_bosses").select("xp_reward").eq("user_id", userId).eq("status", "completed")
    ]);

    if (questError) throw badRequest("Unable to calculate quest XP", questError);
    if (bossError) throw badRequest("Unable to calculate boss XP", bossError);

    const questXp = ((questRows ?? []) as Array<{ xp_reward: number }>).reduce(
      (total, row) => total + Number(row.xp_reward ?? 0),
      0
    );
    const bossXp = ((bossRows ?? []) as Array<{ xp_reward: number }>).reduce(
      (total, row) => total + Number(row.xp_reward ?? 0),
      0
    );

    return questXp + bossXp;
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
      ((data ?? []) as Array<{ completed_at: string | null }>)
        .map((row) => row.completed_at ? todayDateString(new Date(row.completed_at), timezoneOffset) : null)
        .filter((value): value is string => Boolean(value))
    );

    let streak = 0;
    let cursor = today;

    while (completedDates.has(cursor)) {
      streak += 1;
      cursor = addDaysToDateString(cursor, -1);
    }

    return streak;
  }

  private async evaluateAchievements(
    userId: string,
    event: { leveledUp?: boolean; bossDefeated?: boolean } = {}
  ) {
    const [completed, focusCompleted, disciplineCompleted, bossesDefeated] = await Promise.all([
      this.countCompletedQuests(userId),
      this.countCompletedQuests(userId, "focus"),
      this.countCompletedQuests(userId, "discipline"),
      this.countCompletedBosses(userId)
    ]);
    const user = await this.getUserRow(userId);
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
    const uniqueKeys = [...new Set(keys)];
    if (uniqueKeys.length === 0) return [];

    const { data: existing, error: existingError } = await supabase
      .from("achievements")
      .select("key")
      .eq("user_id", userId)
      .in("key", uniqueKeys);

    if (existingError) throw badRequest("Unable to inspect achievements", existingError);
    const existingKeys = new Set(((existing ?? []) as Array<{ key: string }>).map((row) => row.key));
    const rows = uniqueKeys
      .filter((key) => !existingKeys.has(key))
      .map((key) => ({
        user_id: userId,
        key,
        title: ACHIEVEMENTS[key]?.title ?? key,
        description: ACHIEVEMENTS[key]?.description ?? "Достижение открыто."
      }));

    if (rows.length === 0) return [];

    const { data, error } = await supabase.from("achievements").insert(rows).select("*");
    if (error) throw badRequest("Unable to unlock achievement", error);
    return ((data ?? []) as AchievementRow[]).map(toAchievement);
  }

  private pickRandom<T>(items: T[], count: number) {
    return [...items].sort(() => Math.random() - 0.5).slice(0, count);
  }
}

export const hunterService = new HunterService();

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
