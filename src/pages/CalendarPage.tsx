import React, { useEffect, useState } from "react";
import { useAuth } from "../store/AuthContext";
import { useThemeLanguage } from "../store/ThemeLanguageContext";
import { CalendarEvent } from "../types";
import { apiClient } from "../api/client";
import {
  Calendar as CalendarIcon,
  Plus,
  Clock,
  Trash2,
  Edit3,
  X,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List,
  Layers,
} from "lucide-react";

export const CalendarPage: React.FC = () => {
  const { currentClassroom, refreshClassrooms } = useAuth();
  const { lang, t } = useThemeLanguage();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // View state: month grid, week view, or chronological list
  const [viewMode, setViewMode] = useState<"grid" | "week" | "list">("grid");
  const [currentDate, setCurrentDate] = useState(new Date());

  // Editor & Read-Only Viewer Modal State
  const [isEditing, setIsEditing] = useState(false);
  const [viewingEvent, setViewingEvent] = useState<CalendarEvent | null>(null);
  const [confirmState, setConfirmState] = useState<{
    message: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [warning, setWarning] = useState<string | null>(null);

  // Mini-calendar date & time wizard inside modal
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [pickerStep, setPickerStep] = useState<"start_date" | "start_time" | "end_date" | "end_time">("start_date");

  const formatLocalDatePart = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatLocalInput = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  // Step 1: Select Start Date
  const handleSelectStartDate = (pickedDate: Date) => {
    const datePart = formatLocalDatePart(pickedDate);
    let timePart = "10:00";
    if (startsAt && startsAt.includes("T")) {
      timePart = startsAt.split("T")[1].slice(0, 5);
    }

    const newStart = `${datePart}T${timePart}`;
    setStartsAt(newStart);

    if (!endsAt || new Date(endsAt) <= new Date(newStart)) {
      const endD = new Date(new Date(newStart).getTime() + 60 * 60 * 1000);
      setEndsAt(formatLocalInput(endD.toISOString()));
    }

    setPickerStep("start_time");
  };

  // Step 2: Select Start Time
  const handleSelectStartTime = (timeStr: string) => {
    let datePart = formatLocalDatePart(new Date());
    if (startsAt && startsAt.includes("T")) {
      datePart = startsAt.split("T")[0];
    }

    const newStart = `${datePart}T${timeStr}`;
    setStartsAt(newStart);

    const startObj = new Date(newStart);
    const endObj = endsAt ? new Date(endsAt) : new Date(startObj.getTime() + 3600000);
    if (endObj <= startObj) {
      const newEndObj = new Date(startObj.getTime() + 3600000);
      setEndsAt(formatLocalInput(newEndObj.toISOString()));
    }

    setPickerStep("end_date");
  };

  // Step 3: Select End Date
  const handleSelectEndDate = (pickedDate: Date) => {
    const datePart = formatLocalDatePart(pickedDate);
    let timePart = "11:00";
    if (endsAt && endsAt.includes("T")) {
      timePart = endsAt.split("T")[1].slice(0, 5);
    }

    const newEnd = `${datePart}T${timePart}`;
    setEndsAt(newEnd);
    setPickerStep("end_time");
  };

  // Step 4: Select End Time
  const handleSelectEndTime = (timeStr: string) => {
    let datePart = formatLocalDatePart(new Date());
    if (endsAt && endsAt.includes("T")) {
      datePart = endsAt.split("T")[0];
    } else if (startsAt && startsAt.includes("T")) {
      datePart = startsAt.split("T")[0];
    }

    setEndsAt(`${datePart}T${timeStr}`);
    setShowDatePicker(false);
  };

  const fetchEvents = async () => {
    if (!currentClassroom) return;
    setLoading(true);
    setError(null);
    try {
      const list = await apiClient.listEvents(currentClassroom.id);
      setEvents(list);
    } catch (err: any) {
      if (err?.status === 403 || err?.status === 404) {
        await refreshClassrooms();
      }
      setError(
        err.message ||
          (lang === "ru" ? "Не удалось загрузить события класса." : "Failed to load classroom events.")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [currentClassroom?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmState) {
          setConfirmState(null);
          return;
        }
        if (showDatePicker) {
          setShowDatePicker(false);
          return;
        }
        setIsEditing(false);
        setViewingEvent(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmState, showDatePicker]);

  const canManage = currentClassroom?.user_role === "owner" || currentClassroom?.user_role === "admin";

  const handleOpenCreateForm = () => {
    setTitle("");
    setDesc("");
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const future = new Date(now.getTime() + 60 * 60 * 1000);
    setStartsAt(formatLocalInput(now.toISOString()));
    setEndsAt(formatLocalInput(future.toISOString()));
    setSelectedEventId(null);
    setWarning(null);
    setShowDatePicker(false);
    setPickerStep("start_date");
    setIsEditing(true);
  };

  const handleOpenEditForm = (ev: CalendarEvent) => {
    setTitle(ev.title);
    setDesc(ev.description || "");
    setStartsAt(formatLocalInput(ev.starts_at));
    setEndsAt(formatLocalInput(ev.ends_at));
    setSelectedEventId(ev.id);
    setWarning(null);
    setShowDatePicker(false);
    setPickerStep("start_date");
    setIsEditing(true);
  };

  const handleSelectEventItem = (ev: CalendarEvent) => {
    if (canManage) {
      handleOpenEditForm(ev);
    } else {
      setViewingEvent(ev);
    }
  };

  const handleOpenCreateFormForDate = (date: Date, defaultHour = 10) => {
    setTitle("");
    setDesc("");
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate(), defaultHour, 0);
    const future = new Date(target.getTime() + 60 * 60 * 1000);
    setStartsAt(formatLocalInput(target.toISOString()));
    setEndsAt(formatLocalInput(future.toISOString()));
    setSelectedEventId(null);
    setWarning(null);
    setShowDatePicker(false);
    setPickerStep("start_date");
    setIsEditing(true);
  };

  const getMonthName = (date: Date) => {
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
  };

  const getGridCells = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    const totalDays = endOfMonth.getDate();

    let startDayOfWeek = startOfMonth.getDay();
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const cells = [];
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
  };

  const getWeekDays = () => {
    const curr = new Date(currentDate);
    const dayOfWeek = curr.getDay();
    const distanceToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate() - distanceToMon);

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      weekDays.push(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
    }
    return weekDays;
  };

  const getEventsForDate = (date: Date) => {
    return events
      .filter((ev) => {
        const evDate = new Date(ev.starts_at);
        return (
          evDate.getFullYear() === date.getFullYear() &&
          evDate.getMonth() === date.getMonth() &&
          evDate.getDate() === date.getDate()
        );
      })
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  };

  const isTodayDate = (date: Date) => {
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  const checkConflict = (starts: Date, ends: Date, ignoreEventId: string | null) => {
    for (const ev of events) {
      if (ignoreEventId && ev.id === ignoreEventId) continue;
      const evStarts = new Date(ev.starts_at);
      const evEnds = new Date(ev.ends_at);

      if (starts < evEnds && ends > evStarts) {
        const localTimeStrS = evStarts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
        const localTimeStrE = evEnds.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

        return lang === "ru"
          ? `Пересечение по времени с событием «${ev.title}» (${localTimeStrS} – ${localTimeStrE})`
          : `Overlaps with existing event "${ev.title}" (${localTimeStrS} – ${localTimeStrE})`;
      }
    }
    return null;
  };

  useEffect(() => {
    if (startsAt && endsAt) {
      const s = new Date(startsAt);
      const e = new Date(endsAt);
      if (e > s) {
        setWarning(checkConflict(s, e, selectedEventId));
      } else {
        setWarning(null);
      }
    }
  }, [startsAt, endsAt, selectedEventId, events, lang]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClassroom) return;
    setError(null);

    const s = new Date(startsAt);
    const ex = new Date(endsAt);

    if (ex <= s) {
      setError(
        lang === "ru"
          ? "Время окончания события должно быть позже времени начала."
          : "Event end time must be after start time."
      );
      return;
    }

    try {
      const utcStarts = s.toISOString();
      const utcEnds = ex.toISOString();

      if (selectedEventId) {
        await apiClient.updateEvent(currentClassroom.id, selectedEventId, title.trim(), desc.trim(), utcStarts, utcEnds);
      } else {
        await apiClient.createEvent(currentClassroom.id, title.trim(), desc.trim(), utcStarts, utcEnds);
      }

      setIsEditing(false);
      await fetchEvents();
    } catch (err: any) {
      if (err?.status === 403) {
        await refreshClassrooms();
      }
      setError(err.message || (lang === "ru" ? "Не удалось сохранить событие." : "Failed to save event."));
    }
  };

  const handleDelete = (eventId: string) => {
    if (!currentClassroom) return;
    const confirmationMsg =
      lang === "ru"
        ? "Вы уверены, что хотите удалить это событие из календаря класса?"
        : "Are you sure you want to delete this event from the classroom calendar?";

    setConfirmState({
      message: confirmationMsg,
      onConfirm: async () => {
        setError(null);
        try {
          await apiClient.deleteEvent(currentClassroom.id, eventId);
          setIsEditing(false);
          await fetchEvents();
        } catch (err: any) {
          if (err?.status === 403) {
            await refreshClassrooms();
          }
          setError(err.message || (lang === "ru" ? "Не удалось удалить событие." : "Failed to delete event."));
        }
      },
    });
  };

  if (!currentClassroom) {
    return (
      <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 text-center">
        <CalendarIcon className="mx-auto h-10 w-10 text-zinc-400 dark:text-zinc-500" />
        <h3 className="mt-4 text-sm font-bold text-zinc-900 dark:text-zinc-100">{t.no_classroom_selected}</h3>
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{t.pick_classroom_desc}</p>
      </div>
    );
  }

  const getPickerGridCells = () => {
    const year = pickerMonth.getFullYear();
    const month = pickerMonth.getMonth();
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    const totalDays = endOfMonth.getDate();

    let startDay = startOfMonth.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;

    const cells = [];
    const prevMonthEnd = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month - 1, prevMonthEnd - i), currentMonth: false });
    }
    for (let i = 1; i <= totalDays; i++) {
      cells.push({ date: new Date(year, month, i), currentMonth: true });
    }
    const rem = 35 - cells.length;
    for (let i = 1; i <= (rem < 0 ? 42 - cells.length : rem); i++) {
      cells.push({ date: new Date(year, month + 1, i), currentMonth: false });
    }
    return cells;
  };

  const hourSlots = Array.from({ length: 15 }, (_, i) => i + 8);
  const weekDays = getWeekDays();

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
            <span className="font-bold text-zinc-900 dark:text-zinc-100">{currentClassroom.name}</span>
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

      {error && (
        <div
          id="calendar-error-panel"
          className="border-2 border-red-600 bg-red-50 dark:bg-red-950/40 p-4 text-xs font-semibold text-red-700 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {/* Read-Only Event Details Modal (for Members) */}
      {viewingEvent && (
        <div
          id="event-details-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md border-2 border-zinc-900 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 shadow-xl relative space-y-4 text-zinc-900 dark:text-zinc-100">
            <button
              type="button"
              onClick={() => setViewingEvent(null)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 focus:outline-none cursor-pointer"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-extrabold tracking-tight pr-6">{viewingEvent.title}</h3>

            <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-1.5 border-y border-zinc-200 dark:border-zinc-800 py-3">
              <div className="flex items-center gap-2 font-mono tabular-nums font-semibold">
                <Clock className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <span>
                  {new Date(viewingEvent.starts_at).toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" — "}
                  {new Date(viewingEvent.ends_at).toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="text-zinc-500 dark:text-zinc-400">
                {t.by}: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{viewingEvent.creator_username}</span>
              </div>
            </div>

            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {viewingEvent.description || (lang === "ru" ? "Описание отсутствует." : "No description provided.")}
            </p>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setViewingEvent(null)}
                className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2 px-4 text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 cursor-pointer"
              >
                {lang === "ru" ? "Закрыть" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Create / Edit Modal */}
      {isEditing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          id="event-form-overlay"
        >
          <div className="w-full max-w-lg border-2 border-zinc-900 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 shadow-xl relative space-y-4 text-zinc-900 dark:text-zinc-100 max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-900 dark:hover:text-white focus:outline-none cursor-pointer"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50" id="event-editor-title">
              {selectedEventId ? t.edit_event_title : t.create_event_title}
            </h3>

            {error && (
              <div className="border-2 border-red-600 bg-red-50 dark:bg-red-950/50 p-3 text-xs font-semibold text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 pt-1">
              <div>
                <label
                  htmlFor="event-title-input"
                  className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 block"
                >
                  {t.event_title_label}
                </label>
                <input
                  id="event-title-input"
                  type="text"
                  required
                  minLength={2}
                  placeholder={t.event_title_placeholder}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2 px-3 text-sm focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                />
              </div>

              <div>
                <label
                  htmlFor="event-desc-input"
                  className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 block"
                >
                  {t.event_desc_label}
                </label>
                <textarea
                  id="event-desc-input"
                  rows={2}
                  placeholder={t.event_desc_placeholder}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2 px-3 text-sm focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                />
              </div>

              {/* Step-by-step Date & Time Picker */}
              <div className="border border-zinc-200 dark:border-zinc-700 p-3 bg-zinc-50 dark:bg-zinc-800/60 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                    <span>{lang === "ru" ? "Быстрый выбор на календаре" : "Quick calendar picker"}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPickerMonth(startsAt ? new Date(startsAt) : new Date());
                      setShowDatePicker(!showDatePicker);
                    }}
                    className="py-1 px-2.5 text-xs font-bold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 cursor-pointer whitespace-nowrap"
                  >
                    {showDatePicker
                      ? lang === "ru"
                        ? "Скрыть"
                        : "Hide"
                      : lang === "ru"
                      ? "Открыть календарь"
                      : "Open picker"}
                  </button>
                </div>

                {showDatePicker && (
                  <div className="border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 mt-2">
                    <div className="grid grid-cols-4 gap-1 mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => setPickerStep("start_date")}
                        className={`px-2 py-1 text-center transition-colors cursor-pointer truncate ${
                          pickerStep === "start_date"
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                        }`}
                      >
                        1. {lang === "ru" ? "Дата нач." : "Start date"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPickerStep("start_time")}
                        className={`px-2 py-1 text-center transition-colors cursor-pointer truncate ${
                          pickerStep === "start_time"
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                        }`}
                      >
                        2. {lang === "ru" ? "Время нач." : "Start time"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPickerStep("end_date")}
                        className={`px-2 py-1 text-center transition-colors cursor-pointer truncate ${
                          pickerStep === "end_date"
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                        }`}
                      >
                        3. {lang === "ru" ? "Дата кон." : "End date"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPickerStep("end_time")}
                        className={`px-2 py-1 text-center transition-colors cursor-pointer truncate ${
                          pickerStep === "end_time"
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                        }`}
                      >
                        4. {lang === "ru" ? "Время кон." : "End time"}
                      </button>
                    </div>

                    {(pickerStep === "start_date" || pickerStep === "end_date") && (
                      <div>
                        <div className="text-xs font-bold text-center mb-2 text-zinc-700 dark:text-zinc-300">
                          {pickerStep === "start_date"
                            ? lang === "ru"
                              ? "Шаг 1 из 4: выберите дату начала"
                              : "Step 1 of 4: choose start date"
                            : lang === "ru"
                            ? "Шаг 3 из 4: выберите дату окончания"
                            : "Step 3 of 4: choose end date"}
                        </div>

                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-200 dark:border-zinc-800">
                          <button
                            type="button"
                            onClick={() =>
                              setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))
                            }
                            className="p-1 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-xs font-bold">{getMonthName(pickerMonth)}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))
                            }
                            className="p-1 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-7 text-center text-[10px] font-bold text-zinc-400 mb-1">
                          {(lang === "ru"
                            ? ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
                            : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
                          ).map((d, i) => (
                            <div key={i}>{d}</div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {getPickerGridCells().map((cell, idx) => {
                            const cellDateStr = formatLocalDatePart(cell.date);
                            const targetDateStr =
                              pickerStep === "start_date"
                                ? startsAt
                                  ? startsAt.split("T")[0]
                                  : ""
                                : endsAt
                                ? endsAt.split("T")[0]
                                : "";
                            const isSelected = cellDateStr === targetDateStr;

                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  if (pickerStep === "start_date") {
                                    handleSelectStartDate(cell.date);
                                  } else {
                                    handleSelectEndDate(cell.date);
                                  }
                                }}
                                className={`py-1.5 text-xs font-bold tabular-nums cursor-pointer text-center transition-colors border ${
                                  isSelected
                                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                                    : cell.currentMonth
                                    ? "hover:bg-zinc-100 dark:hover:bg-zinc-800 border-transparent text-zinc-900 dark:text-zinc-100"
                                    : "text-zinc-400 dark:text-zinc-600 border-transparent"
                                }`}
                              >
                                {cell.date.getDate()}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {pickerStep === "start_time" && (
                      <div className="space-y-3">
                        <div className="text-xs font-bold text-center text-zinc-700 dark:text-zinc-300 tabular-nums">
                          {lang === "ru"
                            ? `Шаг 2 из 4: выберите время начала (${startsAt ? startsAt.split("T")[0] : ""})`
                            : `Step 2 of 4: select start time (${startsAt ? startsAt.split("T")[0] : ""})`}
                        </div>

                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            "08:00",
                            "09:00",
                            "10:00",
                            "11:00",
                            "12:00",
                            "13:00",
                            "14:00",
                            "15:00",
                            "16:00",
                            "17:00",
                            "18:00",
                            "19:00",
                          ].map((tStr) => {
                            const curTime = startsAt ? startsAt.split("T")[1]?.slice(0, 5) : "";
                            const isSelected = curTime === tStr;
                            return (
                              <button
                                key={tStr}
                                type="button"
                                onClick={() => handleSelectStartTime(tStr)}
                                className={`py-1.5 text-xs font-mono tabular-nums font-bold border transition-colors cursor-pointer text-center ${
                                  isSelected
                                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                                    : "bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                                }`}
                              >
                                {tStr}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {pickerStep === "end_time" && (
                      <div className="space-y-3">
                        <div className="text-xs font-bold text-center text-zinc-700 dark:text-zinc-300 tabular-nums">
                          {lang === "ru"
                            ? `Шаг 4 из 4: выберите время окончания (${endsAt ? endsAt.split("T")[0] : ""})`
                            : `Step 4 of 4: select end time (${endsAt ? endsAt.split("T")[0] : ""})`}
                        </div>

                        <div className="flex gap-1.5 justify-center mb-2">
                          {[1, 2, 3].map((hours) => (
                            <button
                              key={hours}
                              type="button"
                              onClick={() => {
                                if (startsAt) {
                                  const sDate = new Date(startsAt);
                                  const eDate = new Date(sDate.getTime() + hours * 3600000);
                                  setEndsAt(formatLocalInput(eDate.toISOString()));
                                  setShowDatePicker(false);
                                }
                              }}
                              className="px-2.5 py-1 text-xs font-bold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 cursor-pointer hover:bg-zinc-800 dark:hover:bg-zinc-200"
                            >
                              +{hours} {lang === "ru" ? "ч." : "h"}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            "09:00",
                            "10:00",
                            "11:00",
                            "12:00",
                            "13:00",
                            "14:00",
                            "15:00",
                            "16:00",
                            "17:00",
                            "18:00",
                            "19:00",
                            "20:00",
                          ].map((tStr) => {
                            const curTime = endsAt ? endsAt.split("T")[1]?.slice(0, 5) : "";
                            const isSelected = curTime === tStr;
                            return (
                              <button
                                key={tStr}
                                type="button"
                                onClick={() => handleSelectEndTime(tStr)}
                                className={`py-1.5 text-xs font-mono tabular-nums font-bold border transition-colors cursor-pointer text-center ${
                                  isSelected
                                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                                    : "bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                                }`}
                              >
                                {tStr}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Datetime Local Inputs */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="event-start-input"
                    className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 block"
                  >
                    {t.starts_at}
                  </label>
                  <input
                    id="event-start-input"
                    type="datetime-local"
                    required
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2 px-3 text-xs font-mono tabular-nums focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold"
                  />
                </div>

                <div>
                  <label
                    htmlFor="event-end-input"
                    className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 block"
                  >
                    {t.ends_at}
                  </label>
                  <input
                    id="event-end-input"
                    type="datetime-local"
                    required
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2 px-3 text-xs font-mono tabular-nums focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold"
                  />
                </div>
              </div>

              {warning && (
                <div
                  id="conflict-warning-alert"
                  className="flex items-start gap-2 border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs font-semibold text-amber-900 dark:text-amber-200"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <span>{warning}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <div>
                  {selectedEventId && (
                    <button
                      type="button"
                      onClick={() => handleDelete(selectedEventId)}
                      className="inline-flex items-center gap-1.5 border-2 border-red-600 bg-white dark:bg-zinc-900 py-2 px-3 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{lang === "ru" ? "Удалить" : "Delete"}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="border-2 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-2 px-4 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer transition-colors"
                  >
                    {t.cancel}
                  </button>
                  <button
                    id="save-event-btn"
                    type="submit"
                    disabled={!title.trim() || !startsAt || !endsAt}
                    className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2 px-5 text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 focus:outline-none disabled:opacity-40 cursor-pointer transition-colors border-2 border-zinc-900 dark:border-zinc-100"
                  >
                    {selectedEventId ? t.save_changes : t.publish_event}
                  </button>
                </div>
              </div>
            </form>
          </div>
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
                  setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7));
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
                  setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7));
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
                ? getMonthName(currentDate)
                : `${weekDays[0].toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", {
                    month: "short",
                    day: "numeric",
                  })} – ${weekDays[6].toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}`}
            </span>
          </div>
        )}
      </div>

      {/* MONTH GRID VIEW */}
      {viewMode === "grid" && (
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
              {getGridCells().map((cell, idx) => {
                const dayEvents = getEventsForDate(cell.date);
                const cellIsToday = isTodayDate(cell.date);
                const isCurrentMonth = cell.currentMonth;

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (canManage) {
                        handleOpenCreateFormForDate(cell.date);
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
                      {dayEvents.map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectEventItem(ev);
                          }}
                          className="w-full text-left border border-zinc-900 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold truncate cursor-pointer transition-colors"
                          title={`${ev.title} (${new Date(ev.starts_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })})`}
                        >
                          <div className="flex items-center justify-between gap-1 w-full">
                            <span className="truncate">{ev.title}</span>
                            <span className="text-[10px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
                              {new Date(ev.starts_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              })}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* WEEK VIEW */}
      {viewMode === "week" && (
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
                      {day.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { weekday: "short" })}
                    </div>
                    <div className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 tabular-nums">
                      {day.getDate()}{" "}
                      {day.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { month: "short" })}
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
                    const dayEvs = getEventsForDate(day);
                    const slotEvents = dayEvs.filter((ev) => new Date(ev.starts_at).getHours() === hour);

                    return (
                      <div
                        key={day.toISOString() + hour}
                        onClick={() => {
                          if (canManage) {
                            handleOpenCreateFormForDate(day, hour);
                          }
                        }}
                        className={`p-1 border-r last:border-r-0 border-zinc-200 dark:border-zinc-800 transition-colors space-y-1 relative group/slot ${
                          canManage ? "hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer" : ""
                        }`}
                      >
                        {slotEvents.map((ev) => (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectEventItem(ev);
                            }}
                            className="w-full text-left border border-zinc-900 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 p-1 text-[11px] font-semibold cursor-pointer"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="truncate">{ev.title}</span>
                              <span className="text-[10px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
                                {new Date(ev.starts_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: false,
                                })}
                              </span>
                            </div>
                          </button>
                        ))}

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
      )}

      {/* TIMELINE / LIST VIEW */}
      {viewMode === "list" &&
        (loading ? (
          <div className="py-16 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            {t.querying}
          </div>
        ) : events.length === 0 ? (
          <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 p-16 text-center bg-white dark:bg-zinc-900">
            <CalendarIcon className="mx-auto h-10 w-10 text-zinc-400 dark:text-zinc-500" />
            <h3 className="mt-4 text-sm font-bold text-zinc-900 dark:text-zinc-100">{t.event_logs_empty}</h3>
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{t.no_events_desc}</p>
          </div>
        ) : (
          <div className="space-y-3" id="events-timeline-list">
            {events
              .slice()
              .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
              .map((ev) => {
                const dateStarts = new Date(ev.starts_at);
                const dateEnds = new Date(ev.ends_at);

                return (
                  <div
                    key={ev.id}
                    id={`event-row-${ev.id}`}
                    className="group flex flex-col sm:flex-row justify-between gap-4 border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 hover:border-zinc-900 dark:hover:border-zinc-600 transition-colors"
                  >
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center justify-center border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-2.5 text-center h-16 w-16 text-zinc-900 dark:text-zinc-100 shrink-0 tabular-nums">
                        <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                          {dateStarts.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { month: "short" })}
                        </span>
                        <span className="text-xl font-extrabold leading-none mt-1">{dateStarts.getDate()}</span>
                      </div>

                      <div>
                        <h3 className="text-base font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
                          {ev.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                          <span className="inline-flex items-center gap-1 font-mono tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                            <Clock className="h-3.5 w-3.5 text-zinc-400" />
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
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {t.by}: {ev.creator_username}
                          </span>
                        </div>
                        {ev.description && (
                          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-2xl">
                            {ev.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex items-start gap-2 self-end sm:self-center shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditForm(ev)}
                          id={`edit-event-btn-${ev.id}`}
                          className="h-8 w-8 flex items-center justify-center border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
                          title={t.edit_event_tooltip}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ev.id)}
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
        ))}

      {/* Confirmation Modal */}
      {confirmState && (
        <div
          id="calendar-confirm-modal"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-700 p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
              {lang === "ru" ? "Подтверждение удаления" : "Confirm deletion"}
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed mb-6">
              {confirmState.message}
            </p>
            <div className="flex gap-3">
              <button
                id="modal-cancel-btn"
                type="button"
                onClick={() => setConfirmState(null)}
                className="flex-1 bg-white dark:bg-zinc-800 border-2 border-zinc-300 dark:border-zinc-700 py-2.5 px-4 text-xs font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                id="modal-confirm-btn"
                type="button"
                onClick={async () => {
                  const cb = confirmState.onConfirm;
                  setConfirmState(null);
                  await cb();
                }}
                className="flex-1 bg-red-600 text-white py-2.5 px-4 text-xs font-bold hover:bg-red-700 cursor-pointer"
              >
                {lang === "ru" ? "Удалить" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
