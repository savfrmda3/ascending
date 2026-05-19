import { xpToNextLevel, type DashboardSummary } from "@system-hunter/shared";

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
      completedAt: null,
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
      completedAt: null,
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
      completedAt: now,
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
