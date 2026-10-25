const BASE_URL = "/api";
const SESSION_TOKEN_STORAGE_KEY = "ic_session_token";
const TAB_INITIALIZED_KEY = "ic_tab_session_initialized";

let memorySessionToken: string | null = null;
const unauthorizedListeners = new Set<() => void>();

export class ApiError extends Error {
  status: number;
  code?: string;
  meta?: Record<string, any>;

  constructor(message: string, status: number, code?: string, meta?: Record<string, any>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.meta = meta;
  }
}

export function onUnauthorizedSession(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function notifyUnauthorized(): void {
  unauthorizedListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Ignore listener errors
    }
  });
}

function getStoredSessionToken(): string | null {
  if (memorySessionToken) return memorySessionToken;

  // Prefer per-tab sessionStorage first so multiple tabs can hold independent user sessions
  try {
    const tabToken = window.sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (tabToken) {
      memorySessionToken = tabToken;
      return tabToken;
    }
    const tabInitialized = window.sessionStorage.getItem(TAB_INITIALIZED_KEY);
    if (tabInitialized === "1") {
      return null;
    }
  } catch {
    // Ignore storage restrictions in sandboxed iframes
  }

  // Initial fallback to localStorage only when opening a brand-new tab
  try {
    const saved = window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (saved) {
      memorySessionToken = saved;
      try {
        window.sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, saved);
        window.sessionStorage.setItem(TAB_INITIALIZED_KEY, "1");
      } catch {
        // Ignore
      }
      return saved;
    }
  } catch {
    // Ignore storage restrictions in sandboxed iframes
  }

  return null;
}

export function setStoredSessionToken(token: string | null): void {
  memorySessionToken = token;
  try {
    window.sessionStorage.setItem(TAB_INITIALIZED_KEY, "1");
    if (token) {
      window.sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restrictions in sandboxed iframes
  }

  try {
    if (token) {
      window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restrictions in sandboxed iframes
  }
}

function sanitizeErrorMessage(rawMessage: unknown, status: number): string {
  if (typeof rawMessage === "string") {
    const trimmed = rawMessage.trim();
    // Never allow raw proxy HTML (e.g. <html><head><title>403 Forbidden...) into the UI
    if (trimmed && !/<\/?[a-z][\s\S]*>/i.test(trimmed)) {
      return trimmed;
    }
  }

  if (status === 401) {
    return "Сессия истекла или завершена. Пожалуйста, войдите снова.";
  }
  if (status === 403) {
    return "Доступ ограничен. У вас недостаточно прав или вступление в этот класс закрыто.";
  }
  if (status === 404) {
    return "Запрашиваемый ресурс или класс не найден.";
  }
  if (status >= 500) {
    return "Сервер временно недоступен. Попробуйте повторить действие через пару секунд.";
  }
  return `Ошибка запроса (${status}).`;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  suppressUnauthorizedBroadcast = false
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const token = getStoredSessionToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Envelope": "1",
    ...(token ? { "X-Session-Token": token } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text };
  }

  if (data && typeof data === "object" && data.__api_error === true) {
    const logicalStatus = typeof data.status === "number" ? data.status : 400;
    const cleanDetail = sanitizeErrorMessage(data.detail, logicalStatus);
    if (logicalStatus === 401 && !suppressUnauthorizedBroadcast) {
      setStoredSessionToken(null);
      notifyUnauthorized();
    }
    throw new ApiError(cleanDetail, logicalStatus, data.code, data);
  }

  if (!response.ok) {
    const cleanDetail = sanitizeErrorMessage(data?.detail, response.status);
    if (response.status === 401 && !suppressUnauthorizedBroadcast) {
      setStoredSessionToken(null);
      notifyUnauthorized();
    }
    throw new ApiError(cleanDetail, response.status, data?.code, data);
  }

  return data as T;
}

export const apiClient = {
  // Auth endpoints
  async register(username: string, password: string, email?: string) {
    return request<any>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ username, password, email: email || undefined }),
      },
      true
    );
  },

  async login(username: string, password: string) {
    const data = await request<any>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ username, password }),
      },
      true
    );
    if (data && typeof data.session_token === "string") {
      setStoredSessionToken(data.session_token);
    }
    return data;
  },

  async me() {
    try {
      const data = await request<any>("/auth/me", { method: "GET" }, true);
      if (data && typeof data.session_token === "string") {
        setStoredSessionToken(data.session_token);
      }
      return data;
    } catch (err) {
      setStoredSessionToken(null);
      throw err;
    }
  },

  async logout() {
    try {
      return await request<any>("/auth/logout", { method: "POST" }, true);
    } finally {
      setStoredSessionToken(null);
    }
  },

  async requestPasswordReset(email: string) {
    return request<any>(
      "/auth/password-reset/request",
      {
        method: "POST",
        body: JSON.stringify({ email }),
      },
      true
    );
  },

  async confirmPasswordReset(email: string, code: string, newPassword: string) {
    return request<any>(
      "/auth/password-reset/confirm",
      {
        method: "POST",
        body: JSON.stringify({ email, code, new_password: newPassword }),
      },
      true
    );
  },

  // Classroom endpoints
  async listClassrooms() {
    return request<any[]>("/classrooms", { method: "GET" });
  },

  async createClassroom(name: string, description?: string) {
    return request<any>("/classrooms", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });
  },

  async joinClassroom(inviteCode: string) {
    return request<any>("/classrooms/join", {
      method: "POST",
      body: JSON.stringify({ invite_code: inviteCode }),
    });
  },

  async getClassroom(id: string) {
    return request<any>(`/classrooms/${id}`, { method: "GET" });
  },

  async updateClassroom(
    id: string,
    name: string,
    description?: string,
    is_closed?: boolean,
    max_members?: number
  ) {
    return request<any>(`/classrooms/${id}/update`, {
      method: "POST",
      body: JSON.stringify({ name, description, is_closed, max_members }),
    });
  },

  async deleteClassroom(id: string) {
    return request<any>(`/classrooms/${id}/delete`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  // Roster/Member endpoints
  async listMembers(classroomId: string) {
    return request<any[]>(`/classrooms/${classroomId}/members`, { method: "GET" });
  },

  async addMember(classroomId: string, username: string, role: string) {
    return request<any>(`/classrooms/${classroomId}/members`, {
      method: "POST",
      body: JSON.stringify({ username, role }),
    });
  },

  async updateMemberRole(classroomId: string, memberId: string, role: string) {
    return request<any>(`/classrooms/${classroomId}/members/${memberId}/role`, {
      method: "POST",
      body: JSON.stringify({ role }),
    });
  },

  async removeMember(classroomId: string, memberId: string) {
    return request<any>(`/classrooms/${classroomId}/members/${memberId}/remove`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  // Event endpoints
  async listEvents(classroomId: string) {
    return request<any[]>(`/classrooms/${classroomId}/events`, { method: "GET" });
  },

  async createEvent(
    classroomId: string,
    title: string,
    description: string,
    startsAt: string,
    endsAt: string
  ) {
    return request<any>(`/classrooms/${classroomId}/events`, {
      method: "POST",
      body: JSON.stringify({ title, description, starts_at: startsAt, ends_at: endsAt }),
    });
  },

  async updateEvent(
    classroomId: string,
    eventId: string,
    title?: string,
    description?: string,
    startsAt?: string,
    endsAt?: string
  ) {
    return request<any>(`/classrooms/${classroomId}/events/${eventId}/update`, {
      method: "POST",
      body: JSON.stringify({ title, description, starts_at: startsAt, ends_at: endsAt }),
    });
  },

  async deleteEvent(classroomId: string, eventId: string) {
    return request<any>(`/classrooms/${classroomId}/events/${eventId}/delete`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
};
