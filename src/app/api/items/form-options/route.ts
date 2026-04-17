import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/middleware";
import { requireActiveUser } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db/client";
import { getSystemConfigByKey } from "@/lib/db/queries/config";

export const runtime = "edge";

const DEFAULT_CATEGORY_NAMES = [
  "食品",
  "饮料",
  "日用品",
  "洗护用品",
  "药品",
  "调料",
  "零食",
  "清洁用品",
  "其他",
];

const DEFAULT_LOCATION_NAMES = [
  "厨房",
  "冰箱",
  "卫生间",
  "客厅",
  "卧室",
  "阳台",
  "储物间",
  "其他",
];

const DEFAULT_UNITS = [
  "个",
  "瓶",
  "袋",
  "盒",
  "包",
  "罐",
  "支",
  "片",
  "kg",
  "g",
  "L",
  "mL",
];

function normalizeOptionString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function parseOptionList(
  rawValue: string | null | undefined,
  fallback: string[],
): string[] {
  const raw = (rawValue ?? "").trim();
  const deduped = new Set<string>();

  const pushValue = (value: unknown) => {
    const normalized = normalizeOptionString(value);
    if (normalized) {
      deduped.add(normalized);
    }
  };

  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (typeof entry === "string") {
            pushValue(entry);
            continue;
          }

          if (entry && typeof entry === "object") {
            const objectEntry = entry as Record<string, unknown>;
            pushValue(
              objectEntry.label ?? objectEntry.name ?? objectEntry.value,
            );
          }
        }
      }
    } catch {
      // Fall through to delimiter parsing.
    }
  }

  if (deduped.size === 0 && raw) {
    for (const segment of raw.split(/[\n,，|]/)) {
      pushValue(segment);
    }
  }

  if (deduped.size === 0) {
    for (const item of fallback) {
      pushValue(item);
    }
  }

  return Array.from(deduped);
}

export async function GET(request: Request) {
  try {
    const user = await requireActiveUser(request);
    const db = getDb();

    const [categoryConfig, locationConfig, unitConfig] = await Promise.all([
      getSystemConfigByKey(db, "inventory.category.options"),
      getSystemConfigByKey(db, "inventory.location.options"),
      getSystemConfigByKey(db, "inventory.unit.options"),
    ]);

    const categoryNames = parseOptionList(
      categoryConfig?.value,
      DEFAULT_CATEGORY_NAMES,
    );
    const locationNames = parseOptionList(
      locationConfig?.value,
      DEFAULT_LOCATION_NAMES,
    );
    const units = parseOptionList(unitConfig?.value, DEFAULT_UNITS);

    return NextResponse.json({
      data: {
        categories: categoryNames,
        locations: locationNames,
        units,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    console.error("[GET /api/items/form-options]", error);
    return NextResponse.json(
      { error: "读取物资表单配置失败。" },
      { status: 500 },
    );
  }
}
