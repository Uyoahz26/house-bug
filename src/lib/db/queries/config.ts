import { D1DatabaseLike } from "@/lib/db/client";
import {
  ConfigCategory,
  PublicSystemConfig,
  SystemConfigRecord,
} from "@/types/config";

export function toPublicConfig(record: SystemConfigRecord): PublicSystemConfig {
  const isSecret = record.is_secret === 1;
  return {
    key: record.key,
    value: isSecret ? "***" : record.value,
    description: record.description,
    category: record.category,
    isSecret,
    hasValue: record.value.trim().length > 0,
    updatedAt: record.updated_at,
    updatedBy: record.updated_by,
  };
}

export async function getSystemConfigs(
  db: D1DatabaseLike,
  category?: ConfigCategory,
): Promise<SystemConfigRecord[]> {
  if (category) {
    const result = await db
      .prepare(
        `SELECT key, value, description, category, is_secret, updated_at, updated_by
         FROM system_config
         WHERE category = ?
         ORDER BY key ASC`,
      )
      .bind(category)
      .all<SystemConfigRecord>();

    return result.results;
  }

  const result = await db
    .prepare(
      `SELECT key, value, description, category, is_secret, updated_at, updated_by
       FROM system_config
       ORDER BY category ASC, key ASC`,
    )
    .bind()
    .all<SystemConfigRecord>();

  return result.results;
}

export async function getSystemConfigByKey(
  db: D1DatabaseLike,
  key: string,
): Promise<SystemConfigRecord | null> {
  return db
    .prepare(
      `SELECT key, value, description, category, is_secret, updated_at, updated_by
       FROM system_config
       WHERE key = ?
       LIMIT 1`,
    )
    .bind(key)
    .first<SystemConfigRecord>();
}

export async function updateSystemConfigValue(
  db: D1DatabaseLike,
  input: {
    key: string;
    value: string;
    updatedBy: string;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE system_config
       SET value = ?, updated_by = ?
       WHERE key = ?`,
    )
    .bind(input.value, input.updatedBy, input.key)
    .run();
}
