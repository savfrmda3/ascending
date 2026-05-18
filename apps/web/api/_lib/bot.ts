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
      text: "Open System",
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
    await answerCallback(callback.id, "Quest completed.");
    return;
  }

  if (data.startsWith("skip_quest:")) {
    await hunterService.skipQuest(bundle.profile.id, data.split(":")[1] ?? "");
    const quests = await hunterService.getTodayQuests(bundle.profile.id);
    await editMessage(chatId, messageId, renderQuests(quests), questsKeyboard(quests, req));
    await answerCallback(callback.id, "Quest skipped.");
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
    await answerCallback(callback.id, result.victory ? "Boss defeated." : "Boss progress updated.");
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
          [{ text: "Complete Step", callback_data: `boss_progress:${boss.id}` }],
          [{ text: "Boss Details", callback_data: `boss_details:${boss.id}` }]
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

function renderProfile(profile: HunterProfile) {
  return [
    "<b>HUNTER PROFILE</b>",
    "",
    `Hunter: <b>@${escapeHtml(profile.username ?? "unknown")}</b>`,
    `Level: <b>${profile.level}</b>`,
    `Rank: <b>${profile.rank}</b>`,
    `Class: <b>${escapeHtml(profile.className)}</b>`,
    `Title: <b>${escapeHtml(profile.currentTitle ?? "None")}</b>`,
    `XP: <b>${profile.xp}</b> / ${profile.xpToNextLevel}`,
    `Streak: <b>${profile.streak}</b> дней`,
    `Completed quests: <b>${profile.completedQuestsCount}</b>`
  ].join("\n");
}

function renderStats(profile: HunterProfile, stats: UserStats) {
  const rows = Object.entries(STAT_LABELS).map(([key, meta]) => `${meta.short}: <b>${stats[key as keyof UserStats]}</b>`);
  return [`<b>RPG STATS</b>`, "", `Level: <b>${profile.level}</b> | Rank: <b>${profile.rank}</b>`, "", ...rows].join("\n");
}

function renderQuests(quests: Quest[]) {
  if (quests.length === 0) return "<b>Daily Quests</b>\n\nАктивных квестов нет.";

  return [
    "<b>Daily Quests</b>",
    "",
    ...quests.flatMap((quest, index) => [
      `${index + 1}. <b>${escapeHtml(quest.title)}</b>`,
      `Reward: +${quest.xpReward} XP, +${quest.statRewardValue} ${STAT_LABELS[quest.statRewardKey].short}`,
      `Status: <b>${quest.status}</b>`,
      ""
    ])
  ].join("\n");
}

function renderQuestDetails(quest: Quest | undefined) {
  if (!quest) return "<b>Quest Details</b>\n\nКвест не найден.";

  return [
    "<b>Quest Details</b>",
    "",
    `<b>${escapeHtml(quest.title)}</b>`,
    escapeHtml(quest.description),
    "",
    `Difficulty: <b>${quest.difficulty}</b>`,
    `Category: <b>${quest.category}</b>`,
    `Reward: +${quest.xpReward} XP, +${quest.statRewardValue} ${STAT_LABELS[quest.statRewardKey].short}`,
    `Status: <b>${quest.status}</b>`
  ].join("\n");
}

function renderQuestCompleted(result: any) {
  return [
    "<b>[ SYSTEM MESSAGE ]</b>",
    "",
    "Quest completed.",
    "",
    "Reward acquired:",
    `+${result.rewards.xp} XP`,
    `+${result.rewards.statValue} ${STAT_LABELS[result.rewards.statKey as keyof typeof STAT_LABELS].short}`,
    "",
    `Current XP: <b>${result.profile.xp}</b> / ${result.profile.xpToNextLevel}`,
    result.levelUp.leveledUp ? `\n<b>LEVEL UP</b>: ${result.levelUp.from} -> ${result.levelUp.to}` : ""
  ].join("\n");
}

function renderBoss(boss: WeeklyBoss | null) {
  if (!boss) return "<b>WEEKLY BOSS</b>\n\nАктивный boss quest не найден.";

  return [
    "<b>WEEKLY BOSS</b>",
    "",
    `Boss: <b>${escapeHtml(boss.name)}</b>`,
    "",
    `Objective: ${escapeHtml(boss.objective)}`,
    `Progress: <b>${boss.progress}</b> / ${boss.target}`,
    "",
    `Reward: +${boss.xpReward} XP, +${boss.statRewardValue} ${STAT_LABELS[boss.statRewardKey].short}`,
    "Title: Focus Hunter",
    `Status: <b>${boss.status}</b>`
  ].join("\n");
}

function renderBossDetails(boss: WeeklyBoss | null) {
  if (!boss) return "<b>Boss Details</b>\n\nАктивный boss quest не найден.";

  return [
    "<b>Boss Details</b>",
    "",
    `<b>${escapeHtml(boss.name)}</b>`,
    escapeHtml(boss.description),
    "",
    `Objective: ${escapeHtml(boss.objective)}`,
    `Progress: <b>${boss.progress}</b> / ${boss.target}`,
    `Reward: +${boss.xpReward} XP, +${boss.statRewardValue} ${STAT_LABELS[boss.statRewardKey].short}`
  ].join("\n");
}

function renderBossVictory(boss: WeeklyBoss, profile: HunterProfile) {
  return [
    "<b>[ BOSS DEFEATED ]</b>",
    "",
    `<b>${escapeHtml(boss.name)}</b> has fallen.`,
    "",
    `Reward acquired: +${boss.xpReward} XP`,
    "Title: Focus Hunter",
    "",
    `Current XP: <b>${profile.xp}</b> / ${profile.xpToNextLevel}`
  ].join("\n");
}

function renderHelp() {
  return [
    "<b>HELP</b>",
    "",
    "/menu - главное меню",
    "/profile - профиль",
    "/quests - квесты на сегодня",
    "/stats - характеристики",
    "/boss - weekly boss",
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
  const message = error instanceof Error ? error.message : "Unexpected Telegram bot error";
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
    await sendMessage(chatId, `<b>[ SYSTEM ERROR ]</b>\n\n${escapeHtml(message)}`, helpKeyboard({ headers: {} }));
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
    throw new Error(payload.description ?? `Telegram ${method} failed`);
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

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function shorten(value: string) {
  return value.length > 28 ? `${value.slice(0, 25)}...` : value;
}
