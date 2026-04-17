import { NextResponse } from "next/server";
import { requireAdmin, ForbiddenError } from "@/lib/auth/authorization";
import { AuthError } from "@/lib/auth/middleware";
import { hashPassword } from "@/lib/auth/password";
import { getDb } from "@/lib/db/client";
import {
  ensureUserSettings,
  getUserByEmail,
  getUserById,
  resetUserPassword,
  setUserActive,
  setUserNotifyEmail,
  toPublicUser,
  updateUserProfile,
} from "@/lib/db/queries/users";
import { UserRole } from "@/types/auth";

export const runtime = "edge";

interface PatchUserInput {
  email?: string;
  username?: string;
  role?: UserRole;
  isActive?: boolean;
  notifyEmail?: boolean;
  newPassword?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidRole(role: string): role is UserRole {
  return role === "admin" || role === "user";
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    const { id } = await context.params;
    const body = (await request.json()) as PatchUserInput;

    const db = getDb();
    const target = await getUserById(db, id);
    if (!target) {
      return NextResponse.json({ error: "用户不存在。" }, { status: 404 });
    }

    if (
      typeof body.email === "string" ||
      typeof body.username === "string" ||
      typeof body.role === "string"
    ) {
      const email =
        typeof body.email === "string"
          ? normalizeEmail(body.email)
          : target.email;
      const username =
        typeof body.username === "string"
          ? body.username.trim()
          : target.username;
      const role =
        typeof body.role === "string" ? body.role : (target.role as UserRole);

      if (!email || !username) {
        return NextResponse.json(
          { error: "邮箱和用户名不能为空。" },
          { status: 400 },
        );
      }

      if (!isValidRole(role)) {
        return NextResponse.json({ error: "无效角色。" }, { status: 400 });
      }

      if (admin.id === id && role !== "admin") {
        return NextResponse.json(
          { error: "不能取消当前管理员自己的管理员权限。" },
          { status: 400 },
        );
      }

      if (email !== target.email) {
        const existed = await getUserByEmail(db, email);
        if (existed && existed.id !== id) {
          return NextResponse.json({ error: "邮箱已存在。" }, { status: 409 });
        }
      }

      await updateUserProfile(db, {
        userId: id,
        email,
        username,
        role,
      });
    }

    if (typeof body.isActive === "boolean") {
      if (admin.id === id && body.isActive === false) {
        return NextResponse.json(
          { error: "不能禁用当前管理员账号。" },
          { status: 400 },
        );
      }

      await setUserActive(db, id, body.isActive);
    }

    if (typeof body.notifyEmail === "boolean") {
      await ensureUserSettings(db, id);
      await setUserNotifyEmail(db, id, body.notifyEmail);
    }

    if (typeof body.newPassword === "string") {
      const newPassword = body.newPassword.trim();
      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: "新密码至少 6 位。" },
          { status: 400 },
        );
      }

      const passwordHash = await hashPassword(newPassword);
      await resetUserPassword(db, id, passwordHash);
    }

    if (
      typeof body.email !== "string" &&
      typeof body.username !== "string" &&
      typeof body.role !== "string" &&
      typeof body.isActive !== "boolean" &&
      typeof body.notifyEmail !== "boolean" &&
      typeof body.newPassword !== "string"
    ) {
      return NextResponse.json(
        {
          error:
            "至少提供 email、username、role、isActive、notifyEmail、newPassword 之一。",
        },
        { status: 400 },
      );
    }

    const updated = await getUserById(db, id);
    if (!updated) {
      return NextResponse.json({ error: "用户不存在。" }, { status: 404 });
    }

    return NextResponse.json({ data: toPublicUser(updated) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "无管理员权限。" }, { status: 403 });
    }

    console.error("[PATCH /api/admin/users/:id]", error);
    return NextResponse.json({ error: "更新用户失败。" }, { status: 500 });
  }
}
