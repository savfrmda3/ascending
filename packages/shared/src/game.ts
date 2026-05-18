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
  strength: { short: "STR", label: "Strength" },
  intelligence: { short: "INT", label: "Intelligence" },
  vitality: { short: "VIT", label: "Vitality" },
  discipline: { short: "DSC", label: "Discipline" },
  focus: { short: "FOC", label: "Focus" },
  charisma: { short: "CHA", label: "Charisma" }
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
      return "Iron Vanguard";
    case "intelligence":
      return "Mind Seeker";
    case "vitality":
      return "Vital Warden";
    case "discipline":
      return "Oath Keeper";
    case "focus":
      return "Focus Hunter";
    case "charisma":
      return "Voice Adept";
    default:
      return "Novice Hunter";
  }
}

export const DEFAULT_QUEST_TEMPLATES: QuestTemplate[] = [
  {
    title: "20 push-ups",
    description: "Complete 20 controlled push-ups.",
    category: "strength",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "strength",
    statRewardValue: 1
  },
  {
    title: "30 squats",
    description: "Complete 30 bodyweight squats.",
    category: "strength",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "strength",
    statRewardValue: 1
  },
  {
    title: "15 minutes stretching",
    description: "Spend 15 minutes on mobility or stretching.",
    category: "strength",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "strength",
    statRewardValue: 1
  },
  {
    title: "30 minutes workout",
    description: "Train for 30 minutes with steady effort.",
    category: "strength",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "strength",
    statRewardValue: 1
  },
  {
    title: "Read 10 pages",
    description: "Read 10 pages from a useful book.",
    category: "intelligence",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "intelligence",
    statRewardValue: 1
  },
  {
    title: "Study English for 30 minutes",
    description: "Complete focused English study for 30 minutes.",
    category: "intelligence",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "intelligence",
    statRewardValue: 1
  },
  {
    title: "Watch educational video",
    description: "Watch and summarize one educational video.",
    category: "intelligence",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "intelligence",
    statRewardValue: 1
  },
  {
    title: "Complete one lesson",
    description: "Finish one course lesson or tutorial module.",
    category: "intelligence",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "intelligence",
    statRewardValue: 1
  },
  {
    title: "Drink 2 liters of water",
    description: "Reach your daily water target.",
    category: "vitality",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "vitality",
    statRewardValue: 1
  },
  {
    title: "Sleep before target time",
    description: "Start your sleep routine before your target time.",
    category: "vitality",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "vitality",
    statRewardValue: 1
  },
  {
    title: "Walk 7000 steps",
    description: "Walk at least 7000 steps today.",
    category: "vitality",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "vitality",
    statRewardValue: 1
  },
  {
    title: "Prepare healthy meal",
    description: "Prepare one meal that supports your energy.",
    category: "vitality",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "vitality",
    statRewardValue: 1
  },
  {
    title: "Clean workspace",
    description: "Reset your workspace before the next session.",
    category: "discipline",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "discipline",
    statRewardValue: 1
  },
  {
    title: "Plan tomorrow",
    description: "Write the three most important tasks for tomorrow.",
    category: "discipline",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "discipline",
    statRewardValue: 1
  },
  {
    title: "Complete one delayed task",
    description: "Finish one task you have postponed.",
    category: "discipline",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "discipline",
    statRewardValue: 1
  },
  {
    title: "Wake up on time",
    description: "Wake up at your planned time.",
    category: "discipline",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "discipline",
    statRewardValue: 1
  },
  {
    title: "30 minutes deep work",
    description: "Complete one uninterrupted deep work block.",
    category: "focus",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "focus",
    statRewardValue: 1
  },
  {
    title: "No social media for 1 hour",
    description: "Stay away from social feeds for one full hour.",
    category: "focus",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "focus",
    statRewardValue: 1
  },
  {
    title: "Pomodoro session x2",
    description: "Complete two Pomodoro focus sessions.",
    category: "focus",
    difficulty: "medium",
    xpReward: XP_REWARDS.medium,
    statRewardKey: "focus",
    statRewardValue: 1
  },
  {
    title: "Finish one important task",
    description: "Finish one meaningful task before switching context.",
    category: "focus",
    difficulty: "hard",
    xpReward: XP_REWARDS.hard,
    statRewardKey: "focus",
    statRewardValue: 1
  },
  {
    title: "Message one useful contact",
    description: "Send one thoughtful message to a useful contact.",
    category: "charisma",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "charisma",
    statRewardValue: 1
  },
  {
    title: "Practice speaking for 10 minutes",
    description: "Practice speaking clearly for 10 minutes.",
    category: "charisma",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "charisma",
    statRewardValue: 1
  },
  {
    title: "Record a short voice note",
    description: "Record a short voice note and listen back once.",
    category: "charisma",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "charisma",
    statRewardValue: 1
  },
  {
    title: "Give someone a compliment",
    description: "Give one sincere compliment today.",
    category: "charisma",
    difficulty: "easy",
    xpReward: XP_REWARDS.easy,
    statRewardKey: "charisma",
    statRewardValue: 1
  }
];
