import { NextResponse } from "next/server";
import { requireAdmin, ForbiddenError } from "@/lib/auth/authorization";
import { AuthError } from "@/lib/auth/middleware";
import { hashPassword } from "@/lib/auth/password";
import { getDb } from "@/lib/db/client";
import {
  createUserByAdmin,
  ensureUserSettings,
  getUserByEmail,
  listUsers,
  setUserNotifyEmail,
  toPublicUser,
} from "@/lib/db/queries/users";
import { UserRole } from "@/types/auth";

export const runtime = "edge";

interface CreateUserInput {
  email?: string;
  username?: string;
  password?: string;
  role?: UserRole;
  notifyEmail?: boolean;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidRole(role: string): role is UserRole {
  return role === "admin" || role === "user";
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const db = getDb();
    const users = await listUsers(db);

    return NextResponse.json({
      data: users.map((user) => toPublicUser(user)),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "无管理员权限。" }, { status: 403 });
    }

    console.error("[GET /api/admin/users]", error);
    return NextResponse.json({ error: "获取用户列表失败。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = (await request.json()) as CreateUserInput;

    const email = normalizeEmail(body.email ?? "");
    const username = (body.username ?? "").trim();
    const password = (body.password ?? "").trim();
    const role = body.role ?? "user";

    if (!email || !username || !password) {
      return NextResponse.json(
        { error: "email、username、password 均不能为空。" },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "密码至少 6 位。" }, { status: 400 });
    }

    if (!isValidRole(role)) {
      return NextResponse.json({ error: "无效角色。" }, { status: 400 });
    }

    const db = getDb();
    const existed = await getUserByEmail(db, email);
    if (existed) {
      return NextResponse.json({ error: "邮箱已存在。" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const id = crypto.randomUUID();

    await createUserByAdmin(db, {
      id,
      email,
      username,
      passwordHash,
      role,
      invitedBy: admin.id,
    });
    await ensureUserSettings(db, id);
    if (typeof body.notifyEmail === "boolean") {
      await setUserNotifyEmail(db, id, body.notifyEmail);
    }

    const created = await getUserByEmail(db, email);
    if (!created) {
      return NextResponse.json({ error: "创建用户失败。" }, { status: 500 });
    }

    return NextResponse.json({ data: toPublicUser(created) }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "无管理员权限。" }, { status: 403 });
    }

    console.error("[POST /api/admin/users]", error);
    return NextResponse.json({ error: "创建用户失败。" }, { status: 500 });
  }
}
