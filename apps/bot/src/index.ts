import { Telegraf } from "telegraf";
import { env } from "./config/env.js";
import { registerActions } from "./handlers/actions.js";
import { registerCommands } from "./handlers/commands.js";
import { registerNotifications } from "./services/notifications.js";

const bot = new Telegraf(env.BOT_TOKEN);

registerCommands(bot);
registerActions(bot);
registerNotifications(bot);

bot.catch((error, ctx) => {
  console.error("Bot error", error);
  const message = error instanceof Error ? error.message : "Unexpected bot error";
  ctx.reply(`<b>[ SYSTEM ERROR ]</b>\n\n${escapeHtml(message)}`, { parse_mode: "HTML" }).catch(console.error);
});

await bot.telegram.setMyCommands([
  { command: "start", description: "Запустить System Hunter" },
  { command: "menu", description: "Главное меню" },
  { command: "profile", description: "Профиль Hunter" },
  { command: "quests", description: "Квесты на сегодня" },
  { command: "stats", description: "Характеристики" },
  { command: "boss", description: "Босс недели" },
  { command: "systems", description: "Навыки, инвентарь и сезон" },
  { command: "settings", description: "Настройки" },
  { command: "help", description: "Помощь" }
]);

await bot.launch();
console.log("System Hunter bot is running");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
