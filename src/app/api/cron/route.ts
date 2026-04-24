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
import { getAiConfig, getAiAdapter } from "@/lib/ai";

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
  aiTip?: string | null; // AI 生成的幽默提示
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

async function generateAiTipsForItems(
  items: ReminderItemView[],
  type: "expired" | "expiring" | "lowStock",
): Promise<Map<string, string>> {
  const tipsMap = new Map<string, string>();

  if (items.length === 0) {
    return tipsMap;
  }

  try {
    const db = getDb();
    const aiConfig = await getAiConfig(db);

    if (!aiConfig) {
      return tipsMap;
    }

    const adapter = getAiAdapter(aiConfig.provider);

    // 批量生成提示，每次最多处理 10 个物品
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const itemDescriptions = batch
        .map((item, idx) => {
          const displayName = item.brand
            ? `${item.brand} ${item.name}`
            : item.name;
          if (type === "expired") {
            return `${idx + 1}. ${displayName}（已过期 ${Math.abs(item.daysLeft || 0)} 天，库存 ${item.quantity}${item.unit}）`;
          } else if (type === "expiring") {
            return `${idx + 1}. ${displayName}（还剩 ${item.daysLeft} 天过期，库存 ${item.quantity}${item.unit}）`;
          } else {
            return `${idx + 1}. ${displayName}（库存仅剩 ${item.quantity}${item.unit}）`;
          }
        })
        .join("\n");

      const typeDesc =
        type === "expired"
          ? "已经过期"
          : type === "expiring"
            ? "即将过期"
            : "库存不足";

      const prompt = `你是一个幽默风趣的家庭管家助手"囤囤鼠"。请为以下${typeDesc}的物品生成简短、幽默、有创意的提示文案。

要求：
1. 每个物品一句话，15-30字
2. 要幽默、抽象、有梗，但不要太离谱
3. 可以结合物品特性和使用场景
4. 语气要轻松活泼，像朋友聊天
5. 可以用网络流行语、谐音梗、夸张手法
6. ${type === "expired" ? "对于过期物品，可以调侃但要提醒丢弃" : type === "expiring" ? "对于临期物品，鼓励尽快使用" : "对于缺货物品，提醒补货"}

示例风格：
- 洗发水快过期：现在可以一天洗三次头了，头皮SPA走起！
- 牛奶库存不足：早餐没奶喝，只能干啃面包了🥖
- 酱油已过期：这瓶酱油见证了你从单身到现在，该说再见了
- 薯片临期：趁着还脆，赶紧消灭它！
- 卫生纸缺货：再不囤货，就要用树叶了🍃

物品列表：
${itemDescriptions}

请按以下格式输出（纯文本，每行一个序号和文案）：
1. [第一个物品的文案]
2. [第二个物品的文案]
...`;

      const response = await adapter.chat(
        [
          {
            role: "user",
            content: prompt,
          },
        ],
        aiConfig,
      );

      // 解析响应
      const lines = response.content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      lines.forEach((line) => {
        const match = line.match(/^(\d+)\.\s*(.+)$/);
        if (match) {
          const idx = parseInt(match[1], 10) - 1;
          const tip = match[2].trim();
          if (idx >= 0 && idx < batch.length) {
            const item = batch[idx];
            const key = `${item.name}-${item.brand || ""}-${item.expiryDate || ""}-${item.quantity}`;
            tipsMap.set(key, tip);
          }
        }
      });
    }
  } catch (error) {
    console.error("[generateAiTipsForItems] AI 文案生成失败:", error);
    // 静默失败，使用默认文案
  }

  return tipsMap;
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
  const displayName = item.brand ? `${item.brand} ${item.name}` : item.name;
  const dayText =
    item.daysLeft === null
      ? "未知"
      : item.daysLeft < 0
        ? `已过期 ${Math.abs(item.daysLeft)} 天`
        : item.daysLeft === 0
          ? "今天到期"
          : `剩余 ${item.daysLeft} 天`;

  const tip = item.aiTip ? `\n  💡 ${item.aiTip}` : "";
  return `• ${displayName}\n  ${dayText} · 库存 ${item.quantity}${item.unit}${tip}`;
}

function formatStockLine(item: ReminderItemView): string {
  const displayName = item.brand ? `${item.brand} ${item.name}` : item.name;
  const stockText =
    item.quantity === 0 ? "已售罄" : `仅剩 ${item.quantity}${item.unit}`;
  const tip = item.aiTip ? `\n  💡 ${item.aiTip}` : "";
  return `• ${displayName}\n  ${stockText}${tip}`;
}

function formatExpiryHtml(item: ReminderItemView): string {
  const displayName = item.brand ? `${item.brand} ${item.name}` : item.name;
  const daysLeft = item.daysLeft ?? 0;

  const isExpired = daysLeft < 0;
  const statusColor = isExpired ? "#dc2626" : "#f59e0b";
  const statusBg = isExpired ? "#fee2e2" : "#fef3c7";
  const statusIcon = isExpired ? "❌" : "⏰";

  const dayText =
    item.daysLeft === null
      ? "未知"
      : daysLeft < 0
        ? `已过期 ${Math.abs(daysLeft)} 天`
        : daysLeft === 0
          ? "今天到期"
          : `剩余 ${daysLeft} 天`;

  const aiTipHtml = item.aiTip
    ? `<div style="margin-top: 8px; padding: 8px 10px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-left: 3px solid #94a3b8; border-radius: 6px;">
         <div style="display: flex; align-items: flex-start; gap: 6px;">
           <span style="font-size: 14px; line-height: 1.4;">💡</span>
           <span style="font-size: 13px; line-height: 1.5; color: #475569; font-weight: 500;">${escapeHtml(item.aiTip)}</span>
         </div>
       </div>`
    : "";

  return `
    <div style="background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04); transition: all 0.2s;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 6px;">
        <div style="flex: 1; min-width: 0;">
          <h4 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 700; color: #0f172a; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(displayName)}
          </h4>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: ${statusBg}; color: ${statusColor}; border-radius: 6px; font-size: 12px; font-weight: 700;">
              <span>${statusIcon}</span>
              <span>${escapeHtml(dayText)}</span>
            </span>
            <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: #64748b; font-weight: 600;">
              <span>📦</span>
              <span>${item.quantity} ${escapeHtml(item.unit)}</span>
            </span>
          </div>
        </div>
      </div>
      ${aiTipHtml}
    </div>
  `.trim();
}

function formatStockHtml(item: ReminderItemView): string {
  const displayName = item.brand ? `${item.brand} ${item.name}` : item.name;
  const stockText =
    item.quantity === 0
      ? "已售罄"
      : `仅剩 ${item.quantity} ${escapeHtml(item.unit)}`;

  const stockIcon = item.quantity === 0 ? "🚫" : "📉";
  const stockColor = item.quantity === 0 ? "#dc2626" : "#0284c7";
  const stockBg = item.quantity === 0 ? "#fee2e2" : "#dbeafe";

  const aiTipHtml = item.aiTip
    ? `<div style="margin-top: 8px; padding: 8px 10px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-left: 3px solid #94a3b8; border-radius: 6px;">
         <div style="display: flex; align-items: flex-start; gap: 6px;">
           <span style="font-size: 14px; line-height: 1.4;">💡</span>
           <span style="font-size: 13px; line-height: 1.5; color: #475569; font-weight: 500;">${escapeHtml(item.aiTip)}</span>
         </div>
       </div>`
    : "";

  return `
    <div style="background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04); transition: all 0.2s;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 6px;">
        <div style="flex: 1; min-width: 0;">
          <h4 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 700; color: #0f172a; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(displayName)}
          </h4>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: ${stockBg}; color: ${stockColor}; border-radius: 6px; font-size: 12px; font-weight: 700;">
              <span>${stockIcon}</span>
              <span>${escapeHtml(stockText)}</span>
            </span>
            <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: #64748b; font-weight: 600;">
              <span>🛒</span>
              <span>需要补货</span>
            </span>
          </div>
        </div>
      </div>
      ${aiTipHtml}
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
    `${input.appName} 库存提醒`,
    `${new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}`,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
  ];

  if (input.expiredItems.length > 0) {
    lines.push(`【已过期】共 ${input.expiredItems.length} 项`);
    lines.push("");
    input.expiredItems.slice(0, 20).forEach((item) => {
      lines.push(formatExpiryLine(item));
    });
    if (input.expiredItems.length > 20) {
      lines.push(`... 还有 ${input.expiredItems.length - 20} 项未显示`);
    }
    lines.push("");
  }

  if (input.expiringItems.length > 0) {
    lines.push(`【即将过期】共 ${input.expiringItems.length} 项`);
    lines.push("");
    input.expiringItems.slice(0, 20).forEach((item) => {
      lines.push(formatExpiryLine(item));
    });
    if (input.expiringItems.length > 20) {
      lines.push(`... 还有 ${input.expiringItems.length - 20} 项未显示`);
    }
    lines.push("");
  }

  if (input.lowStockItems.length > 0) {
    lines.push(`【库存不足】共 ${input.lowStockItems.length} 项`);
    lines.push("");
    input.lowStockItems.slice(0, 20).forEach((item) => {
      lines.push(formatStockLine(item));
    });
    if (input.lowStockItems.length > 20) {
      lines.push(`... 还有 ${input.lowStockItems.length - 20} 项未显示`);
    }
    lines.push("");
  }

  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("及时处理库存，避免浪费");
  lines.push("");
  lines.push(`${input.appName} · 自动提醒`);

  return lines.join("\n");
}

function toHtmlSummary(input: {
  appName: string;
  daysBefore: number;
  expiringItems: ReminderItemView[];
  expiredItems: ReminderItemView[];
  lowStockItems: ReminderItemView[];
  dashboardUrl?: string;
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

  const totalCount =
    input.expiredItems.length +
    input.expiringItems.length +
    input.lowStockItems.length;

  const funnyFooterTexts = [
    "清理库存，开启清爽一天",
    "别让食物们白白牺牲",
    "冰箱不是时光机",
    "库存管理小能手",
    "今天不处理，明天就要扔",
  ];
  const randomFooter =
    funnyFooterTexts[Math.floor(Math.random() * funnyFooterTexts.length)];

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${input.appName} 库存提醒</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    
    <!-- 头部卡片 -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px 16px 0 0; padding: 24px 20px; text-align: center; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);">
      <div style="font-size: 48px; margin-bottom: 8px;">🐛</div>
      <h1 style="margin: 0 0 6px 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">
        ${input.appName}
      </h1>
      <p style="margin: 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; font-weight: 500;">
        ${new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}
      </p>
      <div style="margin-top: 16px; display: inline-block; background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(10px); padding: 8px 20px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.3);">
        <span style="color: #ffffff; font-size: 15px; font-weight: 600;">📊 ${totalCount} 项提示</span>
      </div>
    </div>
    
    <!-- 主内容卡片 -->
    <div style="background: #ffffff; border-radius: 0 0 16px 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);">
      
      <div style="padding: 20px 16px;">
        
        ${
          input.expiredItems.length > 0
            ? `
        <div style="margin-bottom: ${input.expiringItems.length > 0 || input.lowStockItems.length > 0 ? "24px" : "0"};">
          <div style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); padding: 12px 16px; border-radius: 12px; margin-bottom: 12px; border-left: 4px solid #dc2626;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 20px;">⚠️</span>
                <h2 style="margin: 0; font-size: 17px; font-weight: 700; color: #991b1b;">已过期</h2>
              </div>
              <span style="background: #dc2626; color: #ffffff; padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 700;">${input.expiredItems.length}</span>
            </div>
          </div>
          <div style="display: grid; gap: 8px;">${renderExpired}</div>
          ${input.expiredItems.length > 20 ? `<div style="margin-top: 12px; text-align: center; padding: 8px; background: #f8fafc; border-radius: 8px; color: #64748b; font-size: 13px;">还有 ${input.expiredItems.length - 20} 项未显示</div>` : ""}
        </div>
        `
            : ""
        }
        
        ${
          input.expiringItems.length > 0
            ? `
        <div style="margin-bottom: ${input.lowStockItems.length > 0 ? "24px" : "0"};">
          <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 12px 16px; border-radius: 12px; margin-bottom: 12px; border-left: 4px solid #f59e0b;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 20px;">⏰</span>
                <h2 style="margin: 0; font-size: 17px; font-weight: 700; color: #92400e;">即将过期</h2>
              </div>
              <span style="background: #f59e0b; color: #ffffff; padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 700;">${input.expiringItems.length}</span>
            </div>
          </div>
          <div style="display: grid; gap: 8px;">${renderExpiring}</div>
          ${input.expiringItems.length > 20 ? `<div style="margin-top: 12px; text-align: center; padding: 8px; background: #f8fafc; border-radius: 8px; color: #64748b; font-size: 13px;">还有 ${input.expiringItems.length - 20} 项未显示</div>` : ""}
        </div>
        `
            : ""
        }
        
        ${
          input.lowStockItems.length > 0
            ? `
        <div>
          <div style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); padding: 12px 16px; border-radius: 12px; margin-bottom: 12px; border-left: 4px solid #0284c7;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 20px;">📦</span>
                <h2 style="margin: 0; font-size: 17px; font-weight: 700; color: #075985;">库存不足</h2>
              </div>
              <span style="background: #0284c7; color: #ffffff; padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 700;">${input.lowStockItems.length}</span>
            </div>
          </div>
          <div style="display: grid; gap: 8px;">${renderLowStock}</div>
          ${input.lowStockItems.length > 20 ? `<div style="margin-top: 12px; text-align: center; padding: 8px; background: #f8fafc; border-radius: 8px; color: #64748b; font-size: 13px;">还有 ${input.lowStockItems.length - 20} 项未显示</div>` : ""}
        </div>
        `
            : ""
        }
        
      </div>
      
      <!-- 底部操作区 -->
      <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); padding: 20px; border-top: 2px dashed #e2e8f0;">
        <div style="text-align: center; margin-bottom: 16px;">
          <div style="display: inline-block; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 10px 20px; border-radius: 20px; border: 2px solid #fbbf24;">
            <span style="font-size: 16px;">💡</span>
            <span style="color: #92400e; font-size: 14px; font-weight: 600; margin-left: 6px;">${randomFooter}</span>
          </div>
        </div>
        ${
          input.dashboardUrl
            ? `<div style="text-align: center;">
          <a href="${input.dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-size: 15px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); transition: all 0.3s;">
            查看详情
          </a>
        </div>`
            : ""
        }
      </div>
      
    </div>
    
    <!-- 页脚 -->
    <div style="margin-top: 16px; text-align: center; padding: 12px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.2);">
      <p style="margin: 0; color: rgba(255, 255, 255, 0.9); font-size: 12px; font-weight: 500;">
        🤖 您的忠诚属下：HomeBug囤囤鼠敬上🙇‍♀️ · 请勿直接回复
      </p>
    </div>
    
  </div>
  
</body>
</html>`.trim();
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
       WHERE status IN ('active', 'expired')
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

async function runInventoryReminderJob() {
  const db = getDb();
  await ensureDailyExpiredStatusSync(db);

  const [cronEnabledConfig, cronDaysBeforeConfig] = await Promise.all([
    getSystemConfigByKey(db, "cron.enabled"),
    getSystemConfigByKey(db, "cron.days_before"),
  ]);

  const cronEnabled = toBoolean(cronEnabledConfig?.value ?? "1");
  const daysBefore = parseCronDaysBefore(cronDaysBeforeConfig?.value);

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

  // 按优先级分类：已过期 > 即将过期 > 库存不足
  const expiredItems = normalizedItems.filter((item) => {
    if (item.daysLeft === null) return false;
    return item.daysLeft < 0;
  });

  const expiringItems = normalizedItems.filter((item) => {
    if (item.daysLeft === null) return false;
    return item.daysLeft >= 0 && item.daysLeft <= daysBefore;
  });

  // 库存不足：排除已经在过期/临期列表中的物品
  const expiryItemIds = new Set(
    [...expiredItems, ...expiringItems].map(
      (item) => `${item.name}-${item.brand || ""}-${item.expiryDate || ""}`,
    ),
  );
  const lowStockItems = normalizedItems.filter((item) => {
    if (item.quantity > 1) return false;
    const itemId = `${item.name}-${item.brand || ""}-${item.expiryDate || ""}`;
    return !expiryItemIds.has(itemId);
  });

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

  // 使用 AI 生成幽默文案
  const [expiredTips, expiringTips, lowStockTips] = await Promise.all([
    generateAiTipsForItems(expiredItems, "expired"),
    generateAiTipsForItems(expiringItems, "expiring"),
    generateAiTipsForItems(lowStockItems, "lowStock"),
  ]);

  // 将 AI 文案附加到物品上
  expiredItems.forEach((item) => {
    const key = `${item.name}-${item.brand || ""}-${item.expiryDate || ""}-${item.quantity}`;
    item.aiTip = expiredTips.get(key) || null;
  });

  expiringItems.forEach((item) => {
    const key = `${item.name}-${item.brand || ""}-${item.expiryDate || ""}-${item.quantity}`;
    item.aiTip = expiringTips.get(key) || null;
  });

  lowStockItems.forEach((item) => {
    const key = `${item.name}-${item.brand || ""}-${item.expiryDate || ""}-${item.quantity}`;
    item.aiTip = lowStockTips.get(key) || null;
  });

  // 使用 AI 生成幽默的邮件标题
  let emailSubject = `${emailConfig.appName} 库存提醒`;
  try {
    const summarySubject: string[] = [];
    if (expiredItems.length > 0) {
      summarySubject.push(`${expiredItems.length} 项已过期`);
    }
    if (expiringItems.length > 0) {
      summarySubject.push(`${expiringItems.length} 项即将过期`);
    }
    if (lowStockItems.length > 0) {
      summarySubject.push(`${lowStockItems.length} 项库存不足`);
    }

    const adapter = getAiAdapter((await getAiConfig(db))?.provider || "openai");
    const aiConfig = await getAiConfig(db);

    if (aiConfig) {
      const titlePrompt = `你是一个幽默风趣的家庭管家助手"囤囤鼠"。请为库存提醒邮件生成一个幽默、有梗、吸引人的标题。

当前库存情况：${summarySubject.join("，")}

要求：
1. 标题要简短，15-25字
2. 要幽默、有梗、抽象，但不要太离谱
3. 可以用网络流行语、谐音梗、夸张手法
4. 语气要像朋友发消息，轻松活泼
5. 可以用 emoji 但不要太多（最多2个）

示例风格：
- 报～前方囤囤鼠传来急报～
- 🚨 你的冰箱发来了求救信号
- 警告！有东西要造反了
- 囤囤鼠紧急播报：库存告急！
- 你的食物们在召唤你
- 快醒醒！有些东西等不及了

请直接输出标题，不要其他内容：`;

      const titleResponse = await adapter.chat(
        [{ role: "user", content: titlePrompt }],
        aiConfig,
      );

      const generatedTitle = titleResponse.content.trim();
      if (
        generatedTitle &&
        generatedTitle.length > 0 &&
        generatedTitle.length < 50
      ) {
        emailSubject = generatedTitle;
      } else {
        emailSubject = `${summarySubject.join("，")}`;
      }
    } else {
      emailSubject = `报～ 前方囤囤鼠发来急报：${summarySubject.join("，")}`;
    }
  } catch (error) {
    console.error("[generateEmailSubject] AI 标题生成失败:", error);
    const summarySubject: string[] = [];
    if (expiredItems.length > 0) {
      summarySubject.push(`${expiredItems.length} 项已过期`);
    }
    if (expiringItems.length > 0) {
      summarySubject.push(`${expiringItems.length} 项即将过期`);
    }
    if (lowStockItems.length > 0) {
      summarySubject.push(`${lowStockItems.length} 项库存不足`);
    }
    emailSubject = `报～ 前方囤囤鼠发来急报：${summarySubject.join("，")}`;
  }

  const subject = emailSubject;
  const text = toTextSummary({
    appName: emailConfig.appName,
    daysBefore,
    expiringItems,
    expiredItems,
    lowStockItems,
  });

  // 获取系统 URL 配置用于"查看详情"按钮
  const dashboardUrl = "https://homebug.uyoahz.cc.cd/dashboard";

  const html = toHtmlSummary({
    appName: emailConfig.appName,
    daysBefore,
    expiringItems,
    expiredItems,
    lowStockItems,
    dashboardUrl,
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

      // 生成系统通知标题
      const notificationParts: string[] = [];
      if (expiredItems.length > 0) {
        notificationParts.push(`${expiredItems.length} 项已过期`);
      }
      if (expiringItems.length > 0) {
        notificationParts.push(`${expiringItems.length} 项即将过期`);
      }
      if (lowStockItems.length > 0) {
        notificationParts.push(`${lowStockItems.length} 项库存不足`);
      }

      const title = `居家备忘：${notificationParts.join("，")}`;
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
    const [cronEnabled, logsResult] = await Promise.all([
      getSystemConfigByKey(db, "cron.enabled"),
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
