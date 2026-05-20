import { classForStats, xpToNextLevel } from "@system-hunter/shared";
import type {
  Achievement,
  HunterProfile,
  Quest,
  QuestCategory,
  QuestSource,
  QuestStatus,
  QuestTag,
  QuestType,
  Rank,
  StatKey,
  UserStats,
  WeeklyBoss
} from "@system-hunter/shared";

export interface UserRow {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  level: number;
  xp: number;
  rank: Rank;
  streak: number;
  hp: number;
  energy: number;
  timezone: string | null;
  timezone_offset: number | null;
  current_title: string | null;
  created_at: string;
  updated_at: string;
}

export interface StatsRow {
  id: string;
  user_id: string;
  strength: number;
  intelligence: number;
  vitality: number;
  discipline: number;
  focus: number;
  charisma: number;
  created_at: string;
  updated_at: string;
}

export interface QuestRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  type: QuestType;
  source?: QuestSource | null;
  custom_template_id?: string | null;
  category: QuestCategory;
  difficulty: "easy" | "medium" | "hard";
  xp_reward: number;
  stat_reward_key: StatKey;
  stat_reward_value: number;
  estimated_minutes?: number | null;
  tags?: string[] | null;
  reason?: string | null;
  status: QuestStatus;
  due_date: string;
  started_at?: string | null;
  cancelled_at?: string | null;
  completed_at: string | null;
  deleted_at?: string | null;
  created_at: string;
}

export interface WeeklyBossRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  objective: string;
  progress: number;
  target: number;
  xp_reward: number;
  stat_reward_key: StatKey;
  stat_reward_value: number;
  status: "active" | "completed" | "expired";
  starts_at: string;
  ends_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface AchievementRow {
  id: string;
  user_id: string;
  key: string;
  title: string;
  description: string;
  unlocked_at: string;
}

export function toStats(row: StatsRow): UserStats {
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

export function toProfile(
  row: UserRow,
  stats: UserStats,
  totalXp: number,
  completedQuestsCount: number
): HunterProfile {
  return {
    id: row.id,
    telegramId: row.telegram_id,
    username: row.username,
    firstName: row.first_name,
    level: row.level,
    xp: row.xp,
    xpToNextLevel: xpToNextLevel(row.level),
    rank: row.rank,
    streak: row.streak,
    hp: row.hp,
    energy: row.energy,
    timezone: row.timezone,
    timezoneOffset: row.timezone_offset,
    className: classForStats({
      strength: stats.strength,
      intelligence: stats.intelligence,
      vitality: stats.vitality,
      discipline: stats.discipline,
      focus: stats.focus,
      charisma: stats.charisma
    }),
    currentTitle: row.current_title,
    totalXp,
    completedQuestsCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toQuest(row: QuestRow): Quest {
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
    tags: Array.isArray(row.tags) ? (row.tags as QuestTag[]) : [],
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

export function toBoss(row: WeeklyBossRow): WeeklyBoss {
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

export function toAchievement(row: AchievementRow): Achievement {
  return {
    id: row.id,
    userId: row.user_id,
    key: row.key,
    title: row.title,
    description: row.description,
    unlockedAt: row.unlocked_at
  };
}
