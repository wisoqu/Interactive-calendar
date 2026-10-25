import React, { useEffect, useState } from "react";
import { useAuth } from "../store/AuthContext";
import { useThemeLanguage } from "../store/ThemeLanguageContext";
import { ClassMember, ClassMemberRole } from "../types";
import { apiClient } from "../api/client";
import { NoticeModal, NoticeModalState } from "../components/NoticeModal";
import { Users, UserPlus, ShieldAlert, ArrowRight, X } from "lucide-react";

export const MembersPage: React.FC = () => {
  const { currentClassroom, user, selectClassroom, refreshClassrooms } = useAuth();
  const { lang, t } = useThemeLanguage();
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [notice, setNotice] = useState<NoticeModalState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    message: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  const [targetUsername, setTargetUsername] = useState("");
  const [targetRole, setTargetRole] = useState<"admin" | "member">("member");

  const fetchMembers = async () => {
    if (!currentClassroom) return;
    setLoading(true);
    try {
      const list = await apiClient.listMembers(currentClassroom.id);
      setMembers(list);
    } catch (err: any) {
      if (err?.status === 403 || err?.status === 404) {
        await refreshClassrooms();
      }
      setNotice({
        variant: "error",
        title: lang === "ru" ? "Ошибка загрузки списка" : "Failed to load members",
        message:
          err?.message ||
          (lang === "ru"
            ? "Не удалось загрузить список участников класса."
            : "Failed to load classroom members."),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [currentClassroom?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmState(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const role = currentClassroom?.user_role || "member";
  const isOwner = role === "owner";
  const isAdmin = role === "admin";
  const canManage = isOwner || isAdmin;

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClassroom || !targetUsername.trim()) return;
    setNotice(null);
    setMessage(null);
    setLoading(true);

    try {
      const roleToAssign = isOwner ? targetRole : "member";
      await apiClient.addMember(currentClassroom.id, targetUsername.trim(), roleToAssign);
      const addedMsg =
        lang === "ru"
          ? `Пользователь «${targetUsername.trim()}» добавлен в класс.`
          : `Added "${targetUsername.trim()}" to the classroom.`;

      setTargetUsername("");
      setMessage(addedMsg);
      await fetchMembers();
      await refreshClassrooms();
    } catch (err: any) {
      if (err?.status === 403) {
        await refreshClassrooms();
      }
      if (err?.code === "CLASSROOM_FULL") {
        setNotice({
          variant: "limit",
          title: lang === "ru" ? "Достигнут лимит участников" : "Member limit reached",
          message:
            lang === "ru"
              ? `Невозможно добавить участника: достигнут установленный лимит класса (${
                  err?.meta?.max_members ?? ""
                }). Измените лимит в разделе «Настройки».`
              : `Cannot add member: classroom capacity limit (${
                  err?.meta?.max_members ?? ""
                }) has been reached.`,
        });
      } else {
        setNotice({
          variant: "error",
          title: lang === "ru" ? "Не удалось добавить участника" : "Could not add member",
          message:
            err?.message ||
            (lang === "ru"
              ? "Пользователь не найден или уже состоит в классе."
              : "User not found or already enrolled."),
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: ClassMemberRole) => {
    if (!currentClassroom) return;
    setNotice(null);
    setMessage(null);
    try {
      await apiClient.updateMemberRole(currentClassroom.id, memberId, newRole);
      setMessage(lang === "ru" ? "Роль участника обновлена." : "Member role updated.");
      await fetchMembers();
      await refreshClassrooms();
    } catch (err: any) {
      await refreshClassrooms();
      await fetchMembers();
      setNotice({
        variant: "error",
        title: lang === "ru" ? "Ошибка изменения роли" : "Role update failed",
        message:
          err?.message ||
          (lang === "ru" ? "Не удалось изменить роль участника." : "Failed to update member role."),
      });
    }
  };

  const handleRemoveMember = (memberId: string, memberName: string) => {
    if (!currentClassroom) return;
    const isSelf = members.find((m) => m.id === memberId)?.user_id === user?.id;

    const confirmMessage = isSelf
      ? lang === "ru"
        ? "Вы действительно хотите покинуть этот класс?"
        : "Are you sure you want to leave this classroom?"
      : lang === "ru"
      ? `Исключить пользователя «${memberName}» из класса?`
      : `Remove "${memberName}" from this classroom?`;

    setConfirmState({
      message: confirmMessage,
      onConfirm: async () => {
        setNotice(null);
        setMessage(null);
        try {
          await apiClient.removeMember(currentClassroom.id, memberId);
          if (isSelf) {
            selectClassroom(null);
            await refreshClassrooms();
          } else {
            setMessage(lang === "ru" ? "Участник исключен из класса." : "Member removed from classroom.");
            await fetchMembers();
            await refreshClassrooms();
          }
        } catch (err: any) {
          await refreshClassrooms();
          setNotice({
            variant: "error",
            title: lang === "ru" ? "Действие недоступно" : "Action failed",
            message:
              err?.message ||
              (lang === "ru" ? "Не удалось удалить участника." : "Failed to remove member."),
          });
        }
      },
    });
  };

  const canEvict = (memberRole: ClassMemberRole, targetUserId: string) => {
    if (memberRole === "owner") return false;
    if (targetUserId === user?.id) return true;
    if (isOwner) return true;
    if (isAdmin) return memberRole === "member";
    return false;
  };

  const getRoleLabel = (r: ClassMemberRole) => {
    if (r === "owner") return t.owner;
    if (r === "admin") return t.admin_role;
    return t.member_role;
  };

  if (!currentClassroom) {
    return (
      <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 text-center">
        <Users className="mx-auto h-10 w-10 text-zinc-400 dark:text-zinc-500" />
        <h3 className="mt-4 text-sm font-bold text-zinc-900 dark:text-zinc-100">
          {t.no_classroom_selected}
        </h3>
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{t.pick_classroom_desc}</p>
      </div>
    );
  }

  return (
    <div id="members-view-container" className="space-y-6 py-2">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2.5">
          <Users className="h-6 w-6 shrink-0" />
          <span>{t.members_roster_title}</span>
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          {t.manage_roles_desc}{" "}
          <span className="font-bold text-zinc-900 dark:text-zinc-100">{currentClassroom.name}</span>
        </p>
      </div>

      {message && (
        <div
          id="members-success-panel"
          className="border-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-xs font-semibold text-emerald-800 dark:text-emerald-300"
        >
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Members Roster List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
              {t.enrolled_participants}
            </h2>
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums">
              {members.length}
              {currentClassroom.max_members && currentClassroom.max_members > 0
                ? ` / ${currentClassroom.max_members}`
                : ""}
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {t.loading_roster}
            </div>
          ) : (
            <div
              className="divide-y divide-zinc-200 dark:divide-zinc-800 border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
              id="members-table-list"
            >
              {members.map((m) => {
                const isTargetSelf = m.user_id === user?.id;

                return (
                  <div
                    key={m.id}
                    id={`member-row-${m.id}`}
                    className="flex items-center justify-between gap-4 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50 truncate">
                          {m.username}
                        </span>
                        {isTargetSelf && (
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">({t.you})</span>
                        )}
                        <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                          ·
                        </span>
                        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                          {getRoleLabel(m.role)}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 tabular-nums">
                        {lang === "ru" ? "В группе с " : "Joined "}
                        {new Date(m.created_at).toLocaleDateString(
                          lang === "ru" ? "ru-RU" : "en-US"
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {isOwner && !isTargetSelf && m.role !== "owner" && (
                        <select
                          id={`change-role-select-${m.id}`}
                          value={m.role}
                          onChange={(e) =>
                            handleRoleChange(m.id, e.target.value as ClassMemberRole)
                          }
                          className="border-2 border-zinc-200 dark:border-zinc-700 py-1.5 px-2.5 text-xs font-semibold bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
                        >
                          <option value="member">{t.member_role}</option>
                          <option value="admin">{t.admin_role}</option>
                        </select>
                      )}

                      {canEvict(m.role, m.user_id) && (
                        <button
                          id={`evict-member-btn-${m.id}`}
                          type="button"
                          onClick={() => handleRemoveMember(m.id, m.username)}
                          className={`h-8 px-2.5 inline-flex items-center justify-center gap-1 border text-xs font-bold transition-colors cursor-pointer focus:outline-none whitespace-nowrap ${
                            isTargetSelf
                              ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-200"
                              : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400"
                          }`}
                          title={
                            isTargetSelf
                              ? lang === "ru"
                                ? "Выйти из класса"
                                : "Leave classroom"
                              : lang === "ru"
                              ? "Исключить участника"
                              : "Remove member"
                          }
                        >
                          {isTargetSelf ? (
                            <span>{lang === "ru" ? "Выйти" : "Leave"}</span>
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add Member & Role Policies Panel */}
        {canManage && (
          <div className="space-y-4">
            <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
              {t.roster_admin_title}
            </h2>
            <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
              <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-50 font-extrabold text-sm mb-4">
                <UserPlus className="h-4 w-4 shrink-0" />
                <span>{t.force_add}</span>
              </div>

              <form onSubmit={handleAddMember} className="space-y-4">
                <div>
                  <label
                    htmlFor="add-member-username"
                    className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 block"
                  >
                    {t.existing_username}
                  </label>
                  <input
                    id="add-member-username"
                    type="text"
                    required
                    placeholder={t.enter_username_placeholder}
                    value={targetUsername}
                    onChange={(e) => setTargetUsername(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 px-3 text-sm focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                  />
                </div>

                {isOwner && (
                  <div>
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 block">
                      {t.assigned_role}
                    </label>
                    <div className="flex gap-6 mt-1 text-xs font-semibold">
                      <label className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 cursor-pointer">
                        <input
                          id="add-member-role-member"
                          type="radio"
                          name="add-role"
                          checked={targetRole === "member"}
                          onChange={() => setTargetRole("member")}
                          className="accent-zinc-900 dark:accent-zinc-100 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span>{t.member_role}</span>
                      </label>
                      <label className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 cursor-pointer">
                        <input
                          id="add-member-role-admin"
                          type="radio"
                          name="add-role"
                          checked={targetRole === "admin"}
                          onChange={() => setTargetRole("admin")}
                          className="accent-zinc-900 dark:accent-zinc-100 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span>{t.admin_role}</span>
                      </label>
                    </div>
                  </div>
                )}

                <button
                  id="add-member-submit-btn"
                  type="submit"
                  disabled={loading || !targetUsername.trim()}
                  className="flex w-full items-center justify-center gap-2 bg-zinc-900 dark:bg-zinc-100 py-2.5 px-4 text-xs font-bold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 cursor-pointer transition-colors"
                >
                  <span>{t.instruct_enrollment}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>

            <div className="bg-zinc-900 dark:bg-zinc-900 text-white p-5 border-2 border-zinc-900 dark:border-zinc-800 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-zinc-400 shrink-0" />
                <span className="text-xs font-bold text-zinc-300">{t.roster_control_policies}</span>
              </div>
              <ul className="text-xs text-zinc-300 leading-relaxed space-y-2 list-disc pl-4">
                <li>{t.policy_one}</li>
                <li>{t.policy_two}</li>
                <li>{t.policy_three}</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {confirmState && (
        <div
          id="members-confirm-modal"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-700 p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
              {lang === "ru" ? "Подтверждение" : "Confirmation"}
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
                {lang === "ru" ? "Подтвердить" : "Confirm"}
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
