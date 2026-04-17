import { NextResponse } from "next/server";
import { withAuth, AuthError } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db/client";
import { getUserById, toPublicUser } from "@/lib/db/queries/users";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const authPayload = await withAuth(request);
    const db = getDb();
    const user = await getUserById(db, authPayload.sub);

    if (!user || user.is_active !== 1) {
      return NextResponse.json(
        { error: "用户不存在或已禁用。" },
        { status: 401 },
      );
    }

    return NextResponse.json({ data: toPublicUser(user) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    console.error("[GET /api/auth/me]", error);
    return NextResponse.json({ error: "获取用户信息失败。" }, { status: 500 });
  }
}
