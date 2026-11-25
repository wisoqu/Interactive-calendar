import type { CalendarEvent } from "../types.ts";

export function formatLocalDatePart(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatLocalInput(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isTodayDate(date: Date, now: Date = new Date()): boolean {
  return isSameLocalDay(date, now);
}

export function isMultiDayEvent(ev: Pick<CalendarEvent, "starts_at" | "ends_at">): boolean {
  const s = new Date(ev.starts_at);
  const e = new Date(ev.ends_at);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
  // Treat an event ending exactly at 00:00 of the next day as ending on the previous day
  const adjustedEnd =
    e.getHours() === 0 && e.getMinutes() === 0 && e.getSeconds() === 0 && e.getMilliseconds() === 0 && e.getTime() > s.getTime()
      ? new Date(e.getTime() - 1)
      : e;
  return !isSameLocalDay(s, adjustedEnd);
}

/**
 * Returns true if the event occurs on (starts, spans across, or ends on) the given local calendar date.
 */
export function eventOverlapsDay(
  ev: Pick<CalendarEvent, "starts_at" | "ends_at">,
  day: Date
): boolean {
  const evStart = new Date(ev.starts_at);
  const evEnd = new Date(ev.ends_at);
  if (Number.isNaN(evStart.getTime()) || Number.isNaN(evEnd.getTime())) {
    return false;
  }

  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  const nextDayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 0, 0);

  return evStart < nextDayStart && evEnd > dayStart;
}

export function getEventsForDate(events: CalendarEvent[], date: Date): CalendarEvent[] {
  return events
    .filter((ev) => eventOverlapsDay(ev, date))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

/**
 * Determines which hour slots a given event belongs to on a specific day in the Week view.
 * Returns the hour index (0..23) where the event card should anchor on that day:
 * - On its start day: starts_at.getHours()
 * - On continuation days of a multi-day event: earliest shown hour (or 0 if spanning midnight)
 */
export function getEventDisplayHourForDay(
  ev: Pick<CalendarEvent, "starts_at" | "ends_at">,
  day: Date,
  minHour: number
): number {
  const evStart = new Date(ev.starts_at);
  if (isSameLocalDay(evStart, day)) {
    return evStart.getHours();
  }
  return minHour;
}

/**
 * Computes hour slots for Week View: defaults to 08:00..22:00, and automatically expands
 * earlier (down to 00:00) or later (up to 23:00) when any event in the visible week starts outside 08..22.
 */
export function getWeekHourSlots(weekDays: Date[], events: CalendarEvent[]): number[] {
  let minHour = 8;
  let maxHour = 22;

  for (const day of weekDays) {
    for (const ev of events) {
      if (!eventOverlapsDay(ev, day)) continue;
      const evStart = new Date(ev.starts_at);
      if (isSameLocalDay(evStart, day)) {
        const h = evStart.getHours();
        if (h < minHour) minHour = h;
        if (h > maxHour) maxHour = h;
      }
    }
  }

  const slots: number[] = [];
  for (let h = minHour; h <= maxHour; h++) {
    slots.push(h);
  }
  return slots;
}

export function getMonthName(date: Date, lang: "ru" | "en"): string {
  const monthIndex = date.getMonth();
  const year = date.getFullYear();
  const ruMonths = [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
  ];
  const enMonths = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return lang === "ru" ? `${ruMonths[monthIndex]} ${year}` : `${enMonths[monthIndex]} ${year}`;
}

export function getMonthGridCells(currentDate: Date) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);
  const totalDays = endOfMonth.getDate();

  let startDayOfWeek = startOfMonth.getDay();
  startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const cells: Array<{ date: Date; currentMonth: boolean; dayNum: number }> = [];
  const prevMonthEnd = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    cells.push({
      date: new Date(year, month - 1, prevMonthEnd - i),
      currentMonth: false,
      dayNum: prevMonthEnd - i,
    });
  }

  for (let i = 1; i <= totalDays; i++) {
    cells.push({
      date: new Date(year, month, i),
      currentMonth: true,
      dayNum: i,
    });
  }

  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) {
    cells.push({
      date: new Date(year, month + 1, i),
      currentMonth: false,
      dayNum: i,
    });
  }

  return cells;
}

export function getWeekDays(currentDate: Date): Date[] {
  const curr = new Date(currentDate);
  const dayOfWeek = curr.getDay();
  const distanceToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate() - distanceToMon);

  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) {
    weekDays.push(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  }
  return weekDays;
}

export function findEventConflict(
  events: CalendarEvent[],
  starts: Date,
  ends: Date,
  ignoreEventId: string | null,
  lang: "ru" | "en"
): string | null {
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) {
    return null;
  }

  for (const ev of events) {
    if (ignoreEventId && ev.id === ignoreEventId) continue;
    const evStarts = new Date(ev.starts_at);
    const evEnds = new Date(ev.ends_at);

    if (starts < evEnds && ends > evStarts) {
      const localTimeStrS = evStarts.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const localTimeStrE = evEnds.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      return lang === "ru"
        ? `Пересечение по времени с событием «${ev.title}» (${localTimeStrS} – ${localTimeStrE})`
        : `Overlaps with existing event "${ev.title}" (${localTimeStrS} – ${localTimeStrE})`;
    }
  }
  return null;
}
