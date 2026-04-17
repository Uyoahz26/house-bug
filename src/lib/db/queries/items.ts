import { D1DatabaseLike } from "@/lib/db/client";
import {
  CreateItemInput,
  ItemRecord,
  ItemStatus,
  ItemStatusFilter,
  ListItemsFilter,
  PublicItem,
  UpdateItemInput,
} from "@/types/item";

interface ListQueryParts {
  whereSql: string;
  params: unknown[];
}

function buildListQueryParts(filter: {
  userId: string;
  search?: string;
  status?: ItemStatusFilter;
}): ListQueryParts {
  const conditions: string[] = ["i.user_id = ?"];
  const params: unknown[] = [filter.userId];

  if (filter.status && filter.status !== "all") {
    conditions.push("i.status = ?");
    params.push(filter.status);
  }

  if (filter.search && filter.search.trim()) {
    const keyword = `%${filter.search.trim()}%`;
    conditions.push(
      "(i.name LIKE ? OR IFNULL(i.brand, '') LIKE ? OR IFNULL(i.specification, '') LIKE ?)",
    );
    params.push(keyword, keyword, keyword);
  }

  return {
    whereSql: `WHERE ${conditions.join(" AND ")}`,
    params,
  };
}

export function toPublicItem(record: ItemRecord): PublicItem {
  return {
    id: record.id,
    categoryId: null,
    locationId: null,
    categoryName: record.category ?? null,
    locationName: record.location ?? null,
    name: record.name,
    brand: record.brand,
    specification: record.specification,
    barcode: record.barcode,
    quantity: Number(record.quantity),
    unit: record.unit ?? "个",
    productionDate: record.production_date,
    shelfLifeDays: record.shelf_life_days,
    expiryDate: record.expiry_date,
    purchaseDate: record.purchase_date,
    purchasePrice: record.purchase_price,
    purchaseChannel: record.purchase_channel,
    imageUrl: record.image_url,
    status: record.status,
    notes: record.notes,
    ocrRawText: record.ocr_raw_text,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export async function listItems(
  db: D1DatabaseLike,
  filter: ListItemsFilter,
): Promise<ItemRecord[]> {
  const { whereSql, params } = buildListQueryParts(filter);

  const result = await db
    .prepare(
      `SELECT
         i.id,
         i.user_id,
         i.category,
         i.location,
         i.name,
         i.brand,
         i.specification,
         i.barcode,
         i.quantity,
         i.unit,
         i.production_date,
         i.shelf_life_days,
         i.expiry_date,
         i.purchase_date,
         i.purchase_price,
         i.purchase_channel,
         i.image_url,
         i.status,
         i.notes,
         i.ocr_raw_text,
         i.created_at,
         i.updated_at
       FROM items i
       ${whereSql}
       ORDER BY i.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...params, filter.limit, filter.offset)
    .all<ItemRecord>();

  return result.results;
}

export async function countItems(
  db: D1DatabaseLike,
  filter: {
    userId: string;
    search?: string;
    status?: ItemStatusFilter;
  },
): Promise<number> {
  const { whereSql, params } = buildListQueryParts(filter);

  const row = await db
    .prepare(
      `SELECT COUNT(1) AS total
       FROM items i
       ${whereSql}`,
    )
    .bind(...params)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function getItemById(
  db: D1DatabaseLike,
  userId: string,
  id: string,
): Promise<ItemRecord | null> {
  return db
    .prepare(
      `SELECT
         i.id,
         i.user_id,
         i.category,
         i.location,
         i.name,
         i.brand,
         i.specification,
         i.barcode,
         i.quantity,
         i.unit,
         i.production_date,
         i.shelf_life_days,
         i.expiry_date,
         i.purchase_date,
         i.purchase_price,
         i.purchase_channel,
         i.image_url,
         i.status,
         i.notes,
         i.ocr_raw_text,
         i.created_at,
         i.updated_at
       FROM items i
       WHERE i.user_id = ? AND i.id = ?
       LIMIT 1`,
    )
    .bind(userId, id)
    .first<ItemRecord>();
}

export async function createItem(
  db: D1DatabaseLike,
  input: CreateItemInput,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO items (
         id,
         user_id,
         category,
         location,
         name,
         brand,
         specification,
         barcode,
         quantity,
         unit,
         production_date,
         shelf_life_days,
         expiry_date,
         purchase_date,
         purchase_price,
         purchase_channel,
         image_url,
         status,
         notes,
         ocr_raw_text
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.userId,
      input.category,
      input.location,
      input.name,
      input.brand,
      input.specification,
      input.barcode,
      input.quantity,
      input.unit,
      input.productionDate,
      input.shelfLifeDays,
      input.expiryDate,
      input.purchaseDate,
      input.purchasePrice,
      input.purchaseChannel,
      input.imageUrl,
      input.status,
      input.notes,
      input.ocrRawText,
    )
    .run();
}

export async function updateItem(
  db: D1DatabaseLike,
  input: UpdateItemInput,
): Promise<void> {
  await db
    .prepare(
      `UPDATE items
         SET category = ?,
           location = ?,
           name = ?,
           brand = ?,
           specification = ?,
           barcode = ?,
           quantity = ?,
           unit = ?,
           production_date = ?,
           shelf_life_days = ?,
           expiry_date = ?,
           purchase_date = ?,
           purchase_price = ?,
           purchase_channel = ?,
           image_url = ?,
           status = ?,
           notes = ?,
           ocr_raw_text = ?
       WHERE user_id = ? AND id = ?`,
    )
    .bind(
      input.category,
      input.location,
      input.name,
      input.brand,
      input.specification,
      input.barcode,
      input.quantity,
      input.unit,
      input.productionDate,
      input.shelfLifeDays,
      input.expiryDate,
      input.purchaseDate,
      input.purchasePrice,
      input.purchaseChannel,
      input.imageUrl,
      input.status,
      input.notes,
      input.ocrRawText,
      input.userId,
      input.id,
    )
    .run();
}

export async function deleteItem(
  db: D1DatabaseLike,
  userId: string,
  id: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM items WHERE user_id = ? AND id = ?")
    .bind(userId, id)
    .run();
}

export async function updateItemStatus(
  db: D1DatabaseLike,
  input: {
    userId: string;
    id: string;
    status: ItemStatus;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE items
       SET status = ?
       WHERE user_id = ? AND id = ?`,
    )
    .bind(input.status, input.userId, input.id)
    .run();
}

export async function updateItemQuantity(
  db: D1DatabaseLike,
  input: {
    userId: string;
    id: string;
    quantity: number;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE items
       SET quantity = ?
       WHERE user_id = ? AND id = ?`,
    )
    .bind(input.quantity, input.userId, input.id)
    .run();
}
