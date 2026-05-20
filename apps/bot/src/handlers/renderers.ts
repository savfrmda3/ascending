import {
  STAT_LABELS,
  xpToNextLevel,
  type HunterProfile,
  type Quest,
  type UserStats,
  type WeeklyBoss
} from "@system-hunter/shared";

export function renderMainMenu(profile: HunterProfile) {
  return [
    "<b>СИСТЕМА АКТИВНА</b>",
    "",
    "Добро пожаловать, охотник.",
    "Твой профиль активирован.",
    "",
    `Уровень: <b>${profile.level}</b>`,
    `Ранг: <b>${profile.rank}</b>`,
    `XP: <b>${profile.xp}</b> / ${profile.xpToNextLevel}`,
    `Серия: <b>${profile.streak}</b> дней`,
    "",
    "Выбери действие:"
  ].join("\n");
}

export function renderProfile(profile: HunterProfile) {
  return [
    "<b>ПРОФИЛЬ ОХОТНИКА</b>",
    "",
    `Охотник: <b>@${profile.username ?? "неизвестно"}</b>`,
    `Уровень: <b>${profile.level}</b>`,
    `Ранг: <b>${profile.rank}</b>`,
    `Класс: <b>${profile.className}</b>`,
    `Титул: <b>${profile.currentTitle ?? "Нет"}</b>`,
    `XP: <b>${profile.xp}</b> / ${xpToNextLevel(profile.level)}`,
    `Серия: <b>${profile.streak}</b> дней`,
    `Выполнено квестов: <b>${profile.completedQuestsCount}</b>`,
    `Создан: <b>${new Date(profile.createdAt).toLocaleDateString("ru-RU")}</b>`
  ].join("\n");
}

export function renderStats(profile: HunterProfile, stats: UserStats) {
  const rows = Object.entries(STAT_LABELS).map(([key, meta]) => {
    const value = stats[key as keyof typeof STAT_LABELS];
    return `${meta.short} / ${meta.label}: <b>${value}</b> ${bar(Number(value), 30)}`;
  });

  return [
    "<b>RPG-СТАТЫ</b>",
    "",
    `Уровень: <b>${profile.level}</b> | Ранг: <b>${profile.rank}</b>`,
    `Класс: <b>${profile.className}</b>`,
    "",
    ...rows
  ].join("\n");
}

export function renderQuests(quests: Quest[]) {
  if (quests.length === 0) {
    return ["<b>Ежедневные квесты</b>", "", "Активных квестов нет. Запроси новый квест у системы."].join("\n");
  }

  const lines = quests.flatMap((quest, index) => [
    `${index + 1}. <b>${escapeHtml(quest.title)}</b>`,
    `${escapeHtml(quest.description)}`,
    `Награда: +${quest.xpReward} XP, +${quest.statRewardValue} ${STAT_LABELS[quest.statRewardKey].short}`,
    `Статус: <b>${statusLabel(quest.status)}</b>`,
    ""
  ]);

  return ["<b>Ежедневные квесты</b>", "", ...lines].join("\n").trim();
}

export function renderQuestDetails(quest: Quest) {
  return [
    "<b>ДЕТАЛИ КВЕСТА</b>",
    "",
    `<b>${escapeHtml(quest.title)}</b>`,
    escapeHtml(quest.description),
    "",
    `Сложность: <b>${difficultyLabel(quest.difficulty)}</b>`,
    `Категория: <b>${categoryLabel(quest.category)}</b>`,
    `Награда: <b>+${quest.xpReward} XP</b>, +${quest.statRewardValue} ${STAT_LABELS[quest.statRewardKey].short}`,
    `Статус: <b>${statusLabel(quest.status)}</b>`
  ].join("\n");
}

export function renderQuestCompleted(result: {
  rewards: { xp: number; statKey: keyof typeof STAT_LABELS; statValue: number };
  profile: HunterProfile;
  levelUp: { leveledUp: boolean; from: number; to: number };
}) {
  const levelLine = result.levelUp.leveledUp
    ? [``, `<b>УРОВЕНЬ ПОВЫШЕН</b>: ${result.levelUp.from} -> ${result.levelUp.to}`]
    : [];

  return [
    "<b>[ СИСТЕМНОЕ СООБЩЕНИЕ ]</b>",
    "",
    "Квест выполнен.",
    "",
    "Получена награда:",
    `+${result.rewards.xp} XP`,
    `+${result.rewards.statValue} ${STAT_LABELS[result.rewards.statKey].short}`,
    "",
    "Текущий XP:",
    `<b>${result.profile.xp}</b> / ${result.profile.xpToNextLevel}`,
    ...levelLine
  ].join("\n");
}

export function renderBoss(boss: WeeklyBoss | null) {
  if (!boss) {
    return ["<b>БОСС НЕДЕЛИ</b>", "", "Активный босс-квест не найден."].join("\n");
  }

  return [
    "<b>БОСС НЕДЕЛИ</b>",
    "",
    "Босс:",
    `<b>${escapeHtml(boss.name)}</b>`,
    "",
    "Цель:",
    escapeHtml(boss.objective),
    "",
    "Прогресс:",
    `<b>${boss.progress}</b> / ${boss.target}`,
    "",
    "Награда:",
    `+${boss.xpReward} XP`,
    `+${boss.statRewardValue} ${STAT_LABELS[boss.statRewardKey].short}`,
    "Титул: Охотник фокуса",
    "",
    `Статус: <b>${statusLabel(boss.status)}</b>`
  ].join("\n");
}

export function renderBossVictory(boss: WeeklyBoss, profile: HunterProfile) {
  return [
    "<b>[ БОСС ПОВЕРЖЕН ]</b>",
    "",
    `<b>${escapeHtml(boss.name)}</b> повержен.`,
    "",
    "Получена награда:",
    `+${boss.xpReward} XP`,
    `+${boss.statRewardValue} ${STAT_LABELS[boss.statRewardKey].short}`,
    "Титул: Охотник фокуса",
    "",
    `Текущий XP: <b>${profile.xp}</b> / ${profile.xpToNextLevel}`
  ].join("\n");
}

export function renderSettingsHelp() {
  return [
    "<b>НАСТРОЙКИ</b>",
    "",
    "В Mini App можно выбрать цель, сложность, количество квестов, режим физических задач и любимые категории.",
    "",
    "Открой Mini App и перейди в профиль, чтобы изменить настройки без ручных команд."
  ].join("\n");
}

export function renderHelp() {
  return [
    "<b>ПОМОЩЬ</b>",
    "",
    "System Hunter превращает реальные действия в RPG-прогресс.",
    "",
    "/menu - главное меню",
    "/profile - профиль",
    "/quests - квесты на сегодня",
    "/stats - характеристики",
    "/boss - босс недели",
    "/settings - настройки",
    "/help - помощь",
    "",
    "Можно не вводить команды: используй inline-кнопки или Mini App."
  ].join("\n");
}

function bar(value: number, max: number) {
  const filled = Math.min(10, Math.max(1, Math.round((value / max) * 10)));
  return `[${"#".repeat(filled)}${"-".repeat(10 - filled)}]`;
}

function statusLabel(status: Quest["status"] | WeeklyBoss["status"]) {
  const labels: Record<string, string> = {
    active: "Активен",
    completed: "Выполнен",
    skipped: "Пропущен"
  };
  return labels[status] ?? status;
}

function difficultyLabel(difficulty: Quest["difficulty"]) {
  const labels: Record<Quest["difficulty"], string> = {
    easy: "Легкий",
    medium: "Средний",
    hard: "Сложный"
  };
  return labels[difficulty];
}

function categoryLabel(category: Quest["category"]) {
  const labels: Record<Quest["category"], string> = {
    strength: "Сила",
    intelligence: "Интеллект",
    vitality: "Здоровье",
    discipline: "Дисциплина",
    focus: "Фокус",
    charisma: "Харизма"
  };
  return labels[category];
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
