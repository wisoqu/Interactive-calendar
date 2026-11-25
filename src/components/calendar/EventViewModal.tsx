import React, { useEffect } from "react";
import { Clock, X } from "lucide-react";
import type { CalendarEvent } from "../../types.ts";
import type { Language, Translations } from "../../store/ThemeLanguageContext.tsx";

interface EventViewModalProps {
  event: CalendarEvent | null;
  lang: Language;
  t: Translations;
  onClose: () => void;
}

export const EventViewModal: React.FC<EventViewModalProps> = ({ event, lang, t, onClose }) => {
  useEffect(() => {
    if (!event) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [event, onClose]);

  if (!event) return null;

  const locale = lang === "ru" ? "ru-RU" : "en-US";

  return (
    <div
      id="event-details-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md border-2 border-zinc-900 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 shadow-xl relative space-y-4 text-zinc-900 dark:text-zinc-100"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 focus:outline-none cursor-pointer"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-extrabold tracking-tight pr-6">{event.title}</h3>

        <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-1.5 border-y border-zinc-200 dark:border-zinc-800 py-3">
          <div className="flex items-center gap-2 font-mono tabular-nums font-semibold">
            <Clock className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
            <span>
              {new Date(event.starts_at).toLocaleString(locale, {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {" — "}
              {new Date(event.ends_at).toLocaleString(locale, {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="text-zinc-500 dark:text-zinc-400">
            {t.by}:{" "}
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              {event.creator_username}
            </span>
          </div>
        </div>

        <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
          {event.description || (lang === "ru" ? "Описание отсутствует." : "No description provided.")}
        </p>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2 px-4 text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 cursor-pointer"
          >
            {lang === "ru" ? "Закрыть" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
};
