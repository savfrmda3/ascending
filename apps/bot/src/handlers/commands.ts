import type { Context, Telegraf } from "telegraf";
import { apiClient } from "../services/apiClient.js";
import { bossKeyboard, helpKeyboard, mainMenuKeyboard, profileKeyboard, questsKeyboard } from "../keyboards/keyboards.js";
import {
  renderBoss,
  renderHelp,
  renderMainMenu,
  renderProfile,
  renderQuests,
  renderSettingsHelp,
  renderStats
} from "./renderers.js";
import { requireTelegramUser } from "./actions.js";

export function registerCommands(bot: Telegraf) {
  bot.start(async (ctx) => {
    const { profile } = await syncUser(ctx);
    await ctx.reply(renderMainMenu(profile), {
      parse_mode: "HTML",
      ...mainMenuKeyboard()
    });
  });

  bot.command("menu", async (ctx) => {
    const { profile } = await syncUser(ctx);
    await ctx.reply(renderMainMenu(profile), {
      parse_mode: "HTML",
      ...mainMenuKeyboard()
    });
  });

  bot.command("profile", async (ctx) => {
    const { profile } = await syncUser(ctx);
    await ctx.reply(renderProfile(profile), {
      parse_mode: "HTML",
      ...profileKeyboard()
    });
  });

  bot.command("quests", async (ctx) => {
    await syncUser(ctx);
    const quests = await apiClient.getQuests(requireTelegramUser(ctx).id);
    await ctx.reply(renderQuests(quests), {
      parse_mode: "HTML",
      ...questsKeyboard(quests)
    });
  });

  bot.command("stats", async (ctx) => {
    const { profile, stats } = await syncUser(ctx);
    await ctx.reply(renderStats(profile, stats), {
      parse_mode: "HTML",
      ...profileKeyboard()
    });
  });

  bot.command("boss", async (ctx) => {
    await syncUser(ctx);
    const boss = await apiClient.getBoss(requireTelegramUser(ctx).id);
    await ctx.reply(renderBoss(boss), {
      parse_mode: "HTML",
      ...bossKeyboard(boss)
    });
  });

  bot.command("settings", async (ctx) => {
    await syncUser(ctx);
    await ctx.reply(renderSettingsHelp(), {
      parse_mode: "HTML",
      ...profileKeyboard()
    });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(renderHelp(), {
      parse_mode: "HTML",
      ...helpKeyboard()
    });
  });
}

async function syncUser(ctx: Context) {
  const user = requireTelegramUser(ctx);
  return apiClient.syncUser({
    telegramId: user.id,
    username: user.username,
    firstName: user.first_name
  });
}
