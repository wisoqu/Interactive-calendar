import React, { useState, useEffect } from "react";
import { useAuth } from "../store/AuthContext";
import { useThemeLanguage } from "../store/ThemeLanguageContext";
import { apiClient } from "../api/client";
import { Settings, ShieldAlert, Save, Trash2, Key } from "lucide-react";

export const SettingsPage: React.FC = () => {
  const { currentClassroom, refreshClassrooms, selectClassroom } = useAuth();
  const { lang, t } = useThemeLanguage();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isClosed, setIsClosed] = useState(false);
  const [maxMembers, setMaxMembers] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    message: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  useEffect(() => {
    if (currentClassroom) {
      setName(currentClassroom.name);
      setDescription(currentClassroom.description || "");
      setIsClosed(!!currentClassroom.is_closed);
      setMaxMembers(currentClassroom.max_members || 0);
    }
  }, [currentClassroom]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmState(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!currentClassroom) {
    return (
      <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 text-center rounded-none shadow-sm">
        <Settings className="mx-auto h-12 w-12 text-zinc-400 dark:text-zinc-550" />
        <h3 className="mt-4 text-sm font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">{t.no_classroom_selected}</h3>
        <p className="mt-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{t.pick_classroom_desc}</p>
      </div>
    );
  }

  const isOwner = currentClassroom.user_role === "owner";

  // Strict constraint check
  if (!isOwner) {
    return (
      <div className="border-4 border-black dark:border-zinc-700 bg-white dark:bg-zinc-900 p-8 text-center max-w-xl mx-auto space-y-4 shadow-none mt-8 rounded-none">
        <ShieldAlert className="h-12 w-12 text-zinc-900 dark:text-zinc-100 mx-auto" />
        <h3 className="text-xl font-black uppercase tracking-tighter text-zinc-900 dark:text-zinc-50 font-sans">{t.settings_restricted}</h3>
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {t.only_owner_restricted.replace("{owner}", currentClassroom.owner_username)}
        </p>
      </div>
    );
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const res = await apiClient.updateClassroom(
        currentClassroom.id,
        name.trim(),
        description || undefined,
        isClosed,
        maxMembers
      );
      setMessage(lang === "ru" ? "Параметры класса и настройки приватности сохранены." : "Classroom privacy & capacity configurations saved successfully.");
      await refreshClassrooms();
      selectClassroom(res); // keep updated context in sync
    } catch (err: any) {
      setError(err.message || (lang === "ru" ? "Не удалось обновить конфигурацию класса." : "Failed to update configurations."));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const confirmMsg = lang === "ru"
      ? "КРИТИЧЕСКОЕ ПРЕДУПРЕЖДЕНИЕ: Это действие необратимо. Удаление класса повлечет за собой полное и окончательное стирание всех связанных участников, расписаний и логов. Вы уверены, что хотите продолжить?"
      : "CRITICAL WARNING: This action is irreversible. Deleting the classroom will cascadingly erase all member associations, schedules, and logs forever. Are you sure you want to proceed?";

    setConfirmState({
      message: confirmMsg,
      onConfirm: async () => {
        setError(null);
        setLoading(true);
        try {
          await apiClient.deleteClassroom(currentClassroom.id);
          selectClassroom(null); // Return to home view since group is deceased
          await refreshClassrooms();
        } catch (err: any) {
          setError(err.message || (lang === "ru" ? "Не удалось совершить каскадное удаление." : "Failed to execute cascading deletion."));
        } finally {
          setLoading(false);
        }
      }
    });
  };

  return (
    <div id="settings-view-container" className="space-y-6 py-4 max-w-4xl">
      {/* Header */}
      <div className="border-b-2 border-zinc-200 dark:border-zinc-805 pb-5">
        <h1 className="text-3xl font-black uppercase tracking-tighter text-zinc-900 dark:text-zinc-50 font-sans flex items-center gap-2.5">
          <Settings className="h-6 w-6 text-black dark:text-white" />
          <span>{t.settings_config}</span>
        </h1>
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-1">
          {t.settings_desc}
        </p>
      </div>

      {error && (
        <div id="settings-error-panel" className="border-2 border-zinc-950 dark:border-red-600 bg-red-50 dark:bg-red-950/40 p-4 text-xs font-black uppercase tracking-wider text-red-600 dark:text-red-300 font-sans">
          {error}
        </div>
      )}
      {message && (
        <div id="settings-success-panel" className="border-2 border-zinc-950 dark:border-green-600 bg-green-50 dark:bg-green-950/40 p-4 text-xs font-black uppercase tracking-wider text-green-700 dark:text-green-300 font-sans">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {/* Configurations Form */}
        <div className="md:col-span-2 border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,0.05)]">
          <h2 className="text-xl font-black uppercase tracking-tighter text-zinc-955 dark:text-zinc-50 mb-4 font-sans">{t.group_configs}</h2>
          
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                {t.classroom_name}
              </label>
              <input
                id="update-class-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 px-3 text-xs font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                {t.classroom_desc_label}
              </label>
              <textarea
                id="update-class-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 px-3 text-xs font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
              />
            </div>

            {/* Privacy & Student Capacity Settings */}
            <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850 p-4 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <span>{lang === "ru" ? "Приватность и лимит участников" : "Privacy & Capacity Controls"}</span>
              </h3>

              {/* Closed status toggle */}
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  id="toggle-classroom-closed"
                  type="checkbox"
                  checked={isClosed}
                  onChange={(e) => setIsClosed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded-none border-2 border-zinc-900 dark:border-zinc-500 text-rose-600 focus:ring-0 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-black uppercase tracking-tight text-zinc-900 dark:text-zinc-100 block">
                    {lang === "ru" ? "Закрыть класс (запретить вступление)" : "Close Classroom (Disable Joining)"}
                  </span>
                  <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 block mt-0.5 leading-snug">
                    {lang === "ru"
                      ? "Если класс закрыт, новые ученики не смогут присоединиться даже при наличии правильного кода приглашения."
                      : "When closed, new students cannot join even with a valid invite code."}
                  </span>
                </div>
              </label>

              {/* Max Members limit */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-300 mb-1 block">
                  {lang === "ru" ? "Максимальное количество учеников (0 — без ограничений)" : "Maximum Student Capacity (0 = Unlimited)"}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="update-max-members"
                    type="number"
                    min="0"
                    max="1000"
                    value={maxMembers}
                    onChange={(e) => setMaxMembers(Math.max(0, parseInt(e.target.value) || 0))}
                    className="block w-32 border-2 border-zinc-200 dark:border-zinc-700 py-2 px-3 text-xs font-mono font-bold focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                  <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-tight">
                    {maxMembers > 0
                      ? (lang === "ru" ? `Лимит: ${maxMembers} учеников` : `Limit: ${maxMembers} max`)
                      : (lang === "ru" ? "Неограниченно" : "Unlimited")}
                  </span>
                </div>
              </div>
            </div>

            <button
              id="save-settings-btn"
              type="submit"
              disabled={loading || !name.trim()}
              className="flex items-center justify-center gap-2 bg-black dark:bg-rose-900 py-3 px-5 text-xs font-black uppercase tracking-widest text-white dark:text-rose-100 hover:bg-zinc-800 dark:hover:bg-rose-800 focus:outline-none disabled:opacity-40 rounded-none cursor-pointer duration-150 border border-black dark:border-rose-500 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,63,94,0.3)] active:translate-x-1 active:translate-y-1 active:shadow-none"
            >
              <Save className="h-4 w-4" />
              <span>{t.save_configs}</span>
            </button>
          </form>
        </div>

        {/* Invite Code display & Danger Zone */}
        <div className="space-y-6">
          {/* Invite Code Panel */}
          <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 rounded-none text-center space-y-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.05)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-none border-2 border-zinc-950 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-850 text-black dark:text-white mx-auto">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-tight text-zinc-900 dark:text-zinc-100 font-sans">{t.active_share_code}</h3>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mt-1">{t.distribute_desc}</p>
            </div>
            <div className="py-3 border-2 border-zinc-950 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-850 font-mono text-3xl font-black text-zinc-900 dark:text-zinc-100 tracking-widest rounded-none">
              {currentClassroom.invite_code}
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 leading-relaxed">
              {t.entering_code_desc}
            </p>
          </div>

          {/* Danger Zone */}
          <div className="border-2 border-red-500 bg-red-50/10 dark:bg-red-950/20 p-6 space-y-4 rounded-none border-dashed">
            <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-red-700 dark:text-red-400">
              <Trash2 className="h-4.5 w-4.5 text-red-600 dark:text-red-400 shrink-0" />
              <span>{t.danger_zone}</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400 leading-relaxed">
              {t.danger_desc}
            </p>
            <button
              id="delete-classroom-btn"
              onClick={handleDelete}
              disabled={loading}
              className="w-full bg-red-600 py-3 px-4 text-xs font-black uppercase tracking-widest text-white hover:bg-red-700 focus:outline-none disabled:opacity-40 rounded-none cursor-pointer duration-150 border border-red-600 shadow-[4px_4px_0px_0px_rgba(220,38,38,1)] dark:shadow-[4px_4px_0px_0px_rgba(220,38,38,0.25)] active:translate-x-1 active:translate-y-1 active:shadow-none"
            >
              {t.terminate_btn}
            </button>
          </div>
        </div>
      </div>

      {confirmState && (
        <div id="settings-confirm-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
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
