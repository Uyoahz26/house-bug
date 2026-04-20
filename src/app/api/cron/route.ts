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
}

interface ReminderItemRecord {
  id: string;
  name: string;
  brand: string | null;
  quantity: number;
  unit: string | null;
  expiry_date: string | null;
}

interface ReminderItemView {
  name: string;
  brand: string | null;
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

function normalizeCronValue(value: number, isDayOfWeek: boolean): number {
  if (!isDayOfWeek) return value;
  return value === 7 ? 0 : value;
}

function matchCronPart(
  part: string,
  value: number,
  min: number,
  max: number,
  isDayOfWeek: boolean,
): boolean {
  const trimmed = part.trim();
  if (!trimmed) return false;

  const [rawBase, rawStep] = trimmed.split("/");
  const step = rawStep ? Number.parseInt(rawStep, 10) : 1;
  if (!Number.isFinite(step) || step <= 0) return false;

  const base = rawBase ?? "*";

  const isValueMatchBase = (candidate: number): boolean => {
    const normalizedCandidate = normalizeCronValue(candidate, isDayOfWeek);
    const normalizedValue = normalizeCronValue(value, isDayOfWeek);
    return normalizedCandidate === normalizedValue;
  };

  if (base === "*") {
    return (value - min) % step === 0;
  }

  if (base.includes("-")) {
    const [startRaw, endRaw] = base.split("-");
    const start = Number.parseInt(startRaw ?? "", 10);
    const end = Number.parseInt(endRaw ?? "", 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;

    const normalizedStart = normalizeCronValue(start, isDayOfWeek);
    const normalizedEnd = normalizeCronValue(end, isDayOfWeek);
    const normalizedValue = normalizeCronValue(value, isDayOfWeek);

    if (normalizedValue < normalizedStart || normalizedValue > normalizedEnd) {
      return false;
    }

    return (normalizedValue - normalizedStart) % step === 0;
  }

  const exact = Number.parseInt(base, 10);
  if (!Number.isFinite(exact)) return false;
  if (step !== 1) return false;
  return isValueMatchBase(exact);
}

function matchCronField(
  field: string,
  value: number,
  min: number,
  max: number,
  isDayOfWeek = false,
): boolean {
  const tokens = field
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return false;
  }

  const normalizedValue = normalizeCronValue(value, isDayOfWeek);
  if (normalizedValue < min || normalizedValue > max) {
    return false;
  }

  return tokens.some((token) =>
    matchCronPart(token, normalizedValue, min, max, isDayOfWeek),
  );
}

function matchesCronExpressionUtc(expression: string, now: Date): boolean {
  const fields = expression.trim().split(/\s+/).filter(Boolean);

  if (fields.length !== 5) {
    return false;
  }

  const [minuteField, hourField, dayField, monthField, weekField] = fields;

  const minuteMatch = matchCronField(minuteField, now.getUTCMinutes(), 0, 59);
  const hourMatch = matchCronField(hourField, now.getUTCHours(), 0, 23);
  const monthMatch = matchCronField(monthField, now.getUTCMonth() + 1, 1, 12);
  const dayMatch = matchCronField(dayField, now.getUTCDate(), 1, 31);
  const weekMatch = matchCronField(weekField, now.getUTCDay(), 0, 6, true);

  const dayWildcard = dayField.trim() === "*";
  const weekWildcard = weekField.trim() === "*";

  let dayOfMonthOrWeekMatch = false;
  if (dayWildcard && weekWildcard) {
    dayOfMonthOrWeekMatch = true;
  } else if (dayWildcard) {
    dayOfMonthOrWeekMatch = weekMatch;
  } else if (weekWildcard) {
    dayOfMonthOrWeekMatch = dayMatch;
  } else {
    dayOfMonthOrWeekMatch = dayMatch || weekMatch;
  }

  return minuteMatch && hourMatch && monthMatch && dayOfMonthOrWeekMatch;
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

function parseCronDaysBefore(value: string | null | undefined): number {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) {
    return 7;
  }
  return normalizeDaysBefore(parsed);
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
  const displayName = item.brand ? `${item.brand} - ${item.name}` : item.name;
  const dayText =
    item.daysLeft === null
      ? "未知"
      : item.daysLeft < 0
        ? `已过期 ${Math.abs(item.daysLeft)} 天`
        : item.daysLeft === 0
          ? "今天到期"
          : `剩余 ${item.daysLeft} 天`;

  return `- ${displayName}（${dayText}，库存 ${item.quantity}${item.unit}）`;
}

function formatStockLine(item: ReminderItemView): string {
  const displayName = item.brand ? `${item.brand} - ${item.name}` : item.name;
  return `- ${displayName}（库存 ${item.quantity}${item.unit}）`;
}

function formatExpiryHtml(item: ReminderItemView): string {
  const displayName = item.brand ? `${item.brand} - ${item.name}` : item.name;
  const dayText =
    item.daysLeft === null
      ? "未知"
      : item.daysLeft < 0
        ? `已过期 ${Math.abs(item.daysLeft)} 天`
        : item.daysLeft === 0
          ? "今天到期"
          : `剩余 ${item.daysLeft} 天`;

  const isExpired = item.daysLeft !== null && item.daysLeft < 0;
  const tagColor = isExpired ? "#fef2f2" : "#fffbeb";
  const tagBorder = isExpired ? "#fca5a5" : "#fde68a";
  const tagText = isExpired ? "#ef4444" : "#d97706";

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background-color: #ffffff; border: 1px solid #f4f4f5; border-radius: 12px; margin-bottom: 8px;">
      <div>
        <div style="font-size: 15px; font-weight: 500; color: #3f3f46;">${escapeHtml(displayName)}</div>
        <div style="font-size: 13px; color: #a1a1aa; margin-top: 4px;">当前库存：${item.quantity}${escapeHtml(item.unit)}</div>
      </div>
      <div style="background-color: ${tagColor}; border: 1px solid ${tagBorder}; color: ${tagText}; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">
        ${escapeHtml(dayText)}
      </div>
    </div>
  `.trim();
}

function formatStockHtml(item: ReminderItemView): string {
  const displayName = item.brand ? `${item.brand} - ${item.name}` : item.name;
  return `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background-color: #ffffff; border: 1px solid #f4f4f5; border-radius: 12px; margin-bottom: 8px;">
      <div>
        <div style="font-size: 15px; font-weight: 500; color: #3f3f46;">${escapeHtml(displayName)}</div>
      </div>
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">
        库存告急：${item.quantity}${escapeHtml(item.unit)}
      </div>
    </div>
  `.trim();
}

function toTextSummary(input: {
  appName: string;
  daysBefore: number;
  expiringItems: ReminderItemView[];
  expiredItems: ReminderItemView[];
  lowStockItems: ReminderItemView[];
}): string {
  const lines: string[] = [
    `${input.appName} 居家库存提醒`,
    "你好，以下是本次自动整理结果。",
    "",
  ];

  if (input.expiredItems.length > 0) {
    lines.push(`🚨 已经过期物资（${input.expiredItems.length} 项）：`);
    input.expiredItems.slice(0, 20).forEach((item) => {
      lines.push(formatExpiryLine(item));
    });
    if (input.expiredItems.length > 20) {
      lines.push(`- 其余 ${input.expiredItems.length - 20} 项请登录系统查看`);
    }
    lines.push("");
  }

  if (input.expiringItems.length > 0) {
    lines.push(
      `⏳ 快过期物资（${input.daysBefore} 天内 ${input.expiringItems.length} 项）：`,
    );
    input.expiringItems.slice(0, 20).forEach((item) => {
      lines.push(formatExpiryLine(item));
    });
    if (input.expiringItems.length > 20) {
      lines.push(`- 其余 ${input.expiringItems.length - 20} 项请登录系统查看`);
    }
    lines.push("");
  }

  if (input.lowStockItems.length > 0) {
    lines.push(`🛒 低库存物资（需补充 ${input.lowStockItems.length} 项）：`);
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
  daysBefore: number;
  expiringItems: ReminderItemView[];
  expiredItems: ReminderItemView[];
  lowStockItems: ReminderItemView[];
}): string {
  const renderExpired = input.expiredItems
    .slice(0, 20)
    .map((item) => formatExpiryHtml(item))
    .join("");

  const renderExpiring = input.expiringItems
    .slice(0, 20)
    .map((item) => formatExpiryHtml(item))
    .join("");

  const renderLowStock = input.lowStockItems
    .slice(0, 20)
    .map((item) => formatStockHtml(item))
    .join("");

  return `
<div style="font-family: 'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, sans-serif; background-color: #fafafa; padding: 30px; border-radius: 16px; max-width: 600px; margin: 0 auto; color: #3f3f46;">
  <div style="text-align: center; margin-bottom: 30px;">
    <div style="font-size: 40px; margin-bottom: 10px;">🏠</div>
    <h2 style="margin: 0; color: #18181b; font-size: 24px; font-weight: 600;">${escapeHtml(input.appName)} 居家提醒</h2>
    <p style="margin: 8px 0 0 0; font-size: 14px; color: #71717a;">打理好每一件物品，就是照顾好明天的自己</p>
  </div>
  
  <div style="background: #ffffff; border-radius: 20px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.03);">
    <p style="margin: 0 0 20px 0; font-size: 16px;">你好，以下是今天为你整理的家庭物资状态：</p>
    
    ${
      input.expiredItems.length > 0
        ? `<div style="margin-bottom: 24px;">
      <div style="display: flex; align-items: center; margin-bottom: 12px;">
        <span style="font-size: 18px; margin-right: 8px;">🚨</span>
        <h3 style="margin: 0; font-size: 16px; color: #ef4444;">已过期（建议清理）</h3>
      </div>
      <div>${renderExpired}</div>
      ${input.expiredItems.length > 20 ? `<div style="text-align: center; color: #a1a1aa; font-size: 13px; margin-top: 8px;">还有 ${input.expiredItems.length - 20} 项，请到系统内查看</div>` : ""}
    </div>`
        : ""
    }

    ${
      input.expiringItems.length > 0
        ? `<div style="margin-bottom: 24px;">
      <div style="display: flex; align-items: center; margin-bottom: 12px;">
        <span style="font-size: 18px; margin-right: 8px;">⏳</span>
        <h3 style="margin: 0; font-size: 16px; color: #d97706;">快过期（建议尽快消耗）</h3>
      </div>
      <div>${renderExpiring}</div>
      ${input.expiringItems.length > 20 ? `<div style="text-align: center; color: #a1a1aa; font-size: 13px; margin-top: 8px;">还有 ${input.expiringItems.length - 20} 项，请到系统内查看</div>` : ""}
    </div>`
        : ""
    }
    
    ${
      input.lowStockItems.length > 0
        ? `<div style="margin-bottom: 24px;">
      <div style="display: flex; align-items: center; margin-bottom: 12px;">
        <span style="font-size: 18px; margin-right: 8px;">🛒</span>
        <h3 style="margin: 0; font-size: 16px; color: #166534;">库存告急（建议采购）</h3>
      </div>
      <div>${renderLowStock}</div>
      ${input.lowStockItems.length > 20 ? `<div style="text-align: center; color: #a1a1aa; font-size: 13px; margin-top: 8px;">还有 ${input.lowStockItems.length - 20} 项，请到系统内查看</div>` : ""}
    </div>`
        : ""
    }
    
    <div style="margin-top: 30px; text-align: center;">
      <p style="font-size: 13px; color: #a1a1aa; margin: 0;">来自 🐛 HomeBug 自动派送的温暖信件</p>
    </div>
  </div>
</div>`.trim();
}

async function listCronUsers(): Promise<CronUserRecord[]> {
  const db = getDb();
  const result = await db
    .prepare(
      `SELECT u.id,
              u.email,
              u.username
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
  daysBefore: number,
): Promise<ReminderItemRecord[]> {
  const db = getDb();
  const result = await db
    .prepare(
      `SELECT id,
              name,
              brand,
              quantity,
              unit,
              expiry_date
       FROM items
       WHERE status = 'active'
         AND (
           (
             expiry_date IS NOT NULL
             AND date(expiry_date) <= date('now', '+' || ? || ' day')
           )
           OR quantity <= 1
         )
       ORDER BY
         CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END ASC,
         expiry_date ASC,
         quantity ASC`,
    )
    .bind(daysBefore)
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

async function runInventoryReminderJob(options?: {
  enforceCronExpression?: boolean;
}) {
  const db = getDb();
  const [cronEnabledConfig, cronDaysBeforeConfig, cronExpressionConfig] =
    await Promise.all([
      getSystemConfigByKey(db, "cron.enabled"),
      getSystemConfigByKey(db, "cron.days_before"),
      getSystemConfigByKey(db, "cron.expression"),
    ]);
  const cronEnabled = toBoolean(cronEnabledConfig?.value ?? "1");
  const daysBefore = parseCronDaysBefore(cronDaysBeforeConfig?.value);
  const cronExpression = (cronExpressionConfig?.value ?? "0 1 * * *").trim();

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

  if (options?.enforceCronExpression) {
    const shouldRunNow = matchesCronExpressionUtc(cronExpression, new Date());
    if (!shouldRunNow) {
      return {
        skipped: true,
        cronEnabled,
        cronExpression,
        skippedReason: "not_due",
        usersChecked: 0,
        itemsChecked: 0,
        notificationsSent: 0,
        errors: [] as string[],
      };
    }
  }

  const users = await listCronUsers();
  const emailConfig = await loadEmailProviderConfig(db);

  const rawItems = await listReminderItemsForUser(daysBefore);
  const itemsChecked = rawItems.length;
  let notificationsSent = 0;
  const errors: string[] = [];

  const normalizedItems: ReminderItemView[] = rawItems.map((item) => ({
    name: item.name,
    brand: item.brand,
    quantity: Number(item.quantity),
    unit: item.unit?.trim() || "件",
    expiryDate: item.expiry_date,
    daysLeft: daysUntil(item.expiry_date),
  }));

  const expiredItems = normalizedItems.filter((item) => {
    if (item.daysLeft === null) return false;
    return item.daysLeft < 0;
  });

  const expiringItems = normalizedItems.filter((item) => {
    if (item.daysLeft === null) return false;
    return item.daysLeft >= 0 && item.daysLeft <= daysBefore;
  });

  const lowStockItems = normalizedItems.filter((item) => item.quantity <= 1);

  if (
    expiredItems.length === 0 &&
    expiringItems.length === 0 &&
    lowStockItems.length === 0
  ) {
    await appendCronLog({
      itemsChecked,
      notificationsSent: 0,
      status: "success",
      errorMessage: "本次没有需要提醒的库存数据。",
    });

    return {
      skipped: false,
      cronEnabled,
      usersChecked: users.length,
      itemsChecked,
      notificationsSent: 0,
      errors: [] as string[],
    };
  }

  const summarySubject: string[] = [];
  if (expiredItems.length > 0) {
    summarySubject.push(`${expiredItems.length}件已过期`);
  }
  if (expiringItems.length > 0) {
    summarySubject.push(`${expiringItems.length}件快过期`);
  }
  if (lowStockItems.length > 0) {
    summarySubject.push(`${lowStockItems.length}件需补充`);
  }

  const subject = `[${emailConfig.appName}] 居家备忘：${summarySubject.join("，")}`;
  const text = toTextSummary({
    appName: emailConfig.appName,
    daysBefore,
    expiringItems,
    expiredItems,
    lowStockItems,
  });
  const html = toHtmlSummary({
    appName: emailConfig.appName,
    daysBefore,
    expiringItems,
    expiredItems,
    lowStockItems,
  });

  for (const user of users) {
    try {
      await sendEmailWithProvider({
        config: emailConfig,
        to: user.email,
        subject,
        text,
        html,
      });

      notificationsSent += 1;

      const title = `居家备忘：${summarySubject.join("，")}`;
      const message = `系统已向 ${user.email} 发送备忘邮件。`;
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

    const url = new URL(request.url);
    const autoMode =
      isCronSecretAuthorized(request) && url.searchParams.get("auto") === "1";

    const result = await runInventoryReminderJob({
      enforceCronExpression: autoMode,
    });
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
