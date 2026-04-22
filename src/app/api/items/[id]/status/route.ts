import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/middleware";
import { requireActiveUser } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db/client";
import {
  getItemById,
  toPublicItem,
  updateItemStatus,
} from "@/lib/db/queries/items";
import { ItemStatus } from "@/types/item";

export const runtime = "edge";

interface UpdateStatusRequest {
  status?: ItemStatus;
}

const ITEM_STATUSES: ItemStatus[] = [
  "active",
  "consumed",
  "discarded",
  "expired",
];

function isItemStatus(value: string): value is ItemStatus {
  return ITEM_STATUSES.includes(value as ItemStatus);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireActiveUser(request);
    const { id } = await context.params;

    const body = (await request.json()) as UpdateStatusRequest;
    const status = body.status;

    if (!status || !isItemStatus(status)) {
      return NextResponse.json({ error: "无效的状态值。" }, { status: 400 });
    }

    const db = getDb();
    const current = await getItemById(db, id);
    if (!current) {
      return NextResponse.json({ error: "物资不存在。" }, { status: 404 });
    }

    await updateItemStatus(db, {
      id,
      status,
    });

    const updated = await getItemById(db, id);
    if (!updated) {
      return NextResponse.json({ error: "物资不存在。" }, { status: 404 });
    }

    return NextResponse.json({ data: toPublicItem(updated) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    console.error("[PATCH /api/items/:id/status]", error);
    return NextResponse.json({ error: "更新状态失败。" }, { status: 500 });
  }
}
