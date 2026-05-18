import {
  DEFAULT_QUEST_TEMPLATES,
  STAT_KEYS,
  XP_REWARDS,
  applyXp,
  classForStats,
  rankForLevel,
  xpToNextLevel,
  type Achievement,
  type DashboardSummary,
  type Quest,
  type QuestCompletionResult,
  type StatKey,
  type UserStats,
  type WeeklyBoss
} from "@system-hunter/shared";
import { supabase } from "./db.js";
import { addDays, getWeekRange, todayDateString } from "./dates.js";
import { badRequest, conflict, notFound } from "./http.js";

interface TelegramUserInput {
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
}

const ACHIEVEMENTS: Record<string, { title: string; description: string }> = {
  first_quest: { title: "First Quest", description: "Complete your first daily quest." },
  streak_3: { title: "3 Day Streak", description: "Complete quests three days in a row." },
  streak_7: { title: "7 Day Streak", description: "Complete quests seven days in a row." },
  first_level_up: { title: "First Level Up", description: "Reach a new level for the first time." },
  boss_slayer: { title: "Boss Slayer", description: "Defeat your first weekly boss." },
  focus_hunter: { title: "Focus Hunter", description: "Complete 10 focus quests." },
  discipline_initiate: { title: "Discipline Initiate", description: "Complete 10 discipline quests." }
};

export class HunterService {
  async syncTelegramUser(input: TelegramUserInput) {
    const user = await this.createOrUpdateUser(input);
    await this.ensureStats(user.id);
    await this.ensureDailyQuests(user.id);
    await this.ensureWeeklyBoss(user.id);
    return this.getProfileBundle(user.id);
  }

  async getDashboard(userId: string): Promise<DashboardSummary> {
    const { profile, stats } = await this.getProfileBundle(userId);
    const [todayQuests, boss, achievements] = await Promise.all([
      this.getTodayQuests(userId),
      this.getCurrentBoss(userId),
      this.getAchievements(userId)
    ]);

    return { profile, stats, todayQuests, boss, achievements };
  }

  async getProfileBundle(userId: string) {
    const user = await this.getUser(userId);
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
    const { data, error } = await supabase
      .from("quests")
      .select("*")
      .eq("user_id", userId)
      .eq("due_date", todayDateString())
      .order("created_at", { ascending: true });

    if (error) throw badRequest("Unable to load today's quests", error);
    return (data ?? []).map(toQuest);
  }

  async getTodayQuestsByTelegramId(telegramId: number) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.getTodayQuests(user.id);
  }

  async generateQuest(userId: string) {
    const template = pickRandom(await this.getQuestTemplates(), 1)[0];
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
    return toQuest(data);
  }

  async generateQuestByTelegramId(telegramId: number) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.generateQuest(user.id);
  }

  async completeQuest(userId: string, questId: string): Promise<QuestCompletionResult> {
    const quest = await this.getQuest(userId, questId);
    if (quest.status === "completed") throw conflict("Quest is already completed");
    if (quest.status === "skipped") throw conflict("Skipped quest cannot be completed");

    const { data, error } = await supabase
      .from("quests")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", questId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error || !data) throw badRequest("Unable to complete quest", error);

    const levelUp = await this.award(userId, quest.xp_reward, quest.stat_reward_key, quest.stat_reward_value);
    const streak = await this.calculateStreak(userId);
    await supabase.from("users").update({ streak, updated_at: new Date().toISOString() }).eq("id", userId);

    const unlockedAchievements = await this.evaluateAchievements(userId, { leveledUp: levelUp.leveledUp });
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
      .select("*")
      .single();

    if (error || !data) throw badRequest("Unable to skip quest", error);
    return toQuest(data);
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
    return data ? toBoss(data) : null;
  }

  async getCurrentBossByTelegramId(telegramId: number) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.getCurrentBoss(user.id);
  }

  async progressBoss(userId: string, bossId: string) {
    const boss = await this.getBoss(userId, bossId);
    if (boss.status === "completed") throw conflict("Weekly boss is already completed");

    const progress = Math.min(boss.progress + 1, boss.target);
    const victory = progress >= boss.target;
    const { data, error } = await supabase
      .from("weekly_bosses")
      .update({
        progress,
        status: victory ? "completed" : "active",
        completed_at: victory ? new Date().toISOString() : null
      })
      .eq("id", bossId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error || !data) throw badRequest("Unable to update boss progress", error);

    let unlockedAchievements: Achievement[] = [];
    if (victory) {
      await this.award(userId, boss.xp_reward, boss.stat_reward_key, boss.stat_reward_value, "Focus Hunter");
      unlockedAchievements = await this.evaluateAchievements(userId, { bossDefeated: true });
    }

    const { profile, stats } = await this.getProfileBundle(userId);
    return { boss: toBoss(data), profile, stats, victory, unlockedAchievements };
  }

  async progressBossByTelegramId(telegramId: number, bossId: string) {
    const user = await this.getUserByTelegramId(telegramId);
    return this.progressBoss(user.id, bossId);
  }

  async getAchievements(userId: string) {
    const { data, error } = await supabase
      .from("achievements")
      .select("*")
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
        .select("*")
        .single();

      if (error || !data) throw badRequest("Unable to update user", error);
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
      .select("*")
      .single();

    if (error || !data) throw badRequest("Unable to create user", error);
    return data;
  }

  private async findUserByTelegramId(telegramId: number) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
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
    const { data, error } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
    if (error) throw badRequest("Unable to load user", error);
    if (!data) throw notFound("User not found");
    return data;
  }

  private async ensureStats(userId: string) {
    const { data, error } = await supabase
      .from("user_stats")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw badRequest("Unable to load stats", error);
    if (data) return data;

    const { data: created, error: createError } = await supabase
      .from("user_stats")
      .insert({ user_id: userId })
      .select("*")
      .single();

    if (createError || !created) throw badRequest("Unable to create stats", createError);
    return created;
  }

  private async ensureDailyQuests(userId: string) {
    const { data, error } = await supabase
      .from("quests")
      .select("id")
      .eq("user_id", userId)
      .eq("due_date", todayDateString())
      .limit(1);

    if (error) throw badRequest("Unable to inspect quests", error);
    if ((data ?? []).length > 0) return;

    const rows = pickRandom(await this.getQuestTemplates(), 5).map((template) => ({
      user_id: userId,
      title: template.title,
      description: template.description,
      type: "daily",
      category: template.category,
      difficulty: template.difficulty,
      xp_reward: template.xpReward,
      stat_reward_key: template.statRewardKey,
      stat_reward_value: template.statRewardValue,
      due_date: todayDateString()
    }));

    if (rows.length === 0) throw badRequest("No quest templates are available");
    const { error: insertError } = await supabase.from("quests").insert(rows);
    if (insertError) throw badRequest("Unable to create quests", insertError);
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

  private async getQuestTemplates() {
    const { data, error } = await supabase.from("quest_templates").select("*").eq("is_active", true);
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
      .select("*")
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
      .select("*")
      .eq("id", bossId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw badRequest("Unable to load boss", error);
    if (!data) throw notFound("Weekly boss not found");
    return data;
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
    const { data, error } = await supabase
      .from("quests")
      .select("completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(90);

    if (error) throw badRequest("Unable to calculate streak", error);
    const completedDates = new Set(
      (data ?? []).map((row: any) => row.completed_at?.slice(0, 10)).filter(Boolean)
    );

    let streak = 0;
    let cursor = new Date(`${todayDateString()}T00:00:00.000Z`);
    while (completedDates.has(todayDateString(cursor))) {
      streak += 1;
      cursor = addDays(cursor, -1);
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
        description: ACHIEVEMENTS[key]?.description ?? "Achievement unlocked."
      }));

    if (rows.length === 0) return [];
    const { data, error } = await supabase.from("achievements").insert(rows).select("*");
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

function pickRandom<T>(items: T[], count: number) {
  return [...items].sort(() => Math.random() - 0.5).slice(0, count);
}

function sumRewards(rows: any[] | null) {
  return (rows ?? []).reduce((total, row) => total + Number(row.xp_reward ?? 0), 0);
}

