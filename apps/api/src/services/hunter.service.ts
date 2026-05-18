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
import { addDays, getWeekRange, todayDateString } from "../lib/dates.js";
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
}

const ACHIEVEMENTS: Record<string, { title: string; description: string }> = {
  first_quest: {
    title: "First Quest",
    description: "Complete your first daily quest."
  },
  streak_3: {
    title: "3 Day Streak",
    description: "Complete quests three days in a row."
  },
  streak_7: {
    title: "7 Day Streak",
    description: "Complete quests seven days in a row."
  },
  first_level_up: {
    title: "First Level Up",
    description: "Reach a new level for the first time."
  },
  boss_slayer: {
    title: "Boss Slayer",
    description: "Defeat your first weekly boss."
  },
  focus_hunter: {
    title: "Focus Hunter",
    description: "Complete 10 focus quests."
  },
  discipline_initiate: {
    title: "Discipline Initiate",
    description: "Complete 10 discipline quests."
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
    const { data, error } = await supabase
      .from("quests")
      .select("*")
      .eq("user_id", userId)
      .eq("due_date", todayDateString())
      .order("created_at", { ascending: true });

    if (error) throw badRequest("Unable to load today's quests", error);
    return ((data ?? []) as QuestRow[]).map(toQuest);
  }

  async getTodayQuestsByTelegramId(telegramId: number) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.getTodayQuests(user.id);
  }

  async generateQuest(userId: string) {
    const templates = await this.getQuestTemplates();
    const template = this.pickRandom(templates, 1)[0];
    if (!template) throw badRequest("No quest templates are available");

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
        due_date: todayDateString()
      })
      .select("*")
      .single();

    if (error || !data) throw badRequest("Unable to generate quest", error);
    return toQuest(data as QuestRow);
  }

  async generateQuestByTelegramId(telegramId: number) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.generateQuest(user.id);
  }

  async completeQuest(userId: string, questId: string): Promise<QuestCompletionResult> {
    const quest = await this.getQuestRow(userId, questId);
    if (quest.status === "completed") throw conflict("Quest is already completed");
    if (quest.status === "skipped") throw conflict("Skipped quest cannot be completed");

    const { data: updatedQuest, error: questError } = await supabase
      .from("quests")
      .update({
        status: "completed",
        completed_at: new Date().toISOString()
      })
      .eq("id", questId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (questError || !updatedQuest) throw badRequest("Unable to complete quest", questError);

    const award = await this.awardUser(userId, quest.xp_reward, quest.stat_reward_key, quest.stat_reward_value);
    const streak = await this.calculateStreak(userId);

    await supabase
      .from("users")
      .update({
        streak,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId);

    const unlockedAchievements = await this.evaluateAchievements(userId, {
      leveledUp: award.leveledUp
    });
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
      .select("*")
      .single();

    if (error || !data) throw badRequest("Unable to skip quest", error);
    return toQuest(data as QuestRow);
  }

  async getCurrentBoss(userId: string) {
    await this.ensureWeeklyBoss(userId);
    const { startsAt, endsAt } = getWeekRange();
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

  async getCurrentBossByTelegramId(telegramId: number) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.getCurrentBoss(user.id);
  }

  async progressBoss(userId: string, bossId: string): Promise<BossProgressResult> {
    const boss = await this.getBossRow(userId, bossId);
    if (boss.status === "completed") throw conflict("Weekly boss is already completed");
    if (boss.status === "expired") throw conflict("Weekly boss has expired");

    const nextProgress = Math.min(boss.progress + 1, boss.target);
    const victory = nextProgress >= boss.target;

    const { data: updatedBoss, error } = await supabase
      .from("weekly_bosses")
      .update({
        progress: nextProgress,
        status: victory ? "completed" : "active",
        completed_at: victory ? new Date().toISOString() : null
      })
      .eq("id", bossId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error || !updatedBoss) throw badRequest("Unable to update boss progress", error);

    let unlockedAchievements: Achievement[] = [];
    if (victory) {
      await this.awardUser(userId, boss.xp_reward, boss.stat_reward_key, boss.stat_reward_value, "Focus Hunter");
      unlockedAchievements = await this.evaluateAchievements(userId, {
        bossDefeated: true
      });
    }

    const { profile, stats } = await this.getProfileBundle(userId);

    return {
      boss: toBoss(updatedBoss as WeeklyBossRow),
      profile,
      stats,
      victory,
      unlockedAchievements
    };
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
    const today = todayDateString();
    const { data, error } = await supabase
      .from("quests")
      .select("user_id, users!inner(telegram_id)")
      .eq("due_date", today)
      .eq("status", "active");

    if (error) throw badRequest("Unable to load active quests", error);

    const counts = new Map<number, number>();
    for (const row of (data ?? []) as unknown as Array<{
      users: { telegram_id: number } | Array<{ telegram_id: number }>;
      user_id: string;
    }>) {
      const relatedUser = Array.isArray(row.users) ? row.users[0] : row.users;
      if (!relatedUser) continue;
      const current = counts.get(relatedUser.telegram_id) ?? 0;
      counts.set(relatedUser.telegram_id, current + 1);
    }

    return [...counts.entries()].map(([telegramId, activeCount]) => ({ telegramId, activeCount }));
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
    const today = todayDateString();
    const { data, error } = await supabase
      .from("quests")
      .select("id")
      .eq("user_id", userId)
      .eq("due_date", today)
      .limit(1);

    if (error) throw badRequest("Unable to inspect daily quests", error);
    if ((data ?? []).length > 0) return;

    const templates = this.pickRandom(await this.getQuestTemplates(), 5);
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
    const { startsAt, endsAt } = getWeekRange();
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
      name: "Devourer of Focus",
      description: "A pressure-born entity that weakens when you protect deep work blocks.",
      objective: "Complete 4 deep work sessions.",
      target: 4,
      xp_reward: XP_REWARDS.boss,
      stat_reward_key: "focus",
      stat_reward_value: 3,
      starts_at: startsAt,
      ends_at: endsAt
    });

    if (insertError) throw badRequest("Unable to create weekly boss", insertError);
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
        .map((row) => row.completed_at?.slice(0, 10))
        .filter((value): value is string => Boolean(value))
    );

    let streak = 0;
    let cursor = new Date(`${todayDateString()}T00:00:00.000Z`);

    while (completedDates.has(todayDateString(cursor))) {
      streak += 1;
      cursor = addDays(cursor, -1);
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
        description: ACHIEVEMENTS[key]?.description ?? "Achievement unlocked."
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
