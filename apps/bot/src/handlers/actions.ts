import type { Context, Telegraf } from "telegraf";
import { apiClient } from "../services/apiClient.js";
import {
  bossKeyboard,
  helpKeyboard,
  mainMenuKeyboard,
  profileKeyboard,
  questCompletedKeyboard,
  questsKeyboard
} from "../keyboards/keyboards.js";
import {
  renderBoss,
  renderBossVictory,
  renderHelp,
  renderMainMenu,
  renderProfile,
  renderQuestCompleted,
  renderQuestDetails,
  renderQuests,
  renderSystems,
  renderStats
} from "./renderers.js";

export function registerActions(bot: Telegraf) {
  bot.action(["back_to_menu", "refresh_profile"], async (ctx) => {
    await ctx.answerCbQuery();
    const user = requireTelegramUser(ctx);
    const { profile } = await apiClient.syncUser({
      telegramId: user.id,
      username: user.username,
      firstName: user.first_name
    });
    await editOrReply(ctx, renderMainMenu(profile), mainMenuKeyboard());
  });

  bot.action("show_profile", async (ctx) => {
    await ctx.answerCbQuery();
    const { profile } = await apiClient.getProfile(requireTelegramUser(ctx).id);
    await editOrReply(ctx, renderProfile(profile), profileKeyboard());
  });

  bot.action("show_stats", async (ctx) => {
    await ctx.answerCbQuery();
    const { profile, stats } = await apiClient.getProfile(requireTelegramUser(ctx).id);
    await editOrReply(ctx, renderStats(profile, stats), profileKeyboard());
  });

  bot.action("show_systems", async (ctx) => {
    await ctx.answerCbQuery();
    const systems = await apiClient.getSystems(requireTelegramUser(ctx).id);
    await editOrReply(ctx, renderSystems(systems), profileKeyboard());
  });

  bot.action("show_today_quests", async (ctx) => {
    await ctx.answerCbQuery();
    const quests = await apiClient.getQuests(requireTelegramUser(ctx).id);
    await editOrReply(ctx, renderQuests(quests), questsKeyboard(quests));
  });

  bot.action("generate_quest", async (ctx) => {
    await ctx.answerCbQuery("Generating quest...");
    const telegramId = requireTelegramUser(ctx).id;
    await apiClient.generateQuest(telegramId);
    const quests = await apiClient.getQuests(telegramId);
    await editOrReply(ctx, renderQuests(quests), questsKeyboard(quests));
  });

  bot.action("show_boss", async (ctx) => {
    await ctx.answerCbQuery();
    const boss = await apiClient.getBoss(requireTelegramUser(ctx).id);
    await editOrReply(ctx, renderBoss(boss), bossKeyboard(boss));
  });

  bot.action("show_help", async (ctx) => {
    await ctx.answerCbQuery();
    await editOrReply(ctx, renderHelp(), helpKeyboard());
  });

  bot.action(/^complete_quest:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery("Quest completion received");
    const questId = ctx.match[1];
    if (!questId) throw new Error("Quest id is missing");
    const result = await apiClient.completeQuest(requireTelegramUser(ctx).id, questId);
    await editOrReply(ctx, renderQuestCompleted(result), questCompletedKeyboard());
  });

  bot.action(/^skip_quest:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery("Quest skipped");
    const questId = ctx.match[1];
    if (!questId) throw new Error("Quest id is missing");
    const telegramId = requireTelegramUser(ctx).id;
    await apiClient.skipQuest(telegramId, questId);
    const updated = await apiClient.getQuests(telegramId);
    await editOrReply(ctx, renderQuests(updated), questsKeyboard(updated));
  });

  bot.action(/^quest_details:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const questId = ctx.match[1];
    if (!questId) throw new Error("Quest id is missing");
    const quests = await apiClient.getQuests(requireTelegramUser(ctx).id);
    const quest = quests.find((item) => item.id === questId);
    if (!quest) {
      await editOrReply(ctx, "Quest not found.", questsKeyboard(quests));
      return;
    }
    await editOrReply(ctx, renderQuestDetails(quest), questsKeyboard(quests));
  });

  bot.action(/^boss_progress:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery("Boss progress updated");
    const bossId = ctx.match[1];
    if (!bossId) throw new Error("Boss id is missing");
    const result = await apiClient.progressBoss(requireTelegramUser(ctx).id, bossId);
    await editOrReply(
      ctx,
      result.victory ? renderBossVictory(result.boss, result.profile) : renderBoss(result.boss),
      bossKeyboard(result.boss)
    );
  });

  bot.action(/^boss_details:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const boss = await apiClient.getBoss(requireTelegramUser(ctx).id);
    await editOrReply(ctx, renderBoss(boss), bossKeyboard(boss));
  });
}

export async function editOrReply(ctx: Context, text: string, keyboard: ReturnType<typeof mainMenuKeyboard>) {
  const extra = {
    parse_mode: "HTML" as const,
    ...keyboard
  };

  try {
    await ctx.editMessageText(text, extra);
  } catch {
    await ctx.reply(text, extra);
  }
}

export function requireTelegramUser(ctx: Context) {
  if (!ctx.from) {
    throw new Error("Telegram user is missing");
  }

  return ctx.from;
}
