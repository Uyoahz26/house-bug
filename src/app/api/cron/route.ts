import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { requireAdmin, ForbiddenError } from "@/lib/auth/authorization";
import { AuthError } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db/client";
import { getSystemConfigByKey } from "@/lib/db/queries/config";
import { markExpiredItems } from "@/lib/db/queries/items";
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

const DAILY_EXPIRY_SYNC_KEY = "cron.expired_sync_last_date";

function toBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function getUtcDateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

async function ensureDailyExpiredStatusSync(db: ReturnType<typeof getDb>) {
  const today = getUtcDateKey();
  const lastSyncConfig = await getSystemConfigByKey(db, DAILY_EXPIRY_SYNC_KEY);

  if (lastSyncConfig?.value === today) {
    return;
  }

  await markExpiredItems(db);
  await db
    .prepare(
      `INSERT INTO system_config (key, value, description, category, is_secret, updated_by)
       VALUES (?, ?, ?, 'cron', 0, NULL)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = datetime('now'),
         updated_by = NULL`,
    )
    .bind(DAILY_EXPIRY_SYNC_KEY, today, "兜底：过期状态最近同步日期（UTC）")
    .run();
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
      ? "尊嘟假嘟？(时间倒流)"
      : item.daysLeft < 0
        ? `已凉透 ${Math.abs(item.daysLeft)} 天 🪦`
        : item.daysLeft === 0
          ? "就在今天！快吃快用！💥"
          : `仅剩 ${item.daysLeft} 天 跑毒鸭 🏃`;

  const isExpired = item.daysLeft !== null && item.daysLeft < 0;
  const tagColor = isExpired ? "#fef2f2" : "#fffbeb";
  const tagBorder = isExpired ? "#fca5a5" : "#fde68a";
  const tagText = isExpired ? "#ef4444" : "#d97706";

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
      <div>
        <div style="font-size: 15px; font-weight: 600; color: #3f3f46;">${escapeHtml(displayName)}</div>
        <div style="font-size: 13px; color: #71717a; margin-top: 4px;">库存还有：<b style="color:#18181b;">${item.quantity}</b> ${escapeHtml(item.unit)}</div>
      </div>
      <div style="background-color: ${tagColor}; border: 1px solid ${tagBorder}; color: ${tagText}; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; white-space: nowrap;">
        ${escapeHtml(dayText)}
      </div>
    </div>
  `.trim();
}

function formatStockHtml(item: ReminderItemView): string {
  const displayName = item.brand ? `${item.brand} - ${item.name}` : item.name;
  const showZero =
    item.quantity === 0
      ? "一滴都没了 🏜️"
      : `只剩：${item.quantity} ${escapeHtml(item.unit)} 🤏`;

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
      <div>
        <div style="font-size: 15px; font-weight: 600; color: #3f3f46;">${escapeHtml(displayName)}</div>
      </div>
      <div style="background-color: #ecfdf5; border: 1px solid #6ee7b7; color: #047857; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; white-space: nowrap;">
        ${escapeHtml(showZero)}
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
    `报～ 主公 囤囤鼠传来物资急报！`,
    "探子来报，以下库存有异动，请主公速速定夺：",
    "",
  ];

  if (input.expiredItems.length > 0) {
    lines.push(
      `🚨 如果听一万遍反方向的钟可以回到过去的话，这些应该还有救。过期已凉透共 ${input.expiredItems.length} 项）：`,
    );
    input.expiredItems.slice(0, 20).forEach((item) => {
      lines.push(formatExpiryLine(item));
    });
    if (input.expiredItems.length > 20) {
      lines.push(
        `- 还有 ${input.expiredItems.length - 20} 项未能列出，请上前线查看。`,
      );
    }
    lines.push("");
  }

  if (input.expiringItems.length > 0) {
    lines.push(
      `⏳ 留给它们的时间不多了！（${input.daysBefore} 天内临期，共 ${input.expiringItems.length} 项）：`,
    );
    input.expiringItems.slice(0, 20).forEach((item) => {
      lines.push(formatExpiryLine(item));
    });
    if (input.expiringItems.length > 20) {
      lines.push(
        `- 还有 ${input.expiringItems.length - 20} 个小可怜，请上前线查看。`,
      );
    }
    lines.push("");
  }

  if (input.lowStockItems.length > 0) {
    lines.push(
      `🛒 粮草告急，主公快囤囤囤！（需补充，共 ${input.lowStockItems.length} 项）：`,
    );
    input.lowStockItems.slice(0, 20).forEach((item) => {
      lines.push(formatStockLine(item));
    });
    if (input.lowStockItems.length > 20) {
      lines.push(`- 还有 ${input.lowStockItems.length - 20} 条请上前线查看。`);
    }
    lines.push("");
  }

  lines.push(
    "主公明鉴，为了保住奴才的脑袋，请速速查看处理！",
    "",
    "—— 您忠诚的囤囤鼠敬上",
  );

  return lines.join("\n");
}

function toHtmlSummary(input: {
  appName: string;
  daysBefore: number;
  expiringItems: ReminderItemView[];
  expiredItems: ReminderItemView[];
  lowStockItems: ReminderItemView[];
}): string {
  const iconBase64 =
    "PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiByb2xlPSJpbWciIGFyaWEtbGFiZWw9IkhvdXNlIEJ1ZyBsb2dvIG9wdGlvbiBDIj4KICA8cmVjdCB4PSIxMiIgeT0iMTIiIHdpZHRoPSIxMDQiIGhlaWdodD0iMTA0IiByeD0iMjYiIGZpbGw9IiMwMDAiLz4KICA8cGF0aCBkPSJNNjQgMzJMMzYgNTRWOTZIOTJWNTRMNjQgMzJaIiBmaWxsPSIjZmZmIi8+CiAgPHJlY3QgeD0iNDQiIHk9IjU2IiB3aWR0aD0iNDAiIGhlaWdodD0iMzYiIHJ4PSIxOCIgZmlsbD0iIzAwMCIvPgogIDxyZWN0IHg9IjYxIiB5PSI2MCIgd2lkdGg9IjYiIGhlaWdodD0iMjgiIHJ4PSIzIiBmaWxsPSIjZmZmIi8+CiAgPGNpcmNsZSBjeD0iNTQiIGN5PSI1MiIgcj0iMyIgZmlsbD0iIzAwMCIvPgogIDxjaXJjbGUgY3g9Ijc0IiBjeT0iNTIiIHI9IjMiIGZpbGw9IiMwMDAiLz4KPC9zdmc+";

  const renderExpired = input.expiredItems
    .slice(0, 20)
    .map((item) => formatExpiryHtml(item))
    .join('<div style="height: 12px;"></div>');

  const renderExpiring = input.expiringItems
    .slice(0, 20)
    .map((item) => formatExpiryHtml(item))
    .join('<div style="height: 12px;"></div>');

  const renderLowStock = input.lowStockItems
    .slice(0, 20)
    .map((item) => formatStockHtml(item))
    .join('<div style="height: 12px;"></div>');

  return `
<div style="font-family: 'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, sans-serif; background-color: #f3f4f6; padding: 40px 20px; color: #1f2937;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 24px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); overflow: hidden;">
    
    <!-- 头部横幅 -->
    <div style="background: linear-gradient(135deg, #18181b 0%, #3f3f46 100%); padding: 40px 20px; text-align: center; position: relative;">
      <div style="margin-bottom: 20px;">
        <img src="data:image/svg+xml;base64,${iconBase64}" width="72" height="72" alt="HomeBug Logo" style="border-radius: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); background: #000;" />
      </div>
      <h2 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: 1px;">报～ 主公！</h2>
      <p style="margin: 12px 0 0 0; color: #a1a1aa; font-size: 15px;">属鼠前方急报，请速速定夺 📜</p>
    </div>
  
    <!-- 主体内容 -->
    <div style="padding: 32px 24px;">
    
    ${
      input.expiredItems.length > 0
        ? `<div style="margin-bottom: 36px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px dashed #fee2e2; padding-bottom: 12px;">
        <h3 style="margin: 0; font-size: 18px; color: #ef4444; font-weight: 800;">
          <span style="font-size: 22px; margin-right: 6px; vertical-align: middle;">💀</span> 臣妾做不到啊
        </h3>
        <span style="background: #fef2f2; color: #ef4444; padding: 4px 12px; border-radius: 99px; font-size: 13px; font-weight: 700;">共 ${input.expiredItems.length} 项已凉透</span>
      </div>
      <div>${renderExpired}</div>
      ${input.expiredItems.length > 20 ? `<div style="text-align: center; color: #71717a; font-size: 13px; margin-top: 16px; background: #f4f4f5; padding: 10px; border-radius: 8px; font-weight: 500;">👑 还有 ${input.expiredItems.length - 20} 个已凉透</div>` : ""}
    </div>`
        : ""
    }

    ${
      input.expiringItems.length > 0
        ? `<div style="margin-bottom: 36px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px dashed #fef3c7; padding-bottom: 12px;">
        <h3 style="margin: 0; font-size: 18px; color: #d97706; font-weight: 800;">
          <span style="font-size: 22px; margin-right: 6px; vertical-align: middle;">⏳</span> 留给它的时间不多了
        </h3>
        <span style="background: #fffbeb; color: #d97706; padding: 4px 12px; border-radius: 99px; font-size: 13px; font-weight: 700;">共 ${input.expiringItems.length} 项临期</span>
      </div>
      <div>${renderExpiring}</div>
      ${input.expiringItems.length > 20 ? `<div style="text-align: center; color: #71717a; font-size: 13px; margin-top: 16px; background: #f4f4f5; padding: 10px; border-radius: 8px; font-weight: 500;">👑 还有 ${input.expiringItems.length - 20} 个小可怜</div>` : ""}
    </div>`
        : ""
    }
    
    ${
      input.lowStockItems.length > 0
        ? `<div style="margin-bottom: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px dashed #d1fae5; padding-bottom: 12px;">
        <h3 style="margin: 0; font-size: 18px; color: #059669; font-weight: 800;">
          <span style="font-size: 22px; margin-right: 6px; vertical-align: middle;">🛒</span> 粮草告急，买买买！
        </h3>
        <span style="background: #ecfdf5; color: #059669; padding: 4px 12px; border-radius: 99px; font-size: 13px; font-weight: 700;">共 ${input.lowStockItems.length} 项快吃土了</span>
      </div>
      <div>${renderLowStock}</div>
      ${input.lowStockItems.length > 20 ? `<div style="text-align: center; color: #71717a; font-size: 13px; margin-top: 16px; background: #f4f4f5; padding: 10px; border-radius: 8px; font-weight: 500;">👑 还有 ${input.lowStockItems.length - 20} 种嗷嗷待哺</div>` : ""}
    </div>`
        : ""
    }
    
    </div>

    <!-- 底部落款 -->
    <div style="background: #fafafa; padding: 24px; text-align: center; border-top: 1px solid #f4f4f5;">
      <p style="font-size: 14px; color: #71717a; margin: 0 0 12px 0; font-weight: 500;">主公明鉴，为了保住保洁部部长的脑袋，请速速处理！</p>
      <div style="display: inline-block; background: #ffffff; padding: 8px 16px; border-radius: 99px; border: 1px solid #e4e4e7; font-size: 12px; color: #a1a1aa; font-weight: 600;">
        🤖 您的忠诚属下：HomeBug囤囤鼠 自动敬上🙇‍♀️
      </div>
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
  await ensureDailyExpiredStatusSync(db);
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
    summarySubject.push(`${expiredItems.length} 件已凉透`);
  }
  if (expiringItems.length > 0) {
    summarySubject.push(`${expiringItems.length} 件要过期`);
  }
  if (lowStockItems.length > 0) {
    summarySubject.push(`${lowStockItems.length} 件该囤了`);
  }

  const subject = `报～ 主公！${emailConfig.appName} 前方急报：${summarySubject.join("，")}！`;
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
