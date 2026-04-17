import { D1DatabaseLike } from "@/lib/db/client";
import { getSystemConfigByKey } from "@/lib/db/queries/config";

export async function getConfigValue(
  db: D1DatabaseLike,
  key: string,
): Promise<string> {
  const config = await getSystemConfigByKey(db, key);
  return (config?.value ?? "").trim();
}

export async function getConfigValues(
  db: D1DatabaseLike,
  keys: string[],
): Promise<Record<string, string>> {
  const rows = await Promise.all(
    keys.map(async (key) => {
      const value = await getConfigValue(db, key);
      return [key, value] as const;
    }),
  );

  const values: Record<string, string> = {};
  for (const [key, value] of rows) {
    values[key] = value;
  }

  return values;
}
