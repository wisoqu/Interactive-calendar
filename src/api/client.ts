import type { CalendarEvent, ClassMember, ClassMemberRole, Classroom, User } from "../types.ts";

const BASE_URL = "/api";

const unauthorizedListeners = new Set<() => void>();

export interface ApiMessageResponse {
  success: boolean;
  message: string;
}

export interface AuthConfigResponse {
  smtp_configured: boolean;
}

export interface ClassroomPatchPayload {
  name?: string;
  description?: string;
  is_closed?: boolean;
  max_members?: number;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  meta?: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, meta?: Record<string, unknown>) {
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

function sanitizeErrorMessage(rawMessage: unknown, status: number): string {
  if (typeof rawMessage === "string") {
    const trimmed = rawMessage.trim();
    if (trimmed && !/<\/?[a-z][\s\S]*>/i.test(trimmed)) {
      return trimmed;
    }
  }
  return `HTTP ${status}`;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  suppressUnauthorizedBroadcast = false
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  const text = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { detail: text };
  }

  if (!response.ok) {
    const cleanDetail = sanitizeErrorMessage(data?.detail, response.status);
    const code = typeof data?.code === "string" ? data.code : undefined;
    if (response.status === 401 && !suppressUnauthorizedBroadcast) {
      notifyUnauthorized();
    }
    throw new ApiError(cleanDetail, response.status, code, data);
  }

  return data as T;
}

export const apiClient = {
  // Auth endpoints
  async getAuthConfig(): Promise<AuthConfigResponse> {
    return request<AuthConfigResponse>("/auth/config", { method: "GET" }, true);
  },

  async register(username: string, password: string, email?: string): Promise<User> {
    return request<User>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ username, password, email: email || undefined }),
      },
      true
    );
  },

  async login(username: string, password: string): Promise<User> {
    return request<User>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ username, password }),
      },
      true
    );
  },

  async me(): Promise<User> {
    return request<User>("/auth/me", { method: "GET" }, true);
  },

  async logout(): Promise<ApiMessageResponse> {
    return request<ApiMessageResponse>("/auth/logout", { method: "POST" }, true);
  },

  async requestPasswordReset(email: string, lang: "ru" | "en" = "ru"): Promise<ApiMessageResponse> {
    return request<ApiMessageResponse>(
      "/auth/password-reset/request",
      {
        method: "POST",
        body: JSON.stringify({ email, lang }),
      },
      true
    );
  },

  async confirmPasswordReset(
    email: string,
    code: string,
    newPassword: string
  ): Promise<ApiMessageResponse> {
    return request<ApiMessageResponse>(
      "/auth/password-reset/confirm",
      {
        method: "POST",
        body: JSON.stringify({ email, code, new_password: newPassword }),
      },
      true
    );
  },

  // Classroom endpoints
  async listClassrooms(signal?: AbortSignal): Promise<Classroom[]> {
    return request<Classroom[]>("/classrooms", { method: "GET", signal });
  },

  async createClassroom(name: string, description?: string): Promise<Classroom> {
    return request<Classroom>("/classrooms", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });
  },

  async joinClassroom(inviteCode: string): Promise<Classroom> {
    return request<Classroom>("/classrooms/join", {
      method: "POST",
      body: JSON.stringify({ invite_code: inviteCode }),
    });
  },

  async getClassroom(id: string, signal?: AbortSignal): Promise<Classroom> {
    return request<Classroom>(`/classrooms/${id}`, { method: "GET", signal });
  },

  async updateClassroom(id: string, payload: ClassroomPatchPayload): Promise<Classroom> {
    return request<Classroom>(`/classrooms/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async deleteClassroom(id: string): Promise<ApiMessageResponse> {
    return request<ApiMessageResponse>(`/classrooms/${id}`, {
      method: "DELETE",
    });
  },

  // Roster / Member endpoints
  async listMembers(classroomId: string, signal?: AbortSignal): Promise<ClassMember[]> {
    return request<ClassMember[]>(`/classrooms/${classroomId}/members`, {
      method: "GET",
      signal,
    });
  },

  async addMember(
    classroomId: string,
    username: string,
    role: Exclude<ClassMemberRole, "owner">
  ): Promise<ClassMember> {
    return request<ClassMember>(`/classrooms/${classroomId}/members`, {
      method: "POST",
      body: JSON.stringify({ username, role }),
    });
  },

  async updateMemberRole(
    classroomId: string,
    memberId: string,
    role: Exclude<ClassMemberRole, "owner">
  ): Promise<ClassMember> {
    return request<ClassMember>(`/classrooms/${classroomId}/members/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },

  async removeMember(classroomId: string, memberId: string): Promise<ApiMessageResponse> {
    return request<ApiMessageResponse>(`/classrooms/${classroomId}/members/${memberId}`, {
      method: "DELETE",
    });
  },

  // Event endpoints
  async listEvents(
    classroomId: string,
    options?: { from?: string; to?: string; signal?: AbortSignal }
  ): Promise<CalendarEvent[]> {
    const params = new URLSearchParams();
    if (options?.from) params.set("from", options.from);
    if (options?.to) params.set("to", options.to);
    const qs = params.toString();
    return request<CalendarEvent[]>(`/classrooms/${classroomId}/events${qs ? `?${qs}` : ""}`, {
      method: "GET",
      signal: options?.signal,
    });
  },

  async createEvent(
    classroomId: string,
    title: string,
    description: string,
    startsAt: string,
    endsAt: string
  ): Promise<CalendarEvent> {
    return request<CalendarEvent>(`/classrooms/${classroomId}/events`, {
      method: "POST",
      body: JSON.stringify({ title, description, starts_at: startsAt, ends_at: endsAt }),
    });
  },

  async updateEvent(
    classroomId: string,
    eventId: string,
    payload: {
      title?: string;
      description?: string;
      starts_at?: string;
      ends_at?: string;
    }
  ): Promise<CalendarEvent> {
    return request<CalendarEvent>(`/classrooms/${classroomId}/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async deleteEvent(classroomId: string, eventId: string): Promise<ApiMessageResponse> {
    return request<ApiMessageResponse>(`/classrooms/${classroomId}/events/${eventId}`, {
      method: "DELETE",
    });
  },
};
