import React, { useState, useEffect } from "react";
import { useAuth } from "../store/AuthContext";
import { useThemeLanguage } from "../store/ThemeLanguageContext";
import { apiClient } from "../api/client";
import { Classroom } from "../types";
import { NoticeModal, NoticeModalState } from "../components/NoticeModal";
import { Plus, Users, Code2, ArrowRight, ChevronRight } from "lucide-react";

interface HomePageProps {
  onOpenCalendar?: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onOpenCalendar }) => {
  const { classrooms, currentClassroom, refreshClassrooms, selectClassroom } = useAuth();
  const { lang, t } = useThemeLanguage();
  const [newClassName, setNewClassName] = useState("");
  const [newClassDesc, setNewClassDesc] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [notice, setNotice] = useState<NoticeModalState | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    refreshClassrooms();
  }, [refreshClassrooms]);

  const handleSelectGroup = (cr: Classroom) => {
    selectClassroom(cr);
    onOpenCalendar?.();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    setNotice(null);
    setLoading(true);

    try {
      const created = await apiClient.createClassroom(
        newClassName.trim(),
        newClassDesc.trim() || undefined
      );
      setNewClassName("");
      setNewClassDesc("");
      selectClassroom(created);
      await refreshClassrooms();
      onOpenCalendar?.();
    } catch (err: any) {
      setNotice({
        variant: "error",
        title: lang === "ru" ? "Не удалось создать класс" : "Could not create classroom",
        message:
          err?.message ||
          (lang === "ru"
            ? "Проверьте корректность названия класса (от 2 до 100 символов)."
            : "Please enter a valid classroom name (2 to 100 characters)."),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = inviteCode.trim().toUpperCase();
    if (!trimmedCode) return;
    setNotice(null);
    setLoading(true);

    try {
      const res = await apiClient.joinClassroom(trimmedCode);
      setInviteCode("");
      selectClassroom(res);
      await refreshClassrooms();
      onOpenCalendar?.();
    } catch (err: any) {
      const code = err?.code;
      const className = err?.meta?.classroom_name;
      const maxCap = err?.meta?.max_members;
      const curCount = err?.meta?.member_count;

      if (code === "CLASSROOM_CLOSED") {
        setNotice({
          variant: "closed",
          title: lang === "ru" ? "Вход в класс закрыт" : "Classroom is closed",
          message:
            lang === "ru"
              ? className
                ? `Владелец класса «${className}» временно закрыл присоединение по коду приглашения. Попросите владельца открыть доступ в разделе «Настройки» или добавить вас по логину.`
                : "Владелец этого класса временно закрыл присоединение по коду приглашения. Попросите владельца открыть доступ в разделе «Настройки» или добавить вас по логину."
              : className
              ? `The owner of "${className}" has temporarily disabled joining via invite code. Ask the owner to reopen access in Settings or add you by username.`
              : "The classroom owner has temporarily disabled joining via invite code. Ask the owner to reopen access in Settings or add you by username.",
        });
      } else if (code === "CLASSROOM_FULL") {
        setNotice({
          variant: "limit",
          title: lang === "ru" ? "Достигнут лимит участников" : "Classroom limit reached",
          message:
            lang === "ru"
              ? `В классе${className ? ` «${className}»` : ""} уже достигнуто максимальное количество участников (${
                  curCount ?? maxCap ?? ""
                }${maxCap ? ` из ${maxCap}` : ""}). Попросите владельца увеличить лимит или снять ограничение в настройках класса.`
              : `This classroom${className ? ` ("${className}")` : ""} has reached its maximum capacity (${
                  maxCap ?? ""
                } members). Ask the owner to increase or remove the limit in Settings.`,
        });
      } else if (code === "CLASSROOM_NOT_FOUND" || err?.status === 404) {
        setNotice({
          variant: "warning",
          title: lang === "ru" ? "Класс не найден" : "Invalid invite code",
          message:
            lang === "ru"
              ? `Учебная группа с кодом приглашения «${trimmedCode}» не найдена. Проверьте правильность введённого кода.`
              : `No classroom was found with invite code "${trimmedCode}". Please verify the code and try again.`,
        });
      } else {
        setNotice({
          variant: "error",
          title: lang === "ru" ? "Не удалось присоединиться" : "Unable to join classroom",
          message:
            err?.message ||
            (lang === "ru"
              ? "Не удалось выполнить вход по коду приглашения."
              : "Could not join classroom with this invite code."),
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const getRoleLabel = (role: Classroom["user_role"]) => {
    if (role === "owner") return t.owner;
    if (role === "admin") return t.admin_role;
    return t.member_role;
  };

  return (
    <div id="home-view-container" className="space-y-8 py-2">
      {/* Intro Banner */}
      <div className="bg-zinc-900 dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-700 p-6 sm:p-8 text-white">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-balance">
            {t.welcome_title}
          </h1>
          <p className="mt-2.5 text-zinc-300 text-sm leading-relaxed">{t.welcome_desc}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Classrooms List */}
        <div className="lg:col-span-2 space-y-5">
          <div className="flex items-baseline justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
            <h2 className="text-xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
              {t.registered_classrooms}
            </h2>
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums">
              {classrooms.length} {t.active}
            </span>
          </div>

          {classrooms.length === 0 ? (
            <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 p-12 text-center bg-white dark:bg-zinc-900">
              <Users className="mx-auto h-10 w-10 text-zinc-400 dark:text-zinc-500" />
              <h3 className="mt-4 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {t.no_classrooms}
              </h3>
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
                {t.no_classrooms_desc}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" id="classrooms-bento-grid">
              {classrooms.map((cr) => {
                const isCurrent = currentClassroom?.id === cr.id;
                const count = cr.member_count ?? 1;
                const hasCap = !!cr.max_members && cr.max_members > 0;
                return (
                  <div
                    key={cr.id}
                    id={`classroom-card-${cr.id}`}
                    onClick={() => handleSelectGroup(cr)}
                    className={`group flex flex-col justify-between border-2 p-5 transition-colors cursor-pointer ${
                      isCurrent
                        ? "border-zinc-900 dark:border-zinc-100 bg-white dark:bg-zinc-900"
                        : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-900 dark:hover:border-zinc-500"
                    }`}
                  >
                    <div>
                      {/* Clean unboxed inline metadata */}
                      <div className="flex items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                            {getRoleLabel(cr.user_role)}
                          </span>
                          <span aria-hidden="true">·</span>
                          {cr.is_closed ? (
                            <span className="text-red-600 dark:text-red-400 font-semibold">
                              {lang === "ru" ? "Вход закрыт" : "Closed"}
                            </span>
                          ) : (
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                              {lang === "ru" ? "Открыт" : "Open"}
                            </span>
                          )}
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {hasCap
                              ? `${count}/${cr.max_members}`
                              : lang === "ru"
                              ? `${count} уч.`
                              : `${count} mbr`}
                          </span>
                        </div>

                        <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300 tabular-nums shrink-0">
                          {cr.invite_code}
                        </span>
                      </div>

                      <h3 className="mt-3 text-base font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 group-hover:underline">
                        {cr.name}
                      </h3>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                        {cr.description || t.no_desc}
                      </p>
                    </div>

                    <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="truncate max-w-[150px]">
                        {t.owner}: {cr.owner_username}
                      </span>
                      <span className="inline-flex items-center gap-1 font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                        <span>{t.open}</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Join & Create Forms */}
        <div className="space-y-6">
          {/* Join Classroom Card */}
          <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
            <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-50 font-extrabold text-sm mb-4">
              <Code2 className="h-4 w-4 shrink-0" />
              <span>{t.join_by_code}</span>
            </div>
            <form onSubmit={handleJoin} className="space-y-3.5">
              <div>
                <input
                  id="join-code-input"
                  type="text"
                  required
                  maxLength={10}
                  placeholder="A7K9P2"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 px-3 text-sm uppercase font-mono tabular-nums tracking-widest focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
                />
              </div>
              <button
                id="join-class-btn"
                type="submit"
                disabled={loading || !inviteCode.trim()}
                className="flex w-full items-center justify-center gap-2 bg-zinc-900 dark:bg-zinc-100 py-2.5 px-4 text-xs font-bold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 cursor-pointer transition-colors"
              >
                <span>{t.enroll_btn}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>

          {/* Create Classroom Card */}
          <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
            <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-50 font-extrabold text-sm mb-4">
              <Plus className="h-4 w-4 shrink-0" />
              <span>{t.create_classroom}</span>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label
                  htmlFor="create-class-name"
                  className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 block"
                >
                  {t.classroom_name}
                </label>
                <input
                  id="create-class-name"
                  type="text"
                  required
                  minLength={2}
                  placeholder={lang === "ru" ? "Например: 10 «А» класс" : "e.g. Grade 10A"}
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 px-3 text-sm focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                />
              </div>

              <div>
                <label
                  htmlFor="create-class-desc"
                  className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 block"
                >
                  {t.classroom_desc_label}
                </label>
                <textarea
                  id="create-class-desc"
                  rows={3}
                  placeholder={t.classroom_desc_placeholder}
                  value={newClassDesc}
                  onChange={(e) => setNewClassDesc(e.target.value)}
                  className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 px-3 text-sm focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                />
              </div>

              <button
                id="create-class-btn"
                type="submit"
                disabled={loading || !newClassName.trim()}
                className="flex w-full items-center justify-center gap-2 bg-zinc-900 dark:bg-zinc-100 py-2.5 px-4 text-xs font-bold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 cursor-pointer transition-colors"
              >
                <span>{t.establish_btn}</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      <NoticeModal
        notice={notice}
        onClose={() => setNotice(null)}
        defaultActionLabel={lang === "ru" ? "Понятно" : "Got it"}
      />
    </div>
  );
};
