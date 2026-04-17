import { AuthError, withAuth } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db/client";
import { getUserById } from "@/lib/db/queries/users";
import { PublicUser, UserRecord } from "@/types/auth";

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

function toPublicUser(user: UserRecord): PublicUser {
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

async function requireActiveUserRecord(request: Request): Promise<UserRecord> {
  const payload = await withAuth(request);
  const db = getDb();
  const user = await getUserById(db, payload.sub);

  if (!user || user.is_active !== 1) {
    throw new AuthError("User inactive");
  }

  return user;
}

export async function requireActiveUser(request: Request): Promise<PublicUser> {
  const user = await requireActiveUserRecord(request);
  return toPublicUser(user);
}

export async function requireAdmin(request: Request): Promise<PublicUser> {
  const user = await requireActiveUserRecord(request);

  if (user.role !== "admin") {
    throw new ForbiddenError("Admin required");
  }

  return toPublicUser(user);
}
