import { Markup } from "telegraf";
import type { Quest, WeeklyBoss } from "@system-hunter/shared";
import { env } from "../config/env.js";

export function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp("Открыть Mini App", env.MINI_APP_URL)],
    [Markup.button.callback("Квесты на сегодня", "show_today_quests")],
    [
      Markup.button.callback("Профиль", "show_profile"),
      Markup.button.callback("Статы", "show_stats")
    ],
    [Markup.button.callback("Босс недели", "show_boss")],
    [Markup.button.callback("Получить новый квест", "generate_quest")],
    [Markup.button.callback("Помощь", "show_help")]
  ]);
}

export function profileKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Обновить профиль", "refresh_profile")],
    [Markup.button.webApp("Открыть Mini App", env.MINI_APP_URL)],
    [Markup.button.callback("Назад в меню", "back_to_menu")]
  ]);
}

export function questsKeyboard(quests: Quest[]) {
  const activeRows = quests
    .filter((quest) => quest.status === "active")
    .flatMap((quest) => [
      [Markup.button.callback(`Выполнить: ${shorten(quest.title)}`, `complete_quest:${quest.id}`)],
      [
        Markup.button.callback(`Детали`, `quest_details:${quest.id}`),
        Markup.button.callback(`Пропустить`, `skip_quest:${quest.id}`)
      ]
    ]);

  return Markup.inlineKeyboard([
    ...activeRows,
    [Markup.button.webApp("Открыть Mini App", env.MINI_APP_URL)],
    [Markup.button.callback("Назад в меню", "back_to_menu")]
  ]);
}

export function questCompletedKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Квесты", "show_today_quests")],
    [
      Markup.button.callback("Профиль", "show_profile"),
      Markup.button.webApp("Открыть Mini App", env.MINI_APP_URL)
    ],
    [Markup.button.callback("Назад в меню", "back_to_menu")]
  ]);
}

export function bossKeyboard(boss: WeeklyBoss | null) {
  const rows = boss
    ? [
        [Markup.button.callback("Complete Step", `boss_progress:${boss.id}`)],
        [Markup.button.callback("Boss Details", `boss_details:${boss.id}`)]
      ]
    : [];

  return Markup.inlineKeyboard([
    ...rows,
    [Markup.button.webApp("Открыть Mini App", env.MINI_APP_URL)],
    [Markup.button.callback("Назад в меню", "back_to_menu")]
  ]);
}

export function helpKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp("Открыть Mini App", env.MINI_APP_URL)],
    [Markup.button.callback("Назад в меню", "back_to_menu")]
  ]);
}

function shorten(value: string) {
  return value.length > 28 ? `${value.slice(0, 25)}...` : value;
}
