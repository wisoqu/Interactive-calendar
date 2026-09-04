export interface User {
  id: string;
  username: string;
  email?: string;
}

export type ClassMemberRole = "owner" | "admin" | "member";

export interface Classroom {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  owner_username: string;
  invite_code: string;
  user_role: ClassMemberRole;
  is_closed?: boolean;
  max_members?: number;
  created_at: string;
}

export interface ClassMember {
  id: string;
  user_id: string;
  username: string;
  role: ClassMemberRole;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  classroom_id: string;
  creator_id: string;
  creator_username: string;
  title: string;
  description?: string;
  starts_at: string; // ISO string
  ends_at: string;   // ISO string
  created_at: string;
  updated_at: string;
}
