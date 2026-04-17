import { D1DatabaseLike } from "@/lib/db/client";

interface TableInfoRow {
  name: string;
}

export async function ensureItemDictionaryColumns(db: D1DatabaseLike) {
  const columnsResult = await db
    .prepare("PRAGMA table_info(items)")
    .bind()
    .all<TableInfoRow>();

  const columnNames = new Set(columnsResult.results.map((item) => item.name));

  if (!columnNames.has("category")) {
    await db.prepare("ALTER TABLE items ADD COLUMN category TEXT").bind().run();
  }

  if (!columnNames.has("location")) {
    await db.prepare("ALTER TABLE items ADD COLUMN location TEXT").bind().run();
  }

  if (columnNames.has("category_id")) {
    await db
      .prepare(
        `UPDATE items
         SET category = (
           SELECT c.name
           FROM categories c
           WHERE c.id = items.category_id
         )
         WHERE category IS NULL OR TRIM(category) = ''`,
      )
      .bind()
      .run();
  }

  if (columnNames.has("location_id")) {
    await db
      .prepare(
        `UPDATE items
         SET location = (
           SELECT l.name
           FROM locations l
           WHERE l.id = items.location_id
         )
         WHERE location IS NULL OR TRIM(location) = ''`,
      )
      .bind()
      .run();
  }

  await db
    .prepare("CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)")
    .bind()
    .run();
  await db
    .prepare("CREATE INDEX IF NOT EXISTS idx_items_location ON items(location)")
    .bind()
    .run();
}
