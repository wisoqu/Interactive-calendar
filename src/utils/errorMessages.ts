import { ApiError } from "../api/client.ts";
import type { Language } from "../store/ThemeLanguageContext.tsx";

const CODE_MESSAGES: Record<string, { ru: string; en: string }> = {
  UNAUTHORIZED: {
    ru: "Требуется авторизация. Пожалуйста, войдите в аккаунт.",
    en: "Authentication required. Please sign in.",
  },
  SESSION_EXPIRED: {
    ru: "Срок действия сессии истек. Войдите снова.",
    en: "Your session has expired. Please sign in again.",
  },
  INVALID_CREDENTIALS: {
    ru: "Неверное имя пользователя или пароль.",
    en: "Invalid username or password.",
  },
  INVALID_USERNAME: {
    ru: "Имя пользователя должно содержать от 3 до 50 допустимых символов.",
    en: "Username must be between 3 and 50 valid characters.",
  },
  INVALID_PASSWORD: {
    ru: "Пароль должен содержать от 6 до 128 символов.",
    en: "Password must be between 6 and 128 characters.",
  },
  INVALID_EMAIL: {
    ru: "Указан некорректный адрес электронной почты.",
    en: "Please enter a valid email address.",
  },
  USERNAME_TAKEN: {
    ru: "Это имя пользователя уже занято.",
    en: "This username is already taken.",
  },
  EMAIL_TAKEN: {
    ru: "Этот адрес электронной почты уже зарегистрирован.",
    en: "This email address is already registered.",
  },
  SMTP_NOT_CONFIGURED: {
    ru: "Отправка писем (SMTP) не настроена на этом сервере. Обратитесь к администратору.",
    en: "Email delivery (SMTP) is not configured on this server. Please contact the administrator.",
  },
  INVALID_RESET_INPUT: {
    ru: "Укажите почту, 6-значный код и новый пароль (от 6 до 128 символов).",
    en: "Enter your email, 6-digit code, and new password (6–128 characters).",
  },
  INVALID_RESET_CODE: {
    ru: "Неверный или недействительный код подтверждения.",
    en: "Invalid or expired verification code.",
  },
  RESET_CODE_EXPIRED: {
    ru: "Срок действия кода истек. Запросите новый код.",
    en: "The verification code has expired. Please request a new one.",
  },
  RESET_CODE_LOCKED: {
    ru: "Превышено число попыток ввода кода. Запросите новый код.",
    en: "Too many incorrect attempts. Please request a new verification code.",
  },
  RATE_LIMITED: {
    ru: "Слишком много попыток. Подождите немного и повторите запрос.",
    en: "Too many attempts. Please wait a moment and try again.",
  },
  CSRF_REJECTED: {
    ru: "Запрос отклонен политикой безопасности. Обновите страницу и попробуйте снова.",
    en: "Request rejected by security policy. Please reload the page and try again.",
  },
  INVALID_NAME: {
    ru: "Название класса должно содержать от 2 до 100 символов.",
    en: "Classroom name must be between 2 and 100 characters.",
  },
  DESCRIPTION_TOO_LONG: {
    ru: "Описание превышает допустимую длину.",
    en: "Description exceeds the maximum allowed length.",
  },
  INVITE_CODE_REQUIRED: {
    ru: "Введите код приглашения.",
    en: "Please enter an invite code.",
  },
  CLASSROOM_NOT_FOUND: {
    ru: "Класс не найден.",
    en: "Classroom not found.",
  },
  CLASSROOM_CLOSED: {
    ru: "Вступление в этот класс по коду приглашения закрыто владельцем.",
    en: "Joining this classroom via invite code is currently closed by the owner.",
  },
  CLASSROOM_FULL: {
    ru: "Достигнут максимальный лимит участников класса.",
    en: "This classroom has reached its maximum member capacity.",
  },
  NOT_A_MEMBER: {
    ru: "Вы не состоите в этом классе.",
    en: "You are not a member of this classroom.",
  },
  FORBIDDEN: {
    ru: "Недостаточно прав для выполнения этого действия.",
    en: "You do not have permission to perform this action.",
  },
  FORBIDDEN_OWNER_ONLY: {
    ru: "Это действие доступно только владельцу класса.",
    en: "Only the classroom owner can perform this action.",
  },
  USER_NOT_FOUND: {
    ru: "Пользователь с таким логином не найден.",
    en: "User with this username was not found.",
  },
  ALREADY_MEMBER: {
    ru: "Этот пользователь уже состоит в классе.",
    en: "This user is already a member of the classroom.",
  },
  MEMBER_NOT_FOUND: {
    ru: "Участник не найден в этом классе.",
    en: "Member was not found in this classroom.",
  },
  OWNER_IMMUTABLE: {
    ru: "Владельца класса нельзя исключить или изменить его роль.",
    en: "The classroom owner cannot be removed or demoted.",
  },
  INVALID_ROLE: {
    ru: "Некорректная роль участника.",
    en: "Invalid member role.",
  },
  EVENT_NOT_FOUND: {
    ru: "Событие не найдено.",
    en: "Event not found.",
  },
  INVALID_EVENT_INPUT: {
    ru: "Укажите название события (от 2 до 150 символов), время начала и окончания.",
    en: "Enter an event title (2–150 characters), start time, and end time.",
  },
  INVALID_EVENT_TIME: {
    ru: "Некорректный формат даты или времени события.",
    en: "Invalid event date or time format.",
  },
  INVALID_EVENT_RANGE: {
    ru: "Время окончания события должно быть позже времени начала.",
    en: "Event end time must be after start time.",
  },
  INVALID_DATE_RANGE: {
    ru: "Некорректный формат фильтра дат.",
    en: "Invalid date range filter format.",
  },
  INVALID_INPUT: {
    ru: "Проверьте корректность введенных данных.",
    en: "Please check your input and try again.",
  },
  INVALID_JSON: {
    ru: "Некорректный формат данных запроса.",
    en: "Invalid request payload format.",
  },
  NOT_FOUND: {
    ru: "Запрашиваемый ресурс не найден.",
    en: "The requested resource was not found.",
  },
  SERVER_ERROR: {
    ru: "Внутренняя ошибка сервера. Повторите попытку позже.",
    en: "Internal server error. Please try again later.",
  },
};

export function getLocalizedApiError(err: unknown, lang: Language, fallback?: string): string {
  if (err instanceof ApiError) {
    if (err.code === "CLASSROOM_FULL" && typeof err.meta?.max_members === "number") {
      return lang === "ru"
        ? `Достигнут максимальный лимит участников класса (${err.meta.max_members}).`
        : `This classroom has reached its maximum member capacity (${err.meta.max_members}).`;
    }
    if (err.code && CODE_MESSAGES[err.code]) {
      return CODE_MESSAGES[err.code][lang];
    }
    if (err.status === 401) {
      return CODE_MESSAGES.UNAUTHORIZED[lang];
    }
    if (err.status === 403) {
      return CODE_MESSAGES.FORBIDDEN[lang];
    }
    if (err.status === 404) {
      return lang === "ru"
        ? "Запрашиваемый ресурс не найден."
        : "The requested resource was not found.";
    }
    if (err.status === 429) {
      return CODE_MESSAGES.RATE_LIMITED[lang];
    }
    if (err.status >= 500) {
      return CODE_MESSAGES.SERVER_ERROR[lang];
    }
    if (lang === "ru" && err.message && !err.message.startsWith("HTTP ")) {
      return err.message;
    }
  }

  if (err instanceof TypeError) {
    return lang === "ru"
      ? "Нет соединения с сервером. Проверьте интернет и повторите попытку."
      : "Cannot reach the server. Check your connection and try again.";
  }

  return (
    fallback ||
    (lang === "ru"
      ? "Произошла ошибка при выполнении запроса."
      : "An error occurred while processing the request.")
  );
}
