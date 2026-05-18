import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  Battery,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  User,
  Zap
} from "lucide-react";
import {
  STAT_KEYS,
  STAT_LABELS,
  applyXp,
  xpToNextLevel,
  type BossProgressResult,
  type DashboardSummary,
  type Quest,
  type QuestCompletionResult
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
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "quests", label: "Quests", icon: ListChecks },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "boss", label: "Boss", icon: Swords },
  { id: "profile", label: "Profile", icon: User }
];

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
          if (import.meta.env.DEV) {
            setDemoMode(true);
            setDashboard(demoDashboard);
            return;
          }

          throw new Error("Telegram auth data is missing. Open System Hunter from the bot.");
        }

        await authenticateTelegram(initData);
        setDashboard(await getDashboard());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to start System Hunter");
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
      setError(caught instanceof Error ? caught.message : "Quest completion failed");
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
                    title: "Finish one important task",
                    description: "Finish one meaningful task before switching context.",
                    difficulty: "hard",
                    xpReward: 75,
                    status: "active",
                    createdAt: new Date().toISOString()
                  } as Quest
                ]
              }
            : current
        );
        setModal({ type: "notice", title: "QUEST GENERATED", body: "A new task has entered your daily log." });
        return;
      }

      await generateQuest();
      await refresh();
      setModal({ type: "notice", title: "QUEST GENERATED", body: "A new task has entered your daily log." });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Quest generation failed");
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
        if (result) setModal(result.victory ? { type: "boss", result } : { type: "notice", title: "BOSS PROGRESS", body: "Progress has been recorded." });
        return;
      }

      const result = await progressBoss(dashboard.boss.id);
      setModal(result.victory ? { type: "boss", result } : { type: "notice", title: "BOSS PROGRESS", body: "Progress has been recorded." });
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("medium");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Boss progress failed");
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
    return <BootScreen label="SYSTEM BOOTING" />;
  }

  if (!dashboard) {
    return <BootScreen label="SYSTEM LOCKED" message={error ?? "Unable to load profile"} />;
  }

  return (
    <div className="min-h-screen bg-system-bg text-system-text">
      <div className="system-grid fixed inset-0 opacity-70" />
      <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col overflow-x-hidden px-4 pb-24 pt-4">
        <header className="mb-4 flex items-center justify-between">
          <div className="min-w-0">
            <p className="font-mono text-xs font-bold uppercase tracking-normal text-system-cyan">SYSTEM ONLINE</p>
            <h1 className="mt-1 text-2xl font-black">System Hunter</h1>
          </div>
          <div className="grid size-11 place-items-center rounded-lg border border-system-cyan/40 bg-system-cyan/10 text-system-cyan shadow-cyan">
            <Sparkles size={20} />
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

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-system-border bg-system-bg/92 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                className={`flex min-h-14 flex-col items-center justify-center rounded-lg text-[11px] font-semibold transition ${
                  active
                    ? "border border-system-purple/50 bg-system-purple/18 text-system-cyan shadow-cyan"
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
      <div className="w-full max-w-sm rounded-lg border border-system-border bg-system-card p-6 shadow-glow">
        <p className="font-mono text-sm font-bold uppercase text-system-cyan">{label}</p>
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

  return (
    <div className="space-y-4">
      <Panel glow>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-system-muted">Hunter: @{profile.username ?? "unknown"}</p>
            <p className="mt-2 text-4xl font-black leading-none">Level {profile.level}</p>
            <p className="mt-2 break-words font-mono text-sm text-system-cyan">Rank {profile.rank} / {profile.className}</p>
          </div>
          <div className="rounded-lg border border-system-purple/50 bg-system-purple/15 px-3 py-2 text-center">
            <p className="text-[11px] uppercase text-system-muted">Streak</p>
            <p className="font-mono text-xl font-black text-system-warning">{profile.streak}</p>
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-2 flex justify-between font-mono text-xs text-system-muted">
            <span>XP</span>
            <span>{profile.xp} / {profile.xpToNextLevel}</span>
          </div>
          <ProgressBar value={profile.xp} max={profile.xpToNextLevel} />
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3">
        <Panel>
          <div className="mb-3 flex items-center gap-2 text-system-success">
            <Shield size={17} />
            <span className="text-xs font-bold uppercase">HP</span>
          </div>
          <ProgressBar value={profile.hp} max={100} color="success" />
          <p className="mt-2 font-mono text-sm">{profile.hp} / 100</p>
        </Panel>
        <Panel>
          <div className="mb-3 flex items-center gap-2 text-system-warning">
            <Battery size={17} />
            <span className="text-xs font-bold uppercase">Energy</span>
          </div>
          <ProgressBar value={profile.energy} max={100} color="warning" />
          <p className="mt-2 font-mono text-sm">{profile.energy} / 100</p>
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Metric label="Today" value={`${completedToday} / ${dashboard.todayQuests.length} quests`} />
        <Metric label="Weekly Boss" value={boss ? `${boss.progress} / ${boss.target}` : "No signal"} accent="text-system-warning" />
      </div>

      <Panel className="border-system-cyan/40 bg-system-cyan/8">
        <div className="flex items-start gap-3">
          <Zap className="mt-0.5 text-system-cyan" size={18} />
          <div>
            <p className="font-mono text-sm font-bold text-system-text">SYSTEM NOTIFICATION</p>
            <p className="mt-1 text-sm text-system-muted">
              {demoMode ? "Dev preview is active. Telegram auth will be required in production." : "Daily protocol is synchronized."}
            </p>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-3 gap-2">
        <PrimaryButton onClick={() => onView("quests")}>Go to Quests</PrimaryButton>
        <PrimaryButton onClick={() => onView("stats")} variant="ghost">View Stats</PrimaryButton>
        <PrimaryButton onClick={() => onView("boss")} variant="ghost">Fight Boss</PrimaryButton>
      </div>
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
      <ScreenTitle title="Daily Quests" icon={<ListChecks size={20} />} />
      {quests.map((quest) => (
        <Panel key={quest.id} className={quest.status === "completed" ? "border-system-success/45" : ""}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black">{quest.title}</h2>
              <p className="mt-1 text-sm text-system-muted">{quest.description}</p>
            </div>
            <StatusPill status={quest.status} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric label="Difficulty" value={quest.difficulty} accent={difficultyColor(quest.difficulty)} />
            <Metric label="Category" value={quest.category} />
            <Metric label="Reward" value={`+${quest.xpReward} XP`} accent="text-system-warning" />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="font-mono text-xs text-system-muted">+{quest.statRewardValue} {STAT_LABELS[quest.statRewardKey].short}</p>
            <PrimaryButton
              disabled={quest.status !== "active" || busyId === quest.id}
              onClick={() => onCompleteQuest(quest)}
            >
              {quest.status === "completed" ? "Completed" : "Complete"}
            </PrimaryButton>
          </div>
        </Panel>
      ))}
      <PrimaryButton disabled={busyId === "generate"} onClick={onGenerateQuest} variant="ghost">
        Generate Quest
      </PrimaryButton>
    </div>
  );
}

function StatsView({ dashboard }: { dashboard: DashboardSummary }) {
  const maxStat = Math.max(...STAT_KEYS.map((key) => dashboard.stats[key]), 30);

  return (
    <div className="space-y-4">
      <ScreenTitle title="Stats" icon={<Gauge size={20} />} />
      <Panel glow>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Level" value={`${dashboard.profile.level}`} />
          <Metric label="Rank" value={dashboard.profile.rank} accent="text-system-warning" />
          <Metric label="Class" value={dashboard.profile.className} />
          <Metric label="Total XP" value={`${dashboard.profile.totalXp}`} accent="text-system-cyan" />
          <Metric label="Streak" value={`${dashboard.profile.streak} days`} accent="text-system-warning" />
          <Metric label="Completed" value={`${dashboard.profile.completedQuestsCount}`} accent="text-system-success" />
        </div>
      </Panel>
      {STAT_KEYS.map((key) => (
        <Panel key={key}>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="font-mono text-xs font-bold text-system-cyan">{STAT_LABELS[key].short}</p>
              <h2 className="font-bold">{STAT_LABELS[key].label}</h2>
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
        <ScreenTitle title="Weekly Boss" icon={<Swords size={20} />} />
        <Panel>No active boss quest.</Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ScreenTitle title="Weekly Boss" icon={<Swords size={20} />} />
      <section className="boss-card rounded-lg border border-system-purple/50 p-5 shadow-glow">
        <p className="font-mono text-xs font-bold uppercase text-system-cyan">Boss</p>
        <h2 className="mt-2 text-3xl font-black leading-tight">{boss.name}</h2>
        <p className="mt-3 text-sm text-system-muted">{boss.description}</p>
        <div className="mt-5">
          <div className="mb-2 flex justify-between font-mono text-xs text-system-muted">
            <span>Progress</span>
            <span>{boss.progress} / {boss.target}</span>
          </div>
          <ProgressBar value={boss.progress} max={boss.target} color="danger" />
        </div>
      </section>

      <Panel>
        <p className="font-mono text-xs font-bold uppercase text-system-muted">Objective</p>
        <p className="mt-2 text-lg font-bold">{boss.objective}</p>
      </Panel>

      <Panel>
        <p className="font-mono text-xs font-bold uppercase text-system-muted">Reward</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="XP" value={`+${boss.xpReward}`} accent="text-system-warning" />
          <Metric label={STAT_LABELS[boss.statRewardKey].short} value={`+${boss.statRewardValue}`} />
          <Metric label="Title" value="Focus Hunter" accent="text-system-success" />
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-2">
        <PrimaryButton disabled={boss.status !== "active" || busyId === boss.id} onClick={onBossStep}>
          Complete Step
        </PrimaryButton>
        <PrimaryButton onClick={() => onView("dashboard")} variant="ghost">Back</PrimaryButton>
      </div>
    </div>
  );
}

function ProfileView({ dashboard }: { dashboard: DashboardSummary }) {
  return (
    <div className="space-y-4">
      <ScreenTitle title="Profile" icon={<User size={20} />} />
      <Panel glow>
        <div className="flex items-center gap-4">
          <div className="grid size-16 place-items-center rounded-lg border border-system-cyan/40 bg-system-cyan/10 text-2xl font-black text-system-cyan">
            {dashboard.profile.username?.slice(0, 1).toUpperCase() ?? "H"}
          </div>
          <div>
            <h2 className="text-xl font-black">@{dashboard.profile.username ?? "unknown"}</h2>
            <p className="mt-1 text-sm text-system-muted">Created {new Date(dashboard.profile.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Metric label="Level" value={`${dashboard.profile.level}`} />
          <Metric label="Rank" value={dashboard.profile.rank} accent="text-system-warning" />
          <Metric label="Class" value={dashboard.profile.className} />
          <Metric label="Title" value={dashboard.profile.currentTitle ?? "None"} accent="text-system-success" />
          <Metric label="Streak" value={`${dashboard.profile.streak} days`} />
          <Metric label="Quests" value={`${dashboard.profile.completedQuestsCount}`} />
        </div>
      </Panel>

      <ScreenTitle title="Achievements" icon={<Trophy size={20} />} compact />
      <div className="space-y-3">
        {dashboard.achievements.length === 0 ? (
          <Panel>
            <p className="text-sm text-system-muted">No achievements unlocked yet.</p>
          </Panel>
        ) : (
          dashboard.achievements.map((achievement) => (
            <Panel key={achievement.id} className="border-system-warning/40">
              <div className="flex items-start gap-3">
                <div className="grid size-10 place-items-center rounded-md border border-system-warning/40 bg-system-warning/10 text-system-warning">
                  <Trophy size={18} />
                </div>
                <div>
                  <h3 className="font-bold">{achievement.title}</h3>
                  <p className="mt-1 text-sm text-system-muted">{achievement.description}</p>
                </div>
              </div>
            </Panel>
          ))
        )}
      </div>
    </div>
  );
}

function ResultModal({ modal, onClose }: { modal: NonNullable<AppModal>; onClose: () => void }) {
  if (modal.type === "quest") {
    return (
      <Modal title={modal.result.levelUp.leveledUp ? "Level Up" : "Quest Completed"} onClose={onClose}>
        <div className="space-y-3">
          <p className="text-system-text">{modal.result.quest.title}</p>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="XP" value={`+${modal.result.rewards.xp}`} accent="text-system-warning" />
            <Metric
              label={STAT_LABELS[modal.result.rewards.statKey].short}
              value={`+${modal.result.rewards.statValue}`}
              accent="text-system-cyan"
            />
          </div>
          {modal.result.levelUp.leveledUp ? (
            <p className="rounded-md border border-system-cyan/40 bg-system-cyan/10 p-3 font-mono text-system-cyan">
              Level {modal.result.levelUp.from} -&gt; {modal.result.levelUp.to}
            </p>
          ) : null}
        </div>
      </Modal>
    );
  }

  if (modal.type === "boss") {
    return (
      <Modal title="Boss Defeated" onClose={onClose}>
        <div className="space-y-3">
          <p className="text-system-text">{modal.result.boss.name}</p>
          <Metric label="Reward" value={`+${modal.result.boss.xpReward} XP`} accent="text-system-warning" />
          <p className="rounded-md border border-system-success/40 bg-system-success/10 p-3 font-mono text-system-success">
            Title unlocked: Focus Hunter
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
    <div className={`flex items-center gap-2 ${compact ? "pt-1" : ""}`}>
      <div className="grid size-9 place-items-center rounded-md border border-system-cyan/40 bg-system-cyan/10 text-system-cyan">
        {icon}
      </div>
      <h2 className="text-xl font-black">{title}</h2>
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
      {status}
    </span>
  );
}

function difficultyColor(difficulty: Quest["difficulty"]) {
  if (difficulty === "hard") return "text-system-danger";
  if (difficulty === "medium") return "text-system-warning";
  return "text-system-success";
}
