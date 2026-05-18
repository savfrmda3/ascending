import { xpToNextLevel, type DashboardSummary } from "@system-hunter/shared";

const now = new Date().toISOString();
const today = now.slice(0, 10);

export const demoDashboard: DashboardSummary = {
  profile: {
    id: "demo-user",
    telegramId: 10001,
    username: "demo_hunter",
    firstName: "Demo",
    level: 7,
    xp: 340,
    xpToNextLevel: xpToNextLevel(7),
    rank: "E",
    streak: 4,
    hp: 100,
    energy: 82,
    className: "Focus Hunter",
    currentTitle: "Focus Hunter",
    totalXp: 1240,
    completedQuestsCount: 38,
    createdAt: now,
    updatedAt: now
  },
  stats: {
    id: "demo-stats",
    userId: "demo-user",
    strength: 12,
    intelligence: 17,
    vitality: 10,
    discipline: 19,
    focus: 24,
    charisma: 8,
    createdAt: now,
    updatedAt: now
  },
  todayQuests: [
    {
      id: "quest-1",
      userId: "demo-user",
      title: "20 push-ups",
      description: "Complete 20 controlled push-ups.",
      type: "daily",
      category: "strength",
      difficulty: "easy",
      xpReward: 15,
      statRewardKey: "strength",
      statRewardValue: 1,
      status: "active",
      dueDate: today,
      completedAt: null,
      createdAt: now
    },
    {
      id: "quest-2",
      userId: "demo-user",
      title: "30 minutes deep work",
      description: "Complete one uninterrupted deep work block.",
      type: "daily",
      category: "focus",
      difficulty: "medium",
      xpReward: 35,
      statRewardKey: "focus",
      statRewardValue: 1,
      status: "active",
      dueDate: today,
      completedAt: null,
      createdAt: now
    },
    {
      id: "quest-3",
      userId: "demo-user",
      title: "Read 10 pages",
      description: "Read 10 pages from a useful book.",
      type: "daily",
      category: "intelligence",
      difficulty: "easy",
      xpReward: 15,
      statRewardKey: "intelligence",
      statRewardValue: 1,
      status: "completed",
      dueDate: today,
      completedAt: now,
      createdAt: now
    }
  ],
  boss: {
    id: "demo-boss",
    userId: "demo-user",
    name: "Devourer of Focus",
    description: "A pressure-born entity that weakens when you protect deep work blocks.",
    objective: "Complete 4 deep work sessions.",
    progress: 2,
    target: 4,
    xpReward: 300,
    statRewardKey: "focus",
    statRewardValue: 3,
    status: "active",
    startsAt: today,
    endsAt: today,
    completedAt: null,
    createdAt: now
  },
  achievements: [
    {
      id: "ach-1",
      userId: "demo-user",
      key: "first_quest",
      title: "First Quest",
      description: "Complete your first daily quest.",
      unlockedAt: now
    },
    {
      id: "ach-2",
      userId: "demo-user",
      key: "streak_3",
      title: "3 Day Streak",
      description: "Complete quests three days in a row.",
      unlockedAt: now
    }
  ]
};
