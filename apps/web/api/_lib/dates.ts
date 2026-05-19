export function todayDateString(date = new Date(), timezoneOffset?: number | null) {
  return toUserDate(date, timezoneOffset).toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function addDaysToDateString(dateString: string, days: number) {
  return todayDateString(addDays(new Date(`${dateString}T00:00:00.000Z`), days));
}

export function getWeekRange(date = new Date(), timezoneOffset?: number | null) {
  const localToday = todayDateString(date, timezoneOffset);
  const current = new Date(`${localToday}T00:00:00.000Z`);
  const day = current.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const startsAt = addDays(current, diffToMonday);
  const endsAt = addDays(startsAt, 6);

  return {
    startsAt: todayDateString(startsAt),
    endsAt: todayDateString(endsAt)
  };
}

export function normalizeTimezoneOffset(offset?: number | null) {
  if (typeof offset !== "number" || !Number.isFinite(offset)) return null;
  return Math.max(-840, Math.min(840, Math.trunc(offset)));
}

function toUserDate(date: Date, timezoneOffset?: number | null) {
  const safeOffset = normalizeTimezoneOffset(timezoneOffset);
  if (safeOffset === null) return new Date(date);
  return new Date(date.getTime() - safeOffset * 60_000);
}
