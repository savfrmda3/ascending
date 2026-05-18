import type {
  AuthResponse,
  BossProgressResult,
  DashboardSummary,
  Quest,
  QuestCompletionResult
} from "@system-hunter/shared";

const API_BASE = __BACKEND_URL__.replace(/\/$/, "");
const TOKEN_KEY = "system-hunter-token";

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export async function authenticateTelegram(initData: string) {
  const response = await request<AuthResponse>("/api/auth/telegram", {
    method: "POST",
    body: JSON.stringify({ initData }),
    auth: false
  });
  storeToken(response.token);
  return response;
}

export function getDashboard() {
  return request<DashboardSummary>("/api/me");
}

export function generateQuest() {
  return request<Quest>("/api/quests/generate", {
    method: "POST"
  });
}

export function completeQuest(id: string) {
  return request<QuestCompletionResult>(`/api/quests/${id}/complete`, {
    method: "POST"
  });
}

export function progressBoss(id: string) {
  return request<BossProgressResult>(`/api/boss/${id}/progress`, {
    method: "POST"
  });
}

async function request<T>(path: string, init: RequestInit & { auth?: boolean } = {}) {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");

  if (init.auth !== false && token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers
    });
  } catch {
    throw new Error("Cannot reach backend API. Check Vercel environment variables and /api deployment.");
  }
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(formatApiError(payload, response.status));
  }

  if (!payload || !("data" in payload)) {
    throw new Error("Malformed API response");
  }

  return payload.data as T;
}

function formatApiError(payload: { error?: { message?: string; details?: unknown } } | null, status: number) {
  const message = payload?.error?.message ?? `Request failed with ${status}`;
  const details = payload?.error?.details;

  if (details && typeof details === "object" && "message" in details) {
    const detailMessage = String((details as { message?: unknown }).message ?? "");
    if (detailMessage && !message.includes(detailMessage)) return `${message}: ${detailMessage}`;
  }

  return message;
}
