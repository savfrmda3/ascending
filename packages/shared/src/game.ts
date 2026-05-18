import type { Difficulty, QuestCategory, QuestTemplate, Rank, StatKey } from "./types.js";

export const STAT_KEYS: StatKey[] = [
  "strength",
  "intelligence",
  "vitality",
  "discipline",
  "focus",
  "charisma"
];

export const STAT_LABELS: Record<StatKey, { short: string; label: string }> = {
  strength: { short: "STR", label: "Сила" },
  intelligence: { short: "INT", label: "Интеллект" },
  vitality: { short: "VIT", label: "Выносливость" },
  discipline: { short: "DSC", label: "Дисциплина" },
  focus: { short: "FOC", label: "Фокус" },
  charisma: { short: "CHA", label: "Харизма" }
};

export const XP_REWARDS: Record<Difficulty | "boss", number> = {
  easy: 15,
  medium: 35,
  hard: 75,
  boss: 300
};

export const CATEGORY_TO_STAT: Record<QuestCategory, StatKey> = {
  strength: "strength",
  intelligence: "intelligence",
  vitality: "vitality",
  discipline: "discipline",
  focus: "focus",
  charisma: "charisma"
};

export function xpToNextLevel(level: number): number {
  return Math.round(100 * Math.pow(level, 1.35));
}

export function rankForLevel(level: number): Rank {
  if (level >= 75) return "S";
  if (level >= 50) return "A";
  if (level >= 35) return "B";
  if (level >= 20) return "C";
  if (level >= 10) return "D";
  return "E";
}

export function applyXp(level: number, xp: number, reward: number) {
  let nextLevel = level;
  let nextXp = xp + reward;
  const from = level;

  while (nextXp >= xpToNextLevel(nextLevel)) {
    nextXp -= xpToNextLevel(nextLevel);
    nextLevel += 1;
  }

  return {
    level: nextLevel,
    xp: nextXp,
    rank: rankForLevel(nextLevel),
    leveledUp: nextLevel > from,
    from,
    to: nextLevel
  };
}

export function classForStats(stats: Record<StatKey, number>): string {
  const [best] = Object.entries(stats).sort((a, b) => b[1] - a[1]) as [StatKey, number][];

  switch (best?.[0]) {
    case "strength":
      return "Железный авангард";
    case "intelligence":
      return "Искатель разума";
    case "vitality":
      return "Страж жизненной силы";
    case "discipline":
      return "Хранитель обета";
    case "focus":
      return "Охотник фокуса";
    case "charisma":
      return "Адепт голоса";
    default:
      return "Начинающий охотник";
  }
}

export const DEFAULT_QUEST_TEMPLATES: QuestTemplate[] = [
  {
    title: "20 отжиманий",
    description: "Выполни 20 техничных отжиманий.",
    category: "strength",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "strength",
    statRewardValue: 1
  },
  {
    title: "30 приседаний",
    description: "Выполни 30 приседаний с собственным весом.",
    category: "strength",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "strength",
    statRewardValue: 1
  },
  {
    title: "15 минут растяжки",
    description: "Потрать 15 минут на мобильность или растяжку.",
    category: "strength",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "strength",
    statRewardValue: 1
  },
  {
    title: "30 минут тренировки",
    description: "Тренируйся 30 минут в ровном темпе.",
    category: "strength",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "strength",
    statRewardValue: 1
  },
  {
    title: "Прочитать 10 страниц",
    description: "Прочитай 10 страниц полезной книги.",
    category: "intelligence",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "intelligence",
    statRewardValue: 1
  },
  {
    title: "30 минут английского",
    description: "Позанимайся английским 30 минут без отвлечений.",
    category: "intelligence",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "intelligence",
    statRewardValue: 1
  },
  {
    title: "Посмотреть обучающее видео",
    description: "Посмотри и кратко законспектируй одно обучающее видео.",
    category: "intelligence",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "intelligence",
    statRewardValue: 1
  },
  {
    title: "Пройти один урок",
    description: "Заверши один урок курса или модуль туториала.",
    category: "intelligence",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "intelligence",
    statRewardValue: 1
  },
  {
    title: "Выпить 2 литра воды",
    description: "Закрой дневную норму воды.",
    category: "vitality",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "vitality",
    statRewardValue: 1
  },
  {
    title: "Лечь спать вовремя",
    description: "Начни подготовку ко сну до выбранного времени.",
    category: "vitality",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "vitality",
    statRewardValue: 1
  },
  {
    title: "Пройти 7000 шагов",
    description: "Пройди сегодня минимум 7000 шагов.",
    category: "vitality",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "vitality",
    statRewardValue: 1
  },
  {
    title: "Приготовить полезный прием пищи",
    description: "Приготовь один прием пищи, который поддержит энергию.",
    category: "vitality",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "vitality",
    statRewardValue: 1
  },
  {
    title: "Убрать рабочее место",
    description: "Приведи рабочее место в порядок перед следующей сессией.",
    category: "discipline",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "discipline",
    statRewardValue: 1
  },
  {
    title: "Спланировать завтра",
    description: "Запиши три самые важные задачи на завтра.",
    category: "discipline",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "discipline",
    statRewardValue: 1
  },
  {
    title: "Закрыть одну отложенную задачу",
    description: "Заверши одну задачу, которую откладывал.",
    category: "discipline",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "discipline",
    statRewardValue: 1
  },
  {
    title: "Проснуться вовремя",
    description: "Проснись в запланированное время.",
    category: "discipline",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "discipline",
    statRewardValue: 1
  },
  {
    title: "30 минут глубокой работы",
    description: "Проведи один непрерывный блок глубокой работы.",
    category: "focus",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "focus",
    statRewardValue: 1
  },
  {
    title: "1 час без соцсетей",
    description: "Не заходи в ленты соцсетей один полный час.",
    category: "focus",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "focus",
    statRewardValue: 1
  },
  {
    title: "Две Pomodoro-сессии",
    description: "Заверши две Pomodoro-сессии фокуса.",
    category: "focus",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "focus",
    statRewardValue: 1
  },
  {
    title: "Завершить одну важную задачу",
    description: "Заверши одну значимую задачу перед переключением контекста.",
    category: "focus",
    difficulty: "hard",
    xpReward: XP_REWARDS.hard,
    statRewardKey: "focus",
    statRewardValue: 1
  },
  {
    title: "Написать полезному контакту",
    description: "Отправь одно осмысленное сообщение полезному контакту.",
    category: "charisma",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "charisma",
    statRewardValue: 1
  },
  {
    title: "10 минут практики речи",
    description: "Практикуй четкую речь 10 минут.",
    category: "charisma",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "charisma",
    statRewardValue: 1
  },
  {
    title: "Записать короткое голосовое",
    description: "Запиши короткое голосовое и один раз прослушай его.",
    category: "charisma",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "charisma",
    statRewardValue: 1
  },
  {
    title: "Сделать комплимент",
    description: "Сделай сегодня один искренний комплимент.",
    category: "charisma",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "charisma",
    statRewardValue: 1
  }
];
