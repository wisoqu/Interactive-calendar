import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "ru" | "en";
export type Theme = "light" | "dark";

export interface Translations {
  app_title: string;
  group: string;
  choose_group: string;
  overview: string;
  calendar_app: string;
  members_roster: string;
  settings_config: string;
  logout: string;
  footer_text: string;
  syncing_session: string;
  you: string;
  cancel: string;
  save: string;
  active: string;
  toggle_theme: string;

  // AuthPage
  login_title: string;
  register_title: string;
  forgot_title: string;
  confirm_title: string;
  username: string;
  password: string;
  new_password: string;
  email: string;
  email_recovery_help: string;
  username_placeholder: string;
  password_placeholder: string;
  forgot_password: string;
  log_in: string;
  logging_in: string;
  dont_have_account: string;
  sign_up: string;
  already_registered: string;
  creating_account: string;
  note_recovery: string;
  registered_email: string;
  enter_recovery_email: string;
  back: string;
  send_code: string;
  sending_code: string;
  verification_code_label: string;
  verification_placeholder: string;
  new_password_placeholder: string;
  resetting: string;
  confirm_reset: string;

  // HomePage
  welcome_title: string;
  welcome_desc: string;
  registered_classrooms: string;
  no_classrooms: string;
  no_classrooms_desc: string;
  code: string;
  no_desc: string;
  owner: string;
  open: string;
  join_by_code: string;
  enroll_btn: string;
  create_classroom: string;
  classroom_name: string;
  classroom_desc_label: string;
  classroom_desc_placeholder: string;
  establish_btn: string;

  // CalendarPage
  classroom_events: string;
  sorted_schedules: string;
  add_event: string;
  edit_event_title: string;
  create_event_title: string;
  event_title_label: string;
  event_title_placeholder: string;
  event_desc_label: string;
  event_desc_placeholder: string;
  starts_at: string;
  ends_at: string;
  publish_event: string;
  save_changes: string;
  querying: string;
  event_logs_empty: string;
  no_events_desc: string;
  by: string;
  edit_event_tooltip: string;
  delete_event_tooltip: string;

  // MembersPage
  members_roster_title: string;
  manage_roles_desc: string;
  enrolled_participants: string;
  loading_roster: string;
  force_add: string;
  roster_admin_title: string;
  existing_username: string;
  enter_username_placeholder: string;
  assigned_role: string;
  member_role: string;
  admin_role: string;
  instruct_enrollment: string;
  roster_control_policies: string;
  policy_one: string;
  policy_two: string;
  policy_three: string;

  // SettingsPage
  no_classroom_selected: string;
  pick_classroom_desc: string;
  settings_restricted: string;
  only_owner_restricted: string;
  settings_desc: string;
  group_configs: string;
  save_configs: string;
  active_share_code: string;
  distribute_desc: string;
  entering_code_desc: string;
  danger_zone: string;
  danger_desc: string;
  terminate_btn: string;
}

export const translationDict: Record<Language, Translations> = {
  ru: {
    app_title: "Школьный календарь",
    group: "Класс",
    choose_group: "Выберите класс",
    overview: "Обзор",
    calendar_app: "Календарь",
    members_roster: "Участники",
    settings_config: "Настройки",
    logout: "Выйти",
    footer_text: "Интерактивный школьный календарь класса",
    syncing_session: "Загрузка...",
    you: "вы",
    cancel: "Отмена",
    save: "Сохранить",
    active: "групп",
    toggle_theme: "Переключить тему оформления",

    // AuthPage
    login_title: "Войдите в аккаунт для работы с расписанием класса",
    register_title: "Регистрация нового пользователя",
    forgot_title: "Восстановление пароля по электронной почте",
    confirm_title: "Введите код из письма и задайте новый пароль",
    username: "Имя пользователя",
    password: "Пароль",
    new_password: "Новый пароль",
    email: "Электронная почта (необязательно)",
    email_recovery_help: "Нужна для восстановления пароля",
    username_placeholder: "Введите логин",
    password_placeholder: "Введите пароль",
    forgot_password: "Забыли пароль?",
    log_in: "Войти",
    logging_in: "Вход...",
    dont_have_account: "Нет аккаунта?",
    sign_up: "Зарегистрироваться",
    already_registered: "Уже есть аккаунт?",
    creating_account: "Регистрация...",
    note_recovery: "Укажите адрес электронной почты, привязанный к вашему аккаунту. Мы отправим на него одноразовый 6-значный код подтверждения.",
    registered_email: "Электронная почта",
    enter_recovery_email: "name@example.com",
    back: "Назад",
    send_code: "Отправить код",
    sending_code: "Отправка...",
    verification_code_label: "6-значный код из письма",
    verification_placeholder: "000000",
    new_password_placeholder: "Не менее 6 символов",
    resetting: "Сохранение...",
    confirm_reset: "Сменить пароль",

    // HomePage
    welcome_title: "Учебные классы и школьные группы",
    welcome_desc: "Планируйте контрольные работы, классные часы, олимпиады, собрания и экскурсии в едином календаре класса. Приглашайте учеников по коду и распределяйте права доступа.",
    registered_classrooms: "Мои классы и группы",
    no_classrooms: "Вы пока не состоите ни в одном классе",
    no_classrooms_desc: "Присоединитесь к существующему классу по коду приглашения или создайте новую учебную группу.",
    code: "Код",
    no_desc: "Описание не указано.",
    owner: "Владелец",
    open: "Открыть",
    join_by_code: "Вступить по коду",
    enroll_btn: "Присоединиться",
    create_classroom: "Новый класс",
    classroom_name: "Название класса или группы *",
    classroom_desc_label: "Описание (необязательно)",
    classroom_desc_placeholder: "Например: 10 «А» класс, расписание контрольных и мероприятий",
    establish_btn: "Создать класс",

    // CalendarPage
    classroom_events: "Календарь событий",
    sorted_schedules: "Мероприятия и важные даты:",
    add_event: "Добавить событие",
    edit_event_title: "Редактирование события",
    create_event_title: "Новое событие",
    event_title_label: "Название события *",
    event_title_placeholder: "Например: Контрольная работа по алгебре",
    event_desc_label: "Описание и детали",
    event_desc_placeholder: "Кабинет, список тем для подготовки, комментарии...",
    starts_at: "Начало *",
    ends_at: "Окончание *",
    publish_event: "Создать событие",
    save_changes: "Сохранить изменения",
    querying: "Загрузка расписания...",
    event_logs_empty: "Событий пока нет",
    no_events_desc: "В этом классе еще не запланировано ни одного мероприятия.",
    by: "Добавил",
    edit_event_tooltip: "Редактировать событие",
    delete_event_tooltip: "Удалить событие",

    // MembersPage
    members_roster_title: "Участники класса",
    manage_roles_desc: "Состав учебной группы и роли:",
    enrolled_participants: "Список участников",
    loading_roster: "Загрузка списка участников...",
    force_add: "Добавить по логину",
    roster_admin_title: "Управление составом",
    existing_username: "Логин зарегистрированного пользователя *",
    enter_username_placeholder: "Введите имя пользователя",
    assigned_role: "Роль в классе",
    member_role: "Участник",
    admin_role: "Администратор",
    instruct_enrollment: "Добавить в класс",
    roster_control_policies: "Правила разграничения прав",
    policy_one: "Назначать и снимать администраторов может только владелец класса.",
    policy_two: "Администраторы управляют событиями и могут исключать обычных участников.",
    policy_three: "Владелец не может покинуть собственный класс — при необходимости класс удаляется в настройках.",

    // SettingsPage
    no_classroom_selected: "Класс не выбран",
    pick_classroom_desc: "Выберите учебную группу в верхнем меню или на вкладке «Обзор».",
    settings_restricted: "Доступ ограничен",
    only_owner_restricted: "Изменять настройки класса и управлять его удалением может только владелец группы ({owner}).",
    settings_desc: "Основные параметры учебной группы, код приглашения и правила вступления.",
    group_configs: "Основные параметры",
    save_configs: "Сохранить настройки",
    active_share_code: "Код приглашения",
    distribute_desc: "Сообщите этот код ученикам класса",
    entering_code_desc: "По этому коду зарегистрированные пользователи могут вступить в группу с ролью «Участник».",
    danger_zone: "Удаление класса",
    danger_desc: "При удалении класса все его события и список участников удаляются безвозвратно.",
    terminate_btn: "Удалить класс"
  },
  en: {
    app_title: "School Calendar",
    group: "Class",
    choose_group: "Select class",
    overview: "Overview",
    calendar_app: "Calendar",
    members_roster: "Members",
    settings_config: "Settings",
    logout: "Log out",
    footer_text: "Interactive School Classroom Calendar",
    syncing_session: "Loading...",
    you: "you",
    cancel: "Cancel",
    save: "Save",
    active: "groups",
    toggle_theme: "Toggle color theme",

    // AuthPage
    login_title: "Sign in to view your classroom schedule and events",
    register_title: "Create a new account",
    forgot_title: "Reset your password via email",
    confirm_title: "Enter the verification code and choose a new password",
    username: "Username",
    password: "Password",
    new_password: "New password",
    email: "Email address (optional)",
    email_recovery_help: "Used for password recovery",
    username_placeholder: "Enter username",
    password_placeholder: "Enter password",
    forgot_password: "Forgot password?",
    log_in: "Sign in",
    logging_in: "Signing in...",
    dont_have_account: "No account yet?",
    sign_up: "Create account",
    already_registered: "Already have an account?",
    creating_account: "Creating account...",
    note_recovery: "Enter the email address linked to your account. We will send a one-time 6-digit verification code.",
    registered_email: "Email address",
    enter_recovery_email: "name@example.com",
    back: "Back",
    send_code: "Send code",
    sending_code: "Sending...",
    verification_code_label: "6-digit verification code",
    verification_placeholder: "000000",
    new_password_placeholder: "At least 6 characters",
    resetting: "Saving...",
    confirm_reset: "Update password",

    // HomePage
    welcome_title: "Classrooms & School Groups",
    welcome_desc: "Organize exams, homerooms, competitions, parent meetings, and field trips in one shared classroom calendar. Invite students with a 6-character code and manage roles.",
    registered_classrooms: "My Classrooms",
    no_classrooms: "No classrooms yet",
    no_classrooms_desc: "Join an existing classroom with an invite code or create a new group.",
    code: "Code",
    no_desc: "No description provided.",
    owner: "Owner",
    open: "Open",
    join_by_code: "Join by code",
    enroll_btn: "Join classroom",
    create_classroom: "New classroom",
    classroom_name: "Classroom or group name *",
    classroom_desc_label: "Description (optional)",
    classroom_desc_placeholder: "e.g. Grade 10A — tests, school events, and deadlines",
    establish_btn: "Create classroom",

    // CalendarPage
    classroom_events: "Event Calendar",
    sorted_schedules: "Schedule and upcoming dates for",
    add_event: "Add event",
    edit_event_title: "Edit event",
    create_event_title: "New event",
    event_title_label: "Event title *",
    event_title_placeholder: "e.g. Algebra Chapter Test",
    event_desc_label: "Description & notes",
    event_desc_placeholder: "Room number, preparation topics, notes...",
    starts_at: "Starts at *",
    ends_at: "Ends at *",
    publish_event: "Create event",
    save_changes: "Save changes",
    querying: "Loading schedule...",
    event_logs_empty: "No events scheduled",
    no_events_desc: "There are no scheduled events in this classroom yet.",
    by: "Added by",
    edit_event_tooltip: "Edit event",
    delete_event_tooltip: "Delete event",

    // MembersPage
    members_roster_title: "Classroom Members",
    manage_roles_desc: "Participants and roles for",
    enrolled_participants: "Member list",
    loading_roster: "Loading members...",
    force_add: "Add by username",
    roster_admin_title: "Manage members",
    existing_username: "Registered username *",
    enter_username_placeholder: "Enter username",
    assigned_role: "Role",
    member_role: "Member",
    admin_role: "Admin",
    instruct_enrollment: "Add to classroom",
    roster_control_policies: "Access rules",
    policy_one: "Only the classroom Owner can promote or demote Admins.",
    policy_two: "Admins can manage events and remove regular members.",
    policy_three: "The Owner cannot leave their own classroom; delete the classroom in Settings if needed.",

    // SettingsPage
    no_classroom_selected: "No classroom selected",
    pick_classroom_desc: "Select a classroom from the top switcher or Overview tab.",
    settings_restricted: "Owner access only",
    only_owner_restricted: "Only the classroom Owner ({owner}) can modify classroom settings or delete the group.",
    settings_desc: "Configure group details, invite code access, and member limits.",
    group_configs: "General settings",
    save_configs: "Save settings",
    active_share_code: "Invite code",
    distribute_desc: "Share this code with students",
    entering_code_desc: "Registered users can enter this code on the Overview page to join as a Member.",
    danger_zone: "Delete classroom",
    danger_desc: "Deleting a classroom permanently removes all of its events and member records.",
    terminate_btn: "Delete classroom"
  }
};

interface ThemeLanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  t: Translations;
}

const ThemeLanguageContext = createContext<ThemeLanguageContextType | undefined>(undefined);

function safeGetStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota / sandbox restrictions in cross-origin iframes
  }
}

export const ThemeLanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = safeGetStorage("preferred_lang");
    return saved === "en" || saved === "ru" ? saved : "ru";
  });

  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = safeGetStorage("preferred_theme");
    return saved === "dark" || saved === "light" ? saved : "light";
  });

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    safeSetStorage("preferred_lang", newLang);
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    safeSetStorage("preferred_theme", newTheme);
  };

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  const t = translationDict[lang];

  return (
    <ThemeLanguageContext.Provider value={{ lang, setLang, theme, setTheme, t }}>
      {children}
    </ThemeLanguageContext.Provider>
  );
};

export const useThemeLanguage = () => {
  const context = useContext(ThemeLanguageContext);
  if (!context) {
    throw new Error("useThemeLanguage must be used within a ThemeLanguageProvider");
  }
  return context;
};
