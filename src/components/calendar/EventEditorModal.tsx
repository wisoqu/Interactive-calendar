import React, { useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import type { CalendarEvent } from "../../types.ts";
import type { Language, Translations } from "../../store/ThemeLanguageContext.tsx";
import {
  findEventConflict,
  formatLocalDatePart,
  formatLocalInput,
  getMonthName,
} from "../../utils/calendarDate.ts";

interface EventEditorModalProps {
  open: boolean;
  editingEventId: string | null;
  initialTitle: string;
  initialDesc: string;
  initialStartsAt: string;
  initialEndsAt: string;
  existingEvents: CalendarEvent[];
  lang: Language;
  t: Translations;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    description: string;
    startsAtIso: string;
    endsAtIso: string;
  }) => Promise<void>;
  onDelete?: (eventId: string) => void;
}

type PickerStep = "start_date" | "start_time" | "end_date" | "end_time";

export const EventEditorModal: React.FC<EventEditorModalProps> = ({
  open,
  editingEventId,
  initialTitle,
  initialDesc,
  initialStartsAt,
  initialEndsAt,
  existingEvents,
  lang,
  t,
  onClose,
  onSave,
  onDelete,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [desc, setDesc] = useState(initialDesc);
  const [startsAt, setStartsAt] = useState(initialStartsAt);
  const [endsAt, setEndsAt] = useState(initialEndsAt);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [pickerStep, setPickerStep] = useState<PickerStep>("start_date");

  // Reset form state cleanly every time the modal opens
  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setDesc(initialDesc);
    setStartsAt(initialStartsAt);
    setEndsAt(initialEndsAt);
    setFormError(null);
    setSubmitting(false);
    setShowDatePicker(false);
    setPickerStep("start_date");
    const base = initialStartsAt ? new Date(initialStartsAt) : new Date();
    setPickerMonth(Number.isNaN(base.getTime()) ? new Date() : base);
  }, [open, editingEventId, initialTitle, initialDesc, initialStartsAt, initialEndsAt]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showDatePicker) {
          setShowDatePicker(false);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, showDatePicker, onClose]);

  if (!open) return null;

  const warning =
    startsAt && endsAt
      ? findEventConflict(existingEvents, new Date(startsAt), new Date(endsAt), editingEventId, lang)
      : null;

  const handleSelectStartDate = (pickedDate: Date) => {
    const datePart = formatLocalDatePart(pickedDate);
    let timePart = "10:00";
    if (startsAt && startsAt.includes("T")) {
      timePart = startsAt.split("T")[1].slice(0, 5);
    }

    const newStart = `${datePart}T${timePart}`;
    setStartsAt(newStart);

    const startObj = new Date(newStart);
    if (!endsAt || new Date(endsAt) <= startObj) {
      const endD = new Date(startObj.getTime() + 60 * 60 * 1000);
      setEndsAt(formatLocalInput(endD.toISOString()));
    }

    setPickerStep("start_time");
  };

  const handleSelectStartTime = (timeStr: string) => {
    let datePart = formatLocalDatePart(new Date());
    if (startsAt && startsAt.includes("T")) {
      datePart = startsAt.split("T")[0];
    }

    const newStart = `${datePart}T${timeStr}`;
    setStartsAt(newStart);

    const startObj = new Date(newStart);
    const endObj = endsAt ? new Date(endsAt) : new Date(startObj.getTime() + 3600000);
    if (Number.isNaN(endObj.getTime()) || endObj <= startObj) {
      const newEndObj = new Date(startObj.getTime() + 3600000);
      setEndsAt(formatLocalInput(newEndObj.toISOString()));
    }

    setPickerStep("end_date");
  };

  const handleSelectEndDate = (pickedDate: Date) => {
    const datePart = formatLocalDatePart(pickedDate);
    let timePart = "11:00";
    if (endsAt && endsAt.includes("T")) {
      timePart = endsAt.split("T")[1].slice(0, 5);
    }

    const candidateEnd = `${datePart}T${timePart}`;
    if (startsAt) {
      const sObj = new Date(startsAt);
      const eObj = new Date(candidateEnd);
      if (!Number.isNaN(sObj.getTime()) && !Number.isNaN(eObj.getTime()) && eObj <= sObj) {
        const startDateOnly = startsAt.split("T")[0];
        if (datePart < startDateOnly) {
          setFormError(
            lang === "ru"
              ? "Дата окончания не может быть раньше даты начала."
              : "End date cannot be earlier than start date."
          );
          return;
        }
      }
    }

    setFormError(null);
    setEndsAt(candidateEnd);
    setPickerStep("end_time");
  };

  const handleSelectEndTime = (timeStr: string) => {
    let datePart = formatLocalDatePart(new Date());
    if (endsAt && endsAt.includes("T")) {
      datePart = endsAt.split("T")[0];
    } else if (startsAt && startsAt.includes("T")) {
      datePart = startsAt.split("T")[0];
    }

    setFormError(null);
    setEndsAt(`${datePart}T${timeStr}`);
    setShowDatePicker(false);
  };

  const getPickerGridCells = () => {
    const year = pickerMonth.getFullYear();
    const month = pickerMonth.getMonth();
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    const totalDays = endOfMonth.getDate();

    let startDay = startOfMonth.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;

    const cells: Array<{ date: Date; currentMonth: boolean }> = [];
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanTitle = title.trim();
    if (cleanTitle.length < 2 || cleanTitle.length > 150) {
      setFormError(
        lang === "ru"
          ? "Название события должно содержать от 2 до 150 символов."
          : "Event title must be between 2 and 150 characters."
      );
      return;
    }

    const s = new Date(startsAt);
    const ex = new Date(endsAt);

    if (Number.isNaN(s.getTime()) || Number.isNaN(ex.getTime())) {
      setFormError(
        lang === "ru"
          ? "Укажите корректные дату и время начала и окончания."
          : "Please enter valid start and end dates and times."
      );
      return;
    }

    if (ex <= s) {
      setFormError(
        lang === "ru"
          ? "Время окончания события должно быть позже времени начала."
          : "Event end time must be after start time."
      );
      return;
    }

    setSubmitting(true);
    try {
      await onSave({
        title: cleanTitle,
        description: desc.trim(),
        startsAtIso: s.toISOString(),
        endsAtIso: ex.toISOString(),
      });
    } catch (err: any) {
      setFormError(
        err?.message || (lang === "ru" ? "Не удалось сохранить событие." : "Failed to save event.")
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="event-form-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg border-2 border-zinc-900 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 shadow-xl relative space-y-4 text-zinc-900 dark:text-zinc-100 max-h-[90vh] overflow-y-auto"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-900 dark:hover:text-white focus:outline-none cursor-pointer"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h3
          className="text-xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50"
          id="event-editor-title"
        >
          {editingEventId ? t.edit_event_title : t.create_event_title}
        </h3>

        {formError && (
          <div
            id="event-modal-error-panel"
            className="border-2 border-red-600 bg-red-50 dark:bg-red-950/50 p-3 text-xs font-semibold text-red-700 dark:text-red-300"
          >
            {formError}
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
              maxLength={150}
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
              maxLength={4000}
              placeholder={t.event_desc_placeholder}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2 px-3 text-sm focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
            />
          </div>

          {/* 4-step Date & Time Picker */}
          <div className="border border-zinc-200 dark:border-zinc-700 p-3 bg-zinc-50 dark:bg-zinc-800/60 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                <span>{lang === "ru" ? "Быстрый выбор на календаре" : "Quick calendar picker"}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  const base = startsAt ? new Date(startsAt) : new Date();
                  setPickerMonth(Number.isNaN(base.getTime()) ? new Date() : base);
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
                  {(
                    [
                      ["start_date", lang === "ru" ? "1. Дата нач." : "1. Start date"],
                      ["start_time", lang === "ru" ? "2. Время нач." : "2. Start time"],
                      ["end_date", lang === "ru" ? "3. Дата кон." : "3. End date"],
                      ["end_time", lang === "ru" ? "4. Время кон." : "4. End time"],
                    ] as const
                  ).map(([stepKey, label]) => (
                    <button
                      key={stepKey}
                      type="button"
                      onClick={() => setPickerStep(stepKey)}
                      className={`px-2 py-1 text-center transition-colors cursor-pointer truncate ${
                        pickerStep === stepKey
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
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
                          setPickerMonth(
                            new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1)
                          )
                        }
                        className="p-1 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-xs font-bold">{getMonthName(pickerMonth, lang)}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setPickerMonth(
                            new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1)
                          )
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
                              if (!Number.isNaN(sDate.getTime())) {
                                const eDate = new Date(sDate.getTime() + hours * 3600000);
                                setEndsAt(formatLocalInput(eDate.toISOString()));
                                setShowDatePicker(false);
                              }
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
              {editingEventId && onDelete && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => onDelete(editingEventId)}
                  className="inline-flex items-center gap-1.5 border-2 border-red-600 bg-white dark:bg-zinc-900 py-2 px-3 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{lang === "ru" ? "Удалить" : "Delete"}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="border-2 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-2 px-4 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer transition-colors"
              >
                {t.cancel}
              </button>
              <button
                id="save-event-btn"
                type="submit"
                disabled={submitting || !title.trim() || !startsAt || !endsAt}
                className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2 px-5 text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 focus:outline-none disabled:opacity-40 cursor-pointer transition-colors border-2 border-zinc-900 dark:border-zinc-100"
              >
                {editingEventId ? t.save_changes : t.publish_event}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
