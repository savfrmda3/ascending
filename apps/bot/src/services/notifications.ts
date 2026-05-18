import cron from "node-cron";
import { Markup, type Telegraf } from "telegraf";
import { env } from "../config/env.js";
import { apiClient } from "./apiClient.js";

export function registerNotifications(bot: Telegraf) {
  cron.schedule(
    "0 9 * * *",
    async () => {
      const users = await apiClient.generateDailyForAllUsers();
      await Promise.allSettled(
        users.map((user) =>
          bot.telegram.sendMessage(user.telegram_id, morningMessage(), {
            parse_mode: "HTML",
            ...notificationKeyboard()
          })
        )
      );
    },
    { timezone: "Europe/Minsk" }
  );

  cron.schedule(
    "0 20 * * *",
    async () => {
      const summaries = await apiClient.getActiveQuestSummary();
      await Promise.allSettled(
        summaries.map((summary) =>
          bot.telegram.sendMessage(summary.telegramId, eveningMessage(summary.activeCount), {
            parse_mode: "HTML",
            ...notificationKeyboard()
          })
        )
      );
    },
    { timezone: "Europe/Minsk" }
  );
}

function notificationKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Посмотреть квесты", "show_today_quests")],
    [Markup.button.webApp("Открыть Mini App", env.MINI_APP_URL)]
  ]);
}

function morningMessage() {
  return [
    "<b>[ DAILY QUESTS GENERATED ]</b>",
    "",
    "Твои задания на сегодня готовы."
  ].join("\n");
}

function eveningMessage(activeCount: number) {
  return [
    "<b>[ SYSTEM REMINDER ]</b>",
    "",
    "У тебя остались незавершенные квесты:",
    `<b>${activeCount}</b> active quests`
  ].join("\n");
}
