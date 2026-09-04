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
    app_title: "Интерактивный календарь",
    group: "Группа",
    choose_group: "Выбрать группу...",
    overview: "Обзор",
    calendar_app: "Календарь",
    members_roster: "Участники",
    settings_config: "Настройки",
    logout: "Выйти",
    footer_text: "Интерактивный школьный календарь © 2026.",
    syncing_session: "Синхронизация сессии...",
    you: "Вы",
    cancel: "Отмена",
    save: "Сохранить",
    active: "активно",

    // AuthPage
    login_title: "Войдите, чтобы просматривать расписание школы и клубов",
    register_title: "Создайте учетную запись для планировщика классов",
    forgot_title: "Восстановите пароль через зарегистрированную почту",
    confirm_title: "Полная верификация сброса пароля с помощью кода",
    username: "Имя пользователя",
    password: "Пароль",
    new_password: "Новый пароль",
    email: "Адрес почты (необязательно)",
    email_recovery_help: "Введите email для возможности восстановления",
    username_placeholder: "Введите имя пользователя",
    password_placeholder: "••••••••",
    forgot_password: "Забыли пароль?",
    log_in: "Войти",
    logging_in: "Вход...",
    dont_have_account: "Нет учетной записи?",
    sign_up: "Регистрация",
    already_registered: "Уже зарегистрированы?",
    creating_account: "Создание аккаунта...",
    note_recovery: "* Примечание: Для восстановления пароля требуется зарегистрированный адрес электронной почты, на который отправляется верификационный код.",
    registered_email: "Зарегистрированный адрес почты",
    enter_recovery_email: "Введите ваш email для восстановления",
    back: "Назад",
    send_code: "Запросить код",
    sending_code: "Отправка...",
    verification_code_label: "6-значный код подтверждения",
    verification_placeholder: "Введите 6-значный пин-код",
    new_password_placeholder: "Не менее 6 символов",
    resetting: "Сброс...",
    confirm_reset: "Подтвердить сброс",

    // HomePage
    welcome_title: "Школьные и общинные порталы",
    welcome_desc: "Создавайте академические группы, внеклассные кружки или управляйте расписанием уроков. Распространяйте 6-значные инвойс-коды, распределяйте роли и записывайте события в формате UTC.",
    registered_classrooms: "Зарегистрированные классы",
    no_classrooms: "Нет зачисленных классов",
    no_classrooms_desc: "Присоединяйтесь к существующему классу по коду или создайте новую группу.",
    code: "Код",
    no_desc: "Описание отсутствует.",
    owner: "Владелец",
    open: "Открыть",
    join_by_code: "Войти по коду",
    enroll_btn: "Записаться в класс",
    create_classroom: "Создать класс",
    classroom_name: "Название класса *",
    classroom_desc_label: "Описание",
    classroom_desc_placeholder: "Опишите расписание, задачи или правила группы...",
    establish_btn: "Учредить класс",

    // CalendarPage
    classroom_events: "События в группе",
    sorted_schedules: "Расписание событий для",
    add_event: "Создать событие",
    edit_event_title: "Редактировать событие",
    create_event_title: "Новое событие",
    event_title_label: "Имя события *",
    event_title_placeholder: "например, Тест по биологии, глава 3",
    event_desc_label: "Описание события",
    event_desc_placeholder: "Детали, домашнее задание, полезные ссылки...",
    starts_at: "Время начала *",
    ends_at: "Время окончания *",
    publish_event: "Опубликовать событие",
    save_changes: "Сохранить изменения",
    querying: "Запрос данных расписания...",
    event_logs_empty: "Календарь пуст",
    no_events_desc: "В этой группе пока нет запланированных событий.",
    by: "Автор",
    edit_event_tooltip: "Редактировать событие",
    delete_event_tooltip: "Удалить событие",

    // MembersPage
    members_roster_title: "Список участников",
    manage_roles_desc: "Управление ролями и просмотр участников для",
    enrolled_participants: "Участники группы",
    loading_roster: "Загрузка списка участников...",
    force_add: "Принудительно зачислить",
    roster_admin_title: "Администрирование участников",
    existing_username: "Существующее имя пользователя *",
    enter_username_placeholder: "Укажите имя пользователя",
    assigned_role: "Назначаемая роль",
    member_role: "Участник",
    admin_role: "Администратор",
    instruct_enrollment: "Зачислить в группу",
    roster_control_policies: "Политика управления списком",
    policy_one: "Только Владелец может изменять роли участников или назначать администраторов.",
    policy_two: "Администраторы могут публиковать события и исключать участников, но не могут менять владельца или других администраторов.",
    policy_three: "Владелец не может покинуть класс или удалить свое членство; для этого нужно аннулировать весь класс целиком.",

    // SettingsPage
    no_classroom_selected: "Класс не выбран",
    pick_classroom_desc: "Выберите или создайте групповой портал в навигационном меню выше.",
    settings_restricted: "Доступ ограничен",
    only_owner_restricted: "Только создатель/владелец группы ({owner}) имеет права изменять параметры класса, читать логи безопасности или расформировывать группу.",
    settings_desc: "Регулируйте свойства кабинета, отображайте коды авторизации и управляйте административным циклом.",
    group_configs: "Параметры группы",
    save_configs: "Сохранить конфигурацию",
    active_share_code: "Активный код инвайта",
    distribute_desc: "Передайте этот код ученикам или представителям класса",
    entering_code_desc: "Ввод этого кода на главной странице мгновенно регистрирует входящего как 'участника'.",
    danger_zone: "Опасная зона",
    danger_desc: "Удаление группы безвозвратно сотрет всех участников, расписания и файлы настроек.",
    terminate_btn: "Уничтожить класс"
  },
  en: {
    app_title: "Interactive Calendar",
    group: "Group",
    choose_group: "Choose Group...",
    overview: "Overview",
    calendar_app: "Calendar App",
    members_roster: "Members Roster",
    settings_config: "Settings Config",
    logout: "Logout",
    footer_text: "Interactive Classroom Calendar © 2026.",
    syncing_session: "Syncing session token...",
    you: "You",
    cancel: "Cancel",
    save: "Save",
    active: "active",

    // AuthPage
    login_title: "Log in to view school and club schedules",
    register_title: "Create your classroom planner account",
    forgot_title: "Recover your password via registered email",
    confirm_title: "Complete password reset verification code authentication",
    username: "Username",
    password: "Password",
    new_password: "New Password",
    email: "Email Address (Optional)",
    email_recovery_help: "Enter email for recovery option",
    username_placeholder: "Enter your username",
    password_placeholder: "••••••••",
    forgot_password: "Forgot password?",
    log_in: "Log In",
    logging_in: "Logging in...",
    dont_have_account: "Don't have an account?",
    sign_up: "Sign up",
    already_registered: "Already registered?",
    creating_account: "Creating account...",
    note_recovery: "* Note: Password recovery requires entering your registered email address to emit recovery verification numbers.",
    registered_email: "Registered Email Address",
    enter_recovery_email: "Enter your recovery email",
    back: "Back",
    send_code: "Request Code",
    sending_code: "Sending...",
    verification_code_label: "6-Digit Verification Code",
    verification_placeholder: "Enter 6-digit pin code",
    new_password_placeholder: "At least 6 characters",
    resetting: "Resetting...",
    confirm_reset: "Confirm Reset",

    // HomePage
    welcome_title: "School & Community Portals",
    welcome_desc: "Create academic groups, extracurricular circles, or manage lesson calendars. Distribute 6-digit invite codes, assign roles, and record schedules in UTC coordinates.",
    registered_classrooms: "Registered Classrooms",
    no_classrooms: "No Classrooms Enrolled",
    no_classrooms_desc: "Join an existing classroom by code or create a new group.",
    code: "Code",
    no_desc: "No description provided.",
    owner: "Owner",
    open: "Open",
    join_by_code: "Join by Code",
    enroll_btn: "Enroll in Class",
    create_classroom: "Create Classroom",
    classroom_name: "Classroom Name *",
    classroom_desc_label: "Description",
    classroom_desc_placeholder: "Describe your schedule, class, or community policies...",
    establish_btn: "Establish Classroom",

    // CalendarPage
    classroom_events: "Classroom Events",
    sorted_schedules: "Sorted ascending schedules for",
    add_event: "Add Event",
    edit_event_title: "Edit Scheduled Event",
    create_event_title: "Create Calendar Appointment",
    event_title_label: "Event Title *",
    event_title_placeholder: "e.g. Chapter 4 Lab Quiz",
    event_desc_label: "Description",
    event_desc_placeholder: "Details, homework resources, study instructions...",
    starts_at: "Starts At *",
    ends_at: "Ends At *",
    publish_event: "Publish Event",
    save_changes: "Save Changes",
    querying: "Querying schedule coordinates...",
    event_logs_empty: "Event Logs Empty",
    no_events_desc: "There are no events registered for this classroom yet.",
    by: "By",
    edit_event_tooltip: "Edit event",
    delete_event_tooltip: "Delete event",

    // MembersPage
    members_roster_title: "Members Roster",
    manage_roles_desc: "Manage roles and view participant logs for",
    enrolled_participants: "Enrolled Participants",
    loading_roster: "Loading roster profiles...",
    force_add: "Force Add Member",
    roster_admin_title: "Roster Administration",
    existing_username: "Existing Username *",
    enter_username_placeholder: "Enter school username",
    assigned_role: "Assigned Role",
    member_role: "Member",
    admin_role: "Admin",
    instruct_enrollment: "Instruct Enrollment",
    roster_control_policies: "Roster control policies",
    policy_one: "Only the Owner can mutate member roles or designate Admins.",
    policy_two: "Admins can publish events and dismiss standard members, but cannot touch Owners or other Admins.",
    policy_three: "Owners cannot leave or delete their membership; they must delete the classroom instance.",

    // SettingsPage
    no_classroom_selected: "No Classroom Selected",
    pick_classroom_desc: "Pick or create a classroom pool first using the header navigation.",
    settings_restricted: "Settings Restricted",
    only_owner_restricted: "Only the group Creator/Owner ({owner}) has permissions to modify classroom properties, retrieve secure logs, or delete the group.",
    settings_desc: "Adjust classroom properties, display invitations, or manage administrative lifecycles.",
    group_configs: "Group Configurations",
    save_configs: "Save Configurations",
    active_share_code: "Active Share Code",
    distribute_desc: "Distribute to students or class representatives",
    entering_code_desc: "Entering this code on the landing page authorizes instant enrollment as a 'member'.",
    danger_zone: "Danger Zone",
    danger_desc: "Erasing the classroom removes memberships, event registers, and settings pools irreversibly.",
    terminate_btn: "Terminate Classroom"
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

export const ThemeLanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem("preferred_lang") as Language;
    return saved === "en" || saved === "ru" ? saved : "ru"; // Russian default
  });

  const [theme] = useState<Theme>("light");

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem("preferred_lang", newLang);
  };

  const setTheme = (newTheme: Theme) => {
    // Force white/light-only theme as requested, ignore any toggle request
  };

  useEffect(() => {
    // Always force light theme mode (remove dark class)
    const root = window.document.documentElement;
    root.classList.remove("dark");
  }, []);

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
