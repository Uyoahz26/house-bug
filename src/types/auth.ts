export type UserRole = "admin" | "user";

export interface UserRecord {
  id: string;
  email: string;
  username: string;
  avatar_url: string | null;
  password_hash: string;
  role: UserRole;
  is_active: number;
  notify_email?: number;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  role: UserRole;
  isActive: boolean;
  notifyEmail: boolean;
  invitedBy: string | null;
  createdAt: string;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}
