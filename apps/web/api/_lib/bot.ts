import { STAT_LABELS, type HunterProfile, type Quest, type UserStats, type WeeklyBoss } from "@system-hunter/shared";
import { optionalEnv, requiredEnv } from "./env.js";
import { hunterService } from "./hunter.js";
import type { ApiRequest } from "./http.js";

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

interface TelegramMessage {
  message_id?: number;
  text?: string;
  chat?: {
    id?: number;
  };
  from?: TelegramUser;
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  from?: TelegramUser;
  message?: TelegramMessage;
}

export async function handleTelegramWebhook(update: any, req: ApiRequest) {
  try {
    if (update.message) {
      await handleMessage(update.message, req);
      return;
    }

    if (update.callback_query) {
      await handleCallback(update.callback_query, req);
    }
  } catch (error) {
    await notifyTelegramError(update, error);
  }
}

export async function setupTelegramWebhook(req: ApiRequest) {
  const webhookUrl = `${getPublicBaseUrl(req)}/api/telegram/webhook`;
  const miniAppUrl = getMiniAppUrl(req);
  const secretToken = optionalEnv("TELEGRAM_WEBHOOK_SECRET");
  const webhookResult = await telegram("setWebhook", {
    url: webhookUrl,
    allowed_updates: ["message", "callback_query"],
    ...(secretToken ? { secret_token: secretToken } : {})
  });

  await telegram("setMyCommands", {
    commands: [
      { command: "start", description: "Запустить Ascending" },
      { command: "menu", description: "Главное меню" },
      { command: "profile", description: "Профиль" },
      { command: "quests", description: "Квесты на сегодня" },
      { command: "stats", description: "Характеристики" },
      { command: "boss", description: "Босс недели" },
      { command: "help", description: "Помощь" }
    ]
  });

  await telegram("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Открыть System Hunter",
      web_app: { url: miniAppUrl }
    }
  });

  return { webhookUrl, miniAppUrl, telegram: webhookResult };
}

export function verifyTelegramWebhookSecret(req: ApiRequest) {
  const expected = optionalEnv("TELEGRAM_WEBHOOK_SECRET");
  if (!expected) return true;

  const actual = firstHeader(req, "x-telegram-bot-api-secret-token");
  return actual === expected;
}

async function handleMessage(message: TelegramMessage, req: ApiRequest) {
  const user = message.from;
  const chatId = message.chat?.id;
  const text = String(message.text ?? "");
  if (!user || !chatId) return;

  const bundle = await hunterService.syncTelegramUser({
    telegramId: user.id,
    username: user.username ?? null,
    firstName: user.first_name ?? null
  });

  if (text.startsWith("/quests")) {
    const quests = await hunterService.getTodayQuests(bundle.profile.id);
    await sendMessage(chatId, renderQuests(quests), questsKeyboard(quests, req));
    return;
  }

  if (text.startsWith("/profile")) {
    await sendMessage(chatId, renderProfile(bundle.profile), profileKeyboard(req));
    return;
  }

  if (text.startsWith("/stats")) {
    await sendMessage(chatId, renderStats(bundle.profile, bundle.stats), profileKeyboard(req));
    return;
  }

  if (text.startsWith("/boss")) {
    const boss = await hunterService.getCurrentBoss(bundle.profile.id);
    await sendMessage(chatId, renderBoss(boss), bossKeyboard(boss, req));
    return;
  }

  if (text.startsWith("/help")) {
    await sendMessage(chatId, renderHelp(), helpKeyboard(req));
    return;
  }

  await sendMessage(chatId, renderMainMenu(bundle.profile), mainMenuKeyboard(req));
}

async function handleCallback(callback: TelegramCallbackQuery, req: ApiRequest) {
  const user = callback.from;
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;
  const data = String(callback.data ?? "");
  if (!user || !chatId || !messageId) return;

  const bundle = await hunterService.syncTelegramUser({
    telegramId: user.id,
    username: user.username ?? null,
    firstName: user.first_name ?? null
  });

  if (data === "back_to_menu" || data === "refresh_profile") {
    await editMessage(chatId, messageId, renderMainMenu(bundle.profile), mainMenuKeyboard(req));
    await answerCallback(callback.id);
    return;
  }

  if (data === "show_profile") {
    await editMessage(chatId, messageId, renderProfile(bundle.profile), profileKeyboard(req));
    await answerCallback(callback.id);
    return;
  }

  if (data === "show_stats") {
    await editMessage(chatId, messageId, renderStats(bundle.profile, bundle.stats), profileKeyboard(req));
    await answerCallback(callback.id);
    return;
  }

  if (data === "show_today_quests") {
    const quests = await hunterService.getTodayQuests(bundle.profile.id);
    await editMessage(chatId, messageId, renderQuests(quests), questsKeyboard(quests, req));
    await answerCallback(callback.id);
    return;
  }

  if (data === "generate_quest") {
    await hunterService.generateQuest(bundle.profile.id);
    const quests = await hunterService.getTodayQuests(bundle.profile.id);
    await editMessage(chatId, messageId, renderQuests(quests), questsKeyboard(quests, req));
    await answerCallback(callback.id, "Новый квест добавлен.");
    return;
  }

  if (data === "show_boss") {
    const boss = await hunterService.getCurrentBoss(bundle.profile.id);
    await editMessage(chatId, messageId, renderBoss(boss), bossKeyboard(boss, req));
    await answerCallback(callback.id);
    return;
  }

  if (data === "show_help") {
    await editMessage(chatId, messageId, renderHelp(), helpKeyboard(req));
    await answerCallback(callback.id);
    return;
  }

  if (data.startsWith("quest_details:")) {
    const quests = await hunterService.getTodayQuests(bundle.profile.id);
    const quest = quests.find((item) => item.id === data.split(":")[1]);
    await editMessage(chatId, messageId, renderQuestDetails(quest), questDetailsKeyboard(quest, req));
    await answerCallback(callback.id);
    return;
  }

  if (data.startsWith("complete_quest:")) {
    const result = await hunterService.completeQuest(bundle.profile.id, data.split(":")[1] ?? "");
    await editMessage(chatId, messageId, renderQuestCompleted(result), questCompletedKeyboard(req));
    await answerCallback(callback.id, "Квест выполнен.");
    return;
  }

  if (data.startsWith("skip_quest:")) {
    await hunterService.skipQuest(bundle.profile.id, data.split(":")[1] ?? "");
    const quests = await hunterService.getTodayQuests(bundle.profile.id);
    await editMessage(chatId, messageId, renderQuests(quests), questsKeyboard(quests, req));
    await answerCallback(callback.id, "Квест пропущен.");
    return;
  }

  if (data.startsWith("boss_details:")) {
    const boss = await hunterService.getCurrentBoss(bundle.profile.id);
    await editMessage(chatId, messageId, renderBossDetails(boss), bossKeyboard(boss, req));
    await answerCallback(callback.id);
    return;
  }

  if (data.startsWith("boss_progress:")) {
    const result = await hunterService.progressBoss(bundle.profile.id, data.split(":")[1] ?? "");
    await editMessage(
      chatId,
      messageId,
      result.victory ? renderBossVictory(result.boss, result.profile) : renderBoss(result.boss),
      bossKeyboard(result.boss, req)
    );
    await answerCallback(callback.id, result.victory ? "Босс побежден." : "Прогресс босса обновлен.");
    return;
  }

  await answerCallback(callback.id);
}

function mainMenuKeyboard(req: ApiRequest) {
  return {
    inline_keyboard: [
      [{ text: "Открыть Mini App", web_app: { url: getMiniAppUrl(req) } }],
      [{ text: "Квесты на сегодня", callback_data: "show_today_quests" }],
      [
        { text: "Профиль", callback_data: "show_profile" },
        { text: "Статы", callback_data: "show_stats" }
      ],
      [{ text: "Босс недели", callback_data: "show_boss" }],
      [{ text: "Получить новый квест", callback_data: "generate_quest" }],
      [{ text: "Помощь", callback_data: "show_help" }]
    ]
  };
}

function profileKeyboard(req: ApiRequest) {
  return {
    inline_keyboard: [
      [{ text: "Обновить профиль", callback_data: "refresh_profile" }],
      [{ text: "Открыть Mini App", web_app: { url: getMiniAppUrl(req) } }],
      [{ text: "Назад в меню", callback_data: "back_to_menu" }]
    ]
  };
}

function questsKeyboard(quests: Quest[], req: ApiRequest) {
  const activeRows = quests
    .filter((quest) => quest.status === "active")
    .flatMap((quest) => [
      [{ text: `Выполнить: ${shorten(quest.title)}`, callback_data: `complete_quest:${quest.id}` }],
      [{ text: `Детали: ${shorten(quest.title)}`, callback_data: `quest_details:${quest.id}` }]
    ]);

  return {
    inline_keyboard: [
      ...activeRows,
      [{ text: "Открыть Mini App", web_app: { url: getMiniAppUrl(req) } }],
      [{ text: "Назад в меню", callback_data: "back_to_menu" }]
    ]
  };
}

function questDetailsKeyboard(quest: Quest | undefined, req: ApiRequest) {
  const rows = quest?.status === "active" ? [[{ text: "Выполнить", callback_data: `complete_quest:${quest.id}` }]] : [];
  return {
    inline_keyboard: [
      ...rows,
      [{ text: "Квесты", callback_data: "show_today_quests" }],
      [{ text: "Открыть Mini App", web_app: { url: getMiniAppUrl(req) } }],
      [{ text: "Назад в меню", callback_data: "back_to_menu" }]
    ]
  };
}

function questCompletedKeyboard(req: ApiRequest) {
  return {
    inline_keyboard: [
      [{ text: "Квесты", callback_data: "show_today_quests" }],
      [
        { text: "Профиль", callback_data: "show_profile" },
        { text: "Открыть Mini App", web_app: { url: getMiniAppUrl(req) } }
      ],
      [{ text: "Назад в меню", callback_data: "back_to_menu" }]
    ]
  };
}

function bossKeyboard(boss: WeeklyBoss | null, req: ApiRequest) {
  const bossRows =
    boss?.status === "active"
      ? [
          [{ text: "К focus-квестам", callback_data: "show_today_quests" }],
          [{ text: "Детали босса", callback_data: `boss_details:${boss.id}` }]
        ]
      : [];

  return {
    inline_keyboard: [
      ...bossRows,
      [{ text: "Открыть Mini App", web_app: { url: getMiniAppUrl(req) } }],
      [{ text: "Назад в меню", callback_data: "back_to_menu" }]
    ]
  };
}

function helpKeyboard(req: ApiRequest) {
  return {
    inline_keyboard: [
      [{ text: "Открыть Mini App", web_app: { url: getMiniAppUrl(req) } }],
      [{ text: "Назад в меню", callback_data: "back_to_menu" }]
    ]
  };
}

function renderMainMenu(profile: HunterProfile) {
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

function renderProfile(profile: HunterProfile) {
  return [
    "<b>ПРОФИЛЬ ОХОТНИКА</b>",
    "",
    `Охотник: <b>@${escapeHtml(profile.username ?? "неизвестно")}</b>`,
    `Уровень: <b>${profile.level}</b>`,
    `Ранг: <b>${profile.rank}</b>`,
    `Класс: <b>${escapeHtml(profile.className)}</b>`,
    `Титул: <b>${escapeHtml(profile.currentTitle ?? "Нет")}</b>`,
    `XP: <b>${profile.xp}</b> / ${profile.xpToNextLevel}`,
    `Серия: <b>${profile.streak}</b> дней`,
    `Выполнено квестов: <b>${profile.completedQuestsCount}</b>`
  ].join("\n");
}

function renderStats(profile: HunterProfile, stats: UserStats) {
  const rows = Object.entries(STAT_LABELS).map(([key, meta]) => `${meta.short}: <b>${stats[key as keyof UserStats]}</b>`);
  return [`<b>RPG-СТАТЫ</b>`, "", `Уровень: <b>${profile.level}</b> | Ранг: <b>${profile.rank}</b>`, "", ...rows].join("\n");
}

function renderQuests(quests: Quest[]) {
  if (quests.length === 0) return "<b>Ежедневные квесты</b>\n\nАктивных квестов нет.";

  return [
    "<b>Ежедневные квесты</b>",
    "",
    ...quests.flatMap((quest, index) => [
      `${index + 1}. <b>${escapeHtml(quest.title)}</b>`,
      `Награда: +${quest.xpReward} XP, +${quest.statRewardValue} ${STAT_LABELS[quest.statRewardKey].short}`,
      `Статус: <b>${statusLabel(quest.status)}</b>`,
      ""
    ])
  ].join("\n");
}

function renderQuestDetails(quest: Quest | undefined) {
  if (!quest) return "<b>Детали квеста</b>\n\nКвест не найден.";

  return [
    "<b>Детали квеста</b>",
    "",
    `<b>${escapeHtml(quest.title)}</b>`,
    escapeHtml(quest.description),
    "",
    `Сложность: <b>${difficultyLabel(quest.difficulty)}</b>`,
    `Категория: <b>${categoryLabel(quest.category)}</b>`,
    `Награда: +${quest.xpReward} XP, +${quest.statRewardValue} ${STAT_LABELS[quest.statRewardKey].short}`,
    `Статус: <b>${statusLabel(quest.status)}</b>`
  ].join("\n");
}

function renderQuestCompleted(result: any) {
  return [
    "<b>[ СИСТЕМНОЕ СООБЩЕНИЕ ]</b>",
    "",
    "Квест выполнен.",
    "",
    "Получена награда:",
    `+${result.rewards.xp} XP`,
    `+${result.rewards.statValue} ${STAT_LABELS[result.rewards.statKey as keyof typeof STAT_LABELS].short}`,
    "",
    `Текущий XP: <b>${result.profile.xp}</b> / ${result.profile.xpToNextLevel}`,
    result.levelUp.leveledUp ? `\n<b>УРОВЕНЬ ПОВЫШЕН</b>: ${result.levelUp.from} -> ${result.levelUp.to}` : ""
  ].join("\n");
}

function renderBoss(boss: WeeklyBoss | null) {
  if (!boss) return "<b>БОСС НЕДЕЛИ</b>\n\nАктивный босс-квест не найден.";

  return [
    "<b>БОСС НЕДЕЛИ</b>",
    "",
    `Босс: <b>${escapeHtml(boss.name)}</b>`,
    "",
    `Цель: ${escapeHtml(boss.objective)}`,
    `Прогресс: <b>${boss.progress}</b> / ${boss.target}`,
    "Засчитываются только выполненные focus-квесты этой недели.",
    "",
    `Награда: +${boss.xpReward} XP, +${boss.statRewardValue} ${STAT_LABELS[boss.statRewardKey].short}`,
    "Титул: Охотник фокуса",
    `Статус: <b>${statusLabel(boss.status)}</b>`
  ].join("\n");
}

function renderBossDetails(boss: WeeklyBoss | null) {
  if (!boss) return "<b>Детали босса</b>\n\nАктивный босс-квест не найден.";

  return [
    "<b>Детали босса</b>",
    "",
    `<b>${escapeHtml(boss.name)}</b>`,
    escapeHtml(boss.description),
    "",
    `Цель: ${escapeHtml(boss.objective)}`,
    `Прогресс: <b>${boss.progress}</b> / ${boss.target}`,
    `Награда: +${boss.xpReward} XP, +${boss.statRewardValue} ${STAT_LABELS[boss.statRewardKey].short}`
  ].join("\n");
}

function renderBossVictory(boss: WeeklyBoss, profile: HunterProfile) {
  return [
    "<b>[ БОСС ПОВЕРЖЕН ]</b>",
    "",
    `<b>${escapeHtml(boss.name)}</b> повержен.`,
    "",
    `Получена награда: +${boss.xpReward} XP`,
    "Титул: Охотник фокуса",
    "",
    `Текущий XP: <b>${profile.xp}</b> / ${profile.xpToNextLevel}`
  ].join("\n");
}

function renderHelp() {
  return [
    "<b>ПОМОЩЬ</b>",
    "",
    "/menu - главное меню",
    "/profile - профиль",
    "/quests - квесты на сегодня",
    "/stats - характеристики",
    "/boss - босс недели",
    "/help - помощь"
  ].join("\n");
}

async function sendMessage(chatId: number, text: string, replyMarkup?: unknown) {
  await telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup
  });
}

async function editMessage(chatId: number, messageId: number, text: string, replyMarkup?: unknown) {
  try {
    await telegram("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("message is not modified")) return;
    throw error;
  }
}

async function answerCallback(callbackQueryId: string, text?: string) {
  await telegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {})
  });
}

async function notifyTelegramError(update: any, error: unknown) {
  const message = error instanceof Error ? error.message : "Неожиданная ошибка Telegram-бота";
  const callback = update.callback_query as TelegramCallbackQuery | undefined;
  const chatId = callback?.message?.chat?.id ?? update.message?.chat?.id;

  if (callback?.id) {
    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: message.slice(0, 180),
      show_alert: true
    });
    return;
  }

  if (chatId) {
    await sendMessage(chatId, `<b>[ СИСТЕМНАЯ ОШИБКА ]</b>\n\n${escapeHtml(message)}`, helpKeyboard({ headers: {} }));
  }
}

async function telegram(method: string, body: unknown) {
  const response = await fetch(`https://api.telegram.org/bot${requiredEnv("BOT_TOKEN")}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? `Telegram ${method}: запрос не выполнен`);
  }
  return payload;
}

function getMiniAppUrl(req: ApiRequest) {
  return optionalEnv("MINI_APP_URL") || getPublicBaseUrl(req);
}

function getPublicBaseUrl(req: ApiRequest) {
  const proto = firstHeader(req, "x-forwarded-proto") || "https";
  const host = firstHeader(req, "x-forwarded-host") || firstHeader(req, "host");
  return `${proto}://${host}`;
}

function firstHeader(req: ApiRequest, key: string) {
  const value = req.headers[key] ?? req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
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

function shorten(value: string) {
  return value.length > 28 ? `${value.slice(0, 25)}...` : value;
}
