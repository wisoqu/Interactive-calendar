const BASE_URL = "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // Essential for cookie-based session-cookie transport
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = { detail: text };
  }

  if (!response.ok) {
    throw new Error(data.detail || `HTTP Error ${response.status}: ${response.statusText}`);
  }

  return data as T;
}

export const apiClient = {
  // Auth endpoints
  async register(username: string, password: string, email?: string) {
    return request<any>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, email: email || undefined }),
    });
  },

  async login(username: string, password: string) {
    return request<any>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  async me() {
    return request<any>("/auth/me", { method: "GET" });
  },

  async logout() {
    return request<any>("/auth/logout", { method: "POST" });
  },

  async requestPasswordReset(email: string) {
    return request<any>("/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async confirmPasswordReset(email: string, code: string, newPassword: string) {
    return request<any>("/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ email, code, new_password: newPassword }),
    });
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

  async updateClassroom(id: string, name: string, description?: string, is_closed?: boolean, max_members?: number) {
    return request<any>(`/classrooms/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, description, is_closed, max_members }),
    });
  },

  async deleteClassroom(id: string) {
    return request<any>(`/classrooms/${id}`, { method: "DELETE" });
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
    return request<any>(`/classrooms/${classroomId}/members/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },

  async removeMember(classroomId: string, memberId: string) {
    return request<any>(`/classrooms/${classroomId}/members/${memberId}`, {
      method: "DELETE",
    });
  },

  // Event endpoints
  async listEvents(classroomId: string) {
    return request<any[]>(`/classrooms/${classroomId}/events`, { method: "GET" });
  },

  async createEvent(classroomId: string, title: string, description: string, startsAt: string, endsAt: string) {
    return request<any>(`/classrooms/${classroomId}/events`, {
      method: "POST",
      body: JSON.stringify({ title, description, starts_at: startsAt, ends_at: endsAt }),
    });
  },

  async updateEvent(classroomId: string, eventId: string, title?: string, description?: string, startsAt?: string, endsAt?: string) {
    return request<any>(`/classrooms/${classroomId}/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify({ title, description, starts_at: startsAt, ends_at: endsAt }),
    });
  },

  async deleteEvent(classroomId: string, eventId: string) {
    return request<any>(`/classrooms/${classroomId}/events/${eventId}`, {
      method: "DELETE",
    });
  }
};
