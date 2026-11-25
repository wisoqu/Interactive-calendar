import React from "react";
import type { CalendarEvent } from "../../types.ts";
import type { Language } from "../../store/ThemeLanguageContext.tsx";
import {
  getEventDisplayHourForDay,
  getEventsForDate,
  getWeekHourSlots,
  isSameLocalDay,
  isTodayDate,
} from "../../utils/calendarDate.ts";

interface WeekGridViewProps {
  weekDays: Date[];
  events: CalendarEvent[];
  canManage: boolean;
  lang: Language;
  onCreateForDateHour: (date: Date, hour: number) => void;
  onSelectEvent: (ev: CalendarEvent) => void;
}

export const WeekGridView: React.FC<WeekGridViewProps> = ({
  weekDays,
  events,
  canManage,
  lang,
  onCreateForDateHour,
  onSelectEvent,
}) => {
  const hourSlots = getWeekHourSlots(weekDays, events);
  const minHour = hourSlots[0] ?? 8;
  const locale = lang === "ru" ? "ru-RU" : "en-US";

  return (
    <div className="border-2 border-zinc-900 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-8 border-b-2 border-zinc-900 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
          <div className="py-2.5 text-center text-xs font-bold text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-700">
            {lang === "ru" ? "Время" : "Time"}
          </div>
          {weekDays.map((day) => {
            const today = isTodayDate(day);
            return (
              <div
                key={day.toISOString()}
                className={`py-2 text-center border-r last:border-r-0 border-zinc-200 dark:border-zinc-700 ${
                  today ? "bg-zinc-200/70 dark:bg-zinc-700/60" : ""
                }`}
              >
                <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                  {day.toLocaleDateString(locale, { weekday: "short" })}
                </div>
                <div className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {day.getDate()} {day.toLocaleDateString(locale, { month: "short" })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {hourSlots.map((hour) => (
            <div key={hour} className="grid grid-cols-8 min-h-[48px]">
              <div className="p-1 text-center text-xs font-mono tabular-nums font-semibold text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-950/40 select-none flex items-center justify-center">
                {hour < 10 ? `0${hour}:00` : `${hour}:00`}
              </div>

              {weekDays.map((day) => {
                const dayEvs = getEventsForDate(events, day);
                const slotEvents = dayEvs.filter(
                  (ev) => getEventDisplayHourForDay(ev, day, minHour) === hour
                );

                return (
                  <div
                    key={day.toISOString() + hour}
                    onClick={() => {
                      if (canManage) {
                        onCreateForDateHour(day, hour);
                      }
                    }}
                    className={`p-1 border-r last:border-r-0 border-zinc-200 dark:border-zinc-800 transition-colors space-y-1 relative group/slot ${
                      canManage ? "hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer" : ""
                    }`}
                  >
                    {slotEvents.map((ev) => {
                      const startsOnDay = isSameLocalDay(new Date(ev.starts_at), day);
                      const endsOnDay = isSameLocalDay(new Date(ev.ends_at), day);
                      const timeRange = startsOnDay
                        ? `${new Date(ev.starts_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}${
                            endsOnDay
                              ? `–${new Date(ev.ends_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: false,
                                })}`
                              : "→"
                          }`
                        : endsOnDay
                        ? `→${new Date(ev.ends_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}`
                        : lang === "ru"
                        ? "весь день"
                        : "all day";

                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectEvent(ev);
                          }}
                          className="w-full text-left border border-zinc-900 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 p-1 text-[11px] font-semibold cursor-pointer"
                          title={`${ev.title} (${timeRange})`}
                        >
                          <div className="truncate">{ev.title}</div>
                          <div className="text-[10px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                            {timeRange}
                          </div>
                        </button>
                      );
                    })}

                    {canManage && slotEvents.length === 0 && (
                      <span className="opacity-0 group-hover/slot:opacity-100 text-[10px] font-mono tabular-nums text-zinc-400 dark:text-zinc-600 flex items-center justify-center h-full">
                        +{hour < 10 ? `0${hour}:00` : `${hour}:00`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
