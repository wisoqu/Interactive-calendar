import React, { useEffect, useState } from "react";
import { useAuth } from "../store/AuthContext";
import { useThemeLanguage } from "../store/ThemeLanguageContext";
import { CalendarEvent } from "../types";
import { apiClient } from "../api/client";
import { Calendar as CalendarIcon, Plus, Clock, Trash2, Edit3, X, AlertTriangle, ChevronLeft, ChevronRight, CalendarDays, List, Layers } from "lucide-react";

export const CalendarPage: React.FC = () => {
  const { currentClassroom } = useAuth();
  const { lang, t } = useThemeLanguage();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // View state: grid showing full month vs week view vs list timeline
  const [viewMode, setViewMode] = useState<"grid" | "week" | "list">("grid");
  const [currentDate, setCurrentDate] = useState(new Date());

  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    message: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null); // Null = new event
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [warning, setWarning] = useState<string | null>(null);

  // Mini-calendar date & time wizard picker state inside modal
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [pickerStep, setPickerStep] = useState<"start_date" | "start_time" | "end_date" | "end_time">("start_date");

  // Step 1: Handle selecting Start Date on calendar
  const handleSelectStartDate = (pickedDate: Date) => {
    const yyyy = pickedDate.getFullYear();
    const mm = String(pickedDate.getMonth() + 1).padStart(2, "0");
    const dd = String(pickedDate.getDate()).padStart(2, "0");
    const datePart = `${yyyy}-${mm}-${dd}`;

    let timePart = "10:00";
    if (startsAt && startsAt.includes("T")) {
      timePart = startsAt.split("T")[1].slice(0, 5);
    }

    const newStart = `${datePart}T${timePart}`;
    setStartsAt(newStart);

    // Auto-align endsAt to be at least 1 hr after startsAt if needed
    if (!endsAt || new Date(endsAt) <= new Date(newStart)) {
      const endD = new Date(new Date(newStart).getTime() + 60 * 60 * 1000);
      setEndsAt(formatLocalInput(endD.toISOString()));
    }

    // Auto advance to Step 2: Start Time selection!
    setPickerStep("start_time");
  };

  // Step 2: Handle selecting Start Time
  const handleSelectStartTime = (timeStr: string) => {
    let datePart = new Date().toISOString().slice(0, 10);
    if (startsAt && startsAt.includes("T")) {
      datePart = startsAt.split("T")[0];
    }

    const newStart = `${datePart}T${timeStr}`;
    setStartsAt(newStart);

    // Ensure endsAt is at least +1 hour
    const startObj = new Date(newStart);
    const endObj = endsAt ? new Date(endsAt) : new Date(startObj.getTime() + 3600000);
    if (endObj <= startObj) {
      const newEndObj = new Date(startObj.getTime() + 3600000);
      setEndsAt(formatLocalInput(newEndObj.toISOString()));
    }

    // Auto advance to Step 3: End Date selection!
    setPickerStep("end_date");
  };

  // Step 3: Handle selecting End Date on calendar
  const handleSelectEndDate = (pickedDate: Date) => {
    const yyyy = pickedDate.getFullYear();
    const mm = String(pickedDate.getMonth() + 1).padStart(2, "0");
    const dd = String(pickedDate.getDate()).padStart(2, "0");
    const datePart = `${yyyy}-${mm}-${dd}`;

    let timePart = "11:00";
    if (endsAt && endsAt.includes("T")) {
      timePart = endsAt.split("T")[1].slice(0, 5);
    }

    const newEnd = `${datePart}T${timePart}`;
    setEndsAt(newEnd);

    // Auto advance to Step 4: End Time selection!
    setPickerStep("end_time");
  };

  // Step 4: Handle selecting End Time
  const handleSelectEndTime = (timeStr: string) => {
    let datePart = new Date().toISOString().slice(0, 10);
    if (endsAt && endsAt.includes("T")) {
      datePart = endsAt.split("T")[0];
    } else if (startsAt && startsAt.includes("T")) {
      datePart = startsAt.split("T")[0];
    }

    const newEnd = `${datePart}T${timeStr}`;
    setEndsAt(newEnd);

    // Done! Close date picker wizard
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
      setError(err.message || (lang === "ru" ? "Не удалось получить события группы." : "Failed to fetch classroom events."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [currentClassroom]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsEditing(false);
        setConfirmState(null);
        setShowDatePicker(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const canManage = currentClassroom?.user_role === "owner" || currentClassroom?.user_role === "admin";

  const formatLocalInput = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const tzOffset = date.getTimezoneOffset() * 60000; // in ms
    const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);
    return localISOTime;
  };

  const handleOpenCreateForm = () => {
    setTitle("");
    setDesc("");
    const now = new Date();
    const future = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour later
    setStartsAt(formatLocalInput(now.toISOString()));
    setEndsAt(formatLocalInput(future.toISOString()));
    setSelectedEventId(null);
    setWarning(null);
    setShowDatePicker(false);
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
    setIsEditing(true);
  };

  const handleOpenCreateFormForDate = (date: Date, defaultHour = 10) => {
    setTitle("");
    setDesc("");
    const target = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      defaultHour,
      0
    );
    const future = new Date(target.getTime() + 60 * 60 * 1000); // 1 hour later
    setStartsAt(formatLocalInput(target.toISOString()));
    setEndsAt(formatLocalInput(future.toISOString()));
    setSelectedEventId(null);
    setWarning(null);
    setShowDatePicker(false);
    setIsEditing(true);
  };

  // Pick a date from the mini calendar picker in the editor modal
  const handleSelectPickerDate = (pickedDate: Date) => {
    let startHour = 10;
    let startMin = 0;
    let durationMs = 60 * 60 * 1000;

    if (startsAt && endsAt) {
      const curStart = new Date(startsAt);
      const curEnd = new Date(endsAt);
      startHour = curStart.getHours();
      startMin = curStart.getMinutes();
      if (curEnd > curStart) {
        durationMs = curEnd.getTime() - curStart.getTime();
      }
    }

    const newStart = new Date(
      pickedDate.getFullYear(),
      pickedDate.getMonth(),
      pickedDate.getDate(),
      startHour,
      startMin
    );
    const newEnd = new Date(newStart.getTime() + durationMs);

    setStartsAt(formatLocalInput(newStart.toISOString()));
    setEndsAt(formatLocalInput(newEnd.toISOString()));
    setShowDatePicker(false);
  };

  const getMonthName = (date: Date) => {
    const monthIndex = date.getMonth();
    const year = date.getFullYear();
    const ruMonths = [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ];
    const enMonths = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
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
    // Monday-first sorting
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const cells = [];

    // Prior month days padding
    const prevMonthEnd = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      cells.push({
        date: new Date(year, month - 1, prevMonthEnd - i),
        currentMonth: false,
        dayNum: prevMonthEnd - i,
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      cells.push({
        date: new Date(year, month, i),
        currentMonth: true,
        dayNum: i,
      });
    }

    // Next month days to reach standard 42-cell calendar frame
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

  // Get days for the current selected week (Mon - Sun)
  const getWeekDays = () => {
    const curr = new Date(currentDate);
    let dayOfWeek = curr.getDay();
    const distanceToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate() - distanceToMon);

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      weekDays.push(day);
    }
    return weekDays;
  };

  // Always sort events chronologically by start time!
  const getEventsForDate = (date: Date) => {
    return events
      .filter(ev => {
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

  // Check scheduled overlaps on the frontend-side
  const checkConflict = (starts: Date, ends: Date, ignoreEventId: string | null) => {
    for (const ev of events) {
      if (ignoreEventId && ev.id === ignoreEventId) continue;
      const evStarts = new Date(ev.starts_at);
      const evEnds = new Date(ev.ends_at);

      if (starts < evEnds && ends > evStarts) {
        const localTimeStrS = new Date(ev.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const localTimeStrE = new Date(ev.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        if (lang === "ru") {
          return `⚠️ Внимание: Это расписание пересекается с существующим событием "${ev.title}" (${localTimeStrS} - ${localTimeStrE})`;
        } else {
          return `⚠️ Notice: This schedule overlaps with an existing event "${ev.title}" (${localTimeStrS} - ${localTimeStrE})`;
        }
      }
    }
    return null;
  };

  useEffect(() => {
    if (startsAt && endsAt) {
      const s = new Date(startsAt);
      const e = new Date(endsAt);
      if (e > s) {
        const potentialConflict = checkConflict(s, e, selectedEventId);
        setWarning(potentialConflict);
      } else {
        setWarning(null);
      }
    }
  }, [startsAt, endsAt, selectedEventId, events]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClassroom) return;
    setError(null);

    const s = new Date(startsAt);
    const ex = new Date(endsAt);

    if (ex <= s) {
      setError(lang === "ru" ? "Конечное время события должно быть позже начального времени." : "Event end coordinates must be after start coordinates.");
      return;
    }

    try {
      const utcStarts = s.toISOString();
      const utcEnds = ex.toISOString();

      if (selectedEventId) {
        await apiClient.updateEvent(currentClassroom.id, selectedEventId, title, desc, utcStarts, utcEnds);
      } else {
        await apiClient.createEvent(currentClassroom.id, title, desc, utcStarts, utcEnds);
      }

      setIsEditing(false);
      await fetchEvents();
    } catch (err: any) {
      setError(err.message || (lang === "ru" ? "Не удалось сохранить координаты расписания." : "Failed to process scheduling coordinates."));
    }
  };

  const handleDelete = async (eventId: string) => {
    const confirmationMsg = lang === "ru" ? "Вы уверены, что хотите удалить это событие?" : "Are you sure you want to remove this event?";
    if (!currentClassroom) return;
    
    setConfirmState({
      message: confirmationMsg,
      onConfirm: async () => {
        setError(null);
        try {
          await apiClient.deleteEvent(currentClassroom.id, eventId);
          await fetchEvents();
        } catch (err: any) {
          setError(err.message || (lang === "ru" ? "Не удалось удалить запись расписания." : "Failed to delete scheduling record."));
        }
      }
    });
  };

  if (!currentClassroom) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 text-center shadow-sm">
        <CalendarIcon className="mx-auto h-12 w-12 text-zinc-400 dark:text-zinc-500" />
        <h3 className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t.no_classroom_selected}</h3>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{t.pick_classroom_desc}</p>
      </div>
    );
  }

  // Generate mini calendar grid cells for date picker inside form modal
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

  // Hourly slots for week view (08:00 to 22:00)
  const hourSlots = Array.from({ length: 15 }, (_, i) => i + 8);

  return (
    <div id="calendar-view-container" className="space-y-6 py-4">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b-2 border-zinc-200 dark:border-zinc-800 pb-5">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter text-zinc-900 dark:text-zinc-50 font-sans flex items-center gap-2.5">
            <CalendarIcon className="h-6 w-6 text-black dark:text-white" />
            <span>{t.classroom_events}</span>
          </h1>
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-1">
            {t.sorted_schedules} <span className="font-black text-black dark:text-white">{currentClassroom.name}</span>
          </p>
        </div>

        {canManage && (
          <button
            id="open-create-event-btn"
            onClick={handleOpenCreateForm}
            className="inline-flex items-center justify-center gap-2 bg-black dark:bg-zinc-100 px-5 py-3 text-2xs font-black uppercase tracking-widest text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors duration-150 focus:outline-none rounded-none cursor-pointer border border-black dark:border-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.15)] active:translate-x-1 active:translate-y-1 active:shadow-none"
          >
            <Plus className="h-4 w-4" />
            <span>{t.add_event}</span>
          </button>
        )}
      </div>

      {error && (
        <div id="calendar-error-panel" className="border-2 border-zinc-950 dark:border-red-600 bg-red-50 dark:bg-red-950/40 p-4 text-xs font-black uppercase tracking-wider text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Editor Drawer / Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-xs p-4" id="event-form-overlay">
          <div className="w-full max-w-lg border-4 border-black dark:border-zinc-200 bg-white dark:bg-zinc-900 p-6 shadow-2xl relative space-y-4 rounded-none duration-150 text-zinc-900 dark:text-zinc-100 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsEditing(false)}
              className="absolute right-4 top-4 text-zinc-450 hover:text-black dark:hover:text-white focus:outline-none cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-black uppercase tracking-tighter text-zinc-900 dark:text-zinc-50 font-sans" id="event-editor-title">
              {selectedEventId ? t.edit_event_title : t.create_event_title}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                  {t.event_title_label}
                </label>
                <input
                  id="event-title-input"
                  type="text"
                  required
                  placeholder={lang === "ru" ? "например, Лабораторная работа №3" : "e.g. Physics Lab Assignment 3"}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2 px-3 text-xs uppercase font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                  {t.event_desc_label}
                </label>
                <textarea
                  id="event-desc-input"
                  rows={2}
                  placeholder={t.event_desc_placeholder}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2 px-3 text-xs font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                />
              </div>

              {/* Date selection helper button: Open mini calendar picker */}
              <div className="border border-zinc-200 dark:border-zinc-700 p-3 bg-zinc-50 dark:bg-zinc-800/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-black dark:text-white" />
                    {lang === "ru" ? "Выбор даты на календаре" : "Calendar Date Picker"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPickerMonth(startsAt ? new Date(startsAt) : new Date());
                      setShowDatePicker(!showDatePicker);
                    }}
                    className="py-1 px-2.5 text-[9px] font-black uppercase tracking-wider bg-black dark:bg-zinc-100 text-white dark:text-zinc-950 border border-black hover:bg-zinc-800 dark:hover:bg-zinc-200 cursor-pointer"
                  >
                    {showDatePicker 
                      ? (lang === "ru" ? "Скрыть календарь" : "Hide Calendar")
                      : (lang === "ru" ? "📅 Календарь" : "📅 Open Calendar")
                    }
                  </button>
                </div>

                {showDatePicker && (
                  <div className="border-2 border-black dark:border-zinc-600 bg-white dark:bg-zinc-900 p-3 mt-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    {/* Wizard Steps Breadcrumbs */}
                    <div className="flex items-center justify-between gap-1 mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-700 text-[9px] font-black uppercase">
                      <button
                        type="button"
                        onClick={() => setPickerStep("start_date")}
                        className={`px-2 py-1 border transition-colors cursor-pointer ${
                          pickerStep === "start_date"
                            ? "bg-black text-white dark:bg-rose-600 border-black"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700"
                        }`}
                      >
                        1. {lang === "ru" ? "Дата нач." : "Start Date"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPickerStep("start_time")}
                        className={`px-2 py-1 border transition-colors cursor-pointer ${
                          pickerStep === "start_time"
                            ? "bg-black text-white dark:bg-rose-600 border-black"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700"
                        }`}
                      >
                        2. {lang === "ru" ? "Время нач." : "Start Time"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPickerStep("end_date")}
                        className={`px-2 py-1 border transition-colors cursor-pointer ${
                          pickerStep === "end_date"
                            ? "bg-black text-white dark:bg-rose-600 border-black"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700"
                        }`}
                      >
                        3. {lang === "ru" ? "Дата кон." : "End Date"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPickerStep("end_time")}
                        className={`px-2 py-1 border transition-colors cursor-pointer ${
                          pickerStep === "end_time"
                            ? "bg-black text-white dark:bg-rose-600 border-black"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700"
                        }`}
                      >
                        4. {lang === "ru" ? "Время кон." : "End Time"}
                      </button>
                    </div>

                    {/* STEP 1 or STEP 3: Mini Calendar Grid for Start or End Date */}
                    {(pickerStep === "start_date" || pickerStep === "end_date") && (
                      <div>
                        <div className="text-[10px] font-black uppercase text-center mb-2 text-rose-600 dark:text-rose-400">
                          {pickerStep === "start_date"
                            ? (lang === "ru" ? "📅 Шаг 1/4: Выберите дату НАЧАЛА" : "📅 Step 1/4: Choose START date")
                            : (lang === "ru" ? "📅 Шаг 3/4: Выберите дату ОКОНЧАНИЯ" : "📅 Step 3/4: Choose END date")
                          }
                        </div>

                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-200 dark:border-zinc-700">
                          <button
                            type="button"
                            onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))}
                            className="p-1 border border-black dark:border-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-xs font-black uppercase tracking-wider">
                            {getMonthName(pickerMonth)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))}
                            className="p-1 border border-black dark:border-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-7 text-center text-[9px] font-black uppercase text-zinc-400 mb-1">
                          {(lang === "ru" ? ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"] : ["M","T","W","T","F","S","S"]).map(d => (
                            <div key={d}>{d}</div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {getPickerGridCells().map((cell, idx) => {
                            const cellDateStr = cell.date.toISOString().slice(0, 10);
                            const targetDateStr = pickerStep === "start_date"
                              ? (startsAt ? startsAt.split("T")[0] : "")
                              : (endsAt ? endsAt.split("T")[0] : "");
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
                                className={`py-1.5 text-[10px] font-black cursor-pointer text-center transition-colors border ${
                                  isSelected
                                    ? "bg-black text-white dark:bg-rose-600 dark:text-white border-black"
                                    : cell.currentMonth
                                    ? "hover:bg-zinc-200 dark:hover:bg-zinc-700 border-transparent text-zinc-900 dark:text-zinc-100"
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

                    {/* STEP 2: Time Selection for Start Time */}
                    {pickerStep === "start_time" && (
                      <div className="space-y-3">
                        <div className="text-[10px] font-black uppercase text-center text-rose-600 dark:text-rose-400">
                          ⏰ {lang === "ru" ? `Шаг 2/4: Выберите время НАЧАЛА (${startsAt ? startsAt.split("T")[0] : ""})` : `Step 2/4: Select START time (${startsAt ? startsAt.split("T")[0] : ""})`}
                        </div>

                        <div className="grid grid-cols-4 gap-1.5">
                          {["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"].map((tStr) => {
                            const curTime = startsAt ? startsAt.split("T")[1]?.slice(0, 5) : "";
                            const isSelected = curTime === tStr;
                            return (
                              <button
                                key={tStr}
                                type="button"
                                onClick={() => handleSelectStartTime(tStr)}
                                className={`py-1.5 text-[10px] font-black border transition-colors cursor-pointer text-center ${
                                  isSelected
                                    ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                }`}
                              >
                                {tStr}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* STEP 4: Time Selection for End Time */}
                    {pickerStep === "end_time" && (
                      <div className="space-y-3">
                        <div className="text-[10px] font-black uppercase text-center text-rose-600 dark:text-rose-400">
                          🏁 {lang === "ru" ? `Шаг 4/4: Выберите время ОКОНЧАНИЯ (${endsAt ? endsAt.split("T")[0] : ""})` : `Step 4/4: Select END time (${endsAt ? endsAt.split("T")[0] : ""})`}
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
                              className="px-2 py-1 text-[9px] font-black bg-zinc-950 dark:bg-rose-950 text-white dark:text-rose-200 border border-black cursor-pointer hover:bg-zinc-800"
                            >
                              +{hours} {lang === "ru" ? "час(а)" : "hrs"}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-4 gap-1.5">
                          {["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"].map((tStr) => {
                            const curTime = endsAt ? endsAt.split("T")[1]?.slice(0, 5) : "";
                            const isSelected = curTime === tStr;
                            return (
                              <button
                                key={tStr}
                                type="button"
                                onClick={() => handleSelectEndTime(tStr)}
                                className={`py-1.5 text-[10px] font-black border transition-colors cursor-pointer text-center ${
                                  isSelected
                                    ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700"
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
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                    {t.starts_at}
                  </label>
                  <input
                    id="event-start-input"
                    type="datetime-local"
                    required
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2 px-3 text-xs uppercase font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                    {t.ends_at}
                  </label>
                  <input
                    id="event-end-input"
                    type="datetime-local"
                    required
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2 px-3 text-xs uppercase font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
                  />
                </div>
              </div>

              {warning && (
                <div id="conflict-warning-alert" className="flex items-start gap-2 border-2 border-zinc-950 dark:border-yellow-600 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs font-bold text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>{warning}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="border-2 border-zinc-350 dark:border-zinc-600 bg-white dark:bg-zinc-800 py-2 px-4 text-xs font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-none cursor-pointer duration-150"
                >
                  {t.cancel}
                </button>
                <button
                  id="save-event-btn"
                  type="submit"
                  disabled={!title.trim() || !startsAt || !endsAt}
                  className="bg-black dark:bg-rose-900 text-white dark:text-rose-100 py-2.5 px-5 text-xs font-black uppercase tracking-widest hover:bg-zinc-800 dark:hover:bg-rose-800 focus:outline-none disabled:opacity-40 rounded-none cursor-pointer duration-150 border border-black dark:border-rose-500"
                >
                  {selectedEventId ? t.save_changes : t.publish_event}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Mode Switching Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex border-2 border-black dark:border-zinc-700 rounded-none overflow-hidden select-none bg-zinc-50 dark:bg-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]">
          <button
            onClick={() => setViewMode("grid")}
            className={`flex items-center gap-1.5 py-2 px-3.5 text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
              viewMode === "grid"
                ? "bg-black dark:bg-zinc-100 text-white dark:text-zinc-950"
                : "bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span>{lang === "ru" ? "Месяц" : "Month Grid"}</span>
          </button>
          <button
            onClick={() => setViewMode("week")}
            className={`flex items-center gap-1.5 py-2 px-3.5 text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer border-l-2 border-black dark:border-zinc-700 ${
              viewMode === "week"
                ? "bg-black dark:bg-zinc-100 text-white dark:text-zinc-950"
                : "bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>{lang === "ru" ? "Неделя" : "Week View"}</span>
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1.5 py-2 px-3.5 text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer border-l-2 border-black dark:border-zinc-700 ${
              viewMode === "list"
                ? "bg-black dark:bg-zinc-100 text-white dark:text-zinc-950"
                : "bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            <span>{lang === "ru" ? "Список" : "Timeline List"}</span>
          </button>
        </div>

        {/* Date Navigation Toolbar */}
        {viewMode !== "list" && (
          <div className="flex items-center gap-2 border-2 border-black dark:border-zinc-700 p-2 bg-zinc-50 dark:bg-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]">
            <button
              onClick={() => {
                if (viewMode === "grid") {
                  setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
                } else {
                  setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7));
                }
              }}
              className="p-1.5 border-2 border-black dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:bg-zinc-150 dark:hover:bg-zinc-700 text-black dark:text-white rounded-none cursor-pointer duration-100 active:translate-x-[1px] active:translate-y-[1px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              title={lang === "ru" ? "Назад" : "Previous"}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                if (viewMode === "grid") {
                  setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
                } else {
                  setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7));
                }
              }}
              className="p-1.5 border-2 border-black dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:bg-zinc-150 dark:hover:bg-zinc-700 text-black dark:text-white rounded-none cursor-pointer duration-100 active:translate-x-[1px] active:translate-y-[1px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              title={lang === "ru" ? "Вперед" : "Next"}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="py-1.5 px-3 border-2 border-black dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:bg-zinc-150 dark:hover:bg-zinc-700 text-[10px] font-black uppercase tracking-wider text-black dark:text-white rounded-none cursor-pointer duration-100 active:translate-x-[1px] active:translate-y-[1px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            >
              {lang === "ru" ? "Сегодня" : "Today"}
            </button>

            <span className="text-sm font-black uppercase tracking-tighter text-black dark:text-white select-none ml-2">
              {viewMode === "grid" 
                ? getMonthName(currentDate)
                : `${lang === "ru" ? "Неделя:" : "Week:"} ${getWeekDays()[0].toLocaleDateString([], { month: "short", day: "numeric" })} - ${getWeekDays()[6].toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`
              }
            </span>
          </div>
        )}
      </div>

      {/* MONTH GRID VIEW */}
      {viewMode === "grid" && (
        <div className="border-2 border-black dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.1)] overflow-x-auto min-w-full">
          <div className="min-w-[640px]">
            {/* Weekdays names header row */}
            <div className="grid grid-cols-7 border-b-2 border-black dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
              {(lang === "ru" ? ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]).map((d) => (
                <div key={d} className="py-2.5 text-center text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 border-r last:border-r-0 border-zinc-200 dark:border-zinc-700">
                  {d}
                </div>
              ))}
            </div>

            {/* Matrix day grid cells */}
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
                    className={`min-h-[110px] p-2 border-r border-b border-zinc-250 dark:border-zinc-800 last:border-r-0 flex flex-col justify-between transition-all group/cell relative select-none ${
                      isCurrentMonth ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100" : "bg-zinc-50/70 dark:bg-zinc-950/60 text-zinc-300 dark:text-zinc-700"
                    } ${
                      cellIsToday ? "bg-rose-50/50 dark:bg-rose-950/20 border-2 border-black dark:border-rose-500 z-10" : ""
                    } ${
                      canManage ? "hover:bg-zinc-50/40 dark:hover:bg-zinc-800/40 cursor-pointer" : ""
                    }`}
                  >
                    {/* Day Number Header */}
                    <div className="flex items-center justify-between pb-1 select-none">
                      {cellIsToday ? (
                        <span className="flex h-6 w-6 items-center justify-center bg-black dark:bg-rose-600 text-white text-[10px] font-black rounded-none shadow-[2px_2px_0px_0px_rgba(225,29,72,1)]">
                          {cell.dayNum}
                        </span>
                      ) : (
                        <span className={`text-[10px] font-black ${isCurrentMonth ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-350 dark:text-zinc-700"}`}>
                          {cell.dayNum}
                        </span>
                      )}

                      {canManage && isCurrentMonth && (
                        <span className="opacity-0 group-hover/cell:opacity-100 text-[9px] font-black uppercase tracking-wider text-zinc-400 hover:text-black dark:hover:text-white transition-opacity">
                          + {lang === "ru" ? "событие" : "add"}
                        </span>
                      )}
                    </div>

                    {/* Events capsules ordered chronologically */}
                    <div className="flex-1 overflow-y-auto max-h-[85px] pt-1 space-y-1">
                      {dayEvents.map((ev) => (
                        <div
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditForm(ev);
                          }}
                          className="group/capsule relative border-2 border-black dark:border-zinc-700 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/80 text-zinc-950 dark:text-rose-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter truncate rounded-none cursor-pointer transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                          title={`${ev.title}\n(${new Date(ev.starts_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${new Date(ev.ends_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})`}
                        >
                          <div className="flex items-center justify-between gap-1 w-full">
                            <span className="truncate">{ev.title}</span>
                            <span className="text-[7.5px] font-bold text-zinc-500 dark:text-rose-300 shrink-0">
                              {new Date(ev.starts_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})}
                            </span>
                          </div>
                        </div>
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
        <div className="border-2 border-black dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.1)] overflow-x-auto min-w-full">
          <div className="min-w-[720px]">
            {/* Days header row */}
            <div className="grid grid-cols-8 border-b-2 border-black dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
              <div className="py-2.5 text-center text-[10px] font-black uppercase text-zinc-400 border-r border-zinc-200 dark:border-zinc-700">
                {lang === "ru" ? "Время" : "Time"}
              </div>
              {getWeekDays().map((day) => {
                const today = isTodayDate(day);
                return (
                  <div
                    key={day.toISOString()}
                    className={`py-2 text-center border-r last:border-r-0 border-zinc-200 dark:border-zinc-700 ${
                      today ? "bg-rose-100 dark:bg-rose-950/60 font-black" : ""
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase text-zinc-400 dark:text-zinc-500">
                      {day.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { weekday: "short" })}
                    </div>
                    <div className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                      {day.getDate()} {day.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { month: "short" })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time Slot Grid */}
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {hourSlots.map((hour) => (
                <div key={hour} className="grid grid-cols-8 min-h-[50px]">
                  {/* Time label column */}
                  <div className="p-1 text-center text-[10px] font-black text-zinc-400 border-r border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-950/40 select-none flex items-center justify-center">
                    {hour < 10 ? `0${hour}:00` : `${hour}:00`}
                  </div>

                  {/* Day columns for this hour slot */}
                  {getWeekDays().map((day) => {
                    const dayEvs = getEventsForDate(day);
                    // Filter events that start in this hour slot
                    const slotEvents = dayEvs.filter(ev => {
                      const h = new Date(ev.starts_at).getHours();
                      return h === hour;
                    });

                    return (
                      <div
                        key={day.toISOString() + hour}
                        onClick={() => {
                          if (canManage) {
                            handleOpenCreateFormForDate(day, hour);
                          }
                        }}
                        className="p-1 border-r last:border-r-0 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer space-y-1 relative group/slot"
                      >
                        {slotEvents.map((ev) => (
                          <div
                            key={ev.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditForm(ev);
                            }}
                            className="border-2 border-black dark:border-zinc-600 bg-rose-100 dark:bg-rose-900 text-zinc-950 dark:text-rose-100 p-1 text-[9px] font-black uppercase tracking-tight shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="truncate">{ev.title}</span>
                              <span className="text-[7.5px] font-bold text-zinc-600 dark:text-rose-300">
                                {new Date(ev.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                              </span>
                            </div>
                          </div>
                        ))}

                        {canManage && slotEvents.length === 0 && (
                          <span className="opacity-0 group-hover/slot:opacity-100 text-[8px] font-black text-zinc-350 dark:text-zinc-600 uppercase flex items-center justify-center h-full">
                            + {hour}:00
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
      {viewMode === "list" && (
        loading ? (
          <div className="py-20 text-center text-xs font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{t.querying}</div>
        ) : events.length === 0 ? (
          <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 p-16 text-center bg-zinc-100 dark:bg-zinc-900">
            <CalendarIcon className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-600" />
            <h3 className="mt-4 text-sm font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">{t.event_logs_empty}</h3>
            <p className="mt-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{t.no_events_desc}</p>
          </div>
        ) : (
          <div className="space-y-4" id="events-timeline-list">
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
                    className="group relative flex flex-col sm:flex-row justify-between gap-6 border-2 border-zinc-250 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 hover:border-black dark:hover:border-rose-500 transition-all duration-150 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.05)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(244,63,94,0.3)]"
                  >
                    <div className="flex gap-6 shrink-0">
                      <div className="flex flex-col items-center justify-center border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-3 text-center h-16 w-16 text-zinc-900 dark:text-zinc-100 shrink-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                          {dateStarts.toLocaleDateString([], { month: "short" })}
                        </span>
                        <span className="text-2xl font-black tracking-tighter leading-none mt-0.5">{dateStarts.getDate()}</span>
                      </div>

                      <div className="py-1">
                        <h3 className="text-base font-black uppercase mt-0.5 tracking-tight text-zinc-900 dark:text-zinc-50 group-hover:underline">{ev.title}</h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5">
                          <span className="flex items-center gap-1 font-bold text-zinc-900 dark:text-zinc-100 uppercase bg-zinc-100 dark:bg-zinc-850 px-2 py-0.5 text-[10px] tracking-wide border border-zinc-200 dark:border-zinc-800">
                            <Clock className="h-3 w-3" />
                            {dateStarts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                            {" — "}
                            {dateEnds.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                          </span>
                          <span className="text-[10px] font-bold uppercase text-zinc-400 dark:text-zinc-500">{t.by}: {ev.creator_username}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:items-end justify-between gap-3 text-left sm:text-right py-1">
                      <p className="text-xs text-zinc-500 dark:text-zinc-450 font-medium max-w-sm line-clamp-2">
                        {ev.description || (lang === "ru" ? "Дополнительное описание отсутствует." : "No supplemental descriptions.")}
                      </p>

                      {canManage && (
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-xs">
                          <button
                            onClick={() => handleOpenEditForm(ev)}
                            id={`edit-event-btn-${ev.id}`}
                            className="w-8 h-8 flex items-center justify-center border border-zinc-250 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 transition-colors cursor-pointer"
                            title={t.edit_event_tooltip}
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => handleDelete(ev.id)}
                            id={`delete-event-btn-${ev.id}`}
                            className="w-8 h-8 flex items-center justify-center border border-zinc-250 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-650 dark:text-red-400 transition-colors cursor-pointer font-bold text-sm"
                            title={t.delete_event_tooltip}
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )
      )}

      {/* Confirmation Modal */}
      {confirmState && (
        <div id="calendar-confirm-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border-4 border-black p-6 w-full max-w-md shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-none duration-150">
            <h3 className="text-lg font-black uppercase tracking-tight text-zinc-950 font-sans mb-3">
              {lang === "ru" ? "Подтверждение" : "Confirmation"}
            </h3>
            <p className="text-xs font-bold text-zinc-600 leading-relaxed uppercase tracking-tight mb-6 select-none">
              {confirmState.message}
            </p>
            <div className="flex gap-4">
              <button
                id="modal-cancel-btn"
                onClick={() => setConfirmState(null)}
                className="flex-1 bg-white border-2 border-black py-2.5 px-4 text-xs font-black uppercase tracking-wider text-black hover:bg-zinc-100 cursor-pointer rounded-none duration-100 active:translate-x-[1px] active:translate-y-[1px]"
              >
                {lang === "ru" ? "Отмена" : "Cancel"}
              </button>
              <button
                id="modal-confirm-btn"
                onClick={async () => {
                  const cb = confirmState.onConfirm;
                  setConfirmState(null);
                  await cb();
                }}
                className="flex-1 bg-red-600 text-white border-2 border-black py-2.5 px-4 text-xs font-black uppercase tracking-wider hover:bg-red-700 cursor-pointer rounded-none duration-100 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                {lang === "ru" ? "Да, продолжить" : "Yes, proceed"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
