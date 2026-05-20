import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  BarChart3,
  Battery,
  Brain,
  CalendarDays,
  Crosshair,
  Dumbbell,
  Flame,
  Gauge,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  Package,
  MessageCircle,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  User,
  Zap
} from "lucide-react";
import {
  STAT_KEYS,
  applyXp,
  customQuestRewards,
  xpToNextLevel,
  type BossProgressResult,
  type CustomQuestInput,
  type CustomQuestProgress,
  type CustomQuestTemplate,
  type HabitDayStatus,
  type DashboardSummary,
  type ProgressHistory,
  type Quest,
  type QuestCompletionResult,
  type RecurrenceType,
  type StatKey,
  type SystemsOverview,
  type UserSettings,
  type Weekday
} from "@system-hunter/shared";
import { Modal, Panel, PrimaryButton, ProgressBar, Metric } from "./components/ui.js";
import {
  authenticateTelegram,
  completeQuest,
  createSquad,
  createCustomQuest,
  deleteCustomQuest,
  deleteTodayCustomQuest,
  disableCustomQuest,
  enableCustomQuest,
  generateQuest,
  getCustomQuests,
  getCustomQuestProgress,
  getDashboard,
  getProgressHistory,
  getSystemsOverview,
  joinSquad,
  replaceQuest,
  cancelQuest,
  skipQuest,
  startQuest,
  unlockSkill,
  updateCustomQuest,
  updateSettings
} from "./lib/api.js";
import { demoDashboard, demoProgressHistory } from "./lib/demo.js";

type View = "dashboard" | "quests" | "activeQuest" | "stats" | "boss" | "profile" | "settings" | "progress" | "systems";
type AppModal =
  | { type: "quest"; result: QuestCompletionResult }
  | { type: "boss"; result: BossProgressResult }
  | { type: "notice"; title: string; body: string }
  | null;

const navItems: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Главная", icon: LayoutDashboard },
  { id: "quests", label: "Квесты", icon: ListChecks },
  { id: "stats", label: "Статы", icon: BarChart3 },
  { id: "boss", label: "Босс", icon: Swords },
  { id: "profile", label: "Профиль", icon: User }
];

const statusStats: Array<{ key: StatKey; icon: typeof LayoutDashboard }> = [
  { key: "strength", icon: Dumbbell },
  { key: "vitality", icon: HeartPulse },
  { key: "discipline", icon: Flame },
  { key: "intelligence", icon: Brain },
  { key: "focus", icon: Crosshair },
  { key: "charisma", icon: MessageCircle }
];

const STAT_LABELS_RU: Record<StatKey, { short: string; label: string }> = {
  strength: { short: "STR", label: "Сила" },
  intelligence: { short: "INT", label: "Интеллект" },
  vitality: { short: "VIT", label: "Выносливость" },
  discipline: { short: "DSC", label: "Дисциплина" },
  focus: { short: "FOC", label: "Фокус" },
  charisma: { short: "CHA", label: "Харизма" }
};

const CATEGORY_LABELS_RU: Record<Quest["category"], string> = {
  strength: "Сила",
  intelligence: "Интеллект",
  vitality: "Здоровье",
  discipline: "Дисциплина",
  focus: "Фокус",
  charisma: "Харизма"
};

const DIFFICULTY_LABELS_RU: Record<Quest["difficulty"], string> = {
  easy: "Легкий",
  medium: "Средний",
  hard: "Сложный"
};

const RECURRENCE_LABELS_RU: Record<RecurrenceType, string> = {
  once: "Один раз",
  daily: "Каждый день",
  weekly: "Каждую неделю",
  weekdays: "По дням недели"
};

const WEEKDAY_LABELS_RU: Array<{ value: Weekday; label: string }> = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 7, label: "Вс" }
];

const HABIT_HEALTH_LABELS_RU: Record<CustomQuestProgress["healthStatus"], string> = {
  stable: "Стабильно",
  at_risk: "Сегодня в риске",
  broken: "Серия сломана",
  paused: "Пауза"
};

const GOAL_LABELS_RU: Record<UserSettings["primaryGoal"], string> = {
  sport: "Спорт",
  discipline: "Дисциплина",
  study: "Учеба",
  focus: "Фокус",
  health: "Здоровье",
  charisma: "Харизма"
};

const STATUS_LABELS_RU: Record<Quest["status"], string> = {
  active: "Активен",
  in_progress: "В процессе",
  completed: "Выполнен",
  skipped: "Пропущен"
};

const RARITY_LABELS_RU: Record<ProgressHistory["achievementCollection"][number]["rarity"], string> = {
  common: "Обычное",
  rare: "Редкое",
  epic: "Эпическое",
  legendary: "Легендарное"
};

const CLASS_LABELS_RU: Record<string, string> = {
  "Iron Vanguard": "Железный авангард",
  "Mind Seeker": "Искатель разума",
  "Vital Warden": "Страж жизненной силы",
  "Oath Keeper": "Хранитель обета",
  "Focus Hunter": "Охотник фокуса",
  "Voice Adept": "Адепт голоса",
  "Novice Hunter": "Начинающий охотник"
};

const QUEST_TEXT_RU: Record<string, string> = {
  "20 push-ups": "20 отжиманий",
  "Complete 20 controlled push-ups.": "Выполни 20 техничных отжиманий.",
  "30 squats": "30 приседаний",
  "Complete 30 bodyweight squats.": "Выполни 30 приседаний с собственным весом.",
  "15 minutes stretching": "15 минут растяжки",
  "Spend 15 minutes on mobility or stretching.": "Потрать 15 минут на мобильность или растяжку.",
  "30 minutes workout": "30 минут тренировки",
  "Train for 30 minutes with steady effort.": "Тренируйся 30 минут в ровном темпе.",
  "Read 10 pages": "Прочитать 10 страниц",
  "Read 10 pages from a useful book.": "Прочитай 10 страниц полезной книги.",
  "Study English for 30 minutes": "30 минут английского",
  "Complete focused English study for 30 minutes.": "Позанимайся английским 30 минут без отвлечений.",
  "Watch educational video": "Посмотреть обучающее видео",
  "Watch and summarize one educational video.": "Посмотри и кратко законспектируй одно обучающее видео.",
  "Complete one lesson": "Пройти один урок",
  "Finish one course lesson or tutorial module.": "Заверши один урок курса или модуль туториала.",
  "Drink 2 liters of water": "Выпить 2 литра воды",
  "Reach your daily water target.": "Закрой дневную норму воды.",
  "Sleep before target time": "Лечь спать вовремя",
  "Start your sleep routine before your target time.": "Начни подготовку ко сну до выбранного времени.",
  "Walk 7000 steps": "Пройти 7000 шагов",
  "Walk at least 7000 steps today.": "Пройди сегодня минимум 7000 шагов.",
  "Prepare healthy meal": "Приготовить полезный прием пищи",
  "Prepare one meal that supports your energy.": "Приготовь один прием пищи, который поддержит энергию.",
  "Clean workspace": "Убрать рабочее место",
  "Reset your workspace before the next session.": "Приведи рабочее место в порядок перед следующей сессией.",
  "Plan tomorrow": "Спланировать завтра",
  "Write the three most important tasks for tomorrow.": "Запиши три самые важные задачи на завтра.",
  "Complete one delayed task": "Закрыть одну отложенную задачу",
  "Finish one task you have postponed.": "Заверши одну задачу, которую откладывал.",
  "Wake up on time": "Проснуться вовремя",
  "Wake up at your planned time.": "Проснись в запланированное время.",
  "30 minutes deep work": "30 минут глубокой работы",
  "Complete one uninterrupted deep work block.": "Проведи один непрерывный блок глубокой работы.",
  "No social media for 1 hour": "1 час без соцсетей",
  "Stay away from social feeds for one full hour.": "Не заходи в ленты соцсетей один полный час.",
  "Pomodoro session x2": "Две Pomodoro-сессии",
  "Complete two Pomodoro focus sessions.": "Заверши две Pomodoro-сессии фокуса.",
  "Finish one important task": "Завершить одну важную задачу",
  "Finish one meaningful task before switching context.": "Заверши одну значимую задачу перед переключением контекста.",
  "Message one useful contact": "Написать полезному контакту",
  "Send one thoughtful message to a useful contact.": "Отправь одно осмысленное сообщение полезному контакту.",
  "Practice speaking for 10 minutes": "10 минут практики речи",
  "Practice speaking clearly for 10 minutes.": "Практикуй четкую речь 10 минут.",
  "Record a short voice note": "Записать короткое голосовое",
  "Record a short voice note and listen back once.": "Запиши короткое голосовое и один раз прослушай его.",
  "Give someone a compliment": "Сделать комплимент",
  "Give one sincere compliment today.": "Сделай сегодня один искренний комплимент."
};

const BOSS_TEXT_RU: Record<string, string> = {
  "Devourer of Focus": "Пожиратель фокуса",
  "A pressure-born entity that weakens when you protect deep work blocks.":
    "Сущность давления, которая слабеет, когда ты защищаешь блоки глубокой работы.",
  "Complete 4 deep work sessions.": "Заверши 4 сессии глубокой работы."
};

const ACHIEVEMENT_TEXT_RU: Record<string, { title: string; description: string }> = {
  first_quest: { title: "Первый квест", description: "Выполни первый ежедневный квест." },
  streak_3: { title: "Серия 3 дня", description: "Выполняй квесты три дня подряд." },
  streak_7: { title: "Серия 7 дней", description: "Выполняй квесты семь дней подряд." },
  first_level_up: { title: "Первое повышение", description: "Получи новый уровень впервые." },
  boss_slayer: { title: "Победитель босса", description: "Победи первого недельного босса." },
  focus_hunter: { title: "Охотник фокуса", description: "Выполни 10 квестов фокуса." },
  discipline_initiate: { title: "Адепт дисциплины", description: "Выполни 10 квестов дисциплины." },
  streak_14: { title: "Серия 14 дней", description: "Удержи дисциплину две недели подряд." },
  streak_30: { title: "Серия 30 дней", description: "Закрой месяц без потери ежедневного ритма." },
  strength_path: { title: "Путь силы", description: "Выполни 10 квестов силы." },
  vitality_path: { title: "Путь восстановления", description: "Выполни 10 квестов здоровья." },
  intelligence_path: { title: "Путь разума", description: "Выполни 10 квестов интеллекта." },
  charisma_path: { title: "Путь голоса", description: "Выполни 10 квестов харизмы." }
};

const TITLE_LABELS_RU: Record<string, string> = {
  "Focus Hunter": "Охотник фокуса"
};

function translateKnownText(text: string | null | undefined, dictionary: Record<string, string>) {
  if (!text) return "";
  return dictionary[text] ?? text;
}

function displayClassName(className: string) {
  return CLASS_LABELS_RU[className] ?? className;
}

function displayTitle(title: string | null | undefined) {
  if (!title) return "Нет";
  return TITLE_LABELS_RU[title] ?? title;
}

function displayQuestTitle(quest: Pick<Quest, "title">) {
  return translateKnownText(quest.title, QUEST_TEXT_RU);
}

function displayQuestDescription(quest: Pick<Quest, "description">) {
  return translateKnownText(quest.description, QUEST_TEXT_RU);
}

function questEstimatedMinutes(quest: Pick<Quest, "estimatedMinutes" | "difficulty" | "category">) {
  if (typeof quest.estimatedMinutes === "number" && quest.estimatedMinutes > 0) return quest.estimatedMinutes;
  if (quest.category === "focus") return quest.difficulty === "hard" ? 50 : 30;
  if (quest.category === "vitality") return quest.difficulty === "hard" ? 45 : 20;
  if (quest.category === "strength") return quest.difficulty === "hard" ? 35 : 15;
  return quest.difficulty === "hard" ? 40 : quest.difficulty === "medium" ? 25 : 10;
}

function questReason(quest: Pick<Quest, "reason" | "category" | "difficulty">) {
  if (quest.reason) return quest.reason;
  return `Выбран для прокачки ${CATEGORY_LABELS_RU[quest.category].toLowerCase()} и баланса ${DIFFICULTY_LABELS_RU[quest.difficulty].toLowerCase()} нагрузки.`;
}

function displayBossText(text: string) {
  return translateKnownText(text, BOSS_TEXT_RU);
}

function displayAchievement(achievement: { key: string; title: string; description: string }) {
  return ACHIEVEMENT_TEXT_RU[achievement.key] ?? {
    title: achievement.title,
    description: achievement.description
  };
}

function recurrenceLabel(template: Pick<CustomQuestTemplate, "recurrenceType" | "weekdays">) {
  if (template.recurrenceType !== "weekdays") return RECURRENCE_LABELS_RU[template.recurrenceType];
  const selected = WEEKDAY_LABELS_RU
    .filter((day) => template.weekdays.includes(day.value))
    .map((day) => day.label)
    .join(", ");
  return selected ? `По дням: ${selected}` : "По дням недели";
}

function displaySkillTitle(title: string) {
  return title
    .replace("Focus", "Фокус")
    .replace("Discipline", "Дисциплина")
    .replace("Vitality", "Выносливость")
    .replace("Charisma", "Харизма");
}

function formatRuDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

function formatRuTime(value: string) {
  return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(startedAt: string, now: number) {
  const diffMs = Math.max(0, now - new Date(startedAt).getTime());
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours > 0) return `${hours} ч ${restMinutes} мин`;
  return `${Math.max(1, restMinutes)} мин`;
}

function hapticImpact(style: "light" | "medium" | "heavy" = "light") {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
}

function hapticNotify(type: "success" | "warning" | "error") {
  window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
}

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [progressHistory, setProgressHistory] = useState<ProgressHistory | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [systems, setSystems] = useState<SystemsOverview | null>(null);
  const [systemsLoading, setSystemsLoading] = useState(false);
  const [customQuests, setCustomQuests] = useState<CustomQuestTemplate[]>([]);
  const [customQuestProgress, setCustomQuestProgress] = useState<CustomQuestProgress[]>([]);
  const [customQuestsLoading, setCustomQuestsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [modal, setModal] = useState<AppModal>(null);
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);

  useEffect(() => {
    async function boot() {
      try {
        const initData = window.Telegram?.WebApp?.initData;
        if (!initData) {
          setDemoMode(true);
          setDashboard(demoDashboard);
          return;
        }

        await authenticateTelegram(initData);
        setDashboard(await getDashboard());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Не удалось запустить System Hunter");
      } finally {
        setLoading(false);
      }
    }

    void boot();
  }, []);

  useEffect(() => {
    if (view !== "progress" || !dashboard) return;
    void loadProgressHistory();
  }, [view, demoMode, dashboard?.profile.id]);

  useEffect(() => {
    if (view !== "systems" || !dashboard) return;
    void loadSystemsOverview();
  }, [view, demoMode, dashboard?.profile.id]);

  useEffect(() => {
    if (view !== "quests" || !dashboard) return;
    void loadCustomQuests();
  }, [view, demoMode, dashboard?.profile.id]);

  const completedToday = useMemo(
    () => dashboard?.todayQuests.filter((quest) => quest.status === "completed").length ?? 0,
    [dashboard]
  );
  const inProgressQuest = useMemo(
    () => dashboard?.todayQuests.find((quest) => quest.status === "in_progress") ?? null,
    [dashboard]
  );
  const selectedQuest = useMemo(
    () => dashboard?.todayQuests.find((quest) => quest.id === selectedQuestId) ?? inProgressQuest,
    [dashboard, inProgressQuest, selectedQuestId]
  );

  async function refresh() {
    if (demoMode) return;
    setDashboard(await getDashboard());
    setProgressHistory(null);
    setSystems(null);
    setCustomQuests([]);
    setCustomQuestProgress([]);
  }

  async function loadProgressHistory() {
    setProgressLoading(true);
    try {
      if (demoMode) {
        setProgressHistory(demoProgressHistory);
        return;
      }

      setProgressHistory(await getProgressHistory());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить историю прогресса");
    } finally {
      setProgressLoading(false);
    }
  }

  async function loadSystemsOverview() {
    setSystemsLoading(true);
    try {
      if (demoMode) {
        setSystems(buildDemoSystems(dashboard ?? demoDashboard));
        return;
      }

      setSystems(await getSystemsOverview());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить системные модули");
    } finally {
      setSystemsLoading(false);
    }
  }

  async function loadCustomQuests() {
    setCustomQuestsLoading(true);
    try {
      if (demoMode) {
        const templates = demoCustomQuestTemplates();
        setCustomQuests(templates);
        setCustomQuestProgress(buildDemoHabitProgress(templates, dashboard ?? demoDashboard));
        return;
      }

      const [templates, progress] = await Promise.all([getCustomQuests(), getCustomQuestProgress()]);
      setCustomQuests(templates);
      setCustomQuestProgress(progress);
    } catch (caught) {
      setModal({ type: "notice", title: "МОИ КВЕСТЫ НЕДОСТУПНЫ", body: caught instanceof Error ? caught.message : "Не удалось загрузить пользовательские квесты" });
    } finally {
      setCustomQuestsLoading(false);
    }
  }

  async function onSaveSettings(input: Partial<UserSettings>) {
    setBusyId("settings");
    try {
      if (demoMode) {
        setDashboard((current) =>
          current
            ? {
                ...current,
                settings: {
                  ...current.settings,
                  ...input,
                  updatedAt: new Date().toISOString()
                }
              }
            : current
        );
        setModal({ type: "notice", title: "НАСТРОЙКИ ДЕМО", body: "Настройки изменены только в текущем демо-сеансе." });
        setView("dashboard");
        return;
      }

      await updateSettings(input);
      await refresh();
      setModal({ type: "notice", title: "НАСТРОЙКИ СОХРАНЕНЫ", body: "Система обновит подбор следующих квестов с учетом твоего профиля." });
      setView("dashboard");
    } catch (caught) {
      setModal({ type: "notice", title: "ОШИБКА НАСТРОЕК", body: caught instanceof Error ? caught.message : "Не удалось сохранить настройки" });
    } finally {
      setBusyId(null);
    }
  }

  async function reloadQuestSurfaces() {
    if (demoMode) return;
    setDashboard(await getDashboard());
    const [templates, progress] = await Promise.all([getCustomQuests(), getCustomQuestProgress()]);
    setCustomQuests(templates);
    setCustomQuestProgress(progress);
    setProgressHistory(null);
  }

  async function onCreateCustomQuest(input: CustomQuestInput) {
    setBusyId("custom-create");
    try {
      if (demoMode) {
        const template = demoCustomQuestFromInput(input);
        setCustomQuests((current) => [template, ...current]);
        setDashboard((current) => current ? addDemoCustomQuestInstance(current, template) : current);
        setCustomQuestProgress((current) => [buildDemoHabitProgress([template], dashboard ?? demoDashboard)[0]!, ...current]);
        setModal({ type: "notice", title: "ПРИВЫЧКА ДЕМО", body: "Пользовательский квест добавлен только в демо-сценарии." });
        return;
      }

      await createCustomQuest(input);
      await reloadQuestSurfaces();
      setModal({ type: "notice", title: "ПРИВЫЧКА СОЗДАНА", body: "Если квест подходит под сегодняшний день, он уже добавлен в дневной протокол." });
    } catch (caught) {
      setModal({ type: "notice", title: "ПРИВЫЧКА НЕ СОЗДАНА", body: caught instanceof Error ? caught.message : "Не удалось создать пользовательский квест" });
    } finally {
      setBusyId(null);
    }
  }

  async function onUpdateCustomQuest(id: string, input: Partial<CustomQuestInput>) {
    setBusyId(id);
    try {
      if (demoMode) {
        setCustomQuests((current) => current.map((item) => (item.id === id ? { ...item, ...demoCustomQuestFromInput({ ...item, ...input }), id } : item)));
        setCustomQuestProgress((current) => buildDemoHabitProgress(current.map((item) => (item.template.id === id ? { ...item.template, ...demoCustomQuestFromInput({ ...item.template, ...input }), id } : item.template)), dashboard ?? demoDashboard));
        setModal({ type: "notice", title: "ПРИВЫЧКА ОБНОВЛЕНА", body: "Изменения сохранены только в демо-режиме." });
        return;
      }

      await updateCustomQuest(id, input);
      await reloadQuestSurfaces();
      setModal({ type: "notice", title: "ПРИВЫЧКА ОБНОВЛЕНА", body: "Новые правила будут применяться к будущим экземплярам." });
    } catch (caught) {
      setModal({ type: "notice", title: "ПРИВЫЧКА НЕ ОБНОВЛЕНА", body: caught instanceof Error ? caught.message : "Не удалось обновить привычку" });
    } finally {
      setBusyId(null);
    }
  }

  async function onToggleCustomQuest(template: CustomQuestTemplate) {
    setBusyId(template.id);
    try {
      if (demoMode) {
        setCustomQuests((current) => current.map((item) => (item.id === template.id ? { ...item, isActive: !item.isActive } : item)));
        setCustomQuestProgress((current) => current.map((item) => item.template.id === template.id ? { ...item, template: { ...item.template, isActive: !item.template.isActive }, healthStatus: item.template.isActive ? "paused" : "stable" } : item));
        setModal({ type: "notice", title: template.isActive ? "ПРИВЫЧКА ОТКЛЮЧЕНА" : "ПРИВЫЧКА ВКЛЮЧЕНА", body: "Статус изменен только в демо-режиме." });
        return;
      }

      if (template.isActive) {
        await disableCustomQuest(template.id);
      } else {
        await enableCustomQuest(template.id);
      }
      await reloadQuestSurfaces();
      setModal({ type: "notice", title: template.isActive ? "ПРИВЫЧКА ОТКЛЮЧЕНА" : "ПРИВЫЧКА ВКЛЮЧЕНА", body: "Дневные экземпляры будут создаваться по актуальному статусу." });
    } catch (caught) {
      setModal({ type: "notice", title: "СТАТУС НЕ ИЗМЕНЕН", body: caught instanceof Error ? caught.message : "Не удалось изменить статус привычки" });
    } finally {
      setBusyId(null);
    }
  }

  async function onDeleteCustomQuest(template: CustomQuestTemplate) {
    setBusyId(template.id);
    try {
      if (demoMode) {
        setCustomQuests((current) => current.filter((item) => item.id !== template.id));
        setCustomQuestProgress((current) => current.filter((item) => item.template.id !== template.id));
        setModal({ type: "notice", title: "ПРИВЫЧКА АРХИВИРОВАНА", body: "Шаблон удален только из демо-списка." });
        return;
      }

      await deleteCustomQuest(template.id);
      await reloadQuestSurfaces();
      setModal({ type: "notice", title: "ПРИВЫЧКА АРХИВИРОВАНА", body: "История выполненных квестов сохранена." });
    } catch (caught) {
      setModal({ type: "notice", title: "АРХИВАЦИЯ НЕ УДАЛАСЬ", body: caught instanceof Error ? caught.message : "Не удалось архивировать привычку" });
    } finally {
      setBusyId(null);
    }
  }

  async function onDeleteTodayQuest(quest: Quest) {
    setBusyId(quest.id);
    try {
      if (demoMode) {
        setDashboard((current) => current ? { ...current, todayQuests: current.todayQuests.filter((item) => item.id !== quest.id) } : current);
        setModal({ type: "notice", title: "КВЕСТ УДАЛЕН", body: "Сегодняшний экземпляр удален только в демо-режиме." });
        return;
      }

      await deleteTodayCustomQuest(quest.id);
      await refresh();
      setModal({ type: "notice", title: "КВЕСТ УДАЛЕН", body: "Удален только сегодняшний активный экземпляр. История привычки не затронута." });
    } catch (caught) {
      setModal({ type: "notice", title: "КВЕСТ НЕ УДАЛЕН", body: caught instanceof Error ? caught.message : "Не удалось удалить сегодняшний квест" });
    } finally {
      setBusyId(null);
    }
  }

  async function onUnlockSkill(key: string) {
    setBusyId(key);
    try {
      if (demoMode) {
        setSystems((current) => current ? unlockSkillInDemo(current, key) : current);
        setModal({ type: "notice", title: "НАВЫК ДЕМО", body: "Навык открыт только в текущем демо-сеансе." });
        return;
      }

      const result = await unlockSkill(key);
      setSystems((current) => current ? { ...current, skills: result.skills } : current);
      await refresh();
      setModal({ type: "notice", title: "НАВЫК ОТКРЫТ", body: "Дерево навыков обновлено, характеристика усилена." });
    } catch (caught) {
      setModal({ type: "notice", title: "НАВЫК НЕ ОТКРЫТ", body: caught instanceof Error ? caught.message : "Не удалось открыть навык" });
    } finally {
      setBusyId(null);
    }
  }

  async function onCreateSquad(name: string) {
    setBusyId("squad");
    try {
      if (demoMode) {
        setSystems((current) => current ? { ...current, squad: demoSquad(name) } : current);
        setModal({ type: "notice", title: "ОТРЯД ДЕМО", body: "Отряд создан только в демо-режиме." });
        return;
      }

      const squad = await createSquad(name);
      setSystems((current) => current ? { ...current, squad } : current);
      setModal({ type: "notice", title: "ОТРЯД СОЗДАН", body: `Код отряда: ${squad.code}` });
    } catch (caught) {
      setModal({ type: "notice", title: "ОТРЯД НЕ СОЗДАН", body: caught instanceof Error ? caught.message : "Не удалось создать отряд" });
    } finally {
      setBusyId(null);
    }
  }

  async function onJoinSquad(code: string) {
    setBusyId("squad");
    try {
      if (demoMode) {
        setSystems((current) => current ? { ...current, squad: demoSquad("Демо-отряд", code) } : current);
        setModal({ type: "notice", title: "ОТРЯД ДЕМО", body: "Вступление работает только в текущем демо-сеансе." });
        return;
      }

      const squad = await joinSquad(code);
      setSystems((current) => current ? { ...current, squad } : current);
      setModal({ type: "notice", title: "ОТРЯД НАЙДЕН", body: `Ты присоединился к ${squad.name}.` });
    } catch (caught) {
      setModal({ type: "notice", title: "ВСТУПЛЕНИЕ НЕ УДАЛОСЬ", body: caught instanceof Error ? caught.message : "Не удалось вступить в отряд" });
    } finally {
      setBusyId(null);
    }
  }

  async function onStartQuest(quest: Quest) {
    setBusyId(quest.id);
    try {
      if (demoMode) {
        const current = dashboard ?? demoDashboard;
        if (current.todayQuests.some((item) => item.status === "in_progress" && item.id !== quest.id)) {
          throw new Error("У тебя уже есть активный квест. Заверши или отмени его перед выбором нового.");
        }
        if (quest.status !== "active") throw new Error("Взять можно только активный квест.");
        startQuestInDemo(quest);
        setSelectedQuestId(quest.id);
        setView("activeQuest");
        hapticImpact("light");
        setModal({ type: "notice", title: "КВЕСТ ВЗЯТ", body: "Награда будет начислена только после завершения на экране активного квеста." });
        return;
      }

      const started = await startQuest(quest.id);
      await refresh();
      setSelectedQuestId(started.id);
      setView("activeQuest");
      hapticImpact("light");
      setModal({ type: "notice", title: "КВЕСТ ВЗЯТ", body: "Система перевела квест в режим выполнения." });
    } catch (caught) {
      hapticNotify("error");
      setModal({ type: "notice", title: "КВЕСТ НЕ ВЗЯТ", body: caught instanceof Error ? caught.message : "Не удалось взять квест" });
    } finally {
      setBusyId(null);
    }
  }

  async function onCancelQuest(quest: Quest) {
    setBusyId(quest.id);
    try {
      if (demoMode) {
        cancelQuestInDemo(quest);
        setSelectedQuestId(null);
        setView("quests");
        hapticImpact("light");
        setModal({ type: "notice", title: "КВЕСТ ОТМЕНЕН", body: "Квест вернулся в список доступных. Награда не начислена." });
        return;
      }

      await cancelQuest(quest.id);
      await refresh();
      setSelectedQuestId(null);
      setView("quests");
      hapticImpact("light");
      setModal({ type: "notice", title: "КВЕСТ ОТМЕНЕН", body: "Квест снова доступен в дневном списке." });
    } catch (caught) {
      hapticNotify("error");
      setModal({ type: "notice", title: "ОТМЕНА НЕ УДАЛАСЬ", body: caught instanceof Error ? caught.message : "Не удалось отменить квест" });
    } finally {
      setBusyId(null);
    }
  }

  async function onCompleteQuest(quest: Quest) {
    setBusyId(quest.id);
    try {
      if (demoMode) {
        const result = completeQuestInDemo(quest);
        setModal({ type: "quest", result });
        setSelectedQuestId(null);
        setView("quests");
        hapticNotify("success");
        return;
      }

      const result = await completeQuest(quest.id);
      setModal({ type: "quest", result });
      hapticNotify("success");
      await refresh();
      setSelectedQuestId(null);
      setView("quests");
    } catch (caught) {
      hapticNotify("error");
      setModal({ type: "notice", title: "КВЕСТ НЕ ЗАВЕРШЕН", body: caught instanceof Error ? caught.message : "Не удалось завершить квест" });
    } finally {
      setBusyId(null);
    }
  }

  async function onSkipQuest(quest: Quest) {
    setBusyId(quest.id);
    try {
      if (demoMode) {
        markQuestInDemo(quest, "skipped");
        setModal({ type: "notice", title: "КВЕСТ ПРОПУЩЕН", body: "В демо-режиме это действие не сохраняется." });
        return;
      }

      await skipQuest(quest.id);
      await refresh();
      setModal({ type: "notice", title: "КВЕСТ ПРОПУЩЕН", body: "Квест снят с активного протокола. Награда не начислена." });
    } catch (caught) {
      hapticNotify("error");
      setModal({ type: "notice", title: "ОШИБКА", body: caught instanceof Error ? caught.message : "Не удалось пропустить квест" });
    } finally {
      setBusyId(null);
    }
  }

  async function onReplaceQuest(quest: Quest) {
    setBusyId(quest.id);
    try {
      if (demoMode) {
        if (replaceQuestInDemo(quest)) {
          setModal({ type: "notice", title: "КВЕСТ ЗАМЕНЕН", body: "Добавлен новый демо-квест. Данные не сохраняются." });
        }
        return;
      }

      await replaceQuest(quest.id);
      await refresh();
      setModal({ type: "notice", title: "КВЕСТ ЗАМЕНЕН", body: "Старый квест пропущен, новый добавлен без повтора." });
    } catch (caught) {
      hapticNotify("error");
      setModal({ type: "notice", title: "ОШИБКА", body: caught instanceof Error ? caught.message : "Не удалось заменить квест" });
    } finally {
      setBusyId(null);
    }
  }

  async function onGenerateQuest() {
    setBusyId("generate");
    try {
      if (demoMode) {
        if (demoGeneratedCount(dashboard ?? demoDashboard) >= 3) {
          setModal({ type: "notice", title: "ЛИМИТ ДОСТИГНУТ", body: "В демо-режиме можно создать не больше 3 дополнительных квестов на день." });
          return;
        }
        setDashboard((current) =>
          current
            ? {
                ...current,
                todayQuests: [
                  ...current.todayQuests,
                  {
                    ...(current.todayQuests[1] ?? current.todayQuests[0] ?? demoDashboard.todayQuests[0])!,
                    id: `demo-${Date.now()}`,
                    title: "Завершить одну важную задачу",
                    description: "Заверши одну значимую задачу перед переключением контекста.",
                    difficulty: "hard",
                    xpReward: 75,
                    status: "active",
                    startedAt: null,
                    cancelledAt: null,
                    deletedAt: null,
                    createdAt: new Date().toISOString()
                  } as Quest
                ]
              }
            : current
        );
        setModal({ type: "notice", title: "КВЕСТ СОЗДАН", body: "Новый квест добавлен в дневной протокол." });
        return;
      }

      await generateQuest();
      await refresh();
      setModal({ type: "notice", title: "КВЕСТ СОЗДАН", body: "Новый квест добавлен в дневной протокол." });
    } catch (caught) {
      setModal({ type: "notice", title: "КВЕСТ НЕ СОЗДАН", body: caught instanceof Error ? caught.message : "Не удалось создать квест" });
    } finally {
      setBusyId(null);
    }
  }

  function completeQuestInDemo(quest: Quest): QuestCompletionResult {
    const current = dashboard ?? demoDashboard;
    const xpResult = applyXp(current.profile.level, current.profile.xp, quest.xpReward);
    const updatedStats = {
      ...current.stats,
      [quest.statRewardKey]: current.stats[quest.statRewardKey] + quest.statRewardValue
    };
    const updatedQuest = {
      ...quest,
      status: "completed" as const,
      completedAt: new Date().toISOString()
    };
    const bossProgress = progressBossFromDemoQuest(current, quest);
    const nextDashboard: DashboardSummary = {
      ...current,
      profile: {
        ...current.profile,
        level: xpResult.level,
        xp: xpResult.xp,
        xpToNextLevel: xpToNextLevel(xpResult.level),
        rank: xpResult.rank,
        completedQuestsCount: current.profile.completedQuestsCount + 1
      },
      stats: updatedStats,
      todayQuests: current.todayQuests.map((item) => (item.id === quest.id ? updatedQuest : item)),
      boss: bossProgress?.boss ?? current.boss
    };
    setDashboard(nextDashboard);

    return {
      quest: updatedQuest,
      profile: nextDashboard.profile,
      stats: nextDashboard.stats,
      rewards: {
        xp: quest.xpReward,
        statKey: quest.statRewardKey,
        statValue: quest.statRewardValue
      },
      levelUp: {
        leveledUp: xpResult.leveledUp,
        from: xpResult.from,
        to: xpResult.to
      },
      bossProgress,
      unlockedAchievements: []
    };
  }

  function startQuestInDemo(quest: Quest) {
    setDashboard((current) => {
      if (!current) return current;
      const hasAnother = current.todayQuests.some((item) => item.status === "in_progress" && item.id !== quest.id);
      if (hasAnother || quest.status !== "active") return current;
      return {
        ...current,
        todayQuests: current.todayQuests.map((item) =>
          item.id === quest.id
            ? {
                ...item,
                status: "in_progress" as const,
                startedAt: new Date().toISOString(),
                cancelledAt: null
              }
            : item
        )
      };
    });
  }

  function cancelQuestInDemo(quest: Quest) {
    setDashboard((current) =>
      current
        ? {
            ...current,
            todayQuests: current.todayQuests.map((item) =>
              item.id === quest.id
                ? {
                    ...item,
                    status: "active" as const,
                    cancelledAt: new Date().toISOString()
                  }
                : item
            )
          }
        : current
    );
  }

  function progressBossFromDemoQuest(current: DashboardSummary, quest: Quest): BossProgressResult | null {
    if (quest.category !== "focus") return null;
    if (!current.boss || current.boss.status !== "active") return null;
    return progressBossInDemo(current);
  }

  function progressBossInDemo(current: DashboardSummary): BossProgressResult | null {
    if (!current.boss) return null;
    const nextProgress = Math.min(current.boss.progress + 1, current.boss.target);
    const victory = nextProgress >= current.boss.target;
    const boss = {
      ...current.boss,
      progress: nextProgress,
      status: victory ? ("completed" as const) : current.boss.status,
      completedAt: victory ? new Date().toISOString() : current.boss.completedAt
    };

    return {
      boss,
      profile: current.profile,
      stats: current.stats,
      victory,
      progressed: nextProgress > current.boss.progress,
      unlockedAchievements: victory ? current.achievements : []
    };
  }

  function markQuestInDemo(quest: Quest, status: "skipped") {
    setDashboard((current) =>
      current
        ? {
            ...current,
            todayQuests: current.todayQuests.map((item) => (item.id === quest.id ? { ...item, status } : item))
          }
        : current
    );
  }

  function replaceQuestInDemo(quest: Quest) {
    const current = dashboard ?? demoDashboard;
    if (demoGeneratedCount(current) >= 3) {
      setModal({ type: "notice", title: "ЛИМИТ ДОСТИГНУТ", body: "Сегодня уже создано 3 дополнительных демо-квеста." });
      return false;
    }

    const replacement: Quest = {
      ...(current.todayQuests.find((item) => item.category === "focus") ?? current.todayQuests[0]!),
      id: `demo-replace-${Date.now()}`,
      title: "30 минут глубокой работы",
      description: "Проведи один непрерывный блок глубокой работы.",
      type: "generated",
      category: "focus",
      difficulty: "medium",
      xpReward: 35,
      statRewardKey: "focus",
      statRewardValue: 1,
      status: "active",
      completedAt: null,
      startedAt: null,
      cancelledAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString()
    };

    setDashboard({
      ...current,
      todayQuests: [
        ...current.todayQuests.map((item) => (item.id === quest.id ? { ...item, status: "skipped" as const, cancelledAt: new Date().toISOString() } : item)),
        replacement
      ]
    });
    return true;
  }

  function demoGeneratedCount(current: DashboardSummary) {
    return current.todayQuests.filter((quest) => quest.type === "generated").length;
  }

  function demoCustomQuestTemplates(): CustomQuestTemplate[] {
    const now = new Date().toISOString();
    return [
      {
        id: "demo-custom-reading",
        userId: demoDashboard.profile.id,
        title: "Читать 20 минут",
        description: "Персональная привычка для спокойной прокачки интеллекта.",
        category: "intelligence",
        difficulty: "easy",
        ...customQuestRewards("intelligence", "easy"),
        recurrenceType: "daily",
        weekdays: [],
        startsAt: new Date().toISOString().slice(0, 10),
        endsAt: null,
        isActive: true,
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      },
      {
        id: "demo-custom-focus",
        userId: demoDashboard.profile.id,
        title: "Фокус-блок без телефона",
        description: "Повторяется по будням.",
        category: "focus",
        difficulty: "medium",
        ...customQuestRewards("focus", "medium"),
        recurrenceType: "weekdays",
        weekdays: [1, 2, 3, 4, 5],
        startsAt: new Date().toISOString().slice(0, 10),
        endsAt: null,
        isActive: true,
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      }
    ];
  }

  function demoCustomQuestFromInput(input: CustomQuestInput): CustomQuestTemplate {
    const now = new Date().toISOString();
    return {
      id: `demo-custom-${Date.now()}`,
      userId: demoDashboard.profile.id,
      title: input.title,
      description: input.description ?? "",
      category: input.category,
      difficulty: input.difficulty,
      ...customQuestRewards(input.category, input.difficulty),
      recurrenceType: input.recurrenceType,
      weekdays: input.weekdays ?? [],
      startsAt: input.startsAt ?? now.slice(0, 10),
      endsAt: input.endsAt ?? null,
      isActive: input.isActive ?? true,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    };
  }

  function addDemoCustomQuestInstance(current: DashboardSummary, template: CustomQuestTemplate): DashboardSummary {
    if (!template.isActive) return current;
    const today = new Date().toISOString().slice(0, 10);
    const quest: Quest = {
      id: `demo-custom-quest-${Date.now()}`,
      userId: current.profile.id,
      title: template.title,
      description: template.description,
      type: "custom",
      source: "custom",
      customTemplateId: template.id,
      category: template.category,
      difficulty: template.difficulty,
      xpReward: template.xpReward,
      statRewardKey: template.statRewardKey,
      statRewardValue: template.statRewardValue,
      status: "active",
      dueDate: today,
      startedAt: null,
      cancelledAt: null,
      completedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      reason: "Пользовательский демо-квест."
    };

    return {
      ...current,
      todayQuests: current.todayQuests.some((item) => item.customTemplateId === template.id)
        ? current.todayQuests
        : [...current.todayQuests, quest]
    };
  }

  function buildDemoHabitProgress(templates: CustomQuestTemplate[], current: DashboardSummary): CustomQuestProgress[] {
    const today = new Date().toISOString().slice(0, 10);
    return templates.map((template) => {
      const todayQuest = current.todayQuests.find((quest) => quest.customTemplateId === template.id) ?? null;
      const calendar = Array.from({ length: 60 }, (_, index) => {
        const date = addDaysIso(today, index - 59);
        const due = demoHabitDue(template, date);
        const quest = current.todayQuests.find((item) => item.customTemplateId === template.id && item.dueDate === date) ?? null;
        const status: HabitDayStatus = quest?.status === "completed"
          ? "completed"
          : quest?.status === "skipped"
            ? "skipped"
            : date === today && due
              ? "active"
              : due && date < today
                ? index % 9 === 0
                  ? "missed"
                  : "completed"
                : "scheduled";
        return { date, due, status, questId: quest?.id ?? null, xp: status === "completed" ? template.xpReward : 0 };
      });
      const dueDays = calendar.filter((day) => day.due);
      const completedCount = dueDays.filter((day) => day.status === "completed").length;
      const missedCount = dueDays.filter((day) => day.status === "missed").length;
      const skippedCount = dueDays.filter((day) => day.status === "skipped").length;
      const currentStreak = currentHabitStreakForDemo(dueDays, today);
      return {
        template,
        currentStreak,
        bestStreak: Math.max(currentStreak, 6),
        scheduledCount: dueDays.length,
        completedCount,
        skippedCount,
        missedCount,
        completionRate: dueDays.length > 0 ? Math.round((completedCount / dueDays.length) * 100) : 0,
        healthStatus: !template.isActive ? "paused" : missedCount > 2 ? "broken" : todayQuest?.status === "active" ? "at_risk" : "stable",
        lastCompletedAt: new Date().toISOString(),
        nextDueDate: todayQuest?.status === "active" ? today : addDaysIso(today, 1),
        todayQuest,
        calendar
      };
    });
  }

  function demoHabitDue(template: CustomQuestTemplate, date: string) {
    const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const iso = (day === 0 ? 7 : day) as Weekday;
    if (template.recurrenceType === "once") return date === template.startsAt;
    if (template.recurrenceType === "daily") return true;
    if (template.recurrenceType === "weekly") return iso === 1;
    return template.weekdays.includes(iso);
  }

  function addDaysIso(date: string, offset: number) {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  }

  function currentHabitStreakForDemo(days: Array<{ date: string; status: HabitDayStatus }>, today: string) {
    let streak = 0;
    for (const day of [...days].reverse()) {
      if (day.date === today && day.status === "active") continue;
      if (day.status === "completed") {
        streak += 1;
        continue;
      }
      break;
    }
    return streak;
  }

  function buildDemoSystems(current: DashboardSummary): SystemsOverview {
    const unlockedKeys = new Set(["focus_i", "discipline_i"]);
    const nodes: SystemsOverview["skills"]["nodes"] = [
      ["focus", "Focus"],
      ["discipline", "Discipline"],
      ["vitality", "Vitality"],
      ["charisma", "Charisma"]
    ].flatMap(([stat, title]) =>
      ([1, 2, 3] as const).map((tier) => {
        const key = `${stat}_${"i".repeat(tier)}`;
        const unlocked = unlockedKeys.has(key);
        return {
          key,
          title: `${title} ${"I".repeat(tier)}`,
          description: `Демо-узел прокачки ${STAT_LABELS_RU[stat as StatKey].label}.`,
          statKey: stat as StatKey,
          tier,
          cost: tier,
          bonusText: `+${tier} ${STAT_LABELS_RU[stat as StatKey].short} при открытии`,
          unlocked,
          unlockedAt: unlocked ? new Date().toISOString() : null,
          canUnlock: !unlocked && tier === 1
        };
      })
    );

    return {
      skills: {
        totalPoints: Math.floor(current.profile.level / 2),
        spentPoints: 2,
        availablePoints: Math.max(0, Math.floor(current.profile.level / 2) - 2),
        nodes
      },
      inventory: {
        catalog: [
          { key: "streak_shield", title: "Щит серии", description: "Защита серии.", type: "shield", rarity: "rare", effectKey: "streak_protection", effectValue: 1 },
          { key: "focus_booster", title: "Фокус-ускоритель", description: "Награда босса.", type: "booster", rarity: "epic", effectKey: "focus_bonus", effectValue: 1 },
          { key: "iron_frame", title: "Железная рамка", description: "Косметическая рамка.", type: "frame", rarity: "common", effectKey: null, effectValue: 0 }
        ],
        items: [
          {
            item: { key: "focus_booster", title: "Фокус-ускоритель", description: "Награда босса.", type: "booster", rarity: "epic", effectKey: "focus_bonus", effectValue: 1 },
            quantity: 1,
            acquiredAt: new Date().toISOString()
          }
        ]
      },
      season: {
        key: "awakening-2026-05",
        title: "Сезон пробуждения",
        description: "Демо-сезон для просмотра сезонного прогресса.",
        startsAt: current.boss?.startsAt ?? new Date().toISOString(),
        endsAt: current.boss?.endsAt ?? new Date().toISOString(),
        bossName: "Архонт инерции",
        rewardTitle: "Пробужденный охотник",
        questsCompleted: current.profile.completedQuestsCount,
        bossesDefeated: current.boss?.status === "completed" ? 1 : 0,
        xp: current.profile.totalXp,
        rewardClaimed: false
      },
      squad: null,
      admin: {
        usersCount: 128,
        activeQuestsToday: 342,
        completedQuestsToday: 219,
        templatesCount: 48,
        activeBossesCount: 91
      }
    };
  }

  function unlockSkillInDemo(current: SystemsOverview, key: string): SystemsOverview {
    return {
      ...current,
      skills: {
        ...current.skills,
        availablePoints: Math.max(0, current.skills.availablePoints - 1),
        spentPoints: current.skills.spentPoints + 1,
        nodes: current.skills.nodes.map((node) =>
          node.key === key ? { ...node, unlocked: true, unlockedAt: new Date().toISOString(), canUnlock: false } : node
        )
      }
    };
  }

  function demoSquad(name: string, code = "DEMO2026"): SystemsOverview["squad"] {
    return {
      id: "demo-squad",
      name: name.trim() || "Демо-отряд",
      code: code.trim().toUpperCase() || "DEMO2026",
      role: "owner",
      memberCount: 1,
      createdAt: new Date().toISOString()
    };
  }

  if (loading) {
    return <BootScreen label="СИСТЕМА ЗАГРУЖАЕТСЯ" />;
  }

  if (!dashboard) {
    return <BootScreen label="СИСТЕМА ЗАБЛОКИРОВАНА" message={error ?? "Не удалось загрузить профиль"} />;
  }

  const onboardingRequired = !demoMode && !dashboard.settings.onboardingCompleted;

  return (
    <div className="app-frame min-h-screen bg-system-bg text-system-text">
      <div className="system-backdrop fixed inset-0" />
      <div className="system-grid fixed inset-0 opacity-90" />
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-[414px] flex-col overflow-x-hidden px-3 pb-24 pt-3.5">
        <header className="system-topbar mb-4 flex items-center justify-between px-3 py-2.5">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-normal text-system-cyan">СИСТЕМА АКТИВНА</p>
            <h1 className="mt-0.5 font-mono text-xl font-black uppercase text-slate-50">System Hunter</h1>
          </div>
          <div className="grid size-10 place-items-center border border-system-cyan/40 bg-system-cyan/10 text-system-cyan shadow-cyan">
            <Sparkles size={18} />
          </div>
        </header>

        {error ? (
          <button
            className="mb-4 rounded-lg border border-system-danger/50 bg-system-danger/10 px-3 py-2 text-left text-sm text-red-100"
            onClick={() => setError(null)}
            type="button"
          >
            {error}
          </button>
        ) : null}

        {demoMode ? <DemoBanner /> : null}

        {onboardingRequired ? (
          <SettingsView
            busy={busyId === "settings"}
            mode="onboarding"
            settings={dashboard.settings}
            onBack={() => setView("dashboard")}
            onSave={(input) => onSaveSettings({ ...input, onboardingCompleted: true })}
          />
        ) : (
          <>
            {view === "dashboard" ? (
              <DashboardView
                dashboard={dashboard}
                completedToday={completedToday}
                activeQuest={inProgressQuest}
                onView={setView}
                demoMode={demoMode}
              />
            ) : null}
            {view === "quests" ? (
              <QuestsView
                quests={dashboard.todayQuests}
                customQuests={customQuests}
                customQuestProgress={customQuestProgress}
                customQuestsLoading={customQuestsLoading}
                busyId={busyId}
                onStartQuest={onStartQuest}
                onOpenActiveQuest={(quest) => {
                  setSelectedQuestId(quest.id);
                  setView("activeQuest");
                }}
                onSkipQuest={onSkipQuest}
                onReplaceQuest={onReplaceQuest}
                onDeleteTodayQuest={onDeleteTodayQuest}
                onGenerateQuest={onGenerateQuest}
                onCreateCustomQuest={onCreateCustomQuest}
                onUpdateCustomQuest={onUpdateCustomQuest}
                onToggleCustomQuest={onToggleCustomQuest}
                onDeleteCustomQuest={onDeleteCustomQuest}
              />
            ) : null}
            {view === "activeQuest" ? (
              <ActiveQuestView
                busy={selectedQuest ? busyId === selectedQuest.id : false}
                quest={selectedQuest?.status === "in_progress" ? selectedQuest : inProgressQuest}
                onBack={() => setView("quests")}
                onCancelQuest={onCancelQuest}
                onCompleteQuest={onCompleteQuest}
              />
            ) : null}
            {view === "stats" ? <StatsView dashboard={dashboard} /> : null}
            {view === "boss" ? <BossView dashboard={dashboard} onView={setView} /> : null}
            {view === "progress" ? (
              <ProgressView
                history={progressHistory}
                loading={progressLoading}
                onRefresh={() => void loadProgressHistory()}
                onView={setView}
              />
            ) : null}
            {view === "systems" ? (
              <SystemsView
                busyId={busyId}
                systems={systems}
                loading={systemsLoading}
                onCreateSquad={onCreateSquad}
                onJoinSquad={onJoinSquad}
                onRefresh={() => void loadSystemsOverview()}
                onUnlockSkill={onUnlockSkill}
              />
            ) : null}
            {view === "profile" ? <ProfileView dashboard={dashboard} onOpenSettings={() => setView("settings")} onView={setView} /> : null}
            {view === "settings" ? (
              <SettingsView
                busy={busyId === "settings"}
                mode="settings"
                settings={dashboard.settings}
                onBack={() => setView("profile")}
                onSave={onSaveSettings}
              />
            ) : null}
          </>
        )}
      </main>

      {onboardingRequired ? null : <nav className="nav-hud fixed inset-x-0 bottom-0 z-40 border-t px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
        <div className="mx-auto grid max-w-[414px] grid-cols-5 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                className={`nav-hud-button flex min-h-14 flex-col items-center justify-center text-[10px] font-semibold transition ${
                  active
                    ? "nav-hud-button-active text-system-cyan"
                    : "text-system-muted"
                }`}
                onClick={() => setView(item.id)}
                type="button"
              >
                <Icon size={18} />
                <span className="mt-1">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>}

      {modal ? <ResultModal modal={modal} onClose={() => setModal(null)} /> : null}
    </div>
  );
}

function BootScreen({ label, message }: { label: string; message?: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-system-bg px-6 text-center text-system-text">
      <div className="system-backdrop fixed inset-0" />
      <div className="system-grid fixed inset-0 opacity-90" />
      <div className="hud-panel hud-panel-glow relative w-full max-w-sm border border-system-border bg-system-card p-6">
        <div className="hud-title-frame mb-5">
          <p className="font-mono text-sm font-bold uppercase text-system-cyan">{label}</p>
        </div>
        <div className="mx-auto mt-5 h-2 w-44 overflow-hidden rounded bg-black/50">
          <div className="h-full w-2/3 animate-pulse rounded bg-gradient-to-r from-system-purple to-system-cyan" />
        </div>
        {message ? <p className="mt-5 text-sm text-system-muted">{message}</p> : null}
      </div>
    </div>
  );
}

function DemoBanner() {
  return (
    <Panel className="mb-4 border-system-warning/45 bg-system-warning/10">
      <div className="flex items-start gap-3">
        <Zap className="mt-0.5 text-system-warning" size={18} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-black uppercase text-system-warning">ДЕМО-РЕЖИМ</p>
          <p className="mt-1 text-sm text-system-muted">
            Данные не сохраняются. Настоящий профиль, награды и прогресс доступны только при открытии Mini App из Telegram-бота.
          </p>
          <a
            className="mt-3 inline-flex min-h-10 items-center border border-system-cyan/50 bg-system-cyan/10 px-3 py-2 font-mono text-xs font-bold uppercase text-system-cyan"
            href="https://t.me"
            rel="noreferrer"
            target="_blank"
          >
            Открыть через Telegram
          </a>
        </div>
      </div>
    </Panel>
  );
}

function DashboardView({
  dashboard,
  completedToday,
  activeQuest,
  onView,
  demoMode
}: {
  dashboard: DashboardSummary;
  completedToday: number;
  activeQuest: Quest | null;
  onView: (view: View) => void;
  demoMode: boolean;
}) {
  const { profile, boss } = dashboard;
  const fatigue = Math.max(0, 100 - profile.energy);
  const bossProgress = boss ? `${boss.progress}/${boss.target}` : "--";
  const nextQuest = dashboard.todayQuests.find((quest) => quest.status === "active");

  return (
    <div className="screen-enter space-y-4">
      <section className="status-terminal">
        <div className="hud-title-frame">
          <p className="font-mono text-lg font-black uppercase tracking-normal">СТАТУС</p>
        </div>

        <div className="status-identity grid grid-cols-[0.9fr_1.1fr] items-center gap-4 px-1">
          <div className="text-center">
            <p className="status-level-number">{profile.level}</p>
            <p className="status-label mt-1">УРОВЕНЬ</p>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="status-meta-line">
              <span className="status-label">ОХОТНИК</span>
              <span className="truncate text-slate-100">@{profile.username ?? "unknown"}</span>
            </div>
            <div className="status-meta-line">
              <span className="status-label">РАНГ</span>
              <span className="font-mono font-bold text-system-warning">{profile.rank}</span>
            </div>
            <div className="status-meta-line">
              <span className="status-label">ТИТУЛ</span>
              <span className="break-words font-semibold text-slate-100">{displayTitle(profile.currentTitle) === "Нет" ? displayClassName(profile.className) : displayTitle(profile.currentTitle)}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
          <VitalCell icon={<Shield size={17} />} label="HP" value={profile.hp} max={100} />
          <VitalCell icon={<Battery size={17} />} label="MP" value={profile.energy} max={100} />
          <div className="vital-cell flex flex-col items-center justify-center px-2 py-2 text-center">
            <Flame className="text-system-cyan" size={17} />
            <p className="status-label mt-1">УСТАЛОСТЬ</p>
            <p className="font-mono text-lg font-black text-slate-50">{fatigue}</p>
          </div>
        </div>

        <div className="mt-4 border border-system-cyan/20 bg-black/18 p-3">
          <div className="grid grid-cols-2 gap-2">
            {statusStats.map(({ key, icon: Icon }) => (
              <div className="status-stat" key={key}>
                <Icon className="status-stat-icon" size={18} />
                <div className="min-w-0">
                  <p className="font-mono text-[11px] font-bold uppercase text-system-muted">{STAT_LABELS_RU[key].short}</p>
                  <p className="truncate text-xs text-slate-200">{STAT_LABELS_RU[key].label}</p>
                </div>
                <p className="status-stat-value">{dashboard.stats[key]}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric label="Сегодня" value={`${completedToday}/${dashboard.todayQuests.length}`} />
          <Metric label="Босс" value={bossProgress} accent="text-system-warning" />
          <Metric label="Серия" value={`${profile.streak} дн.`} accent="text-system-success" />
        </div>

        <div className="mt-4">
          <div className="mb-2 flex justify-between font-mono text-xs text-system-muted">
            <span>XP</span>
            <span>{profile.xp} / {profile.xpToNextLevel}</span>
          </div>
          <ProgressBar value={profile.xp} max={profile.xpToNextLevel} />
        </div>
      </section>

      <Panel className={activeQuest ? "active-quest-glow border-system-cyan/55 bg-system-cyan/8" : "border-system-border"}>
        <p className="font-mono text-xs font-bold uppercase text-system-cyan">Активный квест</p>
        {activeQuest ? (
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-bold">{displayQuestTitle(activeQuest)}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-system-muted">{displayQuestDescription(activeQuest)}</p>
              <p className="mt-2 font-mono text-[10px] uppercase text-system-cyan">
                +{activeQuest.xpReward} XP / +{activeQuest.statRewardValue} {STAT_LABELS_RU[activeQuest.statRewardKey].short}
              </p>
            </div>
            <PrimaryButton onClick={() => onView("activeQuest")}>Открыть</PrimaryButton>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-sm text-system-muted">Нет активного квеста. Возьми один из дневного списка.</p>
            <PrimaryButton onClick={() => onView("quests")} variant="ghost">Выбрать</PrimaryButton>
          </div>
        )}
      </Panel>

      <Panel className="border-system-warning/35 bg-system-warning/8">
        <p className="font-mono text-xs font-bold uppercase text-system-muted">Следующее действие</p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">{nextQuest ? displayQuestTitle(nextQuest) : "Дневной протокол закрыт"}</h2>
            <p className="mt-1 text-sm text-system-muted">
              {nextQuest
                ? `${CATEGORY_LABELS_RU[nextQuest.category]} / ${DIFFICULTY_LABELS_RU[nextQuest.difficulty]} / +${nextQuest.xpReward} XP`
                : "Можно проверить босса или восстановиться до следующего дня."}
            </p>
          </div>
          <PrimaryButton onClick={() => onView(nextQuest ? "quests" : "boss")} variant="ghost">
            {nextQuest ? "Открыть" : "Босс"}
          </PrimaryButton>
        </div>
      </Panel>

      <Panel className="border-system-cyan/40 bg-system-cyan/8">
        <div className="flex items-start gap-3">
          <Zap className="mt-0.5 text-system-cyan" size={18} />
          <div>
            <p className="font-mono text-sm font-bold text-system-text">СИСТЕМНОЕ УВЕДОМЛЕНИЕ</p>
            <p className="mt-1 text-sm text-system-muted">
              {demoMode ? "Активен демо-доступ для внешнего просмотра. Реальные данные не используются." : "Дневной протокол синхронизирован."}
            </p>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-2">
        <PrimaryButton onClick={() => onView("quests")}>К квестам</PrimaryButton>
        <PrimaryButton onClick={() => onView("stats")} variant="ghost">Статы</PrimaryButton>
        <PrimaryButton onClick={() => onView("boss")} variant="ghost">Босс</PrimaryButton>
        <PrimaryButton onClick={() => onView("progress")} variant="ghost">История</PrimaryButton>
        <PrimaryButton onClick={() => onView("systems")} variant="ghost">Системы</PrimaryButton>
      </div>
    </div>
  );
}

function VitalCell({ icon, label, value, max }: { icon: ReactNode; label: string; value: number; max: number }) {
  return (
    <div className="vital-cell px-2 py-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-system-cyan">
        {icon}
        <span className="status-label">{label}</span>
      </div>
      <ProgressBar value={value} max={max} color={label === "HP" ? "success" : "cyan"} />
      <p className="mt-1 text-right font-mono text-[10px] text-system-muted">{value}/{max}</p>
    </div>
  );
}

function QuestsView({
  quests,
  customQuests,
  customQuestProgress,
  customQuestsLoading,
  busyId,
  onStartQuest,
  onOpenActiveQuest,
  onSkipQuest,
  onReplaceQuest,
  onDeleteTodayQuest,
  onGenerateQuest,
  onCreateCustomQuest,
  onUpdateCustomQuest,
  onToggleCustomQuest,
  onDeleteCustomQuest
}: {
  quests: Quest[];
  customQuests: CustomQuestTemplate[];
  customQuestProgress: CustomQuestProgress[];
  customQuestsLoading: boolean;
  busyId: string | null;
  onStartQuest: (quest: Quest) => void;
  onOpenActiveQuest: (quest: Quest) => void;
  onSkipQuest: (quest: Quest) => void;
  onReplaceQuest: (quest: Quest) => void;
  onDeleteTodayQuest: (quest: Quest) => void;
  onGenerateQuest: () => void;
  onCreateCustomQuest: (input: CustomQuestInput) => void;
  onUpdateCustomQuest: (id: string, input: Partial<CustomQuestInput>) => void;
  onToggleCustomQuest: (template: CustomQuestTemplate) => void;
  onDeleteCustomQuest: (template: CustomQuestTemplate) => void;
}) {
  const [formMode, setFormMode] = useState<"closed" | "create" | "edit">("closed");
  const [editingTemplate, setEditingTemplate] = useState<CustomQuestTemplate | null>(null);
  const progressByTemplate = new Map(customQuestProgress.map((item) => [item.template.id, item]));

  function startCreate() {
    setEditingTemplate(null);
    setFormMode("create");
  }

  function startEdit(template: CustomQuestTemplate) {
    setEditingTemplate(template);
    setFormMode("edit");
  }

  function closeForm() {
    setEditingTemplate(null);
    setFormMode("closed");
  }

  return (
    <div className="screen-enter space-y-3">
      <ScreenTitle title="Ежедневные квесты" icon={<ListChecks size={20} />} />
      <div className="grid grid-cols-2 gap-2">
        <PrimaryButton onClick={startCreate}>Создать квест</PrimaryButton>
        <PrimaryButton disabled={busyId === "generate"} onClick={onGenerateQuest} variant="ghost">
          Новый системный
        </PrimaryButton>
      </div>

      {formMode !== "closed" ? (
        <CustomQuestForm
          mode={formMode}
          template={editingTemplate}
          busy={busyId === "custom-create" || busyId === editingTemplate?.id}
          onCancel={closeForm}
          onSubmit={(input) => {
            if (editingTemplate) {
              onUpdateCustomQuest(editingTemplate.id, input);
            } else {
              onCreateCustomQuest(input);
            }
            closeForm();
          }}
        />
      ) : null}

      {quests.length === 0 ? (
        <Panel>
          <p className="font-bold">Квесты на сегодня не найдены.</p>
          <p className="mt-1 text-sm text-system-muted">Создай свой квест или сгенерируй системный.</p>
        </Panel>
      ) : null}

      {quests.map((quest, index) => (
        <Panel
          key={quest.id}
          className={`card-enter ${questPanelClass(quest.status)}`}
          style={{ "--card-delay": `${Math.min(index * 45, 240)}ms` } as CSSProperties}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black">{displayQuestTitle(quest)}</h2>
              <p className="mt-1 text-sm text-system-muted">{displayQuestDescription(quest)}</p>
            </div>
            <StatusPill status={quest.status} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric label="Сложность" value={DIFFICULTY_LABELS_RU[quest.difficulty]} accent={difficultyColor(quest.difficulty)} />
            <Metric label="Категория" value={CATEGORY_LABELS_RU[quest.category]} />
            <Metric label="Время" value={`${questEstimatedMinutes(quest)} мин.`} accent="text-system-cyan" />
            <Metric label="Награда" value={`+${quest.xpReward} XP`} accent="text-system-warning" />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="font-mono text-xs text-system-muted">+{quest.statRewardValue} {STAT_LABELS_RU[quest.statRewardKey].short}</p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-system-muted">{questReason(quest)}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {quest.status === "in_progress" ? (
              <PrimaryButton disabled={busyId === quest.id} onClick={() => onOpenActiveQuest(quest)}>
                Открыть
              </PrimaryButton>
            ) : (
              <PrimaryButton
                disabled={quest.status !== "active" || busyId === quest.id}
                onClick={() => onStartQuest(quest)}
              >
                {quest.status === "completed" ? "Выполнено" : quest.status === "skipped" ? "Пропущен" : "Взять квест"}
              </PrimaryButton>
            )}
            <PrimaryButton
              disabled={quest.status !== "active" || busyId === quest.id}
              onClick={() => onSkipQuest(quest)}
              variant="danger"
            >
              Пропустить
            </PrimaryButton>
            <PrimaryButton
              disabled={quest.status !== "active" || busyId === quest.id}
              onClick={() => onReplaceQuest(quest)}
              variant="ghost"
            >
              Заменить
            </PrimaryButton>
          </div>
          {quest.type === "custom" && (quest.status === "active" || quest.status === "skipped") ? (
            <PrimaryButton
              disabled={busyId === quest.id}
              onClick={() => onDeleteTodayQuest(quest)}
              variant="ghost"
            >
              Удалить только сегодня
            </PrimaryButton>
          ) : null}
        </Panel>
      ))}

      <Panel>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-bold uppercase text-system-cyan">Мои привычки</p>
            <p className="mt-1 text-sm text-system-muted">Шаблоны создают реальные квесты на нужные дни. История выполнений не удаляется.</p>
          </div>
          <span className="font-mono text-xs text-system-muted">{customQuestsLoading ? "Загрузка" : `${customQuests.length}`}</span>
        </div>
        <div className="space-y-2">
          {customQuests.length === 0 ? (
            <p className="text-sm text-system-muted">Пока нет пользовательских привычек. Создай первый квест и выбери повторение.</p>
          ) : (
            customQuests.map((template) => {
              const progress = progressByTemplate.get(template.id);
              return (
              <div key={template.id} className={`border px-3 py-3 ${template.isActive ? "border-system-cyan/35 bg-black/20" : "border-system-border bg-black/10 opacity-75"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold">{template.title}</h3>
                    <p className="mt-1 text-sm text-system-muted">{template.description || "Без описания"}</p>
                    <p className="mt-2 font-mono text-[10px] uppercase text-system-cyan">
                      {CATEGORY_LABELS_RU[template.category]} / {DIFFICULTY_LABELS_RU[template.difficulty]} / {recurrenceLabel(template)}
                    </p>
                    <p className="mt-1 text-xs text-system-muted">
                      +{template.xpReward} XP, +{template.statRewardValue} {STAT_LABELS_RU[template.statRewardKey].short}
                    </p>
                  </div>
                  <StatusBadge active={template.isActive} label={progress ? HABIT_HEALTH_LABELS_RU[progress.healthStatus] : undefined} />
                </div>
                {progress ? <HabitProgressPanel progress={progress} /> : null}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <PrimaryButton disabled={busyId === template.id} onClick={() => startEdit(template)} variant="ghost">Изменить</PrimaryButton>
                  <PrimaryButton disabled={busyId === template.id} onClick={() => onToggleCustomQuest(template)} variant="ghost">
                    {template.isActive ? "Отключить" : "Включить"}
                  </PrimaryButton>
                  <PrimaryButton disabled={busyId === template.id} onClick={() => onDeleteCustomQuest(template)} variant="danger">Удалить</PrimaryButton>
                </div>
              </div>
              );
            })
          )}
        </div>
      </Panel>
    </div>
  );
}

function ActiveQuestView({
  quest,
  busy,
  onCompleteQuest,
  onCancelQuest,
  onBack
}: {
  quest: Quest | null | undefined;
  busy: boolean;
  onCompleteQuest: (quest: Quest) => void;
  onCancelQuest: (quest: Quest) => void;
  onBack: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!quest?.startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [quest?.startedAt]);

  if (!quest) {
    return (
      <div className="screen-enter space-y-4">
        <ScreenTitle title="Активный квест" icon={<Zap size={20} />} />
        <Panel>
          <p className="font-bold">Активный квест не выбран.</p>
          <p className="mt-1 text-sm text-system-muted">Возьми квест из списка, чтобы начать выполнение.</p>
          <div className="mt-4">
            <PrimaryButton onClick={onBack}>К списку квестов</PrimaryButton>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="screen-enter space-y-4">
      <ScreenTitle title="Активный квест" icon={<Zap size={20} />} />
      <Panel glow className="active-quest-glow border-system-cyan/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs font-bold uppercase text-system-cyan">В процессе</p>
            <h2 className="mt-2 text-2xl font-black leading-tight">{displayQuestTitle(quest)}</h2>
            <p className="mt-3 text-sm leading-relaxed text-system-muted">{displayQuestDescription(quest)}</p>
          </div>
          <StatusPill status={quest.status} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Metric label="Категория" value={CATEGORY_LABELS_RU[quest.category]} />
          <Metric label="Сложность" value={DIFFICULTY_LABELS_RU[quest.difficulty]} accent={difficultyColor(quest.difficulty)} />
          <Metric label="XP" value={`+${quest.xpReward}`} accent="text-system-warning" />
          <Metric label={STAT_LABELS_RU[quest.statRewardKey].short} value={`+${quest.statRewardValue}`} accent="text-system-cyan" />
        </div>

        <div className="mt-4 border border-system-cyan/20 bg-black/20 p-3">
          <p className="font-mono text-[10px] uppercase text-system-muted">
            Начат: {quest.startedAt ? formatRuTime(quest.startedAt) : "нет данных"}
          </p>
          <p className="mt-1 font-mono text-lg font-black text-system-cyan">
            Выполняется: {quest.startedAt ? formatDuration(quest.startedAt, now) : "--"}
          </p>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-system-muted">{questReason(quest)}</p>
      </Panel>

      <div className="grid grid-cols-1 gap-2">
        <PrimaryButton disabled={busy} onClick={() => onCompleteQuest(quest)}>
          Завершить квест
        </PrimaryButton>
        <PrimaryButton disabled={busy} onClick={() => onCancelQuest(quest)} variant="danger">
          Отменить квест
        </PrimaryButton>
        <PrimaryButton disabled={busy} onClick={onBack} variant="ghost">
          Вернуться к списку
        </PrimaryButton>
      </div>
    </div>
  );
}

function CustomQuestForm({
  mode,
  template,
  busy,
  onCancel,
  onSubmit
}: {
  mode: "create" | "edit";
  template: CustomQuestTemplate | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: CustomQuestInput) => void;
}) {
  const [title, setTitle] = useState(template?.title ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [category, setCategory] = useState<Quest["category"]>(template?.category ?? "focus");
  const [difficulty, setDifficulty] = useState<Quest["difficulty"]>(template?.difficulty ?? "easy");
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(template?.recurrenceType ?? "daily");
  const [weekdays, setWeekdays] = useState<Weekday[]>(template?.weekdays ?? []);
  const [error, setError] = useState<string | null>(null);
  const rewards = customQuestRewards(category, difficulty);

  function toggleWeekday(day: Weekday) {
    setWeekdays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort());
  }

  function submit() {
    if (title.trim().length < 2) {
      setError("Название должно быть не короче 2 символов.");
      return;
    }
    if (recurrenceType === "weekdays" && weekdays.length === 0) {
      setError("Выбери хотя бы один день недели.");
      return;
    }

    setError(null);
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      category,
      difficulty,
      recurrenceType,
      weekdays: recurrenceType === "weekdays" ? weekdays : [],
      isActive: template?.isActive ?? true
    });
  }

  return (
    <Panel glow>
      <p className="font-mono text-xs font-bold uppercase text-system-cyan">
        {mode === "create" ? "Новый пользовательский квест" : "Редактирование привычки"}
      </p>
      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="font-mono text-[10px] uppercase text-system-muted">Название</span>
          <input className="mt-1 w-full border border-system-border bg-black/30 px-3 py-2 text-sm text-system-text outline-none focus-visible:border-system-cyan" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase text-system-muted">Описание</span>
          <textarea className="mt-1 min-h-20 w-full border border-system-border bg-black/30 px-3 py-2 text-sm text-system-text outline-none focus-visible:border-system-cyan" value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <SelectField label="Категория" value={category} onChange={(value) => setCategory(value as Quest["category"])}>
            {STAT_KEYS.map((key) => <option key={key} value={key}>{CATEGORY_LABELS_RU[key]}</option>)}
          </SelectField>
          <SelectField label="Сложность" value={difficulty} onChange={(value) => setDifficulty(value as Quest["difficulty"])}>
            {(["easy", "medium", "hard"] as const).map((key) => <option key={key} value={key}>{DIFFICULTY_LABELS_RU[key]}</option>)}
          </SelectField>
        </div>
        <SelectField label="Повторение" value={recurrenceType} onChange={(value) => setRecurrenceType(value as RecurrenceType)}>
          {(["once", "daily", "weekly", "weekdays"] as const).map((key) => <option key={key} value={key}>{RECURRENCE_LABELS_RU[key]}</option>)}
        </SelectField>
        {recurrenceType === "weekdays" ? (
          <div>
            <p className="font-mono text-[10px] uppercase text-system-muted">Дни недели</p>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {WEEKDAY_LABELS_RU.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleWeekday(day.value)}
                  className={`border px-1 py-2 text-xs font-bold ${weekdays.includes(day.value) ? "border-system-cyan bg-system-cyan/15 text-system-cyan" : "border-system-border bg-black/25 text-system-muted"}`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Metric label="XP" value={`+${rewards.xpReward}`} accent="text-system-warning" />
          <Metric label={STAT_LABELS_RU[rewards.statRewardKey].short} value={`+${rewards.statRewardValue}`} accent="text-system-cyan" />
        </div>
        {error ? <p className="text-sm text-system-danger">{error}</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <PrimaryButton disabled={busy} onClick={submit}>{mode === "create" ? "Создать" : "Сохранить"}</PrimaryButton>
          <PrimaryButton disabled={busy} onClick={onCancel} variant="ghost">Отмена</PrimaryButton>
        </div>
      </div>
    </Panel>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase text-system-muted">{label}</span>
      <select className="mt-1 w-full border border-system-border bg-black/30 px-3 py-2 text-sm text-system-text outline-none focus-visible:border-system-cyan" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function HabitProgressPanel({ progress }: { progress: CustomQuestProgress }) {
  const visibleDays = progress.calendar.slice(-21);
  return (
    <div className="mt-3 border border-system-border bg-black/20 p-3">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Серия" value={`${progress.currentStreak}`} accent={progress.healthStatus === "broken" ? "text-system-danger" : "text-system-success"} />
        <Metric label="Рекорд" value={`${progress.bestStreak}`} accent="text-system-cyan" />
        <Metric label="Точность" value={`${progress.completionRate}%`} accent="text-system-warning" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-system-muted">
        <span>Следующий день: {progress.nextDueDate ? formatRuDate(progress.nextDueDate) : "нет"}</span>
        <span>Пропуски: {progress.missedCount + progress.skippedCount}</span>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1" aria-label="Календарь привычки">
        {visibleDays.map((day) => (
          <div
            key={day.date}
            title={`${formatRuDate(day.date)} / ${habitDayStatusLabel(day.status)}`}
            className={`h-6 border ${habitDayClass(day.status)}`}
          />
        ))}
      </div>
      {progress.healthStatus === "broken" ? (
        <p className="mt-3 text-xs text-system-warning">Серия прервана. Выполни следующий экземпляр, чтобы начать восстановление ритма.</p>
      ) : null}
    </div>
  );
}

function StatusBadge({ active, label }: { active: boolean; label?: string }) {
  return (
    <span className={`shrink-0 border px-2 py-1 font-mono text-[10px] font-bold uppercase ${active ? "border-system-success/60 text-system-success" : "border-system-border text-system-muted"}`}>
      {label ?? (active ? "Активна" : "Откл.")}
    </span>
  );
}

function habitDayClass(status: HabitDayStatus) {
  const classes: Record<HabitDayStatus, string> = {
    completed: "border-system-success bg-system-success/50 shadow-[0_0_10px_rgba(34,197,94,0.35)]",
    skipped: "border-system-warning bg-system-warning/35",
    missed: "border-system-danger bg-system-danger/40",
    active: "border-system-cyan bg-system-cyan/35",
    scheduled: "border-system-border bg-black/30"
  };
  return classes[status];
}

function habitDayStatusLabel(status: HabitDayStatus) {
  const labels: Record<HabitDayStatus, string> = {
    completed: "выполнено",
    skipped: "пропущено",
    missed: "не выполнено",
    active: "активно сегодня",
    scheduled: "не запланировано"
  };
  return labels[status];
}

function StatsView({ dashboard }: { dashboard: DashboardSummary }) {
  const maxStat = Math.max(...STAT_KEYS.map((key) => dashboard.stats[key]), 30);

  return (
    <div className="screen-enter space-y-4">
      <ScreenTitle title="Характеристики" icon={<Gauge size={20} />} />
      <Panel glow>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Уровень" value={`${dashboard.profile.level}`} />
          <Metric label="Ранг" value={dashboard.profile.rank} accent="text-system-warning" />
          <Metric label="Класс" value={displayClassName(dashboard.profile.className)} />
          <Metric label="Всего XP" value={`${dashboard.profile.totalXp}`} accent="text-system-cyan" />
          <Metric label="Серия" value={`${dashboard.profile.streak} дн.`} accent="text-system-warning" />
          <Metric label="Выполнено" value={`${dashboard.profile.completedQuestsCount}`} accent="text-system-success" />
        </div>
      </Panel>
      {STAT_KEYS.map((key) => (
        <Panel key={key}>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="font-mono text-xs font-bold text-system-cyan">{STAT_LABELS_RU[key].short}</p>
              <h2 className="font-bold">{STAT_LABELS_RU[key].label}</h2>
            </div>
            <p className="font-mono text-lg font-black">{dashboard.stats[key]}</p>
          </div>
          <ProgressBar value={dashboard.stats[key]} max={maxStat} color={key === "focus" ? "cyan" : "purple"} />
        </Panel>
      ))}
    </div>
  );
}

function BossView({
  dashboard,
  onView
}: {
  dashboard: DashboardSummary;
  onView: (view: View) => void;
}) {
  const boss = dashboard.boss;
  const relatedQuests = dashboard.todayQuests.filter((quest) => quest.category === "focus");

  if (!boss) {
    return (
      <div className="screen-enter space-y-4">
        <ScreenTitle title="Босс недели" icon={<Swords size={20} />} />
        <Panel>Активный босс-квест не найден.</Panel>
      </div>
    );
  }

  return (
    <div className="screen-enter space-y-4">
      <ScreenTitle title="Босс недели" icon={<Swords size={20} />} />
      <section className="boss-card rounded-lg border border-system-purple/50 p-5 shadow-glow">
        <p className="font-mono text-xs font-bold uppercase text-system-cyan">Босс</p>
        <h2 className="mt-2 text-3xl font-black leading-tight">{displayBossText(boss.name)}</h2>
        <p className="mt-3 text-sm text-system-muted">{displayBossText(boss.description)}</p>
        <div className="mt-5">
          <div className="mb-2 flex justify-between font-mono text-xs text-system-muted">
            <span>Прогресс</span>
            <span>{boss.progress} / {boss.target}</span>
          </div>
          <ProgressBar value={boss.progress} max={boss.target} color="danger" />
        </div>
      </section>

      <Panel>
        <p className="font-mono text-xs font-bold uppercase text-system-muted">Цель</p>
        <p className="mt-2 text-lg font-bold">{displayBossText(boss.objective)}</p>
        <p className="mt-2 text-sm text-system-muted">
          Прогресс босса засчитывается автоматически только за выполненные focus-квесты этой недели. Пустая кнопка больше не дает прогресс.
        </p>
      </Panel>

      <Panel>
        <p className="font-mono text-xs font-bold uppercase text-system-muted">Связанные квесты</p>
        <div className="mt-3 space-y-2">
          {relatedQuests.length === 0 ? (
            <p className="text-sm text-system-muted">Сегодня focus-квестов нет. Создай новый квест или дождись дневного протокола.</p>
          ) : (
            relatedQuests.map((quest) => (
              <div key={quest.id} className="flex items-center justify-between gap-3 border border-system-border bg-black/20 px-3 py-2">
                <span className="min-w-0 truncate text-sm">{displayQuestTitle(quest)}</span>
                <StatusPill status={quest.status} />
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel>
        <p className="font-mono text-xs font-bold uppercase text-system-muted">Награда</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="XP" value={`+${boss.xpReward}`} accent="text-system-warning" />
          <Metric label={STAT_LABELS_RU[boss.statRewardKey].short} value={`+${boss.statRewardValue}`} />
          <Metric label="Титул" value={displayTitle("Focus Hunter")} accent="text-system-success" />
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-2">
        <PrimaryButton onClick={() => onView("quests")}>
          К focus-квестам
        </PrimaryButton>
        <PrimaryButton onClick={() => onView("dashboard")} variant="ghost">Назад</PrimaryButton>
      </div>
    </div>
  );
}

function SettingsView({
  settings,
  busy,
  mode,
  onSave,
  onBack
}: {
  settings: UserSettings;
  busy: boolean;
  mode: "onboarding" | "settings";
  onSave: (input: Partial<UserSettings>) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState({
    primaryGoal: settings.primaryGoal,
    desiredDifficulty: settings.desiredDifficulty,
    questsPerDay: settings.questsPerDay,
    wakeTime: settings.wakeTime ?? "07:30",
    sleepTime: settings.sleepTime ?? "23:30",
    allowPhysicalQuests: settings.allowPhysicalQuests,
    preferredCategories: settings.preferredCategories
  });

  function toggleCategory(category: Quest["category"]) {
    setDraft((current) => {
      const exists = current.preferredCategories.includes(category);
      return {
        ...current,
        preferredCategories: exists
          ? current.preferredCategories.filter((item) => item !== category)
          : [...current.preferredCategories, category]
      };
    });
  }

  return (
    <form
      className="screen-enter space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <ScreenTitle
        title={mode === "onboarding" ? "Первичная настройка" : "Настройки"}
        icon={<User size={20} />}
      />

      <Panel glow>
        <p className="font-mono text-xs font-bold uppercase text-system-cyan">Цель охотника</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(Object.keys(GOAL_LABELS_RU) as UserSettings["primaryGoal"][]).map((goal) => (
            <button
              className={`hud-button min-h-11 border px-3 py-2 text-sm ${
                draft.primaryGoal === goal
                  ? "border-system-cyan/70 bg-system-cyan/15 text-system-cyan"
                  : "border-system-border bg-white/5 text-system-muted"
              }`}
              key={goal}
              onClick={() => setDraft((current) => ({ ...current, primaryGoal: goal }))}
              type="button"
            >
              {GOAL_LABELS_RU[goal]}
            </button>
          ))}
        </div>
      </Panel>

      <Panel>
        <p className="font-mono text-xs font-bold uppercase text-system-muted">Сложность и объем</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["easy", "medium", "hard"] as Quest["difficulty"][]).map((difficulty) => (
            <button
              className={`hud-button min-h-11 border px-2 py-2 text-xs ${
                draft.desiredDifficulty === difficulty
                  ? "border-system-purple/70 bg-system-purple/30 text-white"
                  : "border-system-border bg-white/5 text-system-muted"
              }`}
              key={difficulty}
              onClick={() => setDraft((current) => ({ ...current, desiredDifficulty: difficulty }))}
              type="button"
            >
              {DIFFICULTY_LABELS_RU[difficulty]}
            </button>
          ))}
        </div>
        <label className="mt-4 block text-sm text-system-muted">
          Квестов в день: <span className="font-mono text-system-text">{draft.questsPerDay}</span>
          <input
            className="mt-2 w-full accent-system-cyan"
            max={7}
            min={1}
            onChange={(event) => setDraft((current) => ({ ...current, questsPerDay: Number(event.target.value) }))}
            type="range"
            value={draft.questsPerDay}
          />
        </label>
      </Panel>

      <Panel>
        <p className="font-mono text-xs font-bold uppercase text-system-muted">Ритм дня</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-sm text-system-muted">
            Подъем
            <input
              className="mt-1 w-full border border-system-border bg-black/30 px-3 py-2 text-system-text outline-none focus-visible:border-system-cyan"
              onChange={(event) => setDraft((current) => ({ ...current, wakeTime: event.target.value }))}
              type="time"
              value={draft.wakeTime}
            />
          </label>
          <label className="text-sm text-system-muted">
            Сон
            <input
              className="mt-1 w-full border border-system-border bg-black/30 px-3 py-2 text-system-text outline-none focus-visible:border-system-cyan"
              onChange={(event) => setDraft((current) => ({ ...current, sleepTime: event.target.value }))}
              type="time"
              value={draft.sleepTime}
            />
          </label>
        </div>
      </Panel>

      <Panel>
        <label className="flex items-start gap-3 text-sm text-system-muted">
          <input
            checked={draft.allowPhysicalQuests}
            className="mt-1 accent-system-cyan"
            onChange={(event) => setDraft((current) => ({ ...current, allowPhysicalQuests: event.target.checked }))}
            type="checkbox"
          />
          <span>
            Включать физические квесты
            <span className="mt-1 block text-xs text-system-muted">Если выключить, система не будет выдавать strength-квесты.</span>
          </span>
        </label>

        <p className="mt-4 font-mono text-xs font-bold uppercase text-system-muted">Предпочитаемые категории</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {STAT_KEYS.map((category) => (
            <button
              className={`hud-button min-h-10 border px-2 py-2 text-xs ${
                draft.preferredCategories.includes(category)
                  ? "border-system-cyan/70 bg-system-cyan/15 text-system-cyan"
                  : "border-system-border bg-white/5 text-system-muted"
              }`}
              key={category}
              onClick={() => toggleCategory(category)}
              type="button"
            >
              {CATEGORY_LABELS_RU[category]}
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-2">
        <PrimaryButton disabled={busy} type="submit">Сохранить</PrimaryButton>
        <PrimaryButton disabled={mode === "onboarding"} onClick={onBack} variant="ghost">Назад</PrimaryButton>
      </div>
    </form>
  );
}

function ProgressView({
  history,
  loading,
  onRefresh,
  onView
}: {
  history: ProgressHistory | null;
  loading: boolean;
  onRefresh: () => void;
  onView: (view: View) => void;
}) {
  if (loading || !history) {
    return (
      <div className="screen-enter space-y-4">
        <ScreenTitle title="История прогресса" icon={<CalendarDays size={20} />} />
        <Panel glow>
          <p className="font-mono text-sm font-bold uppercase text-system-cyan">СИНХРОНИЗАЦИЯ</p>
          <p className="mt-2 text-sm text-system-muted">Система собирает историю квестов, недельный отчет и коллекцию достижений.</p>
        </Panel>
      </div>
    );
  }

  const activeDays = history.calendar.filter((day) => day.total > 0).length;
  const perfectDays = history.calendar.filter((day) => day.total > 0 && day.completed === day.total).length;

  return (
    <div className="screen-enter space-y-4">
      <ScreenTitle title="История прогресса" icon={<CalendarDays size={20} />} />

      <Panel glow>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-bold uppercase text-system-cyan">Недельный отчет</p>
            <h2 className="mt-1 text-lg font-black">
              {formatRuDate(history.weeklyRecap.startsAt)} - {formatRuDate(history.weeklyRecap.endsAt)}
            </h2>
          </div>
          <PrimaryButton onClick={onRefresh} variant="ghost">Обновить</PrimaryButton>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Metric label="Выполнено" value={`${history.weeklyRecap.completed}`} accent="text-system-success" />
          <Metric label="Потери" value={`${history.weeklyRecap.skipped + history.weeklyRecap.replaced}`} accent="text-system-danger" />
          <Metric label="XP недели" value={`${history.weeklyRecap.xp}`} accent="text-system-warning" />
          <Metric label="Активных дней" value={`${activeDays}/30`} accent="text-system-cyan" />
          <Metric
            label="Сильная зона"
            value={history.weeklyRecap.strongestCategory ? CATEGORY_LABELS_RU[history.weeklyRecap.strongestCategory] : "Нет данных"}
          />
          <Metric
            label="Риск недели"
            value={history.weeklyRecap.weakestCategory ? CATEGORY_LABELS_RU[history.weeklyRecap.weakestCategory] : "Нет данных"}
            accent={history.weeklyRecap.weakestCategory ? "text-system-warning" : "text-system-muted"}
          />
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-bold uppercase text-system-muted">Календарь 30 дней</p>
            <p className="mt-1 text-sm text-system-muted">Идеальных дней: {perfectDays}</p>
          </div>
          <PrimaryButton onClick={() => onView("quests")} variant="ghost">Квесты</PrimaryButton>
        </div>
        <div className="mt-4 grid grid-cols-10 gap-1.5">
          {history.calendar.map((day) => (
            <div
              aria-label={`${formatRuDate(day.date)}: выполнено ${day.completed} из ${day.total}`}
              className={`h-7 border ${calendarCellClass(day)}`}
              key={day.date}
              role="img"
              title={`${formatRuDate(day.date)}: ${day.completed}/${day.total}, XP ${day.xp}`}
            />
          ))}
        </div>
      </Panel>

      <Panel>
        <p className="font-mono text-xs font-bold uppercase text-system-muted">Последние действия</p>
        <div className="mt-3 space-y-2">
          {history.recentQuests.length === 0 ? (
            <p className="text-sm text-system-muted">История квестов пока пуста.</p>
          ) : (
            history.recentQuests.slice(0, 8).map((quest) => (
              <div key={quest.id} className="flex items-center justify-between gap-3 border border-system-border bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{displayQuestTitle(quest)}</p>
                  <p className="mt-0.5 text-xs text-system-muted">
                    {formatRuDate(quest.dueDate)} / {CATEGORY_LABELS_RU[quest.category]} / +{quest.xpReward} XP
                  </p>
                </div>
                <StatusPill status={quest.status} />
              </div>
            ))
          )}
        </div>
      </Panel>

      <ScreenTitle title="Коллекция достижений" icon={<Trophy size={20} />} compact />
      <div className="space-y-3">
        {history.achievementCollection.map((achievement) => {
          const translated = displayAchievement(achievement);
          return (
            <Panel
              key={achievement.key}
              className={achievement.unlocked ? rarityBorderClass(achievement.rarity) : "border-system-border opacity-80"}
            >
              <div className="flex items-start gap-3">
                <div className={`grid size-10 shrink-0 place-items-center border ${achievement.unlocked ? "border-system-warning/40 bg-system-warning/10 text-system-warning" : "border-system-border bg-white/5 text-system-muted"}`}>
                  <Trophy size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{translated.title}</h3>
                    <span className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${rarityPillClass(achievement.rarity)}`}>
                      {RARITY_LABELS_RU[achievement.rarity]}
                    </span>
                    {!achievement.unlocked ? (
                      <span className="border border-system-border bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase text-system-muted">
                        Закрыто
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-system-muted">{translated.description}</p>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between font-mono text-[11px] text-system-muted">
                      <span>Прогресс</span>
                      <span>{achievement.progress} / {achievement.target}</span>
                    </div>
                    <ProgressBar value={achievement.progress} max={achievement.target} color={rarityProgressColor(achievement.rarity)} />
                  </div>
                  {achievement.unlockedAt ? (
                    <p className="mt-2 text-xs text-system-success">Открыто: {formatRuDate(achievement.unlockedAt)}</p>
                  ) : null}
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function SystemsView({
  systems,
  loading,
  busyId,
  onRefresh,
  onUnlockSkill,
  onCreateSquad,
  onJoinSquad
}: {
  systems: SystemsOverview | null;
  loading: boolean;
  busyId: string | null;
  onRefresh: () => void;
  onUnlockSkill: (key: string) => void;
  onCreateSquad: (name: string) => void;
  onJoinSquad: (code: string) => void;
}) {
  const [squadName, setSquadName] = useState("Мой отряд");
  const [squadCode, setSquadCode] = useState("");

  if (loading || !systems) {
    return (
      <div className="screen-enter space-y-4">
        <ScreenTitle title="Системы" icon={<Package size={20} />} />
        <Panel glow>
          <p className="font-mono text-sm font-bold uppercase text-system-cyan">МОДУЛИ ЗАГРУЖАЮТСЯ</p>
          <p className="mt-2 text-sm text-system-muted">Система проверяет дерево навыков, инвентарь, сезон и отряд.</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="screen-enter space-y-4">
      <ScreenTitle title="Системы" icon={<Package size={20} />} />

      <Panel glow>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-bold uppercase text-system-cyan">Дерево навыков</p>
            <h2 className="mt-1 text-lg font-black">{systems.skills.availablePoints} очк. доступно</h2>
            <p className="mt-1 text-sm text-system-muted">
              Всего: {systems.skills.totalPoints}, потрачено: {systems.skills.spentPoints}
            </p>
          </div>
          <PrimaryButton onClick={onRefresh} variant="ghost">Обновить</PrimaryButton>
        </div>
        <div className="mt-4 space-y-2">
          {systems.skills.nodes.map((node) => (
            <div key={node.key} className={`border px-3 py-3 ${node.unlocked ? "border-system-success/45 bg-system-success/10" : "border-system-border bg-black/20"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-bold uppercase text-system-muted">
                    {STAT_LABELS_RU[node.statKey].short} / Ур. {node.tier} / {node.cost} ОН
                  </p>
                  <h3 className="mt-1 font-bold">{displaySkillTitle(node.title)}</h3>
                  <p className="mt-1 text-sm text-system-muted">{node.description}</p>
                  <p className="mt-1 text-xs text-system-cyan">{node.bonusText}</p>
                </div>
                <PrimaryButton disabled={!node.canUnlock || busyId === node.key} onClick={() => onUnlockSkill(node.key)} variant={node.unlocked ? "ghost" : "primary"}>
                  {node.unlocked ? "Открыт" : "Открыть"}
                </PrimaryButton>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <p className="font-mono text-xs font-bold uppercase text-system-muted">Инвентарь и награды</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {systems.inventory.catalog.map((item) => {
            const owned = systems.inventory.items.find((entry) => entry.item.key === item.key);
            return (
              <div className={`border px-3 py-3 ${owned ? rarityBorderClass(item.rarity) : "border-system-border opacity-70"}`} key={item.key}>
                <p className={`font-mono text-[10px] uppercase ${owned ? "text-system-warning" : "text-system-muted"}`}>
                  {RARITY_LABELS_RU[item.rarity]} / {item.type}
                </p>
                <h3 className="mt-1 text-sm font-bold">{item.title}</h3>
                <p className="mt-1 text-xs text-system-muted">{item.description}</p>
                <p className="mt-2 font-mono text-xs text-system-cyan">x{owned?.quantity ?? 0}</p>
              </div>
            );
          })}
        </div>
      </Panel>

      {systems.season ? (
        <Panel className="border-system-warning/40 bg-system-warning/8">
          <p className="font-mono text-xs font-bold uppercase text-system-muted">Сезон</p>
          <h2 className="mt-1 text-lg font-black">{systems.season.title}</h2>
          <p className="mt-1 text-sm text-system-muted">{systems.season.description}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric label="Квесты" value={`${systems.season.questsCompleted}`} accent="text-system-success" />
            <Metric label="Боссы" value={`${systems.season.bossesDefeated}`} accent="text-system-danger" />
            <Metric label="Сезон XP" value={`${systems.season.xp}`} accent="text-system-warning" />
            <Metric label="Награда" value={systems.season.rewardTitle} />
          </div>
        </Panel>
      ) : null}

      <Panel>
        <p className="font-mono text-xs font-bold uppercase text-system-muted">Отряд</p>
        {systems.squad ? (
          <div className="mt-2">
            <h2 className="text-lg font-black">{systems.squad.name}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Metric label="Код" value={systems.squad.code} accent="text-system-cyan" />
              <Metric label="Участники" value={`${systems.squad.memberCount}`} />
              <Metric label="Роль" value={systems.squad.role === "owner" ? "Лидер" : "Участник"} />
              <Metric label="Создан" value={formatRuDate(systems.squad.createdAt)} />
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <label className="block text-sm text-system-muted">
              Название отряда
              <input
                className="mt-1 w-full border border-system-border bg-black/30 px-3 py-2 text-system-text outline-none focus-visible:border-system-cyan"
                onChange={(event) => setSquadName(event.target.value)}
                value={squadName}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <PrimaryButton disabled={busyId === "squad"} onClick={() => onCreateSquad(squadName)}>Создать</PrimaryButton>
              <PrimaryButton disabled={busyId === "squad" || !squadCode.trim()} onClick={() => onJoinSquad(squadCode)} variant="ghost">Вступить</PrimaryButton>
            </div>
            <input
              className="w-full border border-system-border bg-black/30 px-3 py-2 text-system-text outline-none focus-visible:border-system-cyan"
              onChange={(event) => setSquadCode(event.target.value)}
              placeholder="Код отряда"
              value={squadCode}
            />
          </div>
        )}
      </Panel>

      {systems.admin ? (
        <Panel className="border-system-danger/40 bg-system-danger/8">
          <p className="font-mono text-xs font-bold uppercase text-system-danger">Админ-сводка</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Metric label="Пользователи" value={`${systems.admin.usersCount}`} />
            <Metric label="Активные сегодня" value={`${systems.admin.activeQuestsToday}`} />
            <Metric label="Закрыто сегодня" value={`${systems.admin.completedQuestsToday}`} accent="text-system-success" />
            <Metric label="Шаблоны" value={`${systems.admin.templatesCount}`} />
            <Metric label="Активные боссы" value={`${systems.admin.activeBossesCount}`} accent="text-system-danger" />
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function ProfileView({
  dashboard,
  onOpenSettings,
  onView
}: {
  dashboard: DashboardSummary;
  onOpenSettings: () => void;
  onView: (view: View) => void;
}) {
  return (
    <div className="screen-enter space-y-4">
      <ScreenTitle title="Профиль" icon={<User size={20} />} />
      <Panel glow>
        <div className="flex items-center gap-4">
          <div className="grid size-16 place-items-center rounded-lg border border-system-cyan/40 bg-system-cyan/10 text-2xl font-black text-system-cyan">
            {dashboard.profile.username?.slice(0, 1).toUpperCase() ?? "H"}
          </div>
          <div>
            <h2 className="text-xl font-black">@{dashboard.profile.username ?? "неизвестно"}</h2>
            <p className="mt-1 text-sm text-system-muted">Создан {formatRuDate(dashboard.profile.createdAt)}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Metric label="Уровень" value={`${dashboard.profile.level}`} />
          <Metric label="Ранг" value={dashboard.profile.rank} accent="text-system-warning" />
          <Metric label="Класс" value={displayClassName(dashboard.profile.className)} />
          <Metric label="Титул" value={displayTitle(dashboard.profile.currentTitle)} accent="text-system-success" />
          <Metric label="Серия" value={`${dashboard.profile.streak} дн.`} />
          <Metric label="Квесты" value={`${dashboard.profile.completedQuestsCount}`} />
        </div>
      </Panel>

      <Panel>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-bold uppercase text-system-muted">Настройки системы</p>
            <h2 className="mt-1 font-bold">{GOAL_LABELS_RU[dashboard.settings.primaryGoal]} / {DIFFICULTY_LABELS_RU[dashboard.settings.desiredDifficulty]}</h2>
            <p className="mt-1 text-sm text-system-muted">
              {dashboard.settings.questsPerDay} квестов в день, физические: {dashboard.settings.allowPhysicalQuests ? "включены" : "отключены"}
            </p>
          </div>
          <PrimaryButton onClick={onOpenSettings} variant="ghost">Изменить</PrimaryButton>
        </div>
      </Panel>

      <Panel className="border-system-cyan/35 bg-system-cyan/8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-bold uppercase text-system-muted">Журнал прогресса</p>
            <h2 className="mt-1 font-bold">История, календарь и закрытые достижения</h2>
            <p className="mt-1 text-sm text-system-muted">Проверь динамику недели, последние действия и путь до следующих наград.</p>
          </div>
          <PrimaryButton onClick={() => onView("progress")} variant="ghost">Открыть</PrimaryButton>
        </div>
      </Panel>

      <Panel className="border-system-purple/35 bg-system-purple/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-bold uppercase text-system-muted">Расширенные системы</p>
            <h2 className="mt-1 font-bold">Навыки, инвентарь, сезон и отряд</h2>
            <p className="mt-1 text-sm text-system-muted">Все новые RPG-модули собраны в одном системном терминале.</p>
          </div>
          <PrimaryButton onClick={() => onView("systems")} variant="ghost">Открыть</PrimaryButton>
        </div>
      </Panel>

      <ScreenTitle title="Достижения" icon={<Trophy size={20} />} compact />
      <div className="space-y-3">
        {dashboard.achievements.length === 0 ? (
          <Panel>
            <p className="text-sm text-system-muted">Достижения пока не открыты.</p>
          </Panel>
        ) : (
          dashboard.achievements.map((achievement) => {
            const translated = displayAchievement(achievement);
            return (
              <Panel key={achievement.id} className="border-system-warning/40">
                <div className="flex items-start gap-3">
                  <div className="grid size-10 place-items-center rounded-md border border-system-warning/40 bg-system-warning/10 text-system-warning">
                    <Trophy size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold">{translated.title}</h3>
                    <p className="mt-1 text-sm text-system-muted">{translated.description}</p>
                  </div>
                </div>
              </Panel>
            );
          })
        )}
      </div>
    </div>
  );
}

function ResultModal({ modal, onClose }: { modal: NonNullable<AppModal>; onClose: () => void }) {
  if (modal.type === "quest") {
    return (
      <Modal title={modal.result.levelUp.leveledUp ? "Уровень повышен" : "Квест выполнен"} onClose={onClose}>
        <div className="space-y-3">
          <p className="text-system-text">{displayQuestTitle(modal.result.quest)}</p>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="XP" value={`+${modal.result.rewards.xp}`} accent="text-system-warning" />
            <Metric
              label={STAT_LABELS_RU[modal.result.rewards.statKey].short}
              value={`+${modal.result.rewards.statValue}`}
              accent="text-system-cyan"
            />
          </div>
          {modal.result.levelUp.leveledUp ? (
            <p className="rounded-md border border-system-cyan/40 bg-system-cyan/10 p-3 font-mono text-system-cyan">
              Уровень {modal.result.levelUp.from} -&gt; {modal.result.levelUp.to}
            </p>
          ) : null}
          {modal.result.bossProgress?.progressed ? (
            <p className="rounded-md border border-system-danger/40 bg-system-danger/10 p-3 font-mono text-system-danger">
              Босс: {modal.result.bossProgress.boss.progress} / {modal.result.bossProgress.boss.target}
            </p>
          ) : null}
        </div>
      </Modal>
    );
  }

  if (modal.type === "boss") {
    return (
      <Modal title="Босс повержен" onClose={onClose}>
        <div className="space-y-3">
          <p className="text-system-text">{displayBossText(modal.result.boss.name)}</p>
          <Metric label="Награда" value={`+${modal.result.boss.xpReward} XP`} accent="text-system-warning" />
          <p className="rounded-md border border-system-success/40 bg-system-success/10 p-3 font-mono text-system-success">
            Титул открыт: {displayTitle("Focus Hunter")}
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={modal.title} onClose={onClose}>
      <p>{modal.body}</p>
    </Modal>
  );
}

function ScreenTitle({ title, icon, compact = false }: { title: string; icon: ReactNode; compact?: boolean }) {
  return (
    <div className={`system-topbar flex items-center gap-2 px-3 py-2 ${compact ? "pt-2" : ""}`}>
      <div className="grid size-8 place-items-center border border-system-cyan/40 bg-system-cyan/10 text-system-cyan">
        {icon}
      </div>
      <h2 className="font-mono text-base font-black uppercase text-slate-50">{title}</h2>
    </div>
  );
}

function StatusPill({ status }: { status: Quest["status"] }) {
  const className =
    status === "completed"
      ? "border-system-success/50 bg-system-success/10 text-system-success"
      : status === "skipped"
        ? "border-system-danger/50 bg-system-danger/10 text-system-danger"
        : status === "in_progress"
          ? "border-system-warning/60 bg-system-warning/10 text-system-warning"
        : "border-system-cyan/50 bg-system-cyan/10 text-system-cyan";

  return (
    <span className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[11px] font-bold uppercase ${className}`}>
      {STATUS_LABELS_RU[status]}
    </span>
  );
}

function questPanelClass(status: Quest["status"]) {
  if (status === "completed") return "border-system-success/45";
  if (status === "skipped") return "border-system-danger/40 opacity-75";
  if (status === "in_progress") return "active-quest-glow border-system-warning/55";
  return "";
}

function difficultyColor(difficulty: Quest["difficulty"]) {
  if (difficulty === "hard") return "text-system-danger";
  if (difficulty === "medium") return "text-system-warning";
  return "text-system-success";
}

function calendarCellClass(day: ProgressHistory["calendar"][number]) {
  if (day.total === 0) return "border-system-border bg-white/5";
  if (day.completed === day.total) return "border-system-success/60 bg-system-success/35 shadow-cyan";
  if (day.completed > 0) return "border-system-cyan/55 bg-system-cyan/25";
  if (day.skipped > 0 || day.replaced > 0) return "border-system-danger/55 bg-system-danger/25";
  return "border-system-border bg-white/10";
}

function rarityProgressColor(rarity: ProgressHistory["achievementCollection"][number]["rarity"]): "success" | "warning" | "danger" | "cyan" {
  if (rarity === "legendary") return "danger";
  if (rarity === "epic") return "warning";
  if (rarity === "rare") return "cyan";
  return "success";
}

function rarityBorderClass(rarity: ProgressHistory["achievementCollection"][number]["rarity"]) {
  if (rarity === "legendary") return "border-system-danger/50";
  if (rarity === "epic") return "border-system-warning/50";
  if (rarity === "rare") return "border-system-cyan/45";
  return "border-system-success/40";
}

function rarityPillClass(rarity: ProgressHistory["achievementCollection"][number]["rarity"]) {
  if (rarity === "legendary") return "border-system-danger/50 bg-system-danger/10 text-system-danger";
  if (rarity === "epic") return "border-system-warning/50 bg-system-warning/10 text-system-warning";
  if (rarity === "rare") return "border-system-cyan/50 bg-system-cyan/10 text-system-cyan";
  return "border-system-success/50 bg-system-success/10 text-system-success";
}
