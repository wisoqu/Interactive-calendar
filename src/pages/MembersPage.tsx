import React, { useEffect, useState } from "react";
import { useAuth } from "../store/AuthContext";
import { useThemeLanguage } from "../store/ThemeLanguageContext";
import { ClassMember, ClassMemberRole } from "../types";
import { apiClient } from "../api/client";
import { Users, UserPlus, ShieldAlert, Trash2, ArrowRight } from "lucide-react";

export const MembersPage: React.FC = () => {
  const { currentClassroom, user } = useAuth();
  const { lang, t } = useThemeLanguage();
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    message: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  // Invitation Form
  const [targetUsername, setTargetUsername] = useState("");
  const [targetRole, setTargetRole] = useState<"admin" | "member">("member");

  const fetchMembers = async () => {
    if (!currentClassroom) return;
    setLoading(true);
    setError(null);
    try {
      const list = await apiClient.listMembers(currentClassroom.id);
      setMembers(list);
    } catch (err: any) {
      setError(err.message || (lang === "ru" ? "Не удалось загрузить список участников." : "Failed to load group members."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
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

  const role = currentClassroom?.user_role || "member";
  const isOwner = role === "owner";
  const isAdmin = role === "admin";
  const canManage = isOwner || isAdmin;

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClassroom || !targetUsername.trim()) return;
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      await apiClient.addMember(currentClassroom.id, targetUsername.trim(), targetRole);
      const addedMsg = lang === "ru" 
        ? `Пользователь "${targetUsername.trim()}" успешно добавлен в список группы.`
        : `Successfully added "${targetUsername.trim()}" to the class roster.`;
      
      setTargetUsername("");
      setMessage(addedMsg);
      await fetchMembers();
    } catch (err: any) {
      setError(err.message || (lang === "ru" ? "Пользователь не существует или уже подключен." : "User does not exist or is already enrolled."));
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: ClassMemberRole) => {
    if (!currentClassroom) return;
    setError(null);
    setMessage(null);
    try {
      await apiClient.updateMemberRole(currentClassroom.id, memberId, newRole);
      setMessage(lang === "ru" ? "Права участника обновлены." : "Member permissions updated.");
      await fetchMembers();
    } catch (err: any) {
      setError(err.message || (lang === "ru" ? "Не удалось изменить роль участника." : "Failed to edit user role."));
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!currentClassroom) return;
    const isSelf = members.find(m => m.id === memberId)?.user_id === user?.id;
    
    let confirmMessage = "";
    if (isSelf) {
      confirmMessage = lang === "ru" ? "Вы уверены, что хотите выйти из этой группы?" : "Are you sure you want to leave this classroom group?";
    } else {
      confirmMessage = lang === "ru" ? `Вы уверены, что хотите исключить "${memberName}" из этой группы?` : `Are you sure you want to dismiss "${memberName}" from this classroom?`;
    }

    setConfirmState({
      message: confirmMessage,
      onConfirm: async () => {
        setError(null);
        setMessage(null);
        try {
          await apiClient.removeMember(currentClassroom.id, memberId);
          setMessage(
            isSelf 
              ? (lang === "ru" ? "Вы покинули группу." : "You left the group.") 
              : (lang === "ru" ? "Участник успешно исключен." : "Member dismissed successfully.")
          );
          if (isSelf) {
            window.location.reload();
          } else {
            await fetchMembers();
          }
        } catch (err: any) {
          setError(err.message || (lang === "ru" ? "Не удалось удалить запись членства." : "Failed to delete membership record."));
        }
      }
    });
  };

  const canEvict = (targetRole: ClassMemberRole, targetUserId: string) => {
    if (targetUserId === user?.id) return true; // Can always leave
    if (targetRole === "owner") return false;
    if (isOwner) return true;
    if (isAdmin) return targetRole === "member";
    return false;
  };

  if (!currentClassroom) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 text-center shadow-sm">
        <Users className="mx-auto h-12 w-12 text-zinc-400 dark:text-zinc-500" />
        <h3 className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t.no_classroom_selected}</h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">{t.pick_classroom_desc}</p>
      </div>
    );
  }

  return (
    <div id="members-view-container" className="space-y-6 py-4">
      {/* Header section */}
      <div className="border-b-2 border-zinc-200 dark:border-zinc-800 pb-5">
        <h1 className="text-3xl font-black uppercase tracking-tighter text-zinc-900 dark:text-zinc-50 font-sans flex items-center gap-2.5">
          <Users className="h-6 w-6 text-black dark:text-white" />
          <span>{t.members_roster_title}</span>
        </h1>
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-1">
          {t.manage_roles_desc} <span className="font-black text-black dark:text-white">{currentClassroom.name}</span>
        </p>
      </div>

      {error && (
        <div id="members-error-panel" className="border-2 border-zinc-950 dark:border-red-600 bg-red-50 dark:bg-red-950/40 p-4 text-xs font-black uppercase tracking-wider text-red-600 dark:text-red-300 font-sans">
          {error}
        </div>
      )}
      {message && (
        <div id="members-success-panel" className="border-2 border-zinc-950 dark:border-green-600 bg-green-50 dark:bg-green-950/40 p-4 text-xs font-black uppercase tracking-wider text-green-700 dark:text-green-300 font-sans">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Members Roster List */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-black uppercase tracking-tighter text-zinc-950 dark:text-zinc-50 font-sans">{t.enrolled_participants}</h2>
          
          {loading ? (
            <div className="py-10 text-center text-xs font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{t.loading_roster}</div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-850 border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-none overflow-hidden" id="members-table-list">
              {members.map((m) => {
                const isTargetSelf = m.user_id === user?.id;

                return (
                  <div
                    key={m.id}
                    id={`member-row-${m.id}`}
                    className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-850 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black uppercase tracking-tight text-zinc-900 dark:text-zinc-50">
                          {m.username} {isTargetSelf && <span className="text-xs text-zinc-400 dark:text-zinc-500 font-bold lowercase italic">({t.you})</span>}
                        </span>
                        
                        {/* Static Role Label Badge */}
                        <span className={`rounded px-2 py-0.5 text-[9px] font-black uppercase ${
                          m.role === "owner" ? "bg-zinc-950 dark:bg-zinc-250 text-white dark:text-zinc-900 border border-zinc-950 dark:border-zinc-200" :
                          m.role === "admin" ? "bg-zinc-800 dark:bg-zinc-700 text-white dark:text-zinc-100 border border-zinc-850 dark:border-zinc-600" :
                          "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700"
                        }`}>
                          {m.role === "admin" ? t.admin_role : m.role === "member" ? t.member_role : m.role}
                        </span>
                      </div>
                      <p className="text-[10px] font-bold uppercase text-zinc-400 dark:text-zinc-500 mt-1">
                        {lang === "ru" ? "Зачислен" : "Enrolled"}: {new Date(m.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Owner controls: Dropdown to change role */}
                      {isOwner && !isTargetSelf && m.role !== "owner" ? (
                        <select
                          id={`change-role-select-${m.id}`}
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.id, e.target.value as any)}
                          className="border-2 border-zinc-200 dark:border-zinc-700 py-1.5 px-2 text-[10px] font-black uppercase tracking-wider bg-zinc-50 dark:bg-zinc-850 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-black dark:focus:border-rose-500 rounded-none cursor-pointer"
                        >
                          <option value="member">{t.member_role}</option>
                          <option value="admin">{t.admin_role}</option>
                        </select>
                      ) : null}

                      {/* Unified eviction controls */}
                      {canEvict(m.role, m.user_id) ? (
                        <button
                          id={`evict-member-btn-${m.id}`}
                          onClick={() => handleRemoveMember(m.id, m.username)}
                          className={`w-8 h-8 flex items-center justify-center border-2 border-black font-black text-sm transition-all cursor-pointer focus:outline-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
                            isTargetSelf 
                              ? "bg-amber-100 hover:bg-amber-200 text-amber-900" 
                              : "bg-red-50 hover:bg-red-200 text-red-650"
                          }`}
                          title={isTargetSelf ? (lang === "ru" ? "Выйти из группы" : "Leave classroom group") : (lang === "ru" ? "Исключить участника" : "Dismiss member")}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Administration Add panel */}
        {canManage && (
          <div className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-tighter text-zinc-950 dark:text-zinc-50 font-sans">{t.roster_admin_title}</h2>
            <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.05)]">
              <div className="flex items-center gap-2 text-zinc-950 dark:text-zinc-50 font-black uppercase tracking-wider text-sm mb-4 font-sans">
                <UserPlus className="h-5 w-5 text-black dark:text-white" />
                <span>{t.force_add}</span>
              </div>

              <form onSubmit={handleAddMember} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                    {t.existing_username}
                  </label>
                  <input
                    id="add-member-username"
                    type="text"
                    required
                    placeholder={t.enter_username_placeholder}
                    value={targetUsername}
                    onChange={(e) => setTargetUsername(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 px-3 text-xs uppercase font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
                  />
                </div>

                {isOwner && (
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                      {t.assigned_role}
                    </label>
                    <div className="flex gap-6 mt-1 font-black uppercase tracking-wider text-xs">
                      <label className="flex items-center gap-1.5 text-zinc-900 dark:text-zinc-100 cursor-pointer">
                        <input
                          id="add-member-role-member"
                          type="radio"
                          name="add-role"
                          checked={targetRole === "member"}
                          onChange={() => setTargetRole("member")}
                          className="accent-black dark:accent-rose-500 h-3 w-3 cursor-pointer"
                        />
                        <span>{t.member_role}</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-zinc-900 dark:text-zinc-100 cursor-pointer">
                        <input
                          id="add-member-role-admin"
                          type="radio"
                          name="add-role"
                          checked={targetRole === "admin"}
                          onChange={() => setTargetRole("admin")}
                          className="accent-black dark:accent-rose-500 h-3 w-3 cursor-pointer"
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
                  className="flex w-full items-center justify-center gap-2 bg-black dark:bg-rose-900 py-3 px-4 text-xs font-black uppercase tracking-widest text-white dark:text-rose-100 hover:bg-zinc-800 dark:hover:bg-rose-800 disabled:opacity-40 rounded-none cursor-pointer duration-150 border border-black dark:border-rose-500 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,63,94,0.3)] active:translate-x-1 active:translate-y-1 active:shadow-none"
                >
                  <span>{t.instruct_enrollment}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </div>

            {/* Role Helper Info panel */}
            <div className="bg-zinc-950 dark:bg-zinc-900 text-white p-6 border-2 border-black dark:border-zinc-800 space-y-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,63,94,0.3)]">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="h-5 w-5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">{t.roster_control_policies}</span>
              </div>
              <ul className="text-xs text-zinc-400 dark:text-zinc-300 leading-relaxed space-y-2 list-none">
                <li className="flex items-start gap-1"><span className="text-white font-bold ml-1">•</span> {t.policy_one}</li>
                <li className="flex items-start gap-1"><span className="text-white font-bold ml-1">•</span> {t.policy_two}</li>
                <li className="flex items-start gap-1"><span className="text-white font-bold ml-1">•</span> {t.policy_three}</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {confirmState && (
        <div id="members-confirm-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
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
