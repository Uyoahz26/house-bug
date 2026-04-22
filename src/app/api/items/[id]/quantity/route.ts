import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/middleware";
import { requireActiveUser } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db/client";
import {
  getItemById,
  toPublicItem,
  updateItemQuantity,
  updateItemStatus,
} from "@/lib/db/queries/items";

export const runtime = "edge";

interface UpdateQuantityRequest {
  quantity?: number;
  delta?: number;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireActiveUser(request);
    const { id } = await context.params;

    const body = (await request.json()) as UpdateQuantityRequest;

    const db = getDb();
    const current = await getItemById(db, id);
    if (!current) {
      return NextResponse.json({ error: "物资不存在。" }, { status: 404 });
    }

    const currentQuantity = Number(current.quantity);
    const hasAbsoluteQuantity = typeof body.quantity === "number";
    const hasDelta = typeof body.delta === "number";

    if (!hasAbsoluteQuantity && !hasDelta) {
      return NextResponse.json(
        { error: "至少提供 quantity 或 delta 之一。" },
        { status: 400 },
      );
    }

    const nextQuantity = hasAbsoluteQuantity
      ? Number(body.quantity)
      : currentQuantity + Number(body.delta);

    if (!Number.isFinite(nextQuantity) || nextQuantity < 0) {
      return NextResponse.json(
        { error: "数量必须大于等于 0。" },
        { status: 400 },
      );
    }

    await updateItemQuantity(db, {
      id,
      quantity: nextQuantity,
    });

    if (nextQuantity === 0 && current.status !== "discarded") {
      await updateItemStatus(db, {
        id,
        status: "consumed",
      });
    }

    const updated = await getItemById(db, id);
    if (!updated) {
      return NextResponse.json({ error: "物资不存在。" }, { status: 404 });
    }

    return NextResponse.json({ data: toPublicItem(updated) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    console.error("[PATCH /api/items/:id/quantity]", error);
    return NextResponse.json({ error: "更新数量失败。" }, { status: 500 });
  }
}
