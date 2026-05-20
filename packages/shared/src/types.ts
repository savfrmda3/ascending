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
export type QuestStatus = "active" | "in_progress" | "completed" | "skipped";
export type QuestType = "daily" | "generated" | "custom";
export type QuestSource = "system" | "generated" | "custom";
export type BossStatus = "active" | "completed" | "expired";
export type HunterGoal = "sport" | "discipline" | "study" | "focus" | "health" | "charisma";
export type AchievementRarity = "common" | "rare" | "epic" | "legendary";
export type RecurrenceType = "once" | "daily" | "weekly" | "weekdays";
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type QuestTag =
  | "morning"
  | "sleep"
  | "nutrition"
  | "work_study"
  | "social"
  | "digital_hygiene"
  | "recovery"
  | "movement"
  | "planning";
export type InventoryItemType = "title" | "frame" | "booster" | "shield";
export type SkillTier = 1 | 2 | 3;

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
  type: QuestType;
  source?: QuestSource | null;
  customTemplateId?: string | null;
  category: QuestCategory;
  difficulty: Difficulty;
  xpReward: number;
  statRewardKey: StatKey;
  statRewardValue: number;
  estimatedMinutes?: number | null;
  tags?: QuestTag[];
  reason?: string | null;
  status: QuestStatus;
  dueDate: string;
  startedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface CustomQuestTemplate {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: QuestCategory;
  difficulty: Difficulty;
  xpReward: number;
  statRewardKey: StatKey;
  statRewardValue: number;
  recurrenceType: RecurrenceType;
  weekdays: Weekday[];
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomQuestInput {
  title: string;
  description?: string;
  category: QuestCategory;
  difficulty: Difficulty;
  recurrenceType: RecurrenceType;
  weekdays?: Weekday[];
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
}

export type HabitDayStatus = "completed" | "skipped" | "missed" | "active" | "scheduled";
export type HabitHealthStatus = "stable" | "at_risk" | "broken" | "paused";

export interface HabitProgressDay {
  date: string;
  due: boolean;
  status: HabitDayStatus;
  questId: string | null;
  xp: number;
}

export interface CustomQuestProgress {
  template: CustomQuestTemplate;
  currentStreak: number;
  bestStreak: number;
  scheduledCount: number;
  completedCount: number;
  skippedCount: number;
  missedCount: number;
  completionRate: number;
  healthStatus: HabitHealthStatus;
  lastCompletedAt: string | null;
  nextDueDate: string | null;
  todayQuest: Quest | null;
  calendar: HabitProgressDay[];
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
  estimatedMinutes?: number;
  tags?: QuestTag[];
  reason?: string | null;
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

export interface SkillNode {
  key: string;
  title: string;
  description: string;
  statKey: StatKey;
  tier: SkillTier;
  cost: number;
  bonusText: string;
}

export interface SkillNodeProgress extends SkillNode {
  unlocked: boolean;
  unlockedAt: string | null;
  canUnlock: boolean;
}

export interface SkillTreeSummary {
  totalPoints: number;
  spentPoints: number;
  availablePoints: number;
  nodes: SkillNodeProgress[];
}

export interface InventoryCatalogItem {
  key: string;
  title: string;
  description: string;
  type: InventoryItemType;
  rarity: AchievementRarity;
  effectKey: string | null;
  effectValue: number;
}

export interface UserInventoryItem {
  item: InventoryCatalogItem;
  quantity: number;
  acquiredAt: string | null;
}

export interface InventorySummary {
  items: UserInventoryItem[];
  catalog: InventoryCatalogItem[];
}

export interface SeasonSummary {
  key: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  bossName: string;
  rewardTitle: string;
  questsCompleted: number;
  bossesDefeated: number;
  xp: number;
  rewardClaimed: boolean;
}

export interface SquadSummary {
  id: string;
  name: string;
  code: string;
  role: "owner" | "member";
  memberCount: number;
  createdAt: string;
}

export interface AdminOverview {
  usersCount: number;
  activeQuestsToday: number;
  completedQuestsToday: number;
  templatesCount: number;
  activeBossesCount: number;
}

export interface SystemsOverview {
  skills: SkillTreeSummary;
  inventory: InventorySummary;
  season: SeasonSummary | null;
  squad: SquadSummary | null;
  admin: AdminOverview | null;
}

export interface SkillUnlockResult {
  skills: SkillTreeSummary;
  profile: HunterProfile;
  stats: UserStats;
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
