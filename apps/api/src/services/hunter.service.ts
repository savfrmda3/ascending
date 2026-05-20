import {
  DEFAULT_QUEST_TEMPLATES,
  STAT_KEYS,
  XP_REWARDS,
  applyXp,
  rankForLevel,
  type AdminOverview,
  type Achievement,
  type AchievementCollectionItem,
  type AchievementRarity,
  type BossProgressResult,
  type DashboardSummary,
  type QuestCompletionResult,
  type Difficulty,
  type HunterGoal,
  type InventoryCatalogItem,
  type InventorySummary,
  type ProgressDay,
  type ProgressHistory,
  type Quest,
  type QuestCategory,
  type QuestTemplate,
  type SeasonSummary,
  type SkillNode,
  type SkillTreeSummary,
  type SkillUnlockResult,
  type SquadSummary,
  type StatKey,
  type SystemsOverview,
  type UserSettings,
  type WeeklyRecap
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
const GENERATE_QUEST_ENERGY_COST = 8;
const HARD_QUEST_ENERGY_COST = 15;
const SKIP_HP_PENALTY = 6;
const REPLACE_HP_PENALTY = 2;
const DAILY_RECOVERY_ENERGY = 18;
const DAILY_RECOVERY_HP = 5;
let timezoneColumnsAvailable: boolean | null = null;
let userSettingsTableAvailable: boolean | null = null;
let expansionTablesAvailable: boolean | null = null;

const USER_SETTINGS_COLUMNS =
  "id,user_id,primary_goal,desired_difficulty,quests_per_day,wake_time,sleep_time,allow_physical_quests,preferred_categories,onboarding_completed,created_at,updated_at";

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

export class HunterService {
  async syncTelegramUser(input: TelegramUserInput) {
    const user = await this.createOrUpdateUser(input);
    await this.ensureUserStats(user.id);
    await this.ensureSettings(user.id);
    await this.ensureDailyQuests(user.id);
    await this.ensureWeeklyBoss(user.id);

    return this.getProfileBundle(user.id);
  }

  async getDashboard(userId: string): Promise<DashboardSummary> {
    const { profile, stats } = await this.getProfileBundle(userId);
    const settings = await this.getSettings(userId);
    const todayQuests = await this.getTodayQuests(userId);
    const boss = await this.getCurrentBoss(userId);
    const achievements = await this.getAchievements(userId);

    return {
      profile,
      stats,
      settings,
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

  async getSettings(userId: string) {
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
      .update({ status: "skipped", cancelled_at: new Date().toISOString() })
      .eq("id", questId)
      .eq("user_id", userId)
      .eq("status", "active")
      .select("*")
      .maybeSingle();

    if (error) throw badRequest("Unable to replace quest", error);
    if (!replaced) throw conflict("Quest is not active");
    await this.adjustVitals(userId, { hpDelta: -REPLACE_HP_PENALTY });
    return this.insertGeneratedQuest(userId, prepared.template, prepared.today);
  }

  async completeQuest(userId: string, questId: string): Promise<QuestCompletionResult> {
    const quest = await this.getQuestRow(userId, questId);
    if (quest.status !== "active") throw conflict("Quest is not active");
    if (quest.difficulty === "hard") {
      await this.spendEnergy(userId, HARD_QUEST_ENERGY_COST, "Not enough energy for hard quest");
    }

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
    await this.applyQuestVitals(userId, toQuest(quest));
    const streak = await this.calculateStreak(userId);

    await supabase
      .from("users")
      .update({
        streak,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId);

    const bossProgress = await this.syncBossProgress(userId);
    await this.syncSeasonProgress(userId, { questXp: quest.xp_reward });
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
    await this.adjustVitals(userId, { hpDelta: -SKIP_HP_PENALTY });
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

  async getProgressHistory(userId: string): Promise<ProgressHistory> {
    const { today, startsAt, endsAt } = await this.getDateContext(userId);
    const since = addDaysToDateString(today, -29);
    const [historyResponse, recentResponse, achievementCollection] = await Promise.all([
      supabase
        .from("quests")
        .select("*")
        .eq("user_id", userId)
        .gte("due_date", since)
        .lte("due_date", today)
        .order("due_date", { ascending: true }),
      supabase
        .from("quests")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      this.getAchievementCollection(userId)
    ]);

    if (historyResponse.error) throw badRequest("Unable to load progress history", historyResponse.error);
    if (recentResponse.error) throw badRequest("Unable to load recent quests", recentResponse.error);

    const historyQuests = ((historyResponse.data ?? []) as QuestRow[]).map(toQuest);
    const recentQuests = ((recentResponse.data ?? []) as QuestRow[]).map(toQuest);
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

    const { error } = await supabase.from("user_skills").insert({ user_id: userId, skill_key: key });
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
      this.getUserRow(userId),
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
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      key: row.key as string,
      title: row.title as string,
      description: row.description as string,
      statKey: row.stat_key as StatKey,
      tier: row.tier as 1 | 2 | 3,
      cost: row.cost as number,
      bonusText: row.bonus_text as string
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
    return (data ?? []) as Array<{ skill_key: string; unlocked_at: string }>;
  }

  private async getInventory(userId: string): Promise<InventorySummary> {
    const [catalog, rows] = await Promise.all([this.getInventoryCatalog(), this.getUserInventoryRows(userId)]);
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
    return ((data ?? []) as Array<Record<string, unknown>>).map(toInventoryItem);
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
    return (data ?? []) as Array<{ item_key: string; quantity: number; acquired_at: string }>;
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

    return data as { quests_completed: number; bosses_defeated: number; xp: number; reward_claimed: boolean } | null;
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

    const { error } = await supabase.from("season_progress").upsert(next, { onConflict: "season_id,user_id" });
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
    const record = data as { role: "owner" | "member"; squads?: any[] | any } | null;
    if (!record?.squads) return null;

    const squad = Array.isArray(record.squads) ? record.squads[0] : record.squads;
    const { count, error: countError } = await supabase
      .from("squad_members")
      .select("id", { count: "exact", head: true })
      .eq("squad_id", squad.id);

    if (countError) throw badRequest("Unable to count squad members", countError);
    return {
      id: squad.id,
      name: squad.name,
      code: squad.code,
      role: record.role,
      memberCount: count ?? 1,
      createdAt: squad.created_at
    };
  }

  private async getAdminOverview(userId: string): Promise<AdminOverview | null> {
    const user = await this.getUserRow(userId);
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

    if (error) throw badRequest("Unable to inspect daily quests", error);
    if ((data ?? []).length > 0) return;

    await this.adjustVitals(userId, { hpDelta: DAILY_RECOVERY_HP, energyDelta: DAILY_RECOVERY_ENERGY });
    const settings = await this.getSettings(userId);
    const templates = pickRandomUniqueTemplates(await this.getPersonalizedQuestTemplates(userId, settings), settings.questsPerDay, new Set());
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

  private async getPersonalizedQuestTemplates(userId: string, settings: UserSettings) {
    const [templates, stats, recentSkippedCategories] = await Promise.all([
      this.getQuestTemplates(),
      this.ensureUserStats(userId).then(toStats),
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
          await this.syncSeasonProgress(userId, { bossDefeated: true });
          await this.awardInventoryItem(userId, "focus_booster", 1);
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
      estimatedMinutes: (row.estimated_minutes as number | null | undefined) ?? undefined,
      tags: Array.isArray(row.tags) ? (row.tags as QuestTemplate["tags"]) : [],
      reason: (row.reason as string | null | undefined) ?? null,
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

  private async spendEnergy(userId: string, cost: number, message: string) {
    const user = await this.getUserRow(userId);
    if (Number(user.energy ?? 0) < cost) throw conflict(message);
    await this.adjustVitals(userId, { energyDelta: -cost });
  }

  private async adjustVitals(userId: string, input: { hpDelta?: number; energyDelta?: number }) {
    const user = await this.getUserRow(userId);
    const hp = clampVital(Number(user.hp ?? 100) + (input.hpDelta ?? 0));
    const energy = clampVital(Number(user.energy ?? 100) + (input.energyDelta ?? 0));
    const { error } = await supabase
      .from("users")
      .update({ hp, energy, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) throw badRequest("Unable to update vitals", error);
  }

  private async applyQuestVitals(userId: string, quest: Quest) {
    if (quest.category === "vitality") {
      await this.adjustVitals(userId, { hpDelta: 10, energyDelta: quest.difficulty === "hard" ? 18 : 12 });
      return;
    }

    if (quest.category === "strength" && quest.difficulty === "hard") {
      await this.adjustVitals(userId, { hpDelta: 2 });
    }
  }

  private async increaseStat(userId: string, statKey: StatKey, value: number) {
    const stats = await this.ensureUserStats(userId);
    const currentStat = Number((stats as unknown as Record<StatKey, number>)[statKey]);
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
    const metrics = await this.getAchievementMetrics(userId);
    const keys = Object.entries(ACHIEVEMENTS)
      .filter(([, catalog]) => Number(metrics[catalog.metric] ?? 0) >= catalog.target)
      .map(([key]) => key);

    if (event.leveledUp) keys.push("first_level_up");
    if (event.bossDefeated) keys.push("boss_slayer");

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
    await Promise.all(rows.map((row) => this.awardAchievementItem(userId, row.key)));
    return ((data ?? []) as AchievementRow[]).map(toAchievement);
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

function questTemplateKey(title: string, category: string) {
  return `${category.trim().toLowerCase()}::${title.trim().toLowerCase()}`;
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

function difficultyScore(actual: Difficulty, desired: Difficulty) {
  if (actual === desired) return 2;
  if (desired === "hard" && actual === "medium") return 1;
  if (desired === "easy" && actual === "hard") return -2;
  return 0;
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

function clampVital(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function skillPrerequisiteMet(node: SkillNode, unlocked: Map<string, string>) {
  if (node.tier === 1) return true;
  const previousTier = node.tier - 1;
  const prefix = node.key.replace(/_i+$/i, "");
  return unlocked.has(`${prefix}_${"i".repeat(previousTier)}`);
}

function toInventoryItem(row: Record<string, unknown>): InventoryCatalogItem {
  return {
    key: row.key as string,
    title: row.title as string,
    description: row.description as string,
    type: row.type as InventoryCatalogItem["type"],
    rarity: row.rarity as InventoryCatalogItem["rarity"],
    effectKey: (row.effect_key as string | null | undefined) ?? null,
    effectValue: (row.effect_value as number | undefined) ?? 0
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
  const admins = (process.env.ADMIN_TELEGRAM_IDS ?? "")
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
