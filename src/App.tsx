import React, { useState } from "react";
import { AuthProvider, useAuth } from "./store/AuthContext";
import { ThemeLanguageProvider, useThemeLanguage } from "./store/ThemeLanguageContext";
import { AuthPage } from "./pages/AuthPage";
import { HomePage } from "./pages/HomePage";
import { CalendarPage } from "./pages/CalendarPage";
import { MembersPage } from "./pages/MembersPage";
import { SettingsPage } from "./pages/SettingsPage";
import {
  Calendar,
  Users,
  Settings as SettingsIcon,
  Home,
  LogOut,
  ChevronDown,
  User,
} from "lucide-react";

type ActiveTab = "home" | "calendar" | "members" | "settings";

const ClassroomDashboard: React.FC = () => {
  const { user, classrooms, currentClassroom, selectClassroom, logout } = useAuth();
  const { lang, setLang, theme, setTheme, t } = useThemeLanguage();
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const [justSwitched, setJustSwitched] = useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setClassDropdownOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Trigger pulse animation whenever currentClassroom changes
  React.useEffect(() => {
    if (currentClassroom) {
      setJustSwitched(true);
      const timer = setTimeout(() => setJustSwitched(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [currentClassroom?.id]);

  // Auto-redirect or handle tab changes depending on classroom selections
  const handleSelectClassroom = (classroom: any) => {
    selectClassroom(classroom);
    setClassDropdownOpen(false);
    if (classroom) {
      setJustSwitched(true);
      setActiveTab("calendar"); // jump straight to calendar of selected class!
    } else {
      setActiveTab("home");
    }
  };

  const isOwner = currentClassroom?.user_role === "owner";

  return (
    <div id="school-calendar-app" className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans border-t-8 border-b-8 md:border-8 border-zinc-200 dark:border-zinc-800 duration-150">
      {/* Primary Top Header Banner */}
      <header id="app-header-nav" className="sticky top-0 z-40 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 duration-150 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            
            {/* Logo Brand */}
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setActiveTab("home")}>
              <div className="flex h-10 w-10 items-center justify-center rounded border-2 border-black dark:border-rose-500 bg-zinc-950 dark:bg-rose-900 text-white dark:text-rose-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] group-hover:bg-zinc-800 transition-colors">
                <Calendar className="h-5 w-5 text-white dark:text-rose-100" />
              </div>
              <span className="font-black text-[11px] uppercase tracking-tighter leading-tight hidden lg:block max-w-[120px]">
                {t.app_title}
              </span>
            </div>

            {/* Quick Switcher dropdown with active group animation display */}
            {user && classrooms.length > 0 && (
              <div className="relative flex items-center gap-2">
                <button
                  id="classroom-switcher-btn"
                  onClick={() => setClassDropdownOpen(!classDropdownOpen)}
                  className={`inline-flex items-center gap-2 rounded border-2 py-1.5 px-3 text-[11px] font-black uppercase tracking-tight focus:outline-none cursor-pointer transition-all duration-300 ${
                    justSwitched
                      ? "border-emerald-600 dark:border-emerald-400 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 ring-4 ring-emerald-500/30 scale-105 shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                      : currentClassroom
                      ? "border-black dark:border-rose-500 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-rose-300 hover:bg-zinc-200 dark:hover:bg-rose-950/40"
                      : "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 animate-bounce"
                  }`}
                >
                  <span className="flex h-2 w-2 relative">
                    {currentClassroom && (
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${justSwitched ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${currentClassroom ? (justSwitched ? 'bg-emerald-500' : 'bg-rose-500') : 'bg-amber-500'}`}></span>
                  </span>
                  <span className="text-zinc-500 dark:text-rose-400/80">{t.group}:</span>
                  <span className="text-black dark:text-rose-200 font-black max-w-[130px] truncate">
                    {currentClassroom ? currentClassroom.name : t.choose_group}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-black dark:text-rose-400" />
                </button>

                {justSwitched && currentClassroom && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-1 border border-emerald-500/50 animate-fade-in shadow-sm">
                    ✓ Активно: {currentClassroom.name}
                  </span>
                )}

                {classDropdownOpen && (
                  <div id="classroom-dropdown-menu" className="absolute left-0 mt-1.5 z-50 w-56 rounded border-2 border-black dark:border-rose-500 bg-white dark:bg-zinc-900 py-1 shadow-lg font-sans">
                    <button
                      onClick={() => handleSelectClassroom(null)}
                      className="block w-full text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-tight text-zinc-900 dark:text-rose-300 hover:bg-zinc-100 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      + {t.overview}
                    </button>
                    <div className="border-t border-zinc-200 dark:border-zinc-800 my-1 font-bold"></div>
                    {classrooms.map((cr) => {
                      const isSelected = currentClassroom?.id === cr.id;
                      return (
                        <button
                          key={cr.id}
                          onClick={() => handleSelectClassroom(cr)}
                          className={`w-full text-left px-4 py-2.5 text-[10px] uppercase tracking-tight flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-zinc-950 text-white dark:bg-rose-900 dark:text-rose-100 font-black hover:bg-zinc-800 dark:hover:bg-rose-800"
                              : "text-zinc-700 dark:text-zinc-300 font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          }`}
                        >
                          <span className="truncate">{cr.name}</span>
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                            isSelected
                              ? "bg-zinc-800 dark:bg-rose-950 text-white dark:text-rose-300"
                              : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                          }`}>
                            {cr.user_role}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Profile actions, logouts, headers display */}
            <div className="flex items-center gap-2 md:gap-4">
              {/* Language Toggle */}
              <button
                id="lang-toggle-btn"
                onClick={() => setLang(lang === "ru" ? "en" : "ru")}
                className="inline-flex h-9 items-center justify-center px-2.5 border-2 border-black dark:border-rose-500 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-rose-300 font-black text-[10px] uppercase tracking-wider hover:bg-zinc-200 dark:hover:bg-rose-950/40 transition-colors cursor-pointer rounded-none"
                title="Switch Language / Сменить язык"
              >
                {lang === "ru" ? "EN" : "RU"}
              </button>



              <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-800 dark:text-rose-300 uppercase tracking-tight bg-zinc-100 dark:bg-zinc-900 rounded px-2 md:px-2.5 py-1.5 border border-zinc-200 dark:border-rose-900/60">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-950 dark:bg-rose-900 text-white dark:text-rose-100">
                  <User className="h-3 w-3" />
                </div>
                <span className="hidden md:inline font-black">{user?.username}</span>
              </div>

              <button
                id="logout-btn"
                onClick={logout}
                className="inline-flex h-9 items-center justify-center gap-1.5 px-3 rounded font-black text-[10px] uppercase tracking-tight bg-zinc-950 dark:bg-rose-900 text-white dark:text-rose-100 hover:bg-rose-700 dark:hover:bg-rose-800 hover:text-white transition-colors duration-150 focus:outline-none cursor-pointer"
                title="Log out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t.logout}</span>
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* Roster & Event Navigation Tabs Panel (Only visible if inside a classroom) */}
      {currentClassroom && (
        <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 duration-150">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-8 -mb-px" aria-label="Tabs" id="classroom-tabs-nav">
              <button
                id="tab-home"
                onClick={() => setActiveTab("home")}
                className={`flex items-center gap-1.5 py-4 px-1 border-b-2 font-black text-xs uppercase tracking-wider transition-colors duration-150 focus:outline-none cursor-pointer ${
                  activeTab === "home"
                    ? "border-black dark:border-rose-500 text-black dark:text-rose-400"
                    : "border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-rose-400"
                }`}
              >
                <Home className="h-4 w-4" />
                <span>{t.overview}</span>
              </button>

              <button
                id="tab-calendar"
                onClick={() => setActiveTab("calendar")}
                className={`flex items-center gap-1.5 py-4 px-1 border-b-2 font-black text-xs uppercase tracking-wider transition-colors duration-150 focus:outline-none cursor-pointer ${
                  activeTab === "calendar"
                    ? "border-black dark:border-rose-500 text-black dark:text-rose-400"
                    : "border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-rose-400"
                }`}
              >
                <Calendar className="h-4 w-4" />
                <span>{t.calendar_app}</span>
              </button>

              <button
                id="tab-members"
                onClick={() => setActiveTab("members")}
                className={`flex items-center gap-1.5 py-4 px-1 border-b-2 font-black text-xs uppercase tracking-wider transition-colors duration-150 focus:outline-none cursor-pointer ${
                  activeTab === "members"
                    ? "border-black dark:border-rose-500 text-black dark:text-rose-400"
                    : "border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-rose-400"
                }`}
              >
                <Users className="h-4 w-4" />
                <span>{t.members_roster}</span>
              </button>

              {isOwner && (
                <button
                  id="tab-settings"
                  onClick={() => setActiveTab("settings")}
                  className={`flex items-center gap-1.5 py-4 px-1 border-b-2 font-black text-xs uppercase tracking-wider transition-colors duration-150 focus:outline-none cursor-pointer ${
                    activeTab === "settings"
                      ? "border-black dark:border-rose-500 text-black dark:text-rose-400"
                      : "border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-rose-400"
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

      {/* Main View Workspace block */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!currentClassroom || activeTab === "home" ? (
          <HomePage />
        ) : activeTab === "calendar" ? (
          <CalendarPage />
        ) : activeTab === "members" ? (
          <MembersPage />
        ) : activeTab === "settings" ? (
          <SettingsPage />
        ) : null}
      </main>

      {/* Minimal Footer */}
      <footer className="bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 py-4 text-center mt-auto font-sans text-xs font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 duration-150">
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
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 border-8 border-zinc-200 dark:border-zinc-800 duration-150">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-black dark:border-white border-t-transparent"></div>
          <p className="text-xs font-black text-zinc-500 font-sans uppercase tracking-widest">{t.syncing_session}</p>
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
