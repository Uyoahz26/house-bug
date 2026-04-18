import { NextResponse } from "next/server";
import { generateToken } from "@/lib/auth/jwt";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getDb } from "@/lib/db/client";
import {
  countUsers,
  createFirstAdminIfEmpty,
  ensureUserSettings,
  getUserByEmail,
  toPublicUser,
} from "@/lib/db/queries/users";

export const runtime = "edge";
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

interface LoginInput {
  email?: string;
  password?: string;
  username?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function deriveUsername(email: string): string {
  const localPart = email.split("@")[0]?.trim();
  return localPart && localPart.length > 0 ? localPart : "homebug-user";
}

async function parseLoginInput(request: Request): Promise<LoginInput> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as LoginInput;
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    return {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      username: String(formData.get("username") ?? ""),
    };
  }

  return {};
}

export async function POST(request: Request) {
  try {
    const body = await parseLoginInput(request);
    const email = normalizeEmail(body.email ?? "");
    const password = (body.password ?? "").trim();

    if (!email || !password) {
      return NextResponse.json(
        { error: "邮箱和密码不能为空。" },
        { status: 400 },
      );
    }

    const db = getDb();
    let user = await getUserByEmail(db, email);

    if (!user) {
      const totalUsers = await countUsers(db);

      if (totalUsers > 0) {
        return NextResponse.json(
          { error: "账号不存在，请联系管理员创建账号。" },
          { status: 403 },
        );
      }

      const passwordHash = await hashPassword(password);
      user = await createFirstAdminIfEmpty(db, {
        id: crypto.randomUUID(),
        email,
        username: (body.username ?? "").trim() || deriveUsername(email),
        passwordHash,
      });

      if (!user) {
        return NextResponse.json(
          { error: "首登初始化发生并发冲突，请重试。" },
          { status: 409 },
        );
      }

      await ensureUserSettings(db, user.id);
    }

    if (user.is_active !== 1) {
      return NextResponse.json({ error: "账号已被禁用。" }, { status: 403 });
    }

    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      return NextResponse.json({ error: "邮箱或密码错误。" }, { status: 401 });
    }

    const token = await generateToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const response = NextResponse.json({ data: toPublicUser(user) });
    response.cookies.set({
      name: "token",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE,
    });

    return response;
  } catch (error) {
    console.error("[POST /api/auth/login]", error);
    return NextResponse.json({ error: "登录失败。" }, { status: 500 });
  }
}
