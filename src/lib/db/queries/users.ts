import { D1DatabaseLike } from "@/lib/db/client";
import { PublicUser, UserRecord, UserRole } from "@/types/auth";

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatar_url,
    role: user.role,
    isActive: user.is_active === 1,
    notifyEmail: user.notify_email === 1,
    invitedBy: user.invited_by,
    createdAt: user.created_at,
  };
}

export async function countUsers(db: D1DatabaseLike): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(1) AS total FROM users")
    .bind()
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function getUserByEmail(
  db: D1DatabaseLike,
  email: string,
): Promise<UserRecord | null> {
  const user = await db
    .prepare(
      `SELECT u.id,
              u.email,
              u.username,
              u.avatar_url,
              u.password_hash,
              u.role,
              u.is_active,
              COALESCE(us.notify_email, 0) AS notify_email,
              u.invited_by,
              u.created_at,
              u.updated_at
       FROM users u
       LEFT JOIN user_settings us ON us.user_id = u.id
       WHERE u.email = ?
       LIMIT 1`,
    )
    .bind(email)
    .first<UserRecord>();

  return user;
}

export async function getUserById(
  db: D1DatabaseLike,
  id: string,
): Promise<UserRecord | null> {
  const user = await db
    .prepare(
      `SELECT u.id,
              u.email,
              u.username,
              u.avatar_url,
              u.password_hash,
              u.role,
              u.is_active,
              COALESCE(us.notify_email, 0) AS notify_email,
              u.invited_by,
              u.created_at,
              u.updated_at
       FROM users u
       LEFT JOIN user_settings us ON us.user_id = u.id
       WHERE u.id = ?
       LIMIT 1`,
    )
    .bind(id)
    .first<UserRecord>();

  return user;
}

export async function createFirstAdminIfEmpty(
  db: D1DatabaseLike,
  input: {
    id: string;
    email: string;
    username: string;
    passwordHash: string;
  },
): Promise<UserRecord | null> {
  await db
    .prepare(
      `INSERT INTO users (id, email, username, password_hash, role, is_active)
       SELECT ?, ?, ?, ?, 'admin', 1
       WHERE NOT EXISTS (SELECT 1 FROM users LIMIT 1)`,
    )
    .bind(input.id, input.email, input.username, input.passwordHash)
    .run();

  return getUserByEmail(db, input.email);
}

export async function createUserByAdmin(
  db: D1DatabaseLike,
  input: {
    id: string;
    email: string;
    username: string;
    passwordHash: string;
    role: UserRole;
    invitedBy: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, email, username, password_hash, role, is_active, invited_by)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    )
    .bind(
      input.id,
      input.email,
      input.username,
      input.passwordHash,
      input.role,
      input.invitedBy,
    )
    .run();
}

export async function ensureUserSettings(
  db: D1DatabaseLike,
  userId: string,
): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)")
    .bind(userId)
    .run();
}

export async function listUsers(db: D1DatabaseLike): Promise<UserRecord[]> {
  const result = await db
    .prepare(
      `SELECT u.id,
              u.email,
              u.username,
              u.avatar_url,
              u.password_hash,
              u.role,
              u.is_active,
              COALESCE(us.notify_email, 0) AS notify_email,
              u.invited_by,
              u.created_at,
              u.updated_at
       FROM users u
       LEFT JOIN user_settings us ON us.user_id = u.id
       ORDER BY u.created_at ASC`,
    )
    .bind()
    .all<UserRecord>();

  return result.results;
}

export async function setUserActive(
  db: D1DatabaseLike,
  userId: string,
  isActive: boolean,
): Promise<void> {
  await db
    .prepare("UPDATE users SET is_active = ? WHERE id = ?")
    .bind(isActive ? 1 : 0, userId)
    .run();
}

export async function setUserNotifyEmail(
  db: D1DatabaseLike,
  userId: string,
  notifyEmail: boolean,
): Promise<void> {
  await db
    .prepare(
      `UPDATE user_settings
       SET notify_email = ?
       WHERE user_id = ?`,
    )
    .bind(notifyEmail ? 1 : 0, userId)
    .run();
}

export async function resetUserPassword(
  db: D1DatabaseLike,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await db
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(passwordHash, userId)
    .run();
}

export async function updateUserProfile(
  db: D1DatabaseLike,
  input: {
    userId: string;
    email: string;
    username: string;
    role: UserRole;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE users
       SET email = ?, username = ?, role = ?
       WHERE id = ?`,
    )
    .bind(input.email, input.username, input.role, input.userId)
    .run();
}
