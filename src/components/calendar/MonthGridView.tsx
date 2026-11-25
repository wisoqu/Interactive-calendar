import React from "react";
import type { CalendarEvent } from "../../types.ts";
import type { Language } from "../../store/ThemeLanguageContext.tsx";
import {
  getEventsForDate,
  getMonthGridCells,
  isSameLocalDay,
  isTodayDate,
} from "../../utils/calendarDate.ts";

interface MonthGridViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  canManage: boolean;
  lang: Language;
  onCreateForDate: (date: Date) => void;
  onSelectEvent: (ev: CalendarEvent) => void;
}

export const MonthGridView: React.FC<MonthGridViewProps> = ({
  currentDate,
  events,
  canManage,
  lang,
  onCreateForDate,
  onSelectEvent,
}) => {
  const cells = getMonthGridCells(currentDate);

  return (
    <div className="border-2 border-zinc-900 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-x-auto">
      <div className="min-w-[680px]">
        <div className="grid grid-cols-7 border-b-2 border-zinc-900 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
          {(lang === "ru"
            ? ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
            : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
          ).map((d) => (
            <div
              key={d}
              className="py-2.5 text-center text-xs font-bold text-zinc-600 dark:text-zinc-300 border-r last:border-r-0 border-zinc-200 dark:border-zinc-700"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 grid-rows-6">
          {cells.map((cell, idx) => {
            const dayEvents = getEventsForDate(events, cell.date);
            const cellIsToday = isTodayDate(cell.date);
            const isCurrentMonth = cell.currentMonth;

            return (
              <div
                key={idx}
                onClick={() => {
                  if (canManage) {
                    onCreateForDate(cell.date);
                  }
                }}
                className={`min-h-[112px] p-2 border-r border-b border-zinc-200 dark:border-zinc-800 last:border-r-0 flex flex-col justify-between transition-colors group/cell relative select-none ${
                  isCurrentMonth
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                    : "bg-zinc-50/70 dark:bg-zinc-950/60 text-zinc-400 dark:text-zinc-600"
                } ${cellIsToday ? "bg-amber-50/40 dark:bg-zinc-800/60" : ""} ${
                  canManage ? "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer" : ""
                }`}
              >
                <div className="flex items-center justify-between pb-1">
                  {cellIsToday ? (
                    <span className="flex h-6 w-6 items-center justify-center bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-extrabold tabular-nums">
                      {cell.dayNum}
                    </span>
                  ) : (
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        isCurrentMonth
                          ? "text-zinc-700 dark:text-zinc-300"
                          : "text-zinc-400 dark:text-zinc-600"
                      }`}
                    >
                      {cell.dayNum}
                    </span>
                  )}

                  {canManage && isCurrentMonth && (
                    <span className="opacity-0 group-hover/cell:opacity-100 text-[10px] font-bold text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-opacity">
                      + {lang === "ru" ? "добавить" : "add"}
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto max-h-[84px] pt-1 space-y-1">
                  {dayEvents.map((ev) => {
                    const startsOnThisDay = isSameLocalDay(new Date(ev.starts_at), cell.date);
                    const timeLabel = startsOnThisDay
                      ? new Date(ev.starts_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })
                      : "→";
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEvent(ev);
                        }}
                        className="w-full text-left border border-zinc-900 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold truncate cursor-pointer transition-colors"
                        title={`${ev.title} (${new Date(ev.starts_at).toLocaleString(
                          lang === "ru" ? "ru-RU" : "en-US"
                        )} — ${new Date(ev.ends_at).toLocaleString(
                          lang === "ru" ? "ru-RU" : "en-US"
                        )})`}
                      >
                        <div className="flex items-center justify-between gap-1 w-full">
                          <span className="truncate">{ev.title}</span>
                          <span className="text-[10px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
                            {timeLabel}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
