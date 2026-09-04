import React, { useState } from "react";
import { useAuth } from "../store/AuthContext";
import { useThemeLanguage } from "../store/ThemeLanguageContext";
import { apiClient } from "../api/client";
import { Plus, Users, Landmark, Code2, ArrowRight, ShieldCheck, ChevronRight } from "lucide-react";

export const HomePage: React.FC = () => {
  const { classrooms, currentClassroom, refreshClassrooms, selectClassroom } = useAuth();
  const { lang, t } = useThemeLanguage();
  const [newClassName, setNewClassName] = useState("");
  const [newClassDesc, setNewClassDesc] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<string | null>(null);

  const handleSelectGroup = (cr: any) => {
    selectClassroom(cr);
    setSelectedNotice(lang === "ru" ? `✓ Выбрана группа: ${cr.name}` : `✓ Active group set: ${cr.name}`);
    setTimeout(() => setSelectedNotice(null), 4000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    setError(null);
    setLoading(true);

    try {
      await apiClient.createClassroom(newClassName, newClassDesc);
      setNewClassName("");
      setNewClassDesc("");
      await refreshClassrooms();
    } catch (err: any) {
      setError(err.message || (lang === "ru" ? "Не удалось создать класс." : "Failed to create classroom."));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setError(null);
    setLoading(true);

    try {
      const res = await apiClient.joinClassroom(inviteCode);
      setInviteCode("");
      await refreshClassrooms();
      selectClassroom(res); // Auto-jump into the joined classroom
    } catch (err: any) {
      setError(err.message || (lang === "ru" ? "Неверный инвайт-код или ошибка базы данных." : "Incorrect invite code or database failure."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="home-view-container" className="space-y-10 py-6">
      {/* Welcome Banner */}
      <div className="bg-zinc-950 dark:bg-zinc-900 p-8 text-white relative overflow-hidden border-4 border-black dark:border-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.15)] rounded-none duration-150">
        <div className="relative z-10 max-w-xl">
          <h1 className="text-3xl font-black uppercase tracking-tighter">
            {t.welcome_title}
          </h1>
          <p className="mt-3 text-zinc-400 dark:text-zinc-300 text-xs font-bold uppercase tracking-wide leading-relaxed">
            {t.welcome_desc}
          </p>
        </div>
        <div className="absolute right-6 bottom-0 top-0 w-1/3 opacity-10 pointer-events-none flex items-center justify-center">
          <Landmark className="h-32 w-32 text-white" />
        </div>
      </div>

      {error && (
        <div id="home-error-panel" className="border-2 border-zinc-950 dark:border-red-600 bg-red-50 dark:bg-red-950/40 p-4 text-xs font-black uppercase tracking-wider text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Classrooms List Card Panel */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-end justify-between border-b-2 border-zinc-200 dark:border-zinc-800 pb-3">
            <h2 className="text-2xl font-black uppercase tracking-tighter text-zinc-900 dark:text-zinc-50 font-sans">{t.registered_classrooms}</h2>
            <span className="bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 px-2 py-0.5 text-xs font-black uppercase tracking-wider">
              {classrooms.length} {t.active}
            </span>
          </div>

          {selectedNotice && (
            <div id="group-selected-banner" className="border-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-200 flex items-center justify-between shadow-[4px_4px_0px_0px_rgba(16,185,129,0.3)] animate-pulse">
              <span>{selectedNotice}</span>
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                {lang === "ru" ? "Группа выбрана! Используйте меню 'ГРУППА' наверху или вкладки ниже." : "Classroom set! Use the top 'GROUP' menu or tabs above."}
              </span>
            </div>
          )}

          {classrooms.length === 0 ? (
            <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 p-12 text-center bg-zinc-100 dark:bg-zinc-900">
              <Users className="mx-auto h-12 w-12 text-zinc-400 dark:text-zinc-500" />
              <h3 className="mt-4 text-sm font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">{t.no_classrooms}</h3>
              <p className="mt-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto text-center">
                {t.no_classrooms_desc}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" id="classrooms-bento-grid">
              {classrooms.map((cr) => {
                const isCurrent = currentClassroom?.id === cr.id;
                return (
                  <div
                    key={cr.id}
                    id={`classroom-card-${cr.id}`}
                    onClick={() => handleSelectGroup(cr)}
                    className={`group relative flex flex-col justify-between border-2 p-6 transition-all duration-200 cursor-pointer ${
                      isCurrent
                        ? "border-emerald-600 dark:border-emerald-400 bg-emerald-500/5 dark:bg-emerald-950/20 ring-2 ring-emerald-500/50 shadow-[6px_6px_0px_0px_rgba(16,185,129,0.4)]"
                        : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-black dark:hover:border-rose-500 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.05)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(244,63,94,0.3)]"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between flex-wrap gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 rounded text-[10px] font-black uppercase px-2 py-0.5 ${
                            cr.user_role === "owner" ? "bg-zinc-950 dark:bg-rose-950/40 text-white dark:text-rose-300 border border-zinc-950 dark:border-rose-900/60" :
                            cr.user_role === "admin" ? "bg-zinc-800 dark:bg-zinc-750 text-white dark:text-zinc-100 border border-zinc-850 dark:border-zinc-700" :
                            "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700"
                          }`}>
                            <ShieldCheck className="h-3 w-3" />
                            {cr.user_role}
                          </span>

                          {isCurrent && (
                            <span className="bg-emerald-600 text-white text-[9px] font-black uppercase px-2 py-0.5 shadow-sm">
                              ✓ {lang === "ru" ? "Активная группа" : "Selected Group"}
                            </span>
                          )}

                          {cr.is_closed && (
                            <span className="bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-200 text-[9px] font-black uppercase px-1.5 py-0.5 border border-rose-300 dark:border-rose-700">
                              🔒 {lang === "ru" ? "Закрыт" : "Closed"}
                            </span>
                          )}

                          {!!cr.max_members && cr.max_members > 0 && (
                            <span className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 text-[9px] font-black uppercase px-1.5 py-0.5 border border-zinc-300 dark:border-zinc-700">
                              👥 {lang === "ru" ? `Лимит: ${cr.max_members}` : `Cap: ${cr.max_members}`}
                            </span>
                          )}
                        </div>

                        <span className="text-[10px] uppercase font-mono font-black text-zinc-500 dark:text-rose-500/80">{t.code}: {cr.invite_code}</span>
                      </div>
                      <h3 className="mt-4 text-base font-black uppercase tracking-tight text-zinc-900 dark:text-zinc-50 group-hover:underline">
                        {cr.name}
                      </h3>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 font-medium line-clamp-2">
                        {cr.description || t.no_desc}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[11px] font-black uppercase tracking-tight text-zinc-400 dark:text-zinc-500">
                      <span className="truncate max-w-[120px]">{t.owner}: {cr.owner_username}</span>
                      <span className={`flex items-center gap-1 text-[11px] font-black uppercase tracking-widest ${isCurrent ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-900 dark:text-rose-300'} group-hover:translate-x-1 transition-transform`}>
                        {isCurrent ? (lang === "ru" ? "Выбрана" : "Selected") : t.open} <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Administration Actions Panel */}
        <div className="space-y-6">
          {/* Join Classroom Card */}
          <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-2 text-zinc-950 dark:text-zinc-50 font-black uppercase tracking-wider text-sm mb-4 font-sans">
              <Code2 className="h-5 w-5 text-black dark:text-white" />
              <span>{t.join_by_code}</span>
            </div>
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <input
                  id="join-code-input"
                  type="text"
                  required
                  placeholder="CHEM-902"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 px-3 text-xs uppercase font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
                />
              </div>
              <button
                id="join-class-btn"
                type="submit"
                disabled={loading || !inviteCode}
                className="flex w-full items-center justify-center gap-2 bg-black dark:bg-rose-900 py-3 px-4 text-xs font-black uppercase tracking-widest text-white dark:text-rose-100 hover:bg-zinc-800 dark:hover:bg-rose-800 border border-black dark:border-rose-500 disabled:opacity-40 rounded-none cursor-pointer duration-150 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,63,94,0.3)] active:translate-x-1 active:translate-y-1 active:shadow-none"
              >
                <span>{t.enroll_btn}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>

          {/* Create Classroom Card */}
          <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-2 text-zinc-950 dark:text-zinc-50 font-black uppercase tracking-wider text-sm mb-4 font-sans">
              <Plus className="h-5 w-5 text-black dark:text-white" />
              <span>{t.create_classroom}</span>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                  {t.classroom_name}
                </label>
                <input
                  id="create-class-name"
                  type="text"
                  required
                  placeholder={lang === "ru" ? "например, Продвинутая биология" : "e.g. Advanced Biology"}
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 px-3 text-xs font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                  {t.classroom_desc_label}
                </label>
                <textarea
                  id="create-class-desc"
                  rows={3}
                  placeholder={t.classroom_desc_placeholder}
                  value={newClassDesc}
                  onChange={(e) => setNewClassDesc(e.target.value)}
                  className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 px-3 text-xs font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                />
              </div>

              <button
                id="create-class-btn"
                type="submit"
                disabled={loading || !newClassName.trim()}
                className="flex w-full items-center justify-center gap-2 bg-black dark:bg-rose-900 py-3 px-4 text-xs font-black uppercase tracking-widest text-white dark:text-rose-100 hover:bg-zinc-800 dark:hover:bg-rose-800 border border-black dark:border-rose-500 disabled:opacity-40 rounded-none cursor-pointer duration-150 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,63,94,0.3)] active:translate-x-1 active:translate-y-1 active:shadow-none"
              >
                <span>{t.establish_btn}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

