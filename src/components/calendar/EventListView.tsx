import React, { useState } from "react";
import { Calendar as CalendarIcon, Clock, Edit3, Trash2 } from "lucide-react";
import type { CalendarEvent } from "../../types.ts";
import type { Language, Translations } from "../../store/ThemeLanguageContext.tsx";
import { isMultiDayEvent } from "../../utils/calendarDate.ts";

type ListFilter = "upcoming" | "all" | "past";

interface EventListViewProps {
  events: CalendarEvent[];
  loading: boolean;
  canManage: boolean;
  lang: Language;
  t: Translations;
  onEdit: (ev: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
}

export const EventListView: React.FC<EventListViewProps> = ({
  events,
  loading,
  canManage,
  lang,
  t,
  onEdit,
  onDelete,
}) => {
  const [filter, setFilter] = useState<ListFilter>("upcoming");

  if (loading) {
    return (
      <div className="py-16 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
        {t.querying}
      </div>
    );
  }

  const nowMs = Date.now();
  const sorted = events
    .slice()
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  const upcomingCount = sorted.filter((ev) => new Date(ev.ends_at).getTime() >= nowMs).length;
  const pastCount = sorted.length - upcomingCount;

  const filtered = sorted.filter((ev) => {
    const endMs = new Date(ev.ends_at).getTime();
    if (filter === "upcoming") return endMs >= nowMs;
    if (filter === "past") return endMs < nowMs;
    return true;
  });

  const locale = lang === "ru" ? "ru-RU" : "en-US";

  return (
    <div className="space-y-4">
      {sorted.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["upcoming", lang === "ru" ? `Предстоящие (${upcomingCount})` : `Upcoming (${upcomingCount})`],
              ["all", lang === "ru" ? `Все (${sorted.length})` : `All (${sorted.length})`],
              ["past", lang === "ru" ? `Прошедшие (${pastCount})` : `Past (${pastCount})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 text-xs font-bold border-2 transition-colors cursor-pointer ${
                filter === key
                  ? "border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-900 dark:hover:border-zinc-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 p-16 text-center bg-white dark:bg-zinc-900">
          <CalendarIcon className="mx-auto h-10 w-10 text-zinc-400 dark:text-zinc-500" />
          <h3 className="mt-4 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {sorted.length === 0
              ? t.event_logs_empty
              : filter === "upcoming"
              ? lang === "ru"
                ? "Предстоящих событий нет"
                : "No upcoming events"
              : lang === "ru"
              ? "Прошедших событий нет"
              : "No past events"}
          </h3>
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            {sorted.length === 0
              ? t.no_events_desc
              : lang === "ru"
              ? "Переключите фильтр выше, чтобы посмотреть остальные записи."
              : "Switch the filter above to view other events."}
          </p>
        </div>
      ) : (
        <div className="space-y-3" id="events-timeline-list">
          {filtered.map((ev) => {
            const dateStarts = new Date(ev.starts_at);
            const dateEnds = new Date(ev.ends_at);
            const multiDay = isMultiDayEvent(ev);
            const isPast = dateEnds.getTime() < nowMs;

            return (
              <div
                key={ev.id}
                id={`event-row-${ev.id}`}
                className={`group flex flex-col sm:flex-row justify-between gap-4 border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 hover:border-zinc-900 dark:hover:border-zinc-600 transition-colors ${
                  isPast ? "opacity-75" : ""
                }`}
              >
                <div className="flex gap-4">
                  <div className="flex flex-col items-center justify-center border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-2.5 text-center h-16 w-16 text-zinc-900 dark:text-zinc-100 shrink-0 tabular-nums">
                    <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                      {dateStarts.toLocaleDateString(locale, { month: "short" })}
                    </span>
                    <span className="text-xl font-extrabold leading-none mt-1">
                      {dateStarts.getDate()}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
                      {ev.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                        <Clock className="h-3.5 w-3.5 text-zinc-400" />
                        {multiDay ? (
                          <>
                            {dateStarts.toLocaleString(locale, {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {" — "}
                            {dateEnds.toLocaleString(locale, {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </>
                        ) : (
                          <>
                            {dateStarts.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}
                            {" – "}
                            {dateEnds.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}
                          </>
                        )}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {t.by}: {ev.creator_username}
                      </span>
                    </div>
                    {ev.description && (
                      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-2xl whitespace-pre-wrap">
                        {ev.description}
                      </p>
                    )}
                  </div>
                </div>

                {canManage && (
                  <div className="flex items-start gap-2 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => onEdit(ev)}
                      id={`edit-event-btn-${ev.id}`}
                      className="h-8 w-8 flex items-center justify-center border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
                      title={t.edit_event_tooltip}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(ev.id)}
                      id={`delete-event-btn-${ev.id}`}
                      className="h-8 w-8 flex items-center justify-center border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                      title={t.delete_event_tooltip}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
