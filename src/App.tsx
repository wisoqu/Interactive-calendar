import React, { useState } from "react";
import { AuthProvider, useAuth } from "./store/AuthContext";
import { ThemeLanguageProvider, useThemeLanguage } from "./store/ThemeLanguageContext";
import { AuthPage } from "./pages/AuthPage";
import { HomePage } from "./pages/HomePage";
import { CalendarPage } from "./pages/CalendarPage";
import { MembersPage } from "./pages/MembersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { Classroom } from "./types";
import {
  Calendar,
  Users,
  Settings as SettingsIcon,
  Home,
  LogOut,
  ChevronDown,
  User,
  Sun,
  Moon,
} from "lucide-react";

type ActiveTab = "home" | "calendar" | "members" | "settings";

const ClassroomDashboard: React.FC = () => {
  const { user, classrooms, currentClassroom, selectClassroom, refreshClassrooms, logout } = useAuth();
  const { lang, setLang, theme, setTheme, t } = useThemeLanguage();
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setClassDropdownOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Keep classroom settings, member count, and current user role synchronized across tab switches
  React.useEffect(() => {
    if (user) {
      refreshClassrooms();
    }
  }, [activeTab, user?.id, refreshClassrooms]);

  // Reset tab if current classroom changes and user is no longer owner on Settings tab
  React.useEffect(() => {
    if (activeTab === "settings" && currentClassroom?.user_role !== "owner") {
      setActiveTab("home");
    }
  }, [activeTab, currentClassroom]);

  const handleSelectClassroom = (classroom: Classroom | null) => {
    selectClassroom(classroom);
    setClassDropdownOpen(false);
    if (classroom) {
      setActiveTab("calendar");
    } else {
      setActiveTab("home");
    }
  };

  const isOwner = currentClassroom?.user_role === "owner";

  const getRoleLabel = (role: Classroom["user_role"]) => {
    if (role === "owner") return t.owner;
    if (role === "admin") return t.admin_role;
    return t.member_role;
  };

  return (
    <div
      id="school-calendar-app"
      className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans transition-colors duration-150"
    >
      {/* Top Navigation Header */}
      <header
        id="app-header-nav"
        className="sticky top-0 z-40 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 transition-colors duration-150"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center gap-4 h-16">
            {/* Brand Wordmark */}
            <button
              type="button"
              onClick={() => setActiveTab("home")}
              className="flex items-center gap-3 cursor-pointer text-left focus:outline-none whitespace-nowrap shrink-0"
            >
              <div className="flex h-9 w-9 items-center justify-center border-2 border-zinc-900 dark:border-zinc-200 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900">
                <Calendar className="h-4 w-4" />
              </div>
              <span className="font-extrabold text-sm tracking-tight text-zinc-900 dark:text-zinc-50 hidden sm:inline">
                {t.app_title}
              </span>
            </button>

            {/* Classroom Switcher */}
            {user && classrooms.length > 0 && (
              <div className="relative">
                <button
                  id="classroom-switcher-btn"
                  type="button"
                  onClick={() => setClassDropdownOpen(!classDropdownOpen)}
                  className="inline-flex items-center gap-2 border-2 border-zinc-900 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 py-1.5 px-3 text-xs font-bold text-zinc-900 dark:text-zinc-100 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span className="text-zinc-500 dark:text-zinc-400">{t.group}:</span>
                  <span className="font-extrabold max-w-[140px] sm:max-w-[200px] truncate">
                    {currentClassroom ? currentClassroom.name : t.choose_group}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-400 shrink-0" />
                </button>

                {classDropdownOpen && (
                  <div
                    id="classroom-dropdown-menu"
                    className="absolute left-0 mt-1.5 z-50 w-64 border-2 border-zinc-900 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-1 shadow-lg"
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectClassroom(null)}
                      className="block w-full text-left px-4 py-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      {t.overview}
                    </button>
                    <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                    {classrooms.map((cr) => {
                      const isSelected = currentClassroom?.id === cr.id;
                      return (
                        <button
                          key={cr.id}
                          type="button"
                          onClick={() => handleSelectClassroom(cr)}
                          className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-bold"
                              : "text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          }`}
                        >
                          <span className="truncate">{cr.name}</span>
                          <span
                            className={`text-[11px] shrink-0 ${
                              isSelected
                                ? "text-zinc-300 dark:text-zinc-600"
                                : "text-zinc-400 dark:text-zinc-500"
                            }`}
                          >
                            {getRoleLabel(cr.user_role)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Right Controls: Theme, Language, User, Logout */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                id="theme-toggle-btn"
                type="button"
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                className="inline-flex h-9 w-9 items-center justify-center border-2 border-zinc-900 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                title={t.toggle_theme}
                aria-label={t.toggle_theme}
              >
                {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>

              <button
                id="lang-toggle-btn"
                type="button"
                onClick={() => setLang(lang === "ru" ? "en" : "ru")}
                className="inline-flex h-9 items-center justify-center px-2.5 border-2 border-zinc-900 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer whitespace-nowrap"
                title="Сменить язык / Switch language"
              >
                {lang === "ru" ? "EN" : "RU"}
              </button>

              <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 border border-zinc-200 dark:border-zinc-700">
                <User className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" />
                <span className="max-w-[120px] truncate">{user?.username}</span>
              </div>

              <button
                id="logout-btn"
                type="button"
                onClick={logout}
                className="inline-flex h-9 items-center justify-center gap-1.5 px-3 font-bold text-xs bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
                title={t.logout}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t.logout}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Classroom Section Tabs */}
      {currentClassroom && (
        <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 transition-colors duration-150">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-6 overflow-x-auto -mb-px" aria-label="Tabs" id="classroom-tabs-nav">
              <button
                id="tab-home"
                type="button"
                onClick={() => setActiveTab("home")}
                className={`flex items-center gap-2 py-3.5 px-1 border-b-2 font-bold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === "home"
                    ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                    : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                <Home className="h-4 w-4" />
                <span>{t.overview}</span>
              </button>

              <button
                id="tab-calendar"
                type="button"
                onClick={() => setActiveTab("calendar")}
                className={`flex items-center gap-2 py-3.5 px-1 border-b-2 font-bold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === "calendar"
                    ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                    : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                <Calendar className="h-4 w-4" />
                <span>{t.calendar_app}</span>
              </button>

              <button
                id="tab-members"
                type="button"
                onClick={() => setActiveTab("members")}
                className={`flex items-center gap-2 py-3.5 px-1 border-b-2 font-bold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === "members"
                    ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                    : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                <Users className="h-4 w-4" />
                <span>{t.members_roster}</span>
              </button>

              {isOwner && (
                <button
                  id="tab-settings"
                  type="button"
                  onClick={() => setActiveTab("settings")}
                  className={`flex items-center gap-2 py-3.5 px-1 border-b-2 font-bold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    activeTab === "settings"
                      ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                      : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  <SettingsIcon className="h-4 w-4" />
                  <span>{t.settings_config}</span>
                </button>
              )}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!currentClassroom || activeTab === "home" ? (
          <HomePage onOpenCalendar={() => setActiveTab("calendar")} />
        ) : activeTab === "calendar" ? (
          <CalendarPage />
        ) : activeTab === "members" ? (
          <MembersPage />
        ) : activeTab === "settings" ? (
          <SettingsPage />
        ) : null}
      </main>

      {/* Quiet Footer */}
      <footer className="bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 py-4 text-center mt-auto text-xs text-zinc-500 dark:text-zinc-400 transition-colors duration-150">
        <div>{t.footer_text}</div>
      </footer>
    </div>
  );
};

const AuthGate: React.FC = () => {
  const { user, loading } = useAuth();
  const { t } = useThemeLanguage();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 transition-colors duration-150">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-900 dark:border-zinc-100 border-t-transparent" />
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t.syncing_session}</p>
        </div>
      </div>
    );
  }

  return user ? <ClassroomDashboard /> : <AuthPage />;
};

export default function App() {
  return (
    <ThemeLanguageProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ThemeLanguageProvider>
  );
}
