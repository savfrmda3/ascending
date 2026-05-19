import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  Battery,
  Brain,
  Crosshair,
  Dumbbell,
  Flame,
  Gauge,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
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
  xpToNextLevel,
  type BossProgressResult,
  type DashboardSummary,
  type Quest,
  type QuestCompletionResult,
  type StatKey
} from "@system-hunter/shared";
import { Modal, Panel, PrimaryButton, ProgressBar, Metric } from "./components/ui.js";
import { authenticateTelegram, completeQuest, generateQuest, getDashboard, progressBoss } from "./lib/api.js";
import { demoDashboard } from "./lib/demo.js";

type View = "dashboard" | "quests" | "stats" | "boss" | "profile";
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

const STATUS_LABELS_RU: Record<Quest["status"], string> = {
  active: "Активен",
  completed: "Выполнен",
  skipped: "Пропущен"
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
  discipline_initiate: { title: "Адепт дисциплины", description: "Выполни 10 квестов дисциплины." }
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

function displayBossText(text: string) {
  return translateKnownText(text, BOSS_TEXT_RU);
}

function displayAchievement(achievement: DashboardSummary["achievements"][number]) {
  return ACHIEVEMENT_TEXT_RU[achievement.key] ?? {
    title: achievement.title,
    description: achievement.description
  };
}

function formatRuDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

function isDemoPreviewRequested() {
  const url = new URL(window.location.href);
  const mode = url.searchParams.get("mode")?.toLowerCase();
  const preview = url.searchParams.get("preview")?.toLowerCase();
  const demo = url.searchParams.get("demo")?.toLowerCase();

  return (
    import.meta.env.DEV ||
    url.pathname === "/preview" ||
    url.pathname === "/demo" ||
    mode === "demo" ||
    preview === "1" ||
    preview === "true" ||
    preview === "chatgpt" ||
    demo === "1" ||
    demo === "true"
  );
}

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [modal, setModal] = useState<AppModal>(null);

  useEffect(() => {
    async function boot() {
      try {
        const initData = window.Telegram?.WebApp?.initData;
        if (!initData) {
          if (isDemoPreviewRequested()) {
            setDemoMode(true);
            setDashboard(demoDashboard);
            return;
          }

          throw new Error("Нет данных авторизации Telegram. Открой System Hunter из бота.");
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

  const completedToday = useMemo(
    () => dashboard?.todayQuests.filter((quest) => quest.status === "completed").length ?? 0,
    [dashboard]
  );

  async function refresh() {
    if (demoMode) return;
    setDashboard(await getDashboard());
  }

  async function onCompleteQuest(quest: Quest) {
    setBusyId(quest.id);
    try {
      if (demoMode) {
        const result = completeQuestInDemo(quest);
        setModal({ type: "quest", result });
        return;
      }

      const result = await completeQuest(quest.id);
      setModal({ type: "quest", result });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось завершить квест");
    } finally {
      setBusyId(null);
    }
  }

  async function onGenerateQuest() {
    setBusyId("generate");
    try {
      if (demoMode) {
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
      setError(caught instanceof Error ? caught.message : "Не удалось создать квест");
    } finally {
      setBusyId(null);
    }
  }

  async function onBossStep() {
    if (!dashboard?.boss) return;
    setBusyId(dashboard.boss.id);
    try {
      if (demoMode) {
        const result = progressBossInDemo();
        if (result) setModal(result.victory ? { type: "boss", result } : { type: "notice", title: "ПРОГРЕСС БОССА", body: "Шаг босса засчитан." });
        return;
      }

      const result = await progressBoss(dashboard.boss.id);
      setModal(result.victory ? { type: "boss", result } : { type: "notice", title: "ПРОГРЕСС БОССА", body: "Шаг босса засчитан." });
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("medium");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось обновить прогресс босса");
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
      todayQuests: current.todayQuests.map((item) => (item.id === quest.id ? updatedQuest : item))
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
      unlockedAchievements: []
    };
  }

  function progressBossInDemo(): BossProgressResult | null {
    const current = dashboard ?? demoDashboard;
    if (!current.boss) return null;
    const nextProgress = Math.min(current.boss.progress + 1, current.boss.target);
    const victory = nextProgress >= current.boss.target;
    const boss = {
      ...current.boss,
      progress: nextProgress,
      status: victory ? ("completed" as const) : current.boss.status,
      completedAt: victory ? new Date().toISOString() : current.boss.completedAt
    };
    const nextDashboard = {
      ...current,
      boss
    };
    setDashboard(nextDashboard);

    return {
      boss,
      profile: nextDashboard.profile,
      stats: nextDashboard.stats,
      victory,
      unlockedAchievements: victory ? current.achievements : []
    };
  }

  if (loading) {
    return <BootScreen label="СИСТЕМА ЗАГРУЖАЕТСЯ" />;
  }

  if (!dashboard) {
    return <BootScreen label="СИСТЕМА ЗАБЛОКИРОВАНА" message={error ?? "Не удалось загрузить профиль"} />;
  }

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

        {view === "dashboard" ? (
          <DashboardView
            dashboard={dashboard}
            completedToday={completedToday}
            onView={setView}
            demoMode={demoMode}
          />
        ) : null}
        {view === "quests" ? (
          <QuestsView
            quests={dashboard.todayQuests}
            busyId={busyId}
            onCompleteQuest={onCompleteQuest}
            onGenerateQuest={onGenerateQuest}
          />
        ) : null}
        {view === "stats" ? <StatsView dashboard={dashboard} /> : null}
        {view === "boss" ? <BossView dashboard={dashboard} busyId={busyId} onBossStep={onBossStep} onView={setView} /> : null}
        {view === "profile" ? <ProfileView dashboard={dashboard} /> : null}
      </main>

      <nav className="nav-hud fixed inset-x-0 bottom-0 z-40 border-t px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
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
      </nav>

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

function DashboardView({
  dashboard,
  completedToday,
  onView,
  demoMode
}: {
  dashboard: DashboardSummary;
  completedToday: number;
  onView: (view: View) => void;
  demoMode: boolean;
}) {
  const { profile, boss } = dashboard;
  const fatigue = Math.max(0, 100 - profile.energy);
  const bossProgress = boss ? `${boss.progress}/${boss.target}` : "--";

  return (
    <div className="space-y-4">
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

      <div className="grid grid-cols-3 gap-2">
        <PrimaryButton onClick={() => onView("quests")}>К квестам</PrimaryButton>
        <PrimaryButton onClick={() => onView("stats")} variant="ghost">Статы</PrimaryButton>
        <PrimaryButton onClick={() => onView("boss")} variant="ghost">Босс</PrimaryButton>
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
  busyId,
  onCompleteQuest,
  onGenerateQuest
}: {
  quests: Quest[];
  busyId: string | null;
  onCompleteQuest: (quest: Quest) => void;
  onGenerateQuest: () => void;
}) {
  return (
    <div className="space-y-3">
      <ScreenTitle title="Ежедневные квесты" icon={<ListChecks size={20} />} />
      {quests.map((quest) => (
        <Panel key={quest.id} className={quest.status === "completed" ? "border-system-success/45" : ""}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black">{displayQuestTitle(quest)}</h2>
              <p className="mt-1 text-sm text-system-muted">{displayQuestDescription(quest)}</p>
            </div>
            <StatusPill status={quest.status} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric label="Сложность" value={DIFFICULTY_LABELS_RU[quest.difficulty]} accent={difficultyColor(quest.difficulty)} />
            <Metric label="Категория" value={CATEGORY_LABELS_RU[quest.category]} />
            <Metric label="Награда" value={`+${quest.xpReward} XP`} accent="text-system-warning" />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="font-mono text-xs text-system-muted">+{quest.statRewardValue} {STAT_LABELS_RU[quest.statRewardKey].short}</p>
            <PrimaryButton
              disabled={quest.status !== "active" || busyId === quest.id}
              onClick={() => onCompleteQuest(quest)}
            >
              {quest.status === "completed" ? "Выполнено" : "Выполнить"}
            </PrimaryButton>
          </div>
        </Panel>
      ))}
      <PrimaryButton disabled={busyId === "generate"} onClick={onGenerateQuest} variant="ghost">
        Создать квест
      </PrimaryButton>
    </div>
  );
}

function StatsView({ dashboard }: { dashboard: DashboardSummary }) {
  const maxStat = Math.max(...STAT_KEYS.map((key) => dashboard.stats[key]), 30);

  return (
    <div className="space-y-4">
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
  busyId,
  onBossStep,
  onView
}: {
  dashboard: DashboardSummary;
  busyId: string | null;
  onBossStep: () => void;
  onView: (view: View) => void;
}) {
  const boss = dashboard.boss;

  if (!boss) {
    return (
      <div className="space-y-4">
        <ScreenTitle title="Босс недели" icon={<Swords size={20} />} />
        <Panel>Активный босс-квест не найден.</Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
        <PrimaryButton disabled={boss.status !== "active" || busyId === boss.id} onClick={onBossStep}>
          Засчитать шаг
        </PrimaryButton>
        <PrimaryButton onClick={() => onView("dashboard")} variant="ghost">Назад</PrimaryButton>
      </div>
    </div>
  );
}

function ProfileView({ dashboard }: { dashboard: DashboardSummary }) {
  return (
    <div className="space-y-4">
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
        : "border-system-cyan/50 bg-system-cyan/10 text-system-cyan";

  return (
    <span className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[11px] font-bold uppercase ${className}`}>
      {STATUS_LABELS_RU[status]}
    </span>
  );
}

function difficultyColor(difficulty: Quest["difficulty"]) {
  if (difficulty === "hard") return "text-system-danger";
  if (difficulty === "medium") return "text-system-warning";
  return "text-system-success";
}
