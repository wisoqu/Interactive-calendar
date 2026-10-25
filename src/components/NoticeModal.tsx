import React, { useEffect } from "react";
import { Lock, Users, ShieldAlert, AlertTriangle, CheckCircle2, X } from "lucide-react";

export type NoticeVariant = "closed" | "limit" | "error" | "warning" | "success";

export interface NoticeModalState {
  title: string;
  message: string;
  variant?: NoticeVariant;
  actionLabel?: string;
}

interface NoticeModalProps {
  notice: NoticeModalState | null;
  onClose: () => void;
  defaultActionLabel?: string;
}

export const NoticeModal: React.FC<NoticeModalProps> = ({
  notice,
  onClose,
  defaultActionLabel = "Понятно",
}) => {
  useEffect(() => {
    if (!notice) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [notice, onClose]);

  if (!notice) return null;

  const variant = notice.variant || "error";

  const renderIcon = () => {
    switch (variant) {
      case "closed":
        return <Lock className="h-5 w-5 text-red-600 dark:text-red-400" />;
      case "limit":
        return <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />;
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />;
      default:
        return <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" />;
    }
  };

  const accentBorder =
    variant === "closed" || variant === "error"
      ? "border-red-600 dark:border-red-500 bg-red-50 dark:bg-red-950/50"
      : variant === "limit" || variant === "warning"
      ? "border-amber-500 dark:border-amber-400 bg-amber-50 dark:bg-amber-950/50"
      : "border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50";

  return (
    <div
      id="notice-popup-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notice-popup-title"
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md border-2 border-zinc-900 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-none relative text-zinc-900 dark:text-zinc-100"
      >
        <button
          id="notice-popup-close-x"
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 focus:outline-none cursor-pointer"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-start gap-4 pr-6">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center border-2 ${accentBorder}`}
          >
            {renderIcon()}
          </div>

          <div className="min-w-0 flex-1">
            <h3
              id="notice-popup-title"
              className="text-base sm:text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              {notice.title}
            </h3>
            <p
              id="notice-popup-message"
              className="mt-2 text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed"
            >
              {notice.message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <button
            id="notice-popup-ok-btn"
            type="button"
            autoFocus
            onClick={onClose}
            className="bg-zinc-900 dark:bg-zinc-100 py-2.5 px-6 text-xs font-bold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 focus:outline-none cursor-pointer transition-colors"
          >
            {notice.actionLabel || defaultActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
