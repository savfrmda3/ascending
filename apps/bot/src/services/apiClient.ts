import type {
  BossProgressResult,
  HunterProfile,
  Quest,
  QuestCompletionResult,
  SystemsOverview,
  UserStats,
  WeeklyBoss
} from "@system-hunter/shared";
import { env } from "../config/env.js";

interface ProfileBundle {
  profile: HunterProfile;
  stats: UserStats;
}

interface DailyGenerationUser {
  id: string;
  telegram_id: number;
}

interface ActiveQuestSummary {
  telegramId: number;
  activeCount: number;
}

class BotApiClient {
  private readonly baseUrl = env.BACKEND_URL.replace(/\/$/, "");

  async syncUser(input: { telegramId: number; username?: string | null; firstName?: string | null }) {
    return this.request<ProfileBundle>("/api/bot/user/sync", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  async getProfile(telegramId: number) {
    return this.request<ProfileBundle>(`/api/bot/profile/${telegramId}`);
  }

  async getQuests(telegramId: number) {
    return this.request<Quest[]>(`/api/bot/quests/${telegramId}`);
  }

  async getSystems(telegramId: number) {
    return this.request<SystemsOverview>(`/api/bot/systems/${telegramId}`);
  }

  async generateQuest(telegramId: number) {
    return this.request<Quest>("/api/bot/quest/generate", {
      method: "POST",
      body: JSON.stringify({ telegramId })
    });
  }

  async completeQuest(telegramId: number, questId: string) {
    return this.request<QuestCompletionResult>("/api/bot/quest/complete", {
      method: "POST",
      body: JSON.stringify({ telegramId, questId })
    });
  }

  async skipQuest(telegramId: number, questId: string) {
    return this.request<Quest>("/api/bot/quest/skip", {
      method: "POST",
      body: JSON.stringify({ telegramId, questId })
    });
  }

  async getBoss(telegramId: number) {
    return this.request<WeeklyBoss | null>(`/api/bot/boss/${telegramId}`);
  }

  async progressBoss(telegramId: number, bossId: string) {
    return this.request<BossProgressResult>("/api/bot/boss/progress", {
      method: "POST",
      body: JSON.stringify({ telegramId, bossId })
    });
  }

  async generateDailyForAllUsers() {
    return this.request<DailyGenerationUser[]>("/api/bot/quests/generate-daily", {
      method: "POST"
    });
  }

  async getActiveQuestSummary() {
    return this.request<ActiveQuestSummary[]>("/api/bot/quests/active-summary");
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-bot-token": env.BOT_TOKEN,
        ...(init.headers ?? {})
      }
    });
    const payload = (await response.json().catch(() => null)) as
      | { data?: T; error?: { message?: string } }
      | null;

    if (!response.ok) {
      throw new Error(payload?.error?.message ?? `API request failed with ${response.status}`);
    }

    if (!payload || !("data" in payload)) {
      throw new Error("Malformed API response");
    }

    return payload.data as T;
  }
}

export const apiClient = new BotApiClient();
