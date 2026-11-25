import React, { useEffect } from "react";

export interface ConfirmModalState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
}

interface ConfirmModalProps {
  id?: string;
  state: ConfirmModalState | null;
  cancelLabel: string;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  id = "confirm-modal",
  state,
  cancelLabel,
  onClose,
}) => {
  useEffect(() => {
    if (!state) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state, onClose]);

  if (!state) return null;

  return (
    <div
      id={id}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-700 p-6 w-full max-w-md shadow-xl"
      >
        <h3 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
          {state.title}
        </h3>
        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed mb-6">
          {state.message}
        </p>
        <div className="flex gap-3">
          <button
            id="modal-cancel-btn"
            type="button"
            onClick={onClose}
            className="flex-1 bg-white dark:bg-zinc-800 border-2 border-zinc-300 dark:border-zinc-700 py-2.5 px-4 text-xs font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            id="modal-confirm-btn"
            type="button"
            onClick={async () => {
              const cb = state.onConfirm;
              onClose();
              await cb();
            }}
            className="flex-1 bg-red-600 text-white py-2.5 px-4 text-xs font-bold hover:bg-red-700 cursor-pointer"
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
