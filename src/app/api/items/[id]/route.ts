import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/middleware";
import { requireActiveUser } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db/client";
import { ensureItemDictionaryColumns } from "@/lib/db/ensure-item-dictionary-columns";
import { ensureItemDeleteAuditTable } from "@/lib/db/ensure-item-delete-audit-table";
import { deleteImageFromCosByUrl } from "@/lib/storage/cos";
import {
  deleteItem,
  getItemById,
  toPublicItem,
  updateItem,
} from "@/lib/db/queries/items";
import { ItemStatus } from "@/types/item";

export const runtime = "edge";

interface UpdateItemRequest {
  category?: string | null;
  location?: string | null;
  name?: string;
  brand?: string | null;
  specification?: string | null;
  barcode?: string | null;
  quantity?: number;
  unit?: string | null;
  productionDate?: string | null;
  shelfLifeDays?: number | null;
  expiryDate?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  purchaseChannel?: string | null;
  imageUrl?: string | null;
  status?: ItemStatus;
  notes?: string | null;
  ocrRawText?: string | null;
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

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalDate(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("日期格式必须为 YYYY-MM-DD。");
  }

  return normalized;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error("金额必须是大于等于 0 的数字。");
  }

  return numeric;
}

function normalizeOptionalDays(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error("保质期天数必须是大于等于 0 的整数。");
  }

  return numeric;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireActiveUser(request);
    const { id } = await context.params;

    const db = getDb();
    await ensureItemDictionaryColumns(db);
    const item = await getItemById(db, id);
    if (!item) {
      return NextResponse.json({ error: "物资不存在。" }, { status: 404 });
    }

    return NextResponse.json({ data: toPublicItem(item) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    console.error("[GET /api/items/:id]", error);
    return NextResponse.json({ error: "获取物资详情失败。" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireActiveUser(request);
    const { id } = await context.params;

    const body = (await request.json()) as UpdateItemRequest;

    const db = getDb();
    await ensureItemDictionaryColumns(db);
    const current = await getItemById(db, id);
    if (!current) {
      return NextResponse.json({ error: "物资不存在。" }, { status: 404 });
    }

    const nextName = body.name !== undefined ? body.name.trim() : current.name;
    if (!nextName) {
      return NextResponse.json(
        { error: "物资名称不能为空。" },
        { status: 400 },
      );
    }

    const nextQuantity =
      body.quantity !== undefined
        ? Number(body.quantity)
        : Number(current.quantity);
    if (!Number.isFinite(nextQuantity) || nextQuantity < 0) {
      return NextResponse.json(
        { error: "数量必须大于等于 0。" },
        { status: 400 },
      );
    }

    const nextUnit =
      body.unit !== undefined
        ? (body.unit ?? "").trim() || "个"
        : (current.unit ?? "个");

    const requestedStatus =
      body.status !== undefined ? body.status : current.status;
    const nextStatus =
      nextQuantity === 0 && requestedStatus !== "discarded"
        ? "consumed"
        : requestedStatus;
    if (!isItemStatus(nextStatus)) {
      return NextResponse.json({ error: "无效的状态值。" }, { status: 400 });
    }

    let nextCategory: string | null;
    let nextLocation: string | null;
    let nextPurchasePrice: number | null;
    let nextProductionDate: string | null;
    let nextShelfLifeDays: number | null;
    let nextExpiryDate: string | null;
    let nextPurchaseDate: string | null;

    try {
      nextCategory =
        body.category !== undefined
          ? normalizeOptionalString(body.category)
          : current.category;
      nextLocation =
        body.location !== undefined
          ? normalizeOptionalString(body.location)
          : current.location;
      nextPurchasePrice =
        body.purchasePrice !== undefined
          ? normalizeOptionalNumber(body.purchasePrice)
          : current.purchase_price;
      nextProductionDate =
        body.productionDate !== undefined
          ? normalizeOptionalDate(body.productionDate)
          : current.production_date;
      nextShelfLifeDays =
        body.shelfLifeDays !== undefined
          ? normalizeOptionalDays(body.shelfLifeDays)
          : current.shelf_life_days;
      nextExpiryDate =
        body.expiryDate !== undefined
          ? normalizeOptionalDate(body.expiryDate)
          : current.expiry_date;
      nextPurchaseDate =
        body.purchaseDate !== undefined
          ? normalizeOptionalDate(body.purchaseDate)
          : current.purchase_date;
    } catch (validationError) {
      return NextResponse.json(
        {
          error:
            validationError instanceof Error
              ? validationError.message
              : "请求参数无效。",
        },
        { status: 400 },
      );
    }

    await updateItem(db, {
      id,
      category: nextCategory,
      location: nextLocation,
      name: nextName,
      brand:
        body.brand !== undefined
          ? normalizeOptionalString(body.brand)
          : current.brand,
      specification:
        body.specification !== undefined
          ? normalizeOptionalString(body.specification)
          : current.specification,
      barcode:
        body.barcode !== undefined
          ? normalizeOptionalString(body.barcode)
          : current.barcode,
      quantity: nextQuantity,
      unit: nextUnit,
      productionDate: nextProductionDate,
      shelfLifeDays: nextShelfLifeDays,
      expiryDate: nextExpiryDate,
      purchaseDate: nextPurchaseDate,
      purchasePrice: nextPurchasePrice,
      purchaseChannel:
        body.purchaseChannel !== undefined
          ? normalizeOptionalString(body.purchaseChannel)
          : current.purchase_channel,
      imageUrl:
        body.imageUrl !== undefined
          ? normalizeOptionalString(body.imageUrl)
          : current.image_url,
      status: nextStatus,
      notes:
        body.notes !== undefined
          ? normalizeOptionalString(body.notes)
          : current.notes,
      ocrRawText:
        body.ocrRawText !== undefined
          ? normalizeOptionalString(body.ocrRawText)
          : current.ocr_raw_text,
    });

    const nextImageUrl =
      body.imageUrl !== undefined
        ? normalizeOptionalString(body.imageUrl)
        : current.image_url;

    if (current.image_url && current.image_url !== nextImageUrl) {
      try {
        await deleteImageFromCosByUrl(db, current.image_url);
      } catch (cleanupError) {
        console.error("[PUT /api/items/:id] 清理旧图片失败", cleanupError);
      }
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

    console.error("[PUT /api/items/:id]", error);
    return NextResponse.json({ error: "更新物资失败。" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireActiveUser(request);
    const { id } = await context.params;

    const db = getDb();
    await ensureItemDictionaryColumns(db);
    await ensureItemDeleteAuditTable(db);
    const current = await getItemById(db, id);
    if (!current) {
      return NextResponse.json({ error: "物资不存在。" }, { status: 404 });
    }

    await db
      .prepare(
        `INSERT INTO item_delete_audits (item_id, item_name, deleted_by)
         VALUES (?, ?, ?)`,
      )
      .bind(current.id, current.name, user.id)
      .run();

    if (current.image_url) {
      await deleteImageFromCosByUrl(db, current.image_url);
    }

    await deleteItem(db, id);

    return NextResponse.json({ data: { id } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    console.error("[DELETE /api/items/:id]", error);
    return NextResponse.json({ error: "删除物资失败。" }, { status: 500 });
  }
}
