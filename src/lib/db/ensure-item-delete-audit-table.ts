import { D1DatabaseLike } from "@/lib/db/client";

export async function ensureItemDeleteAuditTable(db: D1DatabaseLike) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS item_delete_audits (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         item_id TEXT NOT NULL,
         item_name TEXT NOT NULL,
        deleted_by TEXT NOT NULL REFERENCES users(id),
        deleted_at DATETIME NOT NULL DEFAULT (datetime('now'))
       )`,
    )
    .bind()
    .run();

  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_item_delete_audits_item_id ON item_delete_audits(item_id)",
    )
    .bind()
    .run();

  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_item_delete_audits_deleted_at ON item_delete_audits(deleted_at DESC)",
    )
    .bind()
    .run();
}
