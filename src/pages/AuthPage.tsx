import React, { useState } from "react";
import { apiClient } from "../api/client";
import { useAuth } from "../store/AuthContext";
import { useThemeLanguage } from "../store/ThemeLanguageContext";
import { KeyRound, Mail, UserPlus, LogIn, RefreshCcw, Command, Eye, EyeOff, Calendar } from "lucide-react";

type AuthTab = "login" | "register" | "forgot" | "confirm_reset";

export const AuthPage: React.FC = () => {
  const { refreshUser } = useAuth();
  const { lang, setLang, theme, setTheme, t } = useThemeLanguage();
  const [tab, setTab] = useState<AuthTab>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setError(null);
        setMessage(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const resetFormState = () => {
    setError(null);
    setMessage(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFormState();
    setLoading(true);

    try {
      await apiClient.login(username, password);
      await refreshUser();
    } catch (err: any) {
      setError(err.message || (lang === "ru" ? "Неверные учетные данные." : "Invalid credentials."));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFormState();
    setLoading(true);

    try {
      await apiClient.register(username, password, email || undefined);
      setMessage(lang === "ru" ? "Аккаунт успешно создан. Теперь вы можете войти." : "Account created. Please log in.");
      setTab("login");
      setPassword(""); // Keep username to help quick logins
    } catch (err: any) {
      setError(err.message || (lang === "ru" ? "Не удалось создать аккаунт." : "Failed to create account."));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFormState();
    setLoading(true);

    try {
      await apiClient.requestPasswordReset(email);
      setMessage(
        lang === "ru" 
          ? "6-значный код сброса отправлен в логи сервера. Введите его ниже для сброса." 
          : "A 6-digit reset code has been printed to the server logs. Enter it below to reset."
      );
      setTab("confirm_reset");
    } catch (err: any) {
      setError(err.message || (lang === "ru" ? "Не удалось запросить код доступа." : "Failed to request code."));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFormState();
    setLoading(true);

    try {
      await apiClient.confirmPasswordReset(email, code, newPassword);
      setMessage(
        lang === "ru" 
          ? "Пароль успешно обновлен. Войдите с новыми учетными данными." 
          : "Password updated successfully. Please log in with your new credentials."
      );
      setTab("login");
      setUsername("");
      setPassword("");
      setEmail("");
      setCode("");
      setNewPassword("");
    } catch (err: any) {
      setError(err.message || (lang === "ru" ? "Не удалось подтвердить код сброса." : "Failed to confirm code reset."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-page-container" className="flex min-h-screen items-center justify-center bg-zinc-100 dark:bg-zinc-950 px-4 py-12 sm:px-6 lg:px-8 relative duration-150">
      {/* Floating Toggles */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          onClick={() => setLang(lang === "ru" ? "en" : "ru")}
          className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-rose-350 border-2 border-black dark:border-rose-500 py-1 px-3 text-[10px] font-black uppercase tracking-widest cursor-pointer duration-150 rounded-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(244,63,94,0.3)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          {lang === "ru" ? "EN" : "RU"}
        </button>
      </div>

      <div id="auth-form-card" className="w-full max-w-md space-y-8 border-4 border-black dark:border-rose-900 bg-white dark:bg-zinc-900 p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(244,63,94,0.3)] rounded-none duration-150">
        <div className="flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center border-2 border-black dark:border-rose-500 bg-black dark:bg-rose-900 text-white dark:text-rose-100 rounded-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <Calendar className="h-6 w-6" id="brand-logo" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-black uppercase tracking-tighter text-zinc-900 dark:text-zinc-50 font-sans">
            {t.app_title}
          </h2>
          <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            {tab === "login" && t.login_title}
            {tab === "register" && t.register_title}
            {tab === "forgot" && t.forgot_title}
            {tab === "confirm_reset" && t.confirm_title}
          </p>
        </div>

        {/* Error and Message Panels */}
        {error && (
          <div id="auth-error-panel" className="border-2 border-zinc-950 dark:border-red-600 bg-red-50 dark:bg-red-950 p-4 text-xs font-black uppercase tracking-wider text-red-600 dark:text-red-300 font-sans">
            {error}
          </div>
        )}
        {message && (
          <div id="auth-success-panel" className="border-2 border-zinc-950 dark:border-green-600 bg-green-50 dark:bg-green-950 p-4 text-xs font-black uppercase tracking-wider text-green-700 dark:text-green-300 font-sans">
            {message}
          </div>
        )}

        {/* Auth Forms */}
        {tab === "login" && (
          <form id="login-form" className="mt-8 space-y-6" onSubmit={handleLogin}>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5">{t.username}</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
                    <LogIn className="h-4 w-4" />
                  </div>
                  <input
                    id="login-username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-3 pl-10 pr-3 text-xs uppercase font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
                    placeholder={t.username_placeholder}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{t.password}</label>
                  <button
                    type="button"
                    onClick={() => { resetFormState(); setTab("forgot"); }}
                    className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-455 hover:text-black dark:hover:text-rose-400 hover:underline cursor-pointer bg-transparent border-0"
                    id="go-forgot-pass"
                  >
                    {t.forgot_password}
                  </button>
                </div>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-3 pl-10 pr-10 text-xs font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
                    placeholder={t.password_placeholder}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 dark:text-zinc-500 hover:text-black dark:hover:text-rose-400 cursor-pointer bg-transparent border-0"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <button
                id="login-submit-btn"
                type="submit"
                disabled={loading}
                className="flex w-full justify-center bg-black dark:bg-rose-900 py-3 px-4 text-xs font-black uppercase tracking-widest text-white dark:text-rose-100 hover:bg-zinc-800 dark:hover:bg-rose-800 focus:outline-none disabled:opacity-45 rounded-none cursor-pointer duration-150 border-2 border-black dark:border-rose-500 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,63,94,0.3)] active:translate-x-1 active:translate-y-1 active:shadow-none"
              >
                {loading ? t.logging_in : t.log_in}
              </button>
            </div>

            <div className="text-center font-sans">
              <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">{t.dont_have_account} </span>
              <button
                type="button"
                onClick={() => { resetFormState(); setTab("register"); }}
                className="text-[11px] font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100 border-b-2 border-transparent hover:border-black dark:hover:border-rose-400 duration-150 cursor-pointer bg-transparent"
                id="go-register"
              >
                {t.sign_up}
              </button>
            </div>
          </form>
        )}

        {tab === "register" && (
          <form id="register-form" className="mt-8 space-y-6" onSubmit={handleRegister}>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5">{t.username} *</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
                    <UserPlus className="h-4 w-4" />
                  </div>
                  <input
                    id="register-username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-3 pl-10 pr-3 text-xs uppercase font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
                    placeholder="Enter username (min 3 chars)"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5">{t.email}</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="register-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-3 pl-10 pr-3 text-xs uppercase font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                    placeholder={t.email_recovery_help}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5">{t.password} *</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <input
                    id="register-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-3 pl-10 pr-3 text-xs font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
                    placeholder="Set secure password (min 6 chars)"
                  />
                </div>
              </div>
            </div>

            <div>
              <button
                id="register-submit-btn"
                type="submit"
                disabled={loading}
                className="flex w-full justify-center bg-black dark:bg-rose-900 py-3 px-4 text-xs font-black uppercase tracking-widest text-white dark:text-rose-100 hover:bg-zinc-800 dark:hover:bg-rose-800 focus:outline-none disabled:opacity-45 rounded-none cursor-pointer duration-150 border-2 border-black dark:border-rose-500 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,63,94,0.3)] active:translate-x-1 active:translate-y-1 active:shadow-none"
              >
                {loading ? t.creating_account : t.sign_up}
              </button>
            </div>

            <div className="text-center font-sans">
              <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">{t.already_registered} </span>
              <button
                type="button"
                onClick={() => { resetFormState(); setTab("login"); }}
                className="text-[11px] font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100 border-b-2 border-transparent hover:border-black dark:hover:border-rose-400 duration-150 cursor-pointer bg-transparent"
                id="go-login"
              >
                {t.log_in}
              </button>
            </div>
          </form>
        )}

        {tab === "forgot" && (
          <form id="forgot-form" className="mt-8 space-y-6" onSubmit={handleRequestReset}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 leading-relaxed font-sans select-none">
              {t.note_recovery}
            </p>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5">{t.registered_email}</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="forgot-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-3 pl-10 pr-3 text-xs uppercase font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
                  placeholder={t.enter_recovery_email}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { resetFormState(); setTab("login"); }}
                className="w-1/2 border-2 border-zinc-300 dark:border-zinc-650 bg-white dark:bg-zinc-800 py-2 px-4 text-xs font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-none duration-150 cursor-pointer"
              >
                {t.back}
              </button>
              <button
                id="forgot-submit-btn"
                type="submit"
                disabled={loading}
                className="w-1/2 justify-center bg-black dark:bg-rose-900 py-2.5 px-4 text-xs font-black uppercase tracking-widest text-white dark:text-rose-100 hover:bg-zinc-800 dark:hover:bg-rose-800 focus:outline-none disabled:opacity-45 rounded-none duration-150 cursor-pointer border-2 border-black dark:border-rose-500 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,63,94,0.3)] active:translate-x-1 active:translate-y-1 active:shadow-none"
              >
                {loading ? t.sending_code : t.send_code}
              </button>
            </div>
          </form>
        )}

        {tab === "confirm_reset" && (
          <form id="confirm-reset-form" className="mt-8 space-y-6" onSubmit={handleConfirmReset}>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5">{t.verification_code_label}</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
                    <RefreshCcw className="h-4 w-4" />
                  </div>
                  <input
                    id="reset-code"
                    type="text"
                    required
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-3 pl-10 pr-3 text-xs uppercase font-sans tracking-tight font-mono focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-black tracking-widest"
                    placeholder={t.verification_placeholder}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5">{t.new_password}</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <input
                    id="reset-new-password"
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-3 pl-10 pr-3 text-xs font-sans tracking-tight focus:border-black dark:focus:border-rose-500 focus:outline-none transition-colors rounded-none placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
                    placeholder={t.new_password_placeholder}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { resetFormState(); setTab("forgot"); }}
                className="w-1/2 border-2 border-zinc-300 dark:border-zinc-650 bg-white dark:bg-zinc-800 py-2 px-4 text-xs font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-none duration-150 cursor-pointer"
              >
                {t.back}
              </button>
              <button
                id="confirm-reset-submit-btn"
                type="submit"
                disabled={loading}
                className="w-1/2 justify-center bg-black dark:bg-rose-900 py-2.5 px-4 text-xs font-black uppercase tracking-widest text-white dark:text-rose-100 hover:bg-zinc-800 dark:hover:bg-rose-800 focus:outline-none disabled:opacity-45 rounded-none duration-150 cursor-pointer border-2 border-black dark:border-rose-500 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,63,94,0.3)] active:translate-x-1 active:translate-y-1 active:shadow-none"
              >
                {loading ? t.resetting : t.confirm_reset}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

