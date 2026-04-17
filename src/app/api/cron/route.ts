import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { requireAdmin, ForbiddenError } from "@/lib/auth/authorization";
import { AuthError } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db/client";
import { getSystemConfigByKey } from "@/lib/db/queries/config";
import {
  loadEmailProviderConfig,
  sendEmailWithProvider,
} from "@/lib/email/sender";

export const runtime = "edge";

interface CronLogRecord {
  id: number;
  executed_at: string;
  type: string;
  items_checked: number;
  notifications_sent: number;
  status: string;
  error_message: string | null;
}

interface CronUserRecord {
  id: string;
  email: string;
  username: string;
  notify_days_before: number | null;
}

interface ReminderItemRecord {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  expiry_date: string | null;
}

interface ReminderItemView {
  name: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  daysLeft: number | null;
}

function toBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function isCronSecretAuthorized(request: Request): boolean {
  const requestSecret = request.headers.get("x-cron-secret")?.trim() ?? "";
  if (!requestSecret) return false;

  const { env } = getRequestContext();
  const envSecret = (env as Record<string, unknown>)?.CRON_SECRET;
  const configuredSecret =
    typeof envSecret === "string" ? envSecret.trim() : "";

  return configuredSecret.length > 0 && configuredSecret === requestSecret;
}

async function authorizeCronTrigger(request: Request): Promise<void> {
  if (isCronSecretAuthorized(request)) {
    return;
  }

  await requireAdmin(request);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeDaysBefore(value: number | null): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 7;
  }

  const parsed = Math.floor(value);
  if (parsed < 1) return 1;
  if (parsed > 90) return 90;
  return parsed;
}

function daysUntil(expiryDate: string | null): number | null {
  if (!expiryDate) return null;

  const target = new Date(`${expiryDate}T00:00:00.000Z`);
  if (Number.isNaN(target.getTime())) return null;

  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  const targetUtc = Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate(),
  );

  return Math.floor((targetUtc - todayUtc) / 86400000);
}

function formatExpiryLine(item: ReminderItemView): string {
  const dayText =
    item.daysLeft === null
      ? "未知"
      : item.daysLeft === 0
        ? "今天到期"
        : `剩余 ${item.daysLeft} 天`;

  return `- ${item.name}（${dayText}，库存 ${item.quantity}${item.unit}）`;
}

function formatStockLine(item: ReminderItemView): string {
  return `- ${item.name}（库存 ${item.quantity}${item.unit}）`;
}

function formatExpiryHtml(item: ReminderItemView): string {
  const dayText =
    item.daysLeft === null
      ? "未知"
      : item.daysLeft === 0
        ? "今天到期"
        : `剩余 ${item.daysLeft} 天`;

  return `${escapeHtml(item.name)}（${escapeHtml(dayText)}，库存 ${item.quantity}${escapeHtml(item.unit)}）`;
}

function formatStockHtml(item: ReminderItemView): string {
  return `${escapeHtml(item.name)}（库存 ${item.quantity}${escapeHtml(item.unit)}）`;
}

function toTextSummary(input: {
  appName: string;
  username: string;
  daysBefore: number;
  expiringItems: ReminderItemView[];
  lowStockItems: ReminderItemView[];
}): string {
  const lines: string[] = [
    `${input.appName} 库存提醒`,
    `你好，${input.username}。`,
    "",
  ];

  if (input.expiringItems.length > 0) {
    lines.push(`快过期物资（${input.daysBefore} 天内）：`);
    input.expiringItems.slice(0, 20).forEach((item) => {
      lines.push(formatExpiryLine(item));
    });
    if (input.expiringItems.length > 20) {
      lines.push(`- 其余 ${input.expiringItems.length - 20} 项请登录系统查看`);
    }
    lines.push("");
  }

  if (input.lowStockItems.length > 0) {
    lines.push("低库存物资（<= 1）：");
    input.lowStockItems.slice(0, 20).forEach((item) => {
      lines.push(formatStockLine(item));
    });
    if (input.lowStockItems.length > 20) {
      lines.push(`- 其余 ${input.lowStockItems.length - 20} 项请登录系统查看`);
    }
    lines.push("");
  }

  lines.push("请尽快处理，避免物资过期或断货。", "", "HomeBug 系统自动发送");

  return lines.join("\n");
}

function toHtmlSummary(input: {
  appName: string;
  username: string;
  daysBefore: number;
  expiringItems: ReminderItemView[];
  lowStockItems: ReminderItemView[];
}): string {
  const renderExpiry = input.expiringItems
    .slice(0, 20)
    .map((item) => `<li>${formatExpiryHtml(item)}</li>`)
    .join("");

  const renderLowStock = input.lowStockItems
    .slice(0, 20)
    .map((item) => `<li>${formatStockHtml(item)}</li>`)
    .join("");

  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #18181b; line-height: 1.6;">
  <h2 style="margin: 0 0 12px;">${escapeHtml(input.appName)} 库存提醒</h2>
  <p style="margin: 0 0 12px;">你好，${escapeHtml(input.username)}。</p>
  ${
    input.expiringItems.length > 0
      ? `<div style="margin-bottom: 14px;">
    <p style="margin: 0 0 6px;"><strong>快过期物资（${input.daysBefore} 天内）</strong></p>
    <ul style="margin: 0; padding-left: 18px;">${renderExpiry}</ul>
  </div>`
      : ""
  }
  ${
    input.lowStockItems.length > 0
      ? `<div style="margin-bottom: 14px;">
    <p style="margin: 0 0 6px;"><strong>低库存物资（<= 1）</strong></p>
    <ul style="margin: 0; padding-left: 18px;">${renderLowStock}</ul>
  </div>`
      : ""
  }
  <p style="margin: 12px 0 0;">请尽快处理，避免物资过期或断货。</p>
</div>`.trim();
}

async function listCronUsers(): Promise<CronUserRecord[]> {
  const db = getDb();
  const result = await db
    .prepare(
      `SELECT u.id,
              u.email,
              u.username,
              COALESCE(us.notify_days_before, 7) AS notify_days_before
       FROM users u
       LEFT JOIN user_settings us ON us.user_id = u.id
       WHERE u.is_active = 1
         AND COALESCE(us.notify_email, 0) = 1
       ORDER BY u.created_at ASC`,
    )
    .bind()
    .all<CronUserRecord>();

  return result.results;
}

async function listReminderItemsForUser(
  userId: string,
  daysBefore: number,
): Promise<ReminderItemRecord[]> {
  const db = getDb();
  const result = await db
    .prepare(
      `SELECT id,
              name,
              quantity,
              unit,
              expiry_date
       FROM items
       WHERE user_id = ?
         AND status = 'active'
         AND (
           (
             expiry_date IS NOT NULL
             AND date(expiry_date) >= date('now')
             AND date(expiry_date) <= date('now', '+' || ? || ' day')
           )
           OR quantity <= 1
         )
       ORDER BY
         CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END ASC,
         expiry_date ASC,
         quantity ASC`,
    )
    .bind(userId, daysBefore)
    .all<ReminderItemRecord>();

  return result.results;
}

async function appendSystemNotification(
  userId: string,
  title: string,
  message: string,
): Promise<void> {
  const db = getDb();
  await db
    .prepare(
      `INSERT INTO notifications (id, user_id, type, title, message, is_read)
       VALUES (?, ?, 'system', ?, ?, 0)`,
    )
    .bind(crypto.randomUUID(), userId, title, message)
    .run();
}

async function appendCronLog(input: {
  itemsChecked: number;
  notificationsSent: number;
  status: "success" | "partial" | "failed";
  errorMessage?: string;
}): Promise<void> {
  const db = getDb();
  await db
    .prepare(
      `INSERT INTO cron_logs (type, items_checked, notifications_sent, status, error_message)
       VALUES ('expiry_check', ?, ?, ?, ?)`,
    )
    .bind(
      input.itemsChecked,
      input.notificationsSent,
      input.status,
      input.errorMessage ?? null,
    )
    .run();
}

async function runInventoryReminderJob() {
  const db = getDb();
  const cronEnabledConfig = await getSystemConfigByKey(db, "cron.enabled");
  const cronEnabled = toBoolean(cronEnabledConfig?.value ?? "1");

  if (!cronEnabled) {
    await appendCronLog({
      itemsChecked: 0,
      notificationsSent: 0,
      status: "success",
      errorMessage: "cron.enabled=0，任务已跳过。",
    });

    return {
      skipped: true,
      cronEnabled,
      usersChecked: 0,
      itemsChecked: 0,
      notificationsSent: 0,
      errors: [] as string[],
    };
  }

  const users = await listCronUsers();
  const emailConfig = await loadEmailProviderConfig(db);

  let itemsChecked = 0;
  let notificationsSent = 0;
  const errors: string[] = [];

  for (const user of users) {
    const daysBefore = normalizeDaysBefore(user.notify_days_before);
    const rawItems = await listReminderItemsForUser(user.id, daysBefore);
    itemsChecked += rawItems.length;

    if (rawItems.length === 0) {
      continue;
    }

    const normalizedItems: ReminderItemView[] = rawItems.map((item) => ({
      name: item.name,
      quantity: Number(item.quantity),
      unit: item.unit?.trim() || "件",
      expiryDate: item.expiry_date,
      daysLeft: daysUntil(item.expiry_date),
    }));

    const expiringItems = normalizedItems.filter((item) => {
      if (item.daysLeft === null) return false;
      return item.daysLeft >= 0 && item.daysLeft <= daysBefore;
    });

    const lowStockItems = normalizedItems.filter((item) => item.quantity <= 1);

    if (expiringItems.length === 0 && lowStockItems.length === 0) {
      continue;
    }

    const subject = `[${emailConfig.appName}] 库存提醒：${expiringItems.length} 件快过期，${lowStockItems.length} 件低库存`;
    const text = toTextSummary({
      appName: emailConfig.appName,
      username: user.username,
      daysBefore,
      expiringItems,
      lowStockItems,
    });
    const html = toHtmlSummary({
      appName: emailConfig.appName,
      username: user.username,
      daysBefore,
      expiringItems,
      lowStockItems,
    });

    try {
      await sendEmailWithProvider({
        config: emailConfig,
        to: user.email,
        subject,
        text,
        html,
      });

      notificationsSent += 1;

      const title = `库存提醒：${expiringItems.length} 件快过期，${lowStockItems.length} 件低库存`;
      const message = `系统已向 ${user.email} 发送库存提醒邮件。`;
      await appendSystemNotification(user.id, title, message);
    } catch (error) {
      errors.push(
        `${user.email}: ${
          error instanceof Error ? error.message : "邮件发送失败"
        }`,
      );
    }
  }

  const status: "success" | "partial" | "failed" =
    errors.length === 0
      ? "success"
      : notificationsSent > 0
        ? "partial"
        : "failed";

  await appendCronLog({
    itemsChecked,
    notificationsSent,
    status,
    errorMessage:
      errors.length > 0 ? errors.join("; ").slice(0, 1000) : undefined,
  });

  return {
    skipped: false,
    cronEnabled,
    usersChecked: users.length,
    itemsChecked,
    notificationsSent,
    errors,
  };
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);

    const db = getDb();
    const [cronEnabled, cronExpression, logsResult] = await Promise.all([
      getSystemConfigByKey(db, "cron.enabled"),
      getSystemConfigByKey(db, "cron.expression"),
      db
        .prepare(
          `SELECT id,
                  executed_at,
                  type,
                  items_checked,
                  notifications_sent,
                  status,
                  error_message
           FROM cron_logs
           ORDER BY executed_at DESC
           LIMIT 20`,
        )
        .bind()
        .all<CronLogRecord>(),
    ]);

    return NextResponse.json({
      data: {
        cronEnabled: toBoolean(cronEnabled?.value ?? "1"),
        cronExpression: cronExpression?.value ?? "0 1 * * *",
        logs: logsResult.results,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "无管理员权限。" }, { status: 403 });
    }

    console.error("[GET /api/cron]", error);
    return NextResponse.json(
      { error: "获取 Cron 状态失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await authorizeCronTrigger(request);

    const result = await runInventoryReminderJob();
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "无管理员权限。" }, { status: 403 });
    }

    console.error("[POST /api/cron]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "执行 Cron 任务失败。",
      },
      { status: 500 },
    );
  }
}
