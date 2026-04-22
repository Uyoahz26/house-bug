import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/middleware";
import { requireActiveUser } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db/client";
import { ensureItemDictionaryColumns } from "@/lib/db/ensure-item-dictionary-columns";
import {
  countItems,
  createItem,
  getItemById,
  listItems,
  toPublicItem,
} from "@/lib/db/queries/items";
import { ItemStatus, ItemStatusFilter } from "@/types/item";

export const runtime = "edge";

interface CreateItemRequest {
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

function isItemStatusFilter(value: string): value is ItemStatusFilter {
  return value === "all" || isItemStatus(value);
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

export async function GET(request: Request) {
  try {
    await requireActiveUser(request);
    const db = getDb();
    await ensureItemDictionaryColumns(db);

    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? undefined;
    const statusParam = url.searchParams.get("status") ?? "all";

    if (!isItemStatusFilter(statusParam)) {
      return NextResponse.json(
        { error: "无效的 status 参数。" },
        { status: 400 },
      );
    }

    const limitParam = Number(url.searchParams.get("limit") ?? 20);
    const offsetParam = Number(url.searchParams.get("offset") ?? 0);

    const limit = Number.isFinite(limitParam)
      ? Math.max(1, Math.min(100, Math.floor(limitParam)))
      : 20;
    const offset = Number.isFinite(offsetParam)
      ? Math.max(0, Math.floor(offsetParam))
      : 0;

    const [rows, total] = await Promise.all([
      listItems(db, {
        search,
        status: statusParam,
        limit,
        offset,
      }),
      countItems(db, {
        search,
        status: statusParam,
      }),
    ]);

    return NextResponse.json({
      data: rows.map((item) => toPublicItem(item)),
      meta: {
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    console.error("[GET /api/items]", error);
    return NextResponse.json({ error: "获取物资列表失败。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireActiveUser(request);
    const body = (await request.json()) as CreateItemRequest;

    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "物资名称不能为空。" },
        { status: 400 },
      );
    }

    const quantity = Number(body.quantity ?? 1);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return NextResponse.json(
        { error: "数量必须大于等于 0。" },
        { status: 400 },
      );
    }

    const unit = (body.unit ?? "个").trim() || "个";
    const status = body.status ?? "active";
    if (!isItemStatus(status)) {
      return NextResponse.json({ error: "无效的状态值。" }, { status: 400 });
    }

    const normalizedStatus =
      quantity === 0 && status !== "discarded" ? "consumed" : status;

    let category: string | null;
    let location: string | null;
    let purchasePrice: number | null;
    let productionDate: string | null;
    let shelfLifeDays: number | null;
    let expiryDate: string | null;
    let purchaseDate: string | null;

    try {
      category = normalizeOptionalString(body.category);
      location = normalizeOptionalString(body.location);
      purchasePrice = normalizeOptionalNumber(body.purchasePrice);
      productionDate = normalizeOptionalDate(body.productionDate);
      shelfLifeDays = normalizeOptionalDays(body.shelfLifeDays);
      expiryDate = normalizeOptionalDate(body.expiryDate);
      purchaseDate = normalizeOptionalDate(body.purchaseDate);
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

    const db = getDb();
    await ensureItemDictionaryColumns(db);
    const id = crypto.randomUUID();

    await createItem(db, {
      id,
      userId: user.id,
      category,
      location,
      name,
      brand: normalizeOptionalString(body.brand),
      specification: normalizeOptionalString(body.specification),
      barcode: normalizeOptionalString(body.barcode),
      quantity,
      unit,
      productionDate,
      shelfLifeDays,
      expiryDate,
      purchaseDate,
      purchasePrice,
      purchaseChannel: normalizeOptionalString(body.purchaseChannel),
      imageUrl: normalizeOptionalString(body.imageUrl),
      status: normalizedStatus,
      notes: normalizeOptionalString(body.notes),
      ocrRawText: normalizeOptionalString(body.ocrRawText),
    });

    const created = await getItemById(db, id);
    if (!created) {
      return NextResponse.json({ error: "创建物资失败。" }, { status: 500 });
    }

    return NextResponse.json({ data: toPublicItem(created) }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    console.error("[POST /api/items]", error);
    return NextResponse.json({ error: "创建物资失败。" }, { status: 500 });
  }
}
