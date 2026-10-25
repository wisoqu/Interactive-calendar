import React, { useState, useEffect } from "react";
import { useAuth } from "../store/AuthContext";
import { useThemeLanguage } from "../store/ThemeLanguageContext";
import { apiClient } from "../api/client";
import { NoticeModal, NoticeModalState } from "../components/NoticeModal";
import {
  Settings,
  ShieldAlert,
  Save,
  Trash2,
  Key,
  Copy,
  Check,
  Lock,
  Unlock,
  AlertTriangle,
} from "lucide-react";

export const SettingsPage: React.FC = () => {
  const { currentClassroom, refreshClassrooms, selectClassroom } = useAuth();
  const { lang, t } = useThemeLanguage();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isClosed, setIsClosed] = useState(false);
  const [maxMembersInput, setMaxMembersInput] = useState<string>("0");
  const [notice, setNotice] = useState<NoticeModalState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    message: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  useEffect(() => {
    if (currentClassroom) {
      setName(currentClassroom.name);
      setDescription(currentClassroom.description || "");
      setIsClosed(Boolean(currentClassroom.is_closed));
      setMaxMembersInput(String(currentClassroom.max_members ?? 0));
    }
  }, [
    currentClassroom?.id,
    currentClassroom?.name,
    currentClassroom?.description,
    currentClassroom?.is_closed,
    currentClassroom?.max_members,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmState(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!currentClassroom) {
    return (
      <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 text-center">
        <Settings className="mx-auto h-10 w-10 text-zinc-400 dark:text-zinc-500" />
        <h3 className="mt-4 text-sm font-bold text-zinc-900 dark:text-zinc-100">
          {t.no_classroom_selected}
        </h3>
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{t.pick_classroom_desc}</p>
      </div>
    );
  }

  const isOwner = currentClassroom.user_role === "owner";

  if (!isOwner) {
    return (
      <div className="border-2 border-zinc-900 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-8 text-center max-w-xl mx-auto space-y-3 mt-8">
        <ShieldAlert className="h-10 w-10 text-zinc-900 dark:text-zinc-100 mx-auto" />
        <h3 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t.settings_restricted}
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {t.only_owner_restricted.replace("{owner}", currentClassroom.owner_username)}
        </p>
      </div>
    );
  }

  const parsedMaxMembers = Math.max(0, Math.min(1000, parseInt(maxMembersInput, 10) || 0));
  const currentMemberCount = currentClassroom.member_count ?? 1;
  const isLimitBlockingJoin = parsedMaxMembers > 0 && parsedMaxMembers <= currentMemberCount;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(currentClassroom.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable fallback
    }
  };

  const persistSettings = async (
    nextClosed: boolean,
    nextMax: number,
    customSuccessMessage?: string
  ) => {
    const cleanName = name.trim() || currentClassroom.name;
    if (cleanName.length < 2) {
      setNotice({
        variant: "warning",
        title: lang === "ru" ? "Проверьте название класса" : "Invalid classroom name",
        message:
          lang === "ru"
            ? "Название класса должно содержать не менее 2 символов."
            : "Classroom name must be at least 2 characters long.",
      });
      return;
    }

    setNotice(null);
    setMessage(null);
    setLoading(true);

    try {
      const updated = await apiClient.updateClassroom(
        currentClassroom.id,
        cleanName,
        description.trim(),
        nextClosed,
        nextMax
      );
      setIsClosed(Boolean(updated.is_closed));
      setMaxMembersInput(String(updated.max_members ?? 0));
      selectClassroom(updated);
      await refreshClassrooms();
      setMessage(
        customSuccessMessage ||
          (lang === "ru" ? "Настройки класса сохранены в базе данных." : "Classroom settings saved.")
      );
    } catch (err: any) {
      await refreshClassrooms();
      setNotice({
        variant: "error",
        title: lang === "ru" ? "Не удалось сохранить настройки" : "Failed to save settings",
        message:
          err?.message ||
          (lang === "ru"
            ? "Произошла ошибка при сохранении параметров класса."
            : "Could not update classroom settings."),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleClosed = async (checked: boolean) => {
    setIsClosed(checked);
    const statusText = checked
      ? lang === "ru"
        ? "Класс закрыт: вступление новых участников по коду отключено."
        : "Classroom closed: invite code joining is now disabled."
      : lang === "ru"
      ? "Класс открыт: участники могут присоединяться по коду приглашения."
      : "Classroom opened: students can now join via invite code.";
    await persistSettings(checked, parsedMaxMembers, statusText);
  };

  const handleClearMemberLimit = async () => {
    setMaxMembersInput("0");
    const statusText =
      lang === "ru"
        ? "Ограничение на количество участников снято."
        : "Member capacity limit removed.";
    await persistSettings(isClosed, 0, statusText);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    await persistSettings(isClosed, parsedMaxMembers);
  };

  const handleDelete = () => {
    const confirmMsg =
      lang === "ru"
        ? `Вы действительно хотите удалить класс «${currentClassroom.name}»? Все события и список участников будут удалены без возможности восстановления.`
        : `Are you sure you want to delete "${currentClassroom.name}"? All events and member records will be permanently deleted.`;

    setConfirmState({
      message: confirmMsg,
      onConfirm: async () => {
        setNotice(null);
        setLoading(true);
        try {
          await apiClient.deleteClassroom(currentClassroom.id);
          selectClassroom(null);
          await refreshClassrooms();
        } catch (err: any) {
          setNotice({
            variant: "error",
            title: lang === "ru" ? "Ошибка удаления" : "Delete failed",
            message:
              err?.message ||
              (lang === "ru" ? "Не удалось удалить класс." : "Failed to delete classroom."),
          });
        } finally {
          setLoading(false);
        }
      },
    });
  };

  return (
    <div id="settings-view-container" className="space-y-6 py-2 max-w-4xl">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2.5">
          <Settings className="h-6 w-6 shrink-0" />
          <span>{t.settings_config}</span>
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t.settings_desc}</p>
      </div>

      {message && (
        <div
          id="settings-success-panel"
          className="border-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-xs font-semibold text-emerald-800 dark:text-emerald-300"
        >
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {/* General & Privacy Settings Form */}
        <div className="md:col-span-2 border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 mb-4">
            {t.group_configs}
          </h2>

          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label
                htmlFor="update-class-name"
                className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 block"
              >
                {t.classroom_name}
              </label>
              <input
                id="update-class-name"
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 px-3 text-sm focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
              />
            </div>

            <div>
              <label
                htmlFor="update-class-desc"
                className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 block"
              >
                {t.classroom_desc_label}
              </label>
              <textarea
                id="update-class-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 px-3 text-sm focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
              />
            </div>

            {/* Privacy & Student Capacity */}
            <div className="border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-700 pb-3">
                <h3 className="text-xs font-extrabold text-zinc-900 dark:text-zinc-100">
                  {lang === "ru"
                    ? "Правила вступления и лимит участников"
                    : "Join access & capacity"}
                </h3>

                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                    isClosed
                      ? "text-red-600 dark:text-red-400"
                      : isLimitBlockingJoin
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-700 dark:text-emerald-400"
                  }`}
                >
                  {isClosed ? (
                    <>
                      <Lock className="h-3.5 w-3.5" />
                      <span>{lang === "ru" ? "Вход закрыт" : "Closed"}</span>
                    </>
                  ) : isLimitBlockingJoin ? (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>{lang === "ru" ? "Лимит заполнен" : "Limit reached"}</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="h-3.5 w-3.5" />
                      <span>{lang === "ru" ? "Вход открыт" : "Open for joining"}</span>
                    </>
                  )}
                </span>
              </div>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  id="toggle-classroom-closed"
                  type="checkbox"
                  disabled={loading}
                  checked={isClosed}
                  onChange={(e) => handleToggleClosed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-zinc-900 dark:accent-zinc-100 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">
                    {lang === "ru" ? "Закрыть вступление по коду" : "Close invite code joining"}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 block mt-0.5 leading-snug">
                    {lang === "ru"
                      ? "Переключатель применяется сразу. Пока класс закрыт, новые пользователи не могут войти по коду приглашения."
                      : "Takes effect immediately. New students cannot join via invite code while closed."}
                  </span>
                </div>
              </label>

              <div>
                <label
                  htmlFor="update-max-members"
                  className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 block"
                >
                  {lang === "ru"
                    ? "Максимальное число участников (0 — без ограничений)"
                    : "Maximum member count (0 = unlimited)"}
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    id="update-max-members"
                    type="number"
                    min="0"
                    max="1000"
                    value={maxMembersInput}
                    onChange={(e) => setMaxMembersInput(e.target.value)}
                    onBlur={() => setMaxMembersInput(String(parsedMaxMembers))}
                    className="block w-28 border-2 border-zinc-200 dark:border-zinc-700 py-2 px-3 text-sm font-mono tabular-nums font-bold focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {lang === "ru"
                      ? `Сейчас в классе: ${currentMemberCount} чел. · ${
                          parsedMaxMembers > 0
                            ? `Лимит: ${parsedMaxMembers} чел.`
                            : "Без ограничений"
                        }`
                      : `Current members: ${currentMemberCount} · ${
                          parsedMaxMembers > 0 ? `Max: ${parsedMaxMembers}` : "Unlimited"
                        }`}
                  </span>
                </div>

                {isLimitBlockingJoin && (
                  <div className="mt-3 border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="leading-relaxed">
                      {lang === "ru"
                        ? `В классе уже ${currentMemberCount} чел. (включая владельца), поэтому при лимите ${parsedMaxMembers} новые участники не смогут присоединиться даже при открытом входе.`
                        : `There are already ${currentMemberCount} member(s) (including the owner), so a limit of ${parsedMaxMembers} blocks any new students from joining.`}
                    </div>
                    <button
                      id="clear-member-limit-btn"
                      type="button"
                      disabled={loading}
                      onClick={handleClearMemberLimit}
                      className="shrink-0 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-1.5 px-3 text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 cursor-pointer whitespace-nowrap"
                    >
                      {lang === "ru" ? "Снять лимит (0)" : "Remove limit (0)"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <button
              id="save-settings-btn"
              type="submit"
              disabled={loading || !name.trim()}
              className="inline-flex items-center justify-center gap-2 bg-zinc-900 dark:bg-zinc-100 py-2.5 px-5 text-xs font-bold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 focus:outline-none disabled:opacity-40 cursor-pointer transition-colors"
            >
              <Save className="h-4 w-4" />
              <span>{t.save_configs}</span>
            </button>
          </form>
        </div>

        {/* Invite Code & Delete Classroom */}
        <div className="space-y-6">
          <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-center space-y-3">
            <div className="flex h-10 w-10 items-center justify-center border-2 border-zinc-900 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 mx-auto">
              <Key className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                {t.active_share_code}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{t.distribute_desc}</p>
            </div>
            <div className="py-3 border-2 border-zinc-900 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 font-mono tabular-nums text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-widest">
              {currentClassroom.invite_code}
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex items-center justify-center gap-1.5 w-full py-2 px-3 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-bold text-zinc-800 dark:text-zinc-200 cursor-pointer transition-colors"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>
                {copied
                  ? lang === "ru"
                    ? "Код скопирован"
                    : "Copied"
                  : lang === "ru"
                  ? "Скопировать код"
                  : "Copy code"}
              </span>
            </button>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {t.entering_code_desc}
            </p>
          </div>

          <div className="border-2 border-red-500/80 bg-red-50/40 dark:bg-red-950/20 p-6 space-y-3">
            <div className="flex items-center gap-2 text-xs font-extrabold text-red-700 dark:text-red-400">
              <Trash2 className="h-4 w-4 shrink-0" />
              <span>{t.danger_zone}</span>
            </div>
            <p className="text-xs text-red-700/90 dark:text-red-300 leading-relaxed">
              {t.danger_desc}
            </p>
            <button
              id="delete-classroom-btn"
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="w-full bg-red-600 py-2.5 px-4 text-xs font-bold text-white hover:bg-red-700 focus:outline-none disabled:opacity-40 cursor-pointer transition-colors"
            >
              {t.terminate_btn}
            </button>
          </div>
        </div>
      </div>

      {confirmState && (
        <div
          id="settings-confirm-modal"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-700 p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
              {lang === "ru" ? "Удаление класса" : "Delete classroom"}
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

      <NoticeModal
        notice={notice}
        onClose={() => setNotice(null)}
        defaultActionLabel={lang === "ru" ? "Понятно" : "Got it"}
      />
    </div>
  );
};
