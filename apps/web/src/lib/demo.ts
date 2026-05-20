import { xpToNextLevel, type DashboardSummary, type ProgressHistory, type Quest } from "@system-hunter/shared";

const now = new Date().toISOString();
const today = now.slice(0, 10);

export const demoDashboard: DashboardSummary = {
  profile: {
    id: "demo-user",
    telegramId: 10001,
    username: "demo_hunter",
    firstName: "Демо",
    level: 7,
    xp: 340,
    xpToNextLevel: xpToNextLevel(7),
    rank: "E",
    streak: 4,
    hp: 100,
    energy: 82,
    timezone: "Europe/Minsk",
    timezoneOffset: -180,
    className: "Охотник фокуса",
    currentTitle: "Охотник фокуса",
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
  settings: {
    id: "demo-settings",
    userId: "demo-user",
    primaryGoal: "focus",
    desiredDifficulty: "medium",
    questsPerDay: 5,
    wakeTime: "07:30",
    sleepTime: "23:30",
    allowPhysicalQuests: true,
    preferredCategories: ["focus", "discipline"],
    onboardingCompleted: true,
    createdAt: now,
    updatedAt: now
  },
  todayQuests: [
    {
      id: "quest-1",
      userId: "demo-user",
      title: "20 отжиманий",
      description: "Выполни 20 техничных отжиманий.",
      type: "daily",
      category: "strength",
      difficulty: "easy",
      xpReward: 15,
      statRewardKey: "strength",
      statRewardValue: 1,
      status: "active",
      dueDate: today,
      startedAt: null,
      cancelledAt: null,
      completedAt: null,
      deletedAt: null,
      createdAt: now
    },
    {
      id: "quest-2",
      userId: "demo-user",
      title: "30 минут глубокой работы",
      description: "Проведи один непрерывный блок глубокой работы.",
      type: "daily",
      category: "focus",
      difficulty: "medium",
      xpReward: 35,
      statRewardKey: "focus",
      statRewardValue: 1,
      status: "active",
      dueDate: today,
      startedAt: null,
      cancelledAt: null,
      completedAt: null,
      deletedAt: null,
      createdAt: now
    },
    {
      id: "quest-3",
      userId: "demo-user",
      title: "Прочитать 10 страниц",
      description: "Прочитай 10 страниц полезной книги.",
      type: "daily",
      category: "intelligence",
      difficulty: "easy",
      xpReward: 15,
      statRewardKey: "intelligence",
      statRewardValue: 1,
      status: "completed",
      dueDate: today,
      startedAt: now,
      cancelledAt: null,
      completedAt: now,
      deletedAt: null,
      createdAt: now
    }
  ],
  boss: {
    id: "demo-boss",
    userId: "demo-user",
    name: "Пожиратель фокуса",
    description: "Сущность давления, которая слабеет, когда ты защищаешь блоки глубокой работы.",
    objective: "Заверши 4 сессии глубокой работы.",
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
      title: "Первый квест",
      description: "Выполни первый ежедневный квест.",
      unlockedAt: now
    },
    {
      id: "ach-2",
      userId: "demo-user",
      key: "streak_3",
      title: "Серия 3 дня",
      description: "Выполняй квесты три дня подряд.",
      unlockedAt: now
    }
  ]
};

const demoRecentQuests: Quest[] = [
  ...demoDashboard.todayQuests,
  {
    ...demoDashboard.todayQuests[1]!,
    id: "quest-demo-old-1",
    status: "completed",
    dueDate: addDaysToDateString(today, -1),
    completedAt: addDaysToDateString(today, -1)
  },
  {
    ...demoDashboard.todayQuests[0]!,
    id: "quest-demo-old-2",
    status: "skipped",
    dueDate: addDaysToDateString(today, -2),
    completedAt: null
  }
];

export const demoProgressHistory: ProgressHistory = {
  calendar: Array.from({ length: 30 }, (_, index) => {
    const date = addDaysToDateString(today, index - 29);
    const completed = index % 5 === 0 ? 0 : Math.min(3, 1 + (index % 3));
    const skipped = index % 7 === 0 ? 1 : 0;
    return {
      date,
      total: completed + skipped + 1,
      completed,
      skipped,
      replaced: index % 11 === 0 ? 1 : 0,
      xp: completed * 25
    };
  }),
  recentQuests: demoRecentQuests,
  weeklyRecap: {
    startsAt: addDaysToDateString(today, -3),
    endsAt: addDaysToDateString(today, 3),
    completed: 9,
    skipped: 1,
    replaced: 1,
    xp: 260,
    strongestCategory: "focus",
    weakestCategory: "strength"
  },
  achievementCollection: [
    {
      key: "first_quest",
      title: "Первый квест",
      description: "Выполни первый ежедневный квест.",
      rarity: "common",
      unlocked: true,
      unlockedAt: now,
      progress: 1,
      target: 1
    },
    {
      key: "streak_3",
      title: "Серия 3 дня",
      description: "Выполняй квесты три дня подряд.",
      rarity: "common",
      unlocked: true,
      unlockedAt: now,
      progress: 3,
      target: 3
    },
    {
      key: "streak_7",
      title: "Серия 7 дней",
      description: "Выполняй квесты семь дней подряд.",
      rarity: "rare",
      unlocked: false,
      unlockedAt: null,
      progress: 4,
      target: 7
    },
    {
      key: "focus_hunter",
      title: "Охотник фокуса",
      description: "Выполни 10 квестов фокуса.",
      rarity: "epic",
      unlocked: false,
      unlockedAt: null,
      progress: 8,
      target: 10
    },
    {
      key: "streak_30",
      title: "Серия 30 дней",
      description: "Закрой месяц без потери ежедневного ритма.",
      rarity: "legendary",
      unlocked: false,
      unlockedAt: null,
      progress: 4,
      target: 30
    }
  ]
};

function addDaysToDateString(dateString: string, days: number) {
  const next = new Date(`${dateString}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
