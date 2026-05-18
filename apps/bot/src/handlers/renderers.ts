import { STAT_LABELS, xpToNextLevel, type HunterProfile, type Quest, type UserStats, type WeeklyBoss } from "@system-hunter/shared";

export function renderMainMenu(profile: HunterProfile) {
  return [
    "<b>SYSTEM ONLINE</b>",
    "",
    "Добро пожаловать, Hunter.",
    "Твой профиль активирован.",
    "",
    `Level: <b>${profile.level}</b>`,
    `Rank: <b>${profile.rank}</b>`,
    `XP: <b>${profile.xp}</b> / ${profile.xpToNextLevel}`,
    `Streak: <b>${profile.streak}</b> дней`,
    "",
    "Выбери действие:"
  ].join("\n");
}

export function renderProfile(profile: HunterProfile) {
  return [
    "<b>HUNTER PROFILE</b>",
    "",
    `Hunter: <b>@${profile.username ?? "unknown"}</b>`,
    `Level: <b>${profile.level}</b>`,
    `Rank: <b>${profile.rank}</b>`,
    `Class: <b>${profile.className}</b>`,
    `Title: <b>${profile.currentTitle ?? "None"}</b>`,
    `XP: <b>${profile.xp}</b> / ${xpToNextLevel(profile.level)}`,
    `Streak: <b>${profile.streak}</b> дней`,
    `Completed quests: <b>${profile.completedQuestsCount}</b>`,
    `Created: <b>${new Date(profile.createdAt).toLocaleDateString("ru-RU")}</b>`
  ].join("\n");
}

export function renderStats(profile: HunterProfile, stats: UserStats) {
  const rows = Object.entries(STAT_LABELS).map(([key, meta]) => {
    const value = stats[key as keyof typeof STAT_LABELS];
    return `${meta.short} / ${meta.label}: <b>${value}</b> ${bar(Number(value), 30)}`;
  });

  return [
    "<b>RPG STATS</b>",
    "",
    `Level: <b>${profile.level}</b> | Rank: <b>${profile.rank}</b>`,
    `Class: <b>${profile.className}</b>`,
    "",
    ...rows
  ].join("\n");
}

export function renderQuests(quests: Quest[]) {
  if (quests.length === 0) {
    return ["<b>Daily Quests</b>", "", "Активных квестов нет. Запроси новый квест у системы."].join("\n");
  }

  const lines = quests.flatMap((quest, index) => [
    `${index + 1}. <b>${escapeHtml(quest.title)}</b>`,
    `${escapeHtml(quest.description)}`,
    `Reward: +${quest.xpReward} XP, +${quest.statRewardValue} ${STAT_LABELS[quest.statRewardKey].short}`,
    `Status: <b>${capitalize(quest.status)}</b>`,
    ""
  ]);

  return ["<b>Daily Quests</b>", "", ...lines].join("\n").trim();
}

export function renderQuestDetails(quest: Quest) {
  return [
    "<b>QUEST DETAILS</b>",
    "",
    `<b>${escapeHtml(quest.title)}</b>`,
    escapeHtml(quest.description),
    "",
    `Difficulty: <b>${capitalize(quest.difficulty)}</b>`,
    `Category: <b>${capitalize(quest.category)}</b>`,
    `Reward: <b>+${quest.xpReward} XP</b>, +${quest.statRewardValue} ${STAT_LABELS[quest.statRewardKey].short}`,
    `Status: <b>${capitalize(quest.status)}</b>`
  ].join("\n");
}

export function renderQuestCompleted(result: {
  rewards: { xp: number; statKey: keyof typeof STAT_LABELS; statValue: number };
  profile: HunterProfile;
  levelUp: { leveledUp: boolean; from: number; to: number };
}) {
  const levelLine = result.levelUp.leveledUp
    ? [``, `<b>LEVEL UP</b>: ${result.levelUp.from} -> ${result.levelUp.to}`]
    : [];

  return [
    "<b>[ SYSTEM MESSAGE ]</b>",
    "",
    "Quest completed.",
    "",
    "Reward acquired:",
    `+${result.rewards.xp} XP`,
    `+${result.rewards.statValue} ${STAT_LABELS[result.rewards.statKey].short}`,
    "",
    "Current XP:",
    `<b>${result.profile.xp}</b> / ${result.profile.xpToNextLevel}`,
    ...levelLine
  ].join("\n");
}

export function renderBoss(boss: WeeklyBoss | null) {
  if (!boss) {
    return ["<b>WEEKLY BOSS</b>", "", "Активный boss quest не найден."].join("\n");
  }

  return [
    "<b>WEEKLY BOSS</b>",
    "",
    "Boss:",
    `<b>${escapeHtml(boss.name)}</b>`,
    "",
    "Objective:",
    escapeHtml(boss.objective),
    "",
    "Progress:",
    `<b>${boss.progress}</b> / ${boss.target}`,
    "",
    "Reward:",
    `+${boss.xpReward} XP`,
    `+${boss.statRewardValue} ${STAT_LABELS[boss.statRewardKey].short}`,
    "Title: Focus Hunter",
    "",
    `Status: <b>${capitalize(boss.status)}</b>`
  ].join("\n");
}

export function renderBossVictory(boss: WeeklyBoss, profile: HunterProfile) {
  return [
    "<b>[ BOSS DEFEATED ]</b>",
    "",
    `<b>${escapeHtml(boss.name)}</b> has fallen.`,
    "",
    "Reward acquired:",
    `+${boss.xpReward} XP`,
    `+${boss.statRewardValue} ${STAT_LABELS[boss.statRewardKey].short}`,
    "Title: Focus Hunter",
    "",
    `Current XP: <b>${profile.xp}</b> / ${profile.xpToNextLevel}`
  ].join("\n");
}

export function renderHelp() {
  return [
    "<b>HELP</b>",
    "",
    "System Hunter превращает реальные действия в RPG-прогресс.",
    "",
    "/menu - главное меню",
    "/profile - профиль",
    "/quests - квесты на сегодня",
    "/stats - характеристики",
    "/boss - weekly boss",
    "/help - помощь",
    "",
    "Можно не вводить команды: используй inline-кнопки или Mini App."
  ].join("\n");
}

function bar(value: number, max: number) {
  const filled = Math.min(10, Math.max(1, Math.round((value / max) * 10)));
  return `[${"#".repeat(filled)}${"-".repeat(10 - filled)}]`;
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
