import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../store/AuthContext.tsx";
import { useThemeLanguage } from "../store/ThemeLanguageContext.tsx";
import type { CalendarEvent } from "../types.ts";
import { ApiError, apiClient } from "../api/client.ts";
import { getLocalizedApiError } from "../utils/errorMessages.ts";
import { formatLocalInput, getMonthName, getWeekDays } from "../utils/calendarDate.ts";
import { ConfirmModal, type ConfirmModalState } from "../components/ConfirmModal.tsx";
import { EventViewModal } from "../components/calendar/EventViewModal.tsx";
import { EventEditorModal } from "../components/calendar/EventEditorModal.tsx";
import { MonthGridView } from "../components/calendar/MonthGridView.tsx";
import { WeekGridView } from "../components/calendar/WeekGridView.tsx";
import { EventListView } from "../components/calendar/EventListView.tsx";
import {
  Calendar as CalendarIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Layers,
  List,
  Plus,
} from "lucide-react";

interface EditorDraft {
  editingEventId: string | null;
  title: string;
  desc: string;
  startsAt: string;
  endsAt: string;
}

export const CalendarPage: React.FC = () => {
  const { currentClassroom, refreshClassrooms } = useAuth();
  const { lang, t } = useThemeLanguage();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [viewMode, setViewMode] = useState<"grid" | "week" | "list">("grid");
  const [currentDate, setCurrentDate] = useState(new Date());

  const [editorDraft, setEditorDraft] = useState<EditorDraft | null>(null);
  const [viewingEvent, setViewingEvent] = useState<CalendarEvent | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmModalState | null>(null);

  const fetchEvents = useCallback(
    async (signal?: AbortSignal) => {
      if (!currentClassroom) return;
      setLoading(true);
      setPageError(null);
      try {
        const list = await apiClient.listEvents(currentClassroom.id, { signal });
        if (!signal?.aborted) {
          setEvents(list);
        }
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === "AbortError") return;
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
          await refreshClassrooms();
        }
        setPageError(
          getLocalizedApiError(
            err,
            lang,
            lang === "ru"
              ? "Не удалось загрузить события класса."
              : "Failed to load classroom events."
          )
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [currentClassroom?.id, lang, refreshClassrooms]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchEvents(controller.signal);
    return () => controller.abort();
  }, [fetchEvents]);

  const canManage =
    currentClassroom?.user_role === "owner" || currentClassroom?.user_role === "admin";

  const handleOpenCreateForm = () => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const future = new Date(now.getTime() + 60 * 60 * 1000);
    setEditorDraft({
      editingEventId: null,
      title: "",
      desc: "",
      startsAt: formatLocalInput(now.toISOString()),
      endsAt: formatLocalInput(future.toISOString()),
    });
  };

  const handleOpenCreateFormForDate = (date: Date, defaultHour = 10) => {
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate(), defaultHour, 0);
    const future = new Date(target.getTime() + 60 * 60 * 1000);
    setEditorDraft({
      editingEventId: null,
      title: "",
      desc: "",
      startsAt: formatLocalInput(target.toISOString()),
      endsAt: formatLocalInput(future.toISOString()),
    });
  };

  const handleOpenEditForm = (ev: CalendarEvent) => {
    setEditorDraft({
      editingEventId: ev.id,
      title: ev.title,
      desc: ev.description || "",
      startsAt: formatLocalInput(ev.starts_at),
      endsAt: formatLocalInput(ev.ends_at),
    });
  };

  const handleSelectEventItem = (ev: CalendarEvent) => {
    if (canManage) {
      handleOpenEditForm(ev);
    } else {
      setViewingEvent(ev);
    }
  };

  const handleSaveEvent = async (payload: {
    title: string;
    description: string;
    startsAtIso: string;
    endsAtIso: string;
  }) => {
    if (!currentClassroom) return;
    try {
      if (editorDraft?.editingEventId) {
        await apiClient.updateEvent(currentClassroom.id, editorDraft.editingEventId, {
          title: payload.title,
          description: payload.description,
          starts_at: payload.startsAtIso,
          ends_at: payload.endsAtIso,
        });
      } else {
        await apiClient.createEvent(
          currentClassroom.id,
          payload.title,
          payload.description,
          payload.startsAtIso,
          payload.endsAtIso
        );
      }

      setEditorDraft(null);
      await fetchEvents();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        await refreshClassrooms();
      }
      throw new Error(
        getLocalizedApiError(
          err,
          lang,
          lang === "ru" ? "Не удалось сохранить событие." : "Failed to save event."
        )
      );
    }
  };

  const handleDelete = (eventId: string) => {
    if (!currentClassroom) return;
    setConfirmState({
      title: lang === "ru" ? "Подтверждение удаления" : "Confirm deletion",
      message:
        lang === "ru"
          ? "Вы уверены, что хотите удалить это событие из календаря класса?"
          : "Are you sure you want to delete this event from the classroom calendar?",
      confirmLabel: lang === "ru" ? "Удалить" : "Delete",
      onConfirm: async () => {
        setPageError(null);
        try {
          await apiClient.deleteEvent(currentClassroom.id, eventId);
          setEditorDraft(null);
          await fetchEvents();
        } catch (err) {
          if (err instanceof ApiError && err.status === 403) {
            await refreshClassrooms();
          }
          setPageError(
            getLocalizedApiError(
              err,
              lang,
              lang === "ru" ? "Не удалось удалить событие." : "Failed to delete event."
            )
          );
        }
      },
    });
  };

  if (!currentClassroom) {
    return (
      <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 text-center">
        <CalendarIcon className="mx-auto h-10 w-10 text-zinc-400 dark:text-zinc-500" />
        <h3 className="mt-4 text-sm font-bold text-zinc-900 dark:text-zinc-100">
          {t.no_classroom_selected}
        </h3>
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{t.pick_classroom_desc}</p>
      </div>
    );
  }

  const weekDays = getWeekDays(currentDate);
  const locale = lang === "ru" ? "ru-RU" : "en-US";

  return (
    <div id="calendar-view-container" className="space-y-6 py-2">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2.5">
            <CalendarIcon className="h-6 w-6 shrink-0" />
            <span>{t.classroom_events}</span>
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            {t.sorted_schedules}{" "}
            <span className="font-bold text-zinc-900 dark:text-zinc-100">
              {currentClassroom.name}
            </span>
          </p>
        </div>

        {canManage && (
          <button
            id="open-create-event-btn"
            type="button"
            onClick={handleOpenCreateForm}
            className="inline-flex items-center justify-center gap-2 bg-zinc-900 dark:bg-zinc-100 px-4 py-2.5 text-xs font-bold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors focus:outline-none cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>{t.add_event}</span>
          </button>
        )}
      </div>

      {pageError && (
        <div
          id="calendar-error-panel"
          className="border-2 border-red-600 bg-red-50 dark:bg-red-950/40 p-4 text-xs font-semibold text-red-700 dark:text-red-300"
        >
          {pageError}
        </div>
      )}

      {/* View Mode & Date Navigation Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex border-2 border-zinc-900 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`flex items-center gap-1.5 py-2 px-3.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === "grid"
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span>{lang === "ru" ? "Месяц" : "Month"}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("week")}
            className={`flex items-center gap-1.5 py-2 px-3.5 text-xs font-bold transition-colors cursor-pointer border-l-2 border-zinc-900 dark:border-zinc-700 whitespace-nowrap ${
              viewMode === "week"
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>{lang === "ru" ? "Неделя" : "Week"}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1.5 py-2 px-3.5 text-xs font-bold transition-colors cursor-pointer border-l-2 border-zinc-900 dark:border-zinc-700 whitespace-nowrap ${
              viewMode === "list"
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            <span>{lang === "ru" ? "Список" : "List"}</span>
          </button>
        </div>

        {viewMode !== "list" && (
          <div className="flex items-center gap-2 border-2 border-zinc-200 dark:border-zinc-800 p-1.5 bg-white dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => {
                if (viewMode === "grid") {
                  setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
                } else {
                  setCurrentDate(
                    new Date(
                      currentDate.getFullYear(),
                      currentDate.getMonth(),
                      currentDate.getDate() - 7
                    )
                  );
                }
              }}
              className="p-1.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 cursor-pointer"
              title={lang === "ru" ? "Предыдущий период" : "Previous"}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (viewMode === "grid") {
                  setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
                } else {
                  setCurrentDate(
                    new Date(
                      currentDate.getFullYear(),
                      currentDate.getMonth(),
                      currentDate.getDate() + 7
                    )
                  );
                }
              }}
              className="p-1.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 cursor-pointer"
              title={lang === "ru" ? "Следующий период" : "Next"}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentDate(new Date())}
              className="py-1.5 px-3 border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-bold text-zinc-900 dark:text-zinc-100 cursor-pointer whitespace-nowrap"
            >
              {lang === "ru" ? "Сегодня" : "Today"}
            </button>

            <span className="text-sm font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 px-2 tabular-nums">
              {viewMode === "grid"
                ? getMonthName(currentDate, lang)
                : `${weekDays[0].toLocaleDateString(locale, {
                    month: "short",
                    day: "numeric",
                  })} – ${weekDays[6].toLocaleDateString(locale, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}`}
            </span>
          </div>
        )}
      </div>

      {viewMode === "grid" && (
        <MonthGridView
          currentDate={currentDate}
          events={events}
          canManage={canManage}
          lang={lang}
          onCreateForDate={(d) => handleOpenCreateFormForDate(d, 10)}
          onSelectEvent={handleSelectEventItem}
        />
      )}

      {viewMode === "week" && (
        <WeekGridView
          weekDays={weekDays}
          events={events}
          canManage={canManage}
          lang={lang}
          onCreateForDateHour={handleOpenCreateFormForDate}
          onSelectEvent={handleSelectEventItem}
        />
      )}

      {viewMode === "list" && (
        <EventListView
          events={events}
          loading={loading}
          canManage={canManage}
          lang={lang}
          t={t}
          onEdit={handleOpenEditForm}
          onDelete={handleDelete}
        />
      )}

      <EventViewModal
        event={viewingEvent}
        lang={lang}
        t={t}
        onClose={() => setViewingEvent(null)}
      />

      <EventEditorModal
        open={editorDraft !== null}
        editingEventId={editorDraft?.editingEventId ?? null}
        initialTitle={editorDraft?.title ?? ""}
        initialDesc={editorDraft?.desc ?? ""}
        initialStartsAt={editorDraft?.startsAt ?? ""}
        initialEndsAt={editorDraft?.endsAt ?? ""}
        existingEvents={events}
        lang={lang}
        t={t}
        onClose={() => setEditorDraft(null)}
        onSave={handleSaveEvent}
        onDelete={handleDelete}
      />

      <ConfirmModal
        id="calendar-confirm-modal"
        state={confirmState}
        cancelLabel={t.cancel}
        onClose={() => setConfirmState(null)}
      />
    </div>
  );
};
