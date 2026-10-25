import React, { useState } from "react";
import { apiClient } from "../api/client";
import { useAuth } from "../store/AuthContext";
import { useThemeLanguage } from "../store/ThemeLanguageContext";
import { KeyRound, Mail, UserPlus, LogIn, RefreshCcw, Eye, EyeOff, Calendar, Sun, Moon } from "lucide-react";

type AuthTab = "login" | "register" | "forgot" | "confirm_reset";

export const AuthPage: React.FC = () => {
  const { applyUser, refreshUser } = useAuth();
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
      const loginData = await apiClient.login(username, password);
      await refreshUser(true);
      if (loginData?.id && loginData?.username) {
        applyUser({
          id: loginData.id,
          username: loginData.username,
          email: loginData.email,
        });
      }
    } catch (err: any) {
      setError(err.message || (lang === "ru" ? "Неверное имя пользователя или пароль." : "Invalid username or password."));
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
      setMessage(
        lang === "ru"
          ? "Аккаунт создан. Теперь вы можете войти."
          : "Account created successfully. You can now sign in."
      );
      setTab("login");
      setPassword("");
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
          ? "Если указанный адрес зарегистрирован, мы отправили на него 6-значный код подтверждения. Проверьте входящие и папку «Спам»."
          : "If this address is registered, a 6-digit verification code has been sent to your email. Please check your inbox and spam folder."
      );
      setTab("confirm_reset");
    } catch (err: any) {
      setError(err.message || (lang === "ru" ? "Не удалось отправить запрос на сброс пароля." : "Failed to request password reset."));
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
          ? "Пароль успешно изменен. Войдите с новым паролем."
          : "Password updated successfully. Please sign in with your new password."
      );
      setTab("login");
      setUsername("");
      setPassword("");
      setEmail("");
      setCode("");
      setNewPassword("");
    } catch (err: any) {
      setError(err.message || (lang === "ru" ? "Не удалось подтвердить код восстановления." : "Failed to confirm verification code."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="auth-page-container"
      className="flex min-h-screen items-center justify-center bg-zinc-100 dark:bg-zinc-950 px-4 py-12 sm:px-6 lg:px-8 relative transition-colors duration-150"
    >
      {/* Theme & Language Toggles */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          id="auth-theme-toggle-btn"
          type="button"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          className="inline-flex h-9 w-9 items-center justify-center bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border-2 border-zinc-900 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
          title={t.toggle_theme}
          aria-label={t.toggle_theme}
        >
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>

        <button
          id="auth-lang-toggle-btn"
          type="button"
          onClick={() => setLang(lang === "ru" ? "en" : "ru")}
          className="inline-flex h-9 items-center justify-center bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border-2 border-zinc-900 dark:border-zinc-700 px-3 text-xs font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
        >
          {lang === "ru" ? "EN" : "RU"}
        </button>
      </div>

      <div
        id="auth-form-card"
        className="w-full max-w-md space-y-6 border-2 border-zinc-900 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-8 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-none transition-colors duration-150"
      >
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center border-2 border-zinc-900 dark:border-zinc-200 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900">
            <Calendar className="h-6 w-6" id="brand-logo" />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t.app_title}
          </h1>
          <p className="mt-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {tab === "login" && t.login_title}
            {tab === "register" && t.register_title}
            {tab === "forgot" && t.forgot_title}
            {tab === "confirm_reset" && t.confirm_title}
          </p>
        </div>

        {error && (
          <div
            id="auth-error-panel"
            className="border-2 border-red-600 bg-red-50 dark:bg-red-950/50 p-3.5 text-xs font-semibold text-red-700 dark:text-red-300"
          >
            {error}
          </div>
        )}
        {message && (
          <div
            id="auth-success-panel"
            className="border-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 p-3.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300"
          >
            {message}
          </div>
        )}

        {/* Login Form */}
        {tab === "login" && (
          <form id="login-form" className="space-y-5" onSubmit={handleLogin}>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5"
                >
                  {t.username}
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
                    <LogIn className="h-4 w-4" />
                  </div>
                  <input
                    id="login-username"
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 pl-10 pr-3 text-sm focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                    placeholder={t.username_placeholder}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-bold text-zinc-700 dark:text-zinc-300"
                  >
                    {t.password}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      resetFormState();
                      setTab("forgot");
                    }}
                    className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline cursor-pointer bg-transparent border-0"
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
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 pl-10 pr-10 text-sm focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                    placeholder={t.password_placeholder}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 cursor-pointer bg-transparent border-0"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={loading}
              className="flex w-full justify-center bg-zinc-900 dark:bg-zinc-100 py-3 px-4 text-xs font-bold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 focus:outline-none disabled:opacity-50 cursor-pointer transition-colors"
            >
              {loading ? t.logging_in : t.log_in}
            </button>

            <div className="text-center text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">{t.dont_have_account} </span>
              <button
                type="button"
                onClick={() => {
                  resetFormState();
                  setTab("register");
                }}
                className="font-bold text-zinc-900 dark:text-zinc-100 hover:underline cursor-pointer bg-transparent"
                id="go-register"
              >
                {t.sign_up}
              </button>
            </div>
          </form>
        )}

        {/* Register Form */}
        {tab === "register" && (
          <form id="register-form" className="space-y-5" onSubmit={handleRegister}>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="register-username"
                  className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5"
                >
                  {t.username} *
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
                    <UserPlus className="h-4 w-4" />
                  </div>
                  <input
                    id="register-username"
                    type="text"
                    required
                    minLength={3}
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 pl-10 pr-3 text-sm focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                    placeholder={lang === "ru" ? "Минимум 3 символа" : "At least 3 characters"}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="register-email"
                  className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5"
                >
                  {t.email}
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="register-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 pl-10 pr-3 text-sm focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                    placeholder={t.email_recovery_help}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="register-password"
                  className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5"
                >
                  {t.password} *
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <input
                    id="register-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 pl-10 pr-3 text-sm focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                    placeholder={lang === "ru" ? "Не менее 6 символов" : "At least 6 characters"}
                  />
                </div>
              </div>
            </div>

            <button
              id="register-submit-btn"
              type="submit"
              disabled={loading}
              className="flex w-full justify-center bg-zinc-900 dark:bg-zinc-100 py-3 px-4 text-xs font-bold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 focus:outline-none disabled:opacity-50 cursor-pointer transition-colors"
            >
              {loading ? t.creating_account : t.sign_up}
            </button>

            <div className="text-center text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">{t.already_registered} </span>
              <button
                type="button"
                onClick={() => {
                  resetFormState();
                  setTab("login");
                }}
                className="font-bold text-zinc-900 dark:text-zinc-100 hover:underline cursor-pointer bg-transparent"
                id="go-login"
              >
                {t.log_in}
              </button>
            </div>
          </form>
        )}

        {/* Password Reset Request Form */}
        {tab === "forgot" && (
          <form id="forgot-form" className="space-y-5" onSubmit={handleRequestReset}>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {t.note_recovery}
            </p>

            <div>
              <label
                htmlFor="forgot-email"
                className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5"
              >
                {t.registered_email}
              </label>
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
                  className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 pl-10 pr-3 text-sm focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                  placeholder={t.enter_recovery_email}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  resetFormState();
                  setTab("login");
                }}
                className="w-1/2 border-2 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-2.5 px-4 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                {t.back}
              </button>
              <button
                id="forgot-submit-btn"
                type="submit"
                disabled={loading}
                className="w-1/2 bg-zinc-900 dark:bg-zinc-100 py-2.5 px-4 text-xs font-bold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 focus:outline-none disabled:opacity-50 transition-colors cursor-pointer"
              >
                {loading ? t.sending_code : t.send_code}
              </button>
            </div>
          </form>
        )}

        {/* Password Reset Confirmation Form */}
        {tab === "confirm_reset" && (
          <form id="confirm-reset-form" className="space-y-5" onSubmit={handleConfirmReset}>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="reset-code"
                  className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5"
                >
                  {t.verification_code_label}
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
                    <RefreshCcw className="h-4 w-4" />
                  </div>
                  <input
                    id="reset-code"
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 pl-10 pr-3 text-sm font-mono tabular-nums tracking-widest focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
                    placeholder={t.verification_placeholder}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="reset-new-password"
                  className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5"
                >
                  {t.new_password}
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <input
                    id="reset-new-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full border-2 border-zinc-200 dark:border-zinc-700 py-2.5 pl-10 pr-3 text-sm focus:border-zinc-900 dark:focus:border-zinc-300 focus:outline-none transition-colors placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                    placeholder={t.new_password_placeholder}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  resetFormState();
                  setTab("forgot");
                }}
                className="w-1/2 border-2 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-2.5 px-4 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                {t.back}
              </button>
              <button
                id="confirm-reset-submit-btn"
                type="submit"
                disabled={loading}
                className="w-1/2 bg-zinc-900 dark:bg-zinc-100 py-2.5 px-4 text-xs font-bold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 focus:outline-none disabled:opacity-50 transition-colors cursor-pointer"
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
