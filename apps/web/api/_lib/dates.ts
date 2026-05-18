export function todayDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function getWeekRange(date = new Date()) {
  const current = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = current.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const startsAt = addDays(current, diffToMonday);
  const endsAt = addDays(startsAt, 6);

  return {
    startsAt: todayDateString(startsAt),
    endsAt: todayDateString(endsAt)
  };
}

