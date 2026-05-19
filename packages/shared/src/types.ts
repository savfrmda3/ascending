export type Rank = "E" | "D" | "C" | "B" | "A" | "S";

export type StatKey =
  | "strength"
  | "intelligence"
  | "vitality"
  | "discipline"
  | "focus"
  | "charisma";

export type QuestCategory = StatKey;
export type Difficulty = "easy" | "medium" | "hard";
export type QuestStatus = "active" | "completed" | "skipped" | "replaced";
export type BossStatus = "active" | "completed" | "expired";
export type HunterGoal = "sport" | "discipline" | "study" | "focus" | "health" | "charisma";
export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

export interface HunterProfile {
  id: string;
  telegramId: number;
  username: string | null;
  firstName: string | null;
  level: number;
  xp: number;
  xpToNextLevel: number;
  rank: Rank;
  streak: number;
  hp: number;
  energy: number;
  timezone: string | null;
  timezoneOffset: number | null;
  className: string;
  currentTitle: string | null;
  totalXp: number;
  completedQuestsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserStats {
  id: string;
  userId: string;
  strength: number;
  intelligence: number;
  vitality: number;
  discipline: number;
  focus: number;
  charisma: number;
  createdAt: string;
  updatedAt: string;
}

export interface Quest {
  id: string;
  userId: string;
  title: string;
  description: string;
  type: "daily" | "generated";
  category: QuestCategory;
  difficulty: Difficulty;
  xpReward: number;
  statRewardKey: StatKey;
  statRewardValue: number;
  status: QuestStatus;
  dueDate: string;
  completedAt: string | null;
  createdAt: string;
}

export interface QuestTemplate {
  id?: string;
  title: string;
  description: string;
  category: QuestCategory;
  difficulty: Difficulty;
  xpReward: number;
  statRewardKey: StatKey;
  statRewardValue: number;
  isActive?: boolean;
}

export interface WeeklyBoss {
  id: string;
  userId: string;
  name: string;
  description: string;
  objective: string;
  progress: number;
  target: number;
  xpReward: number;
  statRewardKey: StatKey;
  statRewardValue: number;
  status: BossStatus;
  startsAt: string;
  endsAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface Achievement {
  id: string;
  userId: string;
  key: string;
  title: string;
  description: string;
  unlockedAt: string;
}

export interface AchievementCollectionItem {
  key: string;
  title: string;
  description: string;
  rarity: AchievementRarity;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: number;
  target: number;
}

export interface UserSettings {
  id: string;
  userId: string;
  primaryGoal: HunterGoal;
  desiredDifficulty: Difficulty;
  questsPerDay: number;
  wakeTime: string | null;
  sleepTime: string | null;
  allowPhysicalQuests: boolean;
  preferredCategories: QuestCategory[];
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  profile: HunterProfile;
  stats: UserStats;
  settings: UserSettings;
  todayQuests: Quest[];
  boss: WeeklyBoss | null;
  achievements: Achievement[];
}

export interface ProgressDay {
  date: string;
  total: number;
  completed: number;
  skipped: number;
  replaced: number;
  xp: number;
}

export interface WeeklyRecap {
  startsAt: string;
  endsAt: string;
  completed: number;
  skipped: number;
  replaced: number;
  xp: number;
  strongestCategory: QuestCategory | null;
  weakestCategory: QuestCategory | null;
}

export interface ProgressHistory {
  calendar: ProgressDay[];
  recentQuests: Quest[];
  weeklyRecap: WeeklyRecap;
  achievementCollection: AchievementCollectionItem[];
}

export interface QuestCompletionResult {
  quest: Quest;
  profile: HunterProfile;
  stats: UserStats;
  rewards: {
    xp: number;
    statKey: StatKey;
    statValue: number;
  };
  levelUp: {
    leveledUp: boolean;
    from: number;
    to: number;
  };
  bossProgress: BossProgressResult | null;
  unlockedAchievements: Achievement[];
}

export interface BossProgressResult {
  boss: WeeklyBoss;
  profile: HunterProfile;
  stats: UserStats;
  victory: boolean;
  progressed: boolean;
  unlockedAchievements: Achievement[];
}

export interface AuthResponse {
  token: string;
  profile: HunterProfile;
  stats: UserStats;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ApiSuccess<T> {
  data: T;
}
