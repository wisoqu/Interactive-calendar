import type { Request } from "express";

export type MemberRole = "owner" | "admin" | "member";

export interface UserRecord {
  id: string;
  username: string;
  email: string | null;
  password_hash: string;
  created_at: string;
}

export interface ClassroomRecord {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  invite_code: string;
  is_closed: number;
  max_members: number;
  created_at: string;
  updated_at: string;
}

export interface ClassroomWithMeta extends ClassroomRecord {
  owner_username: string | null;
  member_count: number;
}

export interface MemberRecord {
  id: string;
  user_id: string;
  classroom_id: string;
  role: MemberRole;
  created_at: string;
}

export interface EventRecord {
  id: string;
  classroom_id: string;
  creator_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  created_at: string;
  updated_at: string;
}

export interface SessionRecord {
  id: string;
  session_id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface ResetCodeRecord {
  id: string;
  user_id: string;
  code_hash: string;
  expires_at: string;
  used_at: string | null;
  attempts: number;
  created_at: string;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  email?: string;
}

export interface AppRequest extends Request {
  cookies: Record<string, string>;
  sessionId?: string;
  user?: AuthenticatedUser;
  classroom?: ClassroomWithMeta;
  callerMembership?: MemberRecord;
  callerRole?: MemberRole;
}

export interface RateLimitRule {
  windowMs: number;
  max: number;
}

export interface RateLimitConfig {
  login: RateLimitRule;
  register: RateLimitRule;
  resetRequest: RateLimitRule;
  resetConfirm: RateLimitRule;
  joinClassroom: RateLimitRule;
}

export interface ServerOptions {
  dbPath?: string;
  attachFrontend?: boolean;
  enableRateLimit?: boolean;
  rateLimitOverrides?: Partial<RateLimitConfig>;
  onResetCodeGenerated?: (email: string, code: string) => void;
}
