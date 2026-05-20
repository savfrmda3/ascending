import type {
  AuthResponse,
  BossProgressResult,
  CustomQuestInput,
  CustomQuestProgress,
  CustomQuestTemplate,
  DashboardSummary,
  ProgressHistory,
  Quest,
  QuestCompletionResult,
  UserNotificationSettings,
  UserSettings
} from "@system-hunter/shared";

const API_BASE = __BACKEND_URL__.replace(/\/$/, "");
const TOKEN_KEY = "system-hunter-token";

export function getStoredToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string) {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.setItem(TOKEN_KEY, token);
}

export async function authenticateTelegram(initData: string) {
  const response = await request<AuthResponse>("/api/auth/telegram", {
    method: "POST",
    body: JSON.stringify({
      initData,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset()
    }),
    auth: false
  });
  storeToken(response.token);
  return response;
}

export function getDashboard() {
  return request<DashboardSummary>("/api/me");
}

export function getProgressHistory() {
  return request<ProgressHistory>("/api/progress/history");
}

export function updateSettings(input: Partial<UserSettings>) {
  return request<UserSettings>("/api/settings", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getNotificationSettings() {
  return request<UserNotificationSettings>("/api/notification-settings");
}

export function updateNotificationSettings(input: Partial<UserNotificationSettings>) {
  return request<UserNotificationSettings>("/api/notification-settings", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getCustomQuests() {
  return request<CustomQuestTemplate[]>("/api/custom-quests");
}

export function getCustomQuestProgress() {
  return request<CustomQuestProgress[]>("/api/custom-quests/progress");
}

export function createCustomQuest(input: CustomQuestInput) {
  return request<CustomQuestTemplate>("/api/custom-quests", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateCustomQuest(id: string, input: Partial<CustomQuestInput>) {
  return request<CustomQuestTemplate>(`/api/custom-quests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function disableCustomQuest(id: string) {
  return request<CustomQuestTemplate>(`/api/custom-quests/${id}/disable`, {
    method: "POST"
  });
}

export function enableCustomQuest(id: string) {
  return request<CustomQuestTemplate>(`/api/custom-quests/${id}/enable`, {
    method: "POST"
  });
}

export function deleteCustomQuest(id: string) {
  return request<CustomQuestTemplate>(`/api/custom-quests/${id}`, {
    method: "DELETE"
  });
}

export function deleteTodayCustomQuest(id: string) {
  return request<{ deleted: boolean }>(`/api/quests/${id}`, {
    method: "DELETE"
  });
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

export function startQuest(id: string) {
  return request<Quest>(`/api/quests/${id}/start`, {
    method: "POST"
  });
}

export function cancelQuest(id: string) {
  return request<Quest>(`/api/quests/${id}/cancel`, {
    method: "POST"
  });
}

export function skipQuest(id: string) {
  return request<Quest>(`/api/quests/${id}/skip`, {
    method: "POST"
  });
}

export function replaceQuest(id: string) {
  return request<Quest>(`/api/quests/${id}/replace`, {
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
    throw new Error("Не удалось подключиться к API. Проверь переменные Vercel и деплой /api.");
  }
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(formatApiError(payload, response.status));
  }

  if (!payload || !("data" in payload)) {
    throw new Error("Некорректный ответ API");
  }

  return payload.data as T;
}

function formatApiError(payload: { error?: { message?: string; details?: unknown } } | null, status: number) {
  const message = translateApiMessage(payload?.error?.message) ?? `Запрос завершился ошибкой ${status}`;
  const details = payload?.error?.details;

  if (details && typeof details === "object" && "message" in details) {
    const rawDetailMessage = String((details as { message?: unknown }).message ?? "");
    const detailMessage = translateApiMessage(rawDetailMessage) ?? rawDetailMessage;
    if (detailMessage && !message.includes(detailMessage)) return `${message}: ${detailMessage}`;
  }

  return message;
}

function translateApiMessage(message?: string) {
  if (!message) return null;

  const knownMessages: Record<string, string> = {
    "Invalid Telegram initData": "Некорректные данные авторизации Telegram",
    "Telegram initData is expired": "Данные авторизации Telegram устарели. Открой приложение заново из бота.",
    "Missing authorization token": "Не найден токен авторизации. Открой приложение заново из бота.",
    "Invalid authorization token": "Некорректный токен авторизации. Открой приложение заново из бота.",
    "User not found": "Пользователь не найден",
    "Quest not found": "Квест не найден",
    "Quest is already completed": "Квест уже выполнен",
    "Quest is not active": "Квест уже нельзя изменить: он не активен",
    "Quest must be started before completion": "Сначала возьми квест в выполнение",
    "Another quest is already in progress": "У тебя уже есть активный квест. Заверши или отмени его перед выбором нового.",
    "Quest is already in progress": "Квест уже выполняется",
    "Only active quests can be started": "Взять можно только активный квест",
    "Only in-progress quests can be cancelled": "Отменить можно только выполняемый квест",
    "Only in-progress quests can be completed": "Завершить можно только квест в процессе",
    "Unable to start quest": "Не удалось взять квест",
    "Unable to cancel quest": "Не удалось отменить квест",
    "Unable to inspect active quest": "Не удалось проверить активный квест",
    "Active quest storage is not ready": "Хранилище активных квестов еще не обновлено. Примени новую миграцию Supabase.",
    "Skipped quest cannot be completed": "Пропущенный квест нельзя выполнить",
    "Completed quest cannot be skipped": "Выполненный квест нельзя пропустить",
    "Quest is already skipped": "Квест уже пропущен",
    "Only active quests can be skipped": "Пропустить можно только активный квест",
    "Only active quests can be replaced": "Заменить можно только активный квест",
    "Daily generated quest limit reached": "Лимит новых квестов на сегодня исчерпан. Завтра система снова откроет генерацию.",
    "No unique quest templates available today": "На сегодня нет уникальных шаблонов без повторов.",
    "Quest already exists today": "Такой квест уже есть в сегодняшнем протоколе.",
    "No quest templates are available": "Нет доступных шаблонов квестов",
    "Unable to load today's quests": "Не удалось загрузить квесты на сегодня",
    "Unable to generate quest": "Не удалось создать квест",
    "Unable to complete quest": "Не удалось завершить квест",
    "Unable to skip quest": "Не удалось пропустить квест",
    "Unable to replace quest": "Не удалось заменить квест",
    "Unable to load weekly boss": "Не удалось загрузить недельного босса",
    "Unable to load boss": "Не удалось загрузить босса",
    "Weekly boss not found": "Недельный босс не найден",
    "Weekly boss is already completed": "Недельный босс уже побежден",
    "Boss objective is not complete yet": "Цель босса еще не выполнена",
    "Unable to inspect boss objective": "Не удалось проверить условие босса",
    "Unable to update boss progress": "Не удалось обновить прогресс босса",
    "Weekly boss has expired": "Недельный босс уже истек",
    "Invalid stat reward": "Некорректная награда характеристики",
    "Unable to update stats": "Не удалось обновить характеристики",
    "Unable to update XP": "Не удалось обновить XP",
    "Unable to count completed quests": "Не удалось посчитать выполненные квесты",
    "Unable to count completed bosses": "Не удалось посчитать побежденных боссов",
    "Unable to calculate streak": "Не удалось рассчитать серию",
    "Unable to inspect achievements": "Не удалось проверить достижения",
    "Unable to unlock achievement": "Не удалось открыть достижение",
    "Unable to load progress history": "Не удалось загрузить историю прогресса",
    "Unable to load recent quests": "Не удалось загрузить последние квесты",
    "Not enough energy to generate quest": "Недостаточно энергии для генерации квеста",
    "Not enough energy for hard quest": "Недостаточно энергии для сложного квеста",
    "Unable to update vitals": "Не удалось обновить HP/Energy",
    "Achievement unlocked.": "Достижение открыто.",
    "Invalid JSON body": "Некорректный запрос к серверу",
    "Request body is too large": "Запрос слишком большой",
    "Rate limit exceeded": "Слишком много действий подряд. Подожди немного и повтори.",
    "Settings storage is not ready": "Хранилище настроек еще не обновлено. Примени новую миграцию Supabase и повтори.",
    "Unable to load settings": "Не удалось загрузить настройки",
    "Unable to create settings": "Не удалось создать настройки",
    "Unable to update settings": "Не удалось сохранить настройки",
    "Notification settings storage is not ready": "Хранилище уведомлений ещё не обновлено. Примени новую миграцию Supabase.",
    "Unable to load notification settings": "Не удалось загрузить настройки уведомлений",
    "Unable to create notification settings": "Не удалось создать настройки уведомлений",
    "Unable to update notification settings": "Не удалось сохранить настройки уведомлений",
    "Custom quests storage is not ready": "Хранилище пользовательских квестов еще не обновлено. Примени новую миграцию Supabase.",
    "Unable to load custom quests": "Не удалось загрузить мои квесты",
    "Unable to load custom quest progress": "Не удалось загрузить прогресс привычек",
    "Unable to create custom quest": "Не удалось создать привычку",
    "Unable to update custom quest": "Не удалось обновить привычку",
    "Unable to delete custom quest": "Не удалось архивировать привычку",
    "Unable to disable custom quest": "Не удалось отключить привычку",
    "Unable to enable custom quest": "Не удалось включить привычку",
    "Custom quest not found": "Привычка не найдена",
    "Custom quest is deleted": "Этот квест уже удален",
    "Choose at least one weekday": "Выбери хотя бы один день недели",
    "Weekdays must not be empty": "Выбери хотя бы один день недели",
    "Invalid recurrence type": "Некорректный тип повторения",
    "Title is required": "Укажи название квеста",
    "Cannot delete completed quest": "Нельзя удалить выполненный квест, история сохранена",
    "Cancel quest before deletion": "Сначала отмени активный квест",
    "Only custom quests can be deleted": "Удалять можно только пользовательские квесты",
    "Only today's custom quest can be deleted": "Удалить можно только сегодняшний пользовательский квест",
    "Unable to delete today's custom quest": "Не удалось удалить сегодняшний квест"
  };

  return knownMessages[message] ?? message;
}
