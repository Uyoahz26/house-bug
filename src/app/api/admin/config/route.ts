import { NextResponse } from "next/server";
import { requireAdmin, ForbiddenError } from "@/lib/auth/authorization";
import { AuthError } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db/client";
import {
  getSystemConfigByKey,
  getSystemConfigs,
  toPublicConfig,
  updateSystemConfigValue,
} from "@/lib/db/queries/config";
import { ConfigCategory } from "@/types/config";

export const runtime = "edge";

interface ConfigUpdateItem {
  key: string;
  value: string;
}

interface UpdateConfigInput {
  updates?: ConfigUpdateItem[];
}

const DICTIONARY_DEFAULT_CONFIGS = [
  {
    key: "inventory.category.options",
    value: "食品,饮料,日用品,洗护用品,药品,调料,零食,清洁用品,其他",
    description: "物资分类选项，支持逗号分隔或 JSON 数组",
    category: "general" as const,
    isSecret: 0,
  },
  {
    key: "inventory.location.options",
    value: "厨房,冰箱,卫生间,客厅,卧室,阳台,储物间,其他",
    description: "存放位置选项，支持逗号分隔或 JSON 数组",
    category: "general" as const,
    isSecret: 0,
  },
  {
    key: "inventory.unit.options",
    value: "个,瓶,袋,盒,包,罐,支,片,kg,g,L,mL",
    description: "数量单位选项，支持逗号分隔或 JSON 数组",
    category: "general" as const,
    isSecret: 0,
  },
];

const CRON_DEFAULT_CONFIGS = [
  {
    key: "cron.days_before",
    value: "7",
    description: "统一提醒范围（天）：会提醒 N 天内到期与已过期物资",
    category: "cron" as const,
    isSecret: 0,
  },
];

async function ensureConfigDefaults(db: ReturnType<typeof getDb>) {
  const defaults = [...DICTIONARY_DEFAULT_CONFIGS, ...CRON_DEFAULT_CONFIGS];

  for (const item of defaults) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO system_config (key, value, description, category, is_secret)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        item.key,
        item.value,
        item.description,
        item.category,
        item.isSecret,
      )
      .run();
  }
}

function isValidCategory(value: string): value is ConfigCategory {
  return (
    value === "general" ||
    value === "storage" ||
    value === "ocr" ||
    value === "email" ||
    value === "cron" ||
    value === "ai" ||
    value === "openclaw"
  );
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);

    const url = new URL(request.url);
    const rawCategory = url.searchParams.get("category");
    const category =
      rawCategory && isValidCategory(rawCategory) ? rawCategory : undefined;

    if (rawCategory && !category) {
      return NextResponse.json({ error: "无效的 category。" }, { status: 400 });
    }

    const db = getDb();
    await ensureConfigDefaults(db);
    const configs = await getSystemConfigs(db, category);

    return NextResponse.json({
      data: configs.map((item) => toPublicConfig(item)),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "无管理员权限。" }, { status: 403 });
    }

    console.error("[GET /api/admin/config]", error);
    return NextResponse.json({ error: "读取系统配置失败。" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = (await request.json()) as UpdateConfigInput;
    const updates = body.updates ?? [];

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "updates 不能为空。" },
        { status: 400 },
      );
    }

    const db = getDb();
    await ensureConfigDefaults(db);
    const statements = [];

    for (const item of updates) {
      const key = (item.key ?? "").trim();
      const value = typeof item.value === "string" ? item.value : "";

      if (!key) {
        return NextResponse.json({ error: "存在空 key。" }, { status: 400 });
      }

      const current = await getSystemConfigByKey(db, key);
      if (!current) {
        return NextResponse.json(
          { error: `配置项不存在: ${key}` },
          { status: 404 },
        );
      }

      const isSecret = current.is_secret === 1;
      if (isSecret && value === "***") {
        continue;
      }

      statements.push(
        db
          .prepare(
            `UPDATE system_config
             SET value = ?, updated_by = ?
             WHERE key = ?`,
          )
          .bind(value, admin.id, key),
      );
    }

    if (statements.length === 0) {
      const refreshed = await getSystemConfigs(db);
      return NextResponse.json({
        data: refreshed.map((item) => toPublicConfig(item)),
      });
    }

    if (typeof db.batch === "function") {
      await db.batch(statements);
    } else {
      // Fallback for environments that do not expose batch.
      for (const item of updates) {
        const key = (item.key ?? "").trim();
        const value = typeof item.value === "string" ? item.value : "";

        if (!key) {
          continue;
        }

        const current = await getSystemConfigByKey(db, key);
        if (!current) {
          continue;
        }

        const isSecret = current.is_secret === 1;
        if (isSecret && value === "***") {
          continue;
        }

        await updateSystemConfigValue(db, {
          key,
          value,
          updatedBy: admin.id,
        });
      }
    }

    const refreshed = await getSystemConfigs(db);
    return NextResponse.json({
      data: refreshed.map((item) => toPublicConfig(item)),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "无管理员权限。" }, { status: 403 });
    }

    console.error("[PUT /api/admin/config]", error);
    return NextResponse.json({ error: "更新系统配置失败。" }, { status: 500 });
  }
}
