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

// 随机风格标签池，用于让每次生成的文案有不同调性
const TIP_STYLE_POOL = [
  "古风文人感",
  "东北大碴子味",
  "沪上小资腔调",
  "抽象网络梗",
  "温柔软萌系",
  "毒舌吐槽风",
  "赛博朋克赛",
  "广告文案腔",
  "中二热血风",
  "职场打工人",
  "冷幽默段子手",
  "情景剧台词",
  "武侠江湖体",
  "谐音梗狂魔",
  "emo文艺青年",
];

function pickRandomStyles(count: number): string[] {
  const pool = [...TIP_STYLE_POOL];
  const picked: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
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

    // 提高温度以获得更具变化与创意的文案（原 config 针对 OCR 精确度设了低温度）
    const creativeConfig = {
      ...aiConfig,
      temperature: 0.95,
      maxTokens: Math.max(aiConfig.maxTokens || 2000, 1200),
    };

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

      // 每次生成时注入随机风格与随机种子，确保每次发送的文案都不一样
      const styles = pickRandomStyles(3).join("、");
      const randomSeed = Math.random().toString(36).slice(2, 10).toUpperCase();
      const nowLabel = new Date().toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      });

      const prompt = `你是一个幽默风趣的家庭管家助手"囤囤鼠"。请为以下${typeDesc}的物品生成简短、幽默、抽象有创意的提示文案。

【本次随机指令】
- 生成时间：${nowLabel}
- 变化种子：${randomSeed}（每次不同，请据此产出全新的、与历史不同的文案）
- 本轮建议融合风格：${styles}（可混搭，也可任选一种贯穿全部）
- 严禁套用以下俗套开头：洗发水、牛奶、酱油、薯片、卫生纸（示例只做风格参考，不要直接模仿内容）

要求：
1. 每个物品一句话，15-30字
2. 要幽默、有画面感、有梗、抽象，但不要太离谱
3. 可以结合物品特性和使用场景
4. 语气要轻松活泼，像朋友聊天
5. 可以用网络流行语、谐音梗、夸张手法
6. ${type === "expired" ? "对于过期物品，可以调侃但要提醒丢弃" : type === "expiring" ? "对于临期物品，鼓励尽快使用" : "对于缺货物品，提醒补货"}
7. 每条文案都要彼此不同，不要用相似的句式开头
8. 不要输出"第X个物品"这种编号文字，只要纯文案

示例风格（仅示意语气，禁止抄袭用词）：
- 这瓶酱油见证了你从单身到现在，该说再见了
- 趁着薯片还脆，赶紧消灭它！
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
        creativeConfig,
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

/**
 * 动态生成"囤囤鼠便签"内容 —— 每次发送邮件时 AI 生成一段幽默抽象的开场白
 */
async function generateEditorNote(input: {
  expiredCount: number;
  expiringCount: number;
  lowStockCount: number;
}): Promise<string> {
  const fallback = "翻了翻你的橱柜和冰箱，有些小事想跟你说。不急，慢慢来。";

  try {
    const db = getDb();
    const aiConfig = await getAiConfig(db);
    if (!aiConfig) return fallback;

    const adapter = getAiAdapter(aiConfig.provider);
    const creativeConfig = {
      ...aiConfig,
      temperature: 1.0,
      maxTokens: 200,
    };

    const totalCount =
      input.expiredCount + input.expiringCount + input.lowStockCount;

    const situationParts: string[] = [];
    if (input.expiredCount > 0)
      situationParts.push(`${input.expiredCount} 样东西已经过期`);
    if (input.expiringCount > 0)
      situationParts.push(`${input.expiringCount} 样东西快过期了`);
    if (input.lowStockCount > 0)
      situationParts.push(`${input.lowStockCount} 样东西快没了`);

    const situation = situationParts.join("，") || "一切安好";
    const styles = pickRandomStyles(2).join("、");
    const seed = Math.random().toString(36).slice(2, 10).toUpperCase();

    const prompt = `你是"囤囤鼠"，一只住在主人家里的仓鼠管家。现在你要给主人写一张便签，告诉他家里的库存情况。

当前情况：${situation}（共 ${totalCount} 件需要关注）

【本次随机指令】
- 变化种子：${seed}
- 风格倾向：${styles}

要求：
1. 写 2-3 句话，总共 40-80 字
2. 要幽默、抽象、有梗，像朋友发微信
3. 不要太正式，不要"亲爱的主人"这种开头，可以叫老大、大哥和老板等
4. 可以用比喻、拟人、夸张、网络梗
5. 结尾可以轻松一点，比如"不急""不慌""慢慢来""先喝口水"之类等。不要硬套，择机使用。
6. emoji 表情可以少量使用。
7. 直接输出便签内容，不要加引号或前缀

示例语气（禁止照抄）：
- 冰箱里有几位选手的签证快到期了，你看着办。但是不急，可以先把手里的奶茶喝完。
- 今天巡逻了一圈，发现有些东西在偷偷变老。建议你抽空翻翻角落。
- 库存告急，再不补货我就要啃纸箱了。开玩笑的，但确实该看看了。`;

    const response = await adapter.chat(
      [{ role: "user", content: prompt }],
      creativeConfig,
    );

    const note = response.content
      .trim()
      .replace(/^["「『]/, "")
      .replace(/["」』]$/, "");
    if (note && note.length >= 10 && note.length <= 200) {
      return note;
    }
    return fallback;
  } catch (error) {
    console.error("[generateEditorNote] AI 便签生成失败:", error);
    return fallback;
  }
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
      ? "日期未知"
      : item.daysLeft < 0
        ? `过期 ${Math.abs(item.daysLeft)} 天`
        : item.daysLeft === 0
          ? "今天到期"
          : `还有 ${item.daysLeft} 天`;

  const tip = item.aiTip ? `\n      ❝ ${item.aiTip} ❞` : "";
  return `   · ${displayName}\n     ${dayText}  |  家里还有 ${item.quantity}${item.unit}${tip}`;
}

function formatStockLine(item: ReminderItemView): string {
  const displayName = item.brand ? `${item.brand} ${item.name}` : item.name;
  const stockText =
    item.quantity === 0 ? "已经没了" : `仅剩 ${item.quantity}${item.unit}`;
  const tip = item.aiTip ? `\n      ❝ ${item.aiTip} ❞` : "";
  return `   · ${displayName}\n     ${stockText}  |  记得加进购物清单${tip}`;
}

// 治愈系配色 — 按类别使用温暖的色调
const SECTION_THEMES = {
  expired: {
    emoji: "🫧",
    label: "温柔告别",
    zh: "该和它们说再见啦",
    bgSoft: "#fbeee7",
    bgDeep: "#f4d9cd",
    tape: "#f2c0a8",
    text: "#8c4a38",
    accent: "#c2684a",
    glow: "rgba(194, 104, 74, 0.14)",
    sprig: "✿",
  },
  expiring: {
    emoji: "🍯",
    label: "优先享用",
    zh: "正好是吃掉它们的时候",
    bgSoft: "#fbefd6",
    bgDeep: "#f4e0ad",
    tape: "#f0d79b",
    text: "#8a6420",
    accent: "#d9a441",
    glow: "rgba(217, 164, 65, 0.14)",
    sprig: "❀",
  },
  lowStock: {
    emoji: "🌿",
    label: "记得补货",
    zh: "是时候把它们加进购物清单",
    bgSoft: "#e8f0de",
    bgDeep: "#cfe0be",
    tape: "#c2d6ac",
    text: "#4d6b48",
    accent: "#7a9b7a",
    glow: "rgba(122, 155, 122, 0.14)",
    sprig: "❦",
  },
} as const;

type SectionThemeKey = keyof typeof SECTION_THEMES;

// —— 治愈风可复用装饰件 —— //

// 手绘波浪分割线（SVG 内联，邮件客户端绝大多数支持）
function wavyDivider(color: string, width = 240): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="12" viewBox="0 0 ${width} 12" style="display:block;">
      <path d="M0 6 Q 15 0, 30 6 T 60 6 T 90 6 T 120 6 T 150 6 T 180 6 T 210 6 T ${width} 6"
        fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>
    </svg>
  `.trim();
}

// 手写感下划线（一条微微起伏、末端向上翘的线）
function scribbleUnderline(color: string, width = 140): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="10" viewBox="0 0 ${width} 10" style="display:block;">
      <path d="M2 7 Q ${width * 0.25} 2, ${width * 0.5} 6 T ${width - 6} 4"
        fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
    </svg>
  `.trim();
}

// 圆点虚线分割（笔记本穿孔质感）
function dottedLine(color: string, width = 300): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="4" viewBox="0 0 ${width} 4" style="display:block;">
      <line x1="0" y1="2" x2="${width}" y2="2" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 6" opacity="0.5"/>
    </svg>
  `.trim();
}

// 小叶子枝桠 —— 右下角装饰
function leafSprig(color: string): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42" style="display:block;">
      <g fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" opacity="0.6">
        <path d="M6 36 Q 20 30, 34 12"/>
        <path d="M14 30 Q 18 28, 20 22 Q 14 24, 14 30 Z" fill="${color}" fill-opacity="0.22"/>
        <path d="M22 22 Q 26 20, 28 14 Q 22 16, 22 22 Z" fill="${color}" fill-opacity="0.22"/>
        <path d="M28 16 Q 32 14, 34 8 Q 28 10, 28 16 Z" fill="${color}" fill-opacity="0.22"/>
      </g>
    </svg>
  `.trim();
}

// 胶带片（washi tape），使用 HTML 即可，支持旋转
function washiTape(color: string, rotate: number, widthPx = 78): string {
  return `
    <span style="display:inline-block; width:${widthPx}px; height:18px; background:${color}; background-image:linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.06) 100%); opacity:0.86; transform:rotate(${rotate}deg); -ms-transform:rotate(${rotate}deg); box-shadow:0 1px 3px rgba(120,95,70,0.12); border-radius:1px; vertical-align:middle;"></span>
  `.trim();
}

function formatExpiryHtml(
  item: ReminderItemView,
  themeKey: SectionThemeKey = "expiring",
): string {
  const displayName = item.brand ? `${item.brand} ${item.name}` : item.name;
  const daysLeft = item.daysLeft ?? 0;

  const badgeText =
    item.daysLeft === null
      ? "日期未知"
      : daysLeft < 0
        ? `过期 ${Math.abs(daysLeft)} 天`
        : daysLeft === 0
          ? "今天到期"
          : `还有 ${daysLeft} 天`;

  const theme = SECTION_THEMES[themeKey];

  // AI 便签：便利贴风格，右上折角，轻微旋转
  const aiTipHtml = item.aiTip
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
         <tr>
           <td>
             <div style="position:relative; padding:14px 16px 14px 18px; background:${theme.bgSoft}; background-image:linear-gradient(180deg, ${theme.bgSoft} 0%, #fffdf7 100%); border-radius:3px 12px 12px 12px; transform:rotate(-0.6deg); -ms-transform:rotate(-0.6deg); box-shadow:2px 3px 0 ${theme.glow}, 0 2px 10px rgba(120,95,70,0.06);">
               <div style="font-size:11px; color:${theme.text}; opacity:0.65; letter-spacing:2px; margin-bottom:4px;">
                 ${escapeHtml(theme.sprig)}&nbsp;&nbsp;囤囤鼠碎碎念
               </div>
               <p style="margin:0; color:#5e5349; font-size:13.5px; line-height:1.85; font-style:italic; letter-spacing:.2px; font-family:'Kaiti SC','STKaiti','Noto Serif SC','Songti SC',Georgia,serif;">
                 ${escapeHtml(item.aiTip)}
               </p>
             </div>
           </td>
         </tr>
       </table>`
    : "";

  // 物品卡：左侧"笔记本穿孔"点状边 + 圆角 + 轻微投影 + 右下叶子
  return `
    <tr>
      <td style="padding:8px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffdf7; background-image:radial-gradient(circle at 18px 24px, ${theme.accent}33 1.5px, transparent 2px), radial-gradient(circle at 18px 50px, ${theme.accent}33 1.5px, transparent 2px), radial-gradient(circle at 18px 76px, ${theme.accent}33 1.5px, transparent 2px); border-radius:18px; box-shadow:0 1px 0 ${theme.glow}, 0 4px 14px rgba(120, 95, 70, 0.06);">
          <tr>
            <td style="padding:20px 22px 20px 42px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="font-size:15.5px; font-weight:600; color:#3f3832; letter-spacing:.3px; line-height:1.45;">
                      ${escapeHtml(displayName)}
                    </div>
                    <div style="margin-top:5px; font-size:12.5px; color:#9c8d7c; letter-spacing:.3px;">
                      家里还有 ${item.quantity} ${escapeHtml(item.unit)}
                    </div>
                  </td>
                  <td style="vertical-align:middle; text-align:right; white-space:nowrap;">
                    <span style="display:inline-block; padding:6px 14px; background:${theme.bgDeep}; color:${theme.text}; font-size:12px; font-weight:600; border-radius:999px; letter-spacing:.3px; transform:rotate(2deg); -ms-transform:rotate(2deg); box-shadow:0 2px 0 ${theme.glow};">
                      ${escapeHtml(badgeText)}
                    </span>
                  </td>
                </tr>
              </table>
              ${aiTipHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `.trim();
}

function formatStockHtml(item: ReminderItemView): string {
  const displayName = item.brand ? `${item.brand} ${item.name}` : item.name;
  const isEmpty = item.quantity === 0;
  const badgeText = isEmpty ? "已经无了" : `仅剩 ${item.quantity} ${item.unit}`;
  const theme = SECTION_THEMES.lowStock;

  const aiTipHtml = item.aiTip
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
         <tr>
           <td>
             <div style="position:relative; padding:14px 16px 14px 18px; background:${theme.bgSoft}; background-image:linear-gradient(180deg, ${theme.bgSoft} 0%, #fffdf7 100%); border-radius:3px 12px 12px 12px; transform:rotate(-0.6deg); -ms-transform:rotate(-0.6deg); box-shadow:2px 3px 0 ${theme.glow}, 0 2px 10px rgba(120,95,70,0.06);">
               <div style="font-size:11px; color:${theme.text}; opacity:0.65; letter-spacing:2px; margin-bottom:4px;">
                 ${escapeHtml(theme.sprig)}&nbsp;&nbsp;囤囤鼠碎碎念
               </div>
               <p style="margin:0; color:#5e5349; font-size:13.5px; line-height:1.85; font-style:italic; letter-spacing:.2px; font-family:'Kaiti SC','STKaiti','Noto Serif SC','Songti SC',Georgia,serif;">
                 ${escapeHtml(item.aiTip)}
               </p>
             </div>
           </td>
         </tr>
       </table>`
    : "";

  return `
    <tr>
      <td style="padding:8px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffdf7; background-image:radial-gradient(circle at 18px 24px, ${theme.accent}33 1.5px, transparent 2px), radial-gradient(circle at 18px 50px, ${theme.accent}33 1.5px, transparent 2px), radial-gradient(circle at 18px 76px, ${theme.accent}33 1.5px, transparent 2px); border-radius:18px; box-shadow:0 1px 0 ${theme.glow}, 0 4px 14px rgba(120, 95, 70, 0.06);">
          <tr>
            <td style="padding:20px 22px 20px 42px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="font-size:15.5px; font-weight:600; color:#3f3832; letter-spacing:.3px; line-height:1.45;">
                      ${escapeHtml(displayName)}
                    </div>
                    <div style="margin-top:5px; font-size:12.5px; color:#9c8d7c; letter-spacing:.3px;">
                      记得加进购物清单
                    </div>
                  </td>
                  <td style="vertical-align:middle; text-align:right; white-space:nowrap;">
                    <span style="display:inline-block; padding:6px 14px; background:${theme.bgDeep}; color:${theme.text}; font-size:12px; font-weight:600; border-radius:999px; letter-spacing:.3px; transform:rotate(-2deg); -ms-transform:rotate(-2deg); box-shadow:0 2px 0 ${theme.glow};">
                      ${escapeHtml(badgeText)}
                    </span>
                  </td>
                </tr>
              </table>
              ${aiTipHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `.trim();
}

function toTextSummary(input: {
  appName: string;
  daysBefore: number;
  expiringItems: ReminderItemView[];
  expiredItems: ReminderItemView[];
  lowStockItems: ReminderItemView[];
  editorNote: string;
}): string {
  const dateLabel = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const hour = new Date().getHours();
  const greeting =
    hour < 6
      ? "夜深了，屋子里一切都好"
      : hour < 11
        ? "早上好呀"
        : hour < 14
          ? "午后时光"
          : hour < 18
            ? "下午好"
            : hour < 22
              ? "晚上好"
              : "夜色温柔";

  const lines: string[] = [
    "🏠 A Letter From Home",
    `${greeting}，囤囤鼠有些小事想告诉你。`,
    dateLabel,
    "",
    "· · · · · · · · · · · · · · · · · ·",
    "",
    `🐹 ${input.editorNote}`,
    "",
    "· · · · · · · · · · · · · · · · · ·",
    "",
  ];

  const pushSection = (
    emoji: string,
    title: string,
    subtitle: string,
    items: ReminderItemView[],
    formatter: (item: ReminderItemView) => string,
  ) => {
    if (items.length === 0) return;
    lines.push(`${emoji}  ${title} · ${items.length} 件`);
    lines.push(`   ${subtitle}`);
    lines.push("");
    items.slice(0, 20).forEach((item) => {
      lines.push(formatter(item));
      lines.push("");
    });
    if (items.length > 20) {
      lines.push(`   · 还有 ${items.length - 20} 样静静等你 ·`);
      lines.push("");
    }
  };

  pushSection(
    "🫧",
    "该温柔告别",
    "和它们说再见吧",
    input.expiredItems,
    formatExpiryLine,
  );
  pushSection(
    "🍯",
    "优先享用",
    "正好是吃掉它们的时候",
    input.expiringItems,
    formatExpiryLine,
  );
  pushSection(
    "🌿",
    "记得补货",
    "是时候把它们加进购物清单",
    input.lowStockItems,
    formatStockLine,
  );

  lines.push("· · · · · · · · · · · · · · · · · ·");
  lines.push("");
  lines.push("囤货多是一件美事啊");
  lines.push(`${input.appName} · 来自囤囤鼠的手写信 · 请勿直接回复`);

  return lines.join("\n");
}

function toHtmlSummary(input: {
  appName: string;
  daysBefore: number;
  expiringItems: ReminderItemView[];
  expiredItems: ReminderItemView[];
  lowStockItems: ReminderItemView[];
  dashboardUrl?: string;
  editorNote: string;
}): string {
  const renderExpired = input.expiredItems
    .slice(0, 20)
    .map((item) => formatExpiryHtml(item, "expired"))
    .join("");

  const renderExpiring = input.expiringItems
    .slice(0, 20)
    .map((item) => formatExpiryHtml(item, "expiring"))
    .join("");

  const renderLowStock = input.lowStockItems
    .slice(0, 20)
    .map((item) => formatStockHtml(item))
    .join("");

  const now = new Date();
  const dateLabel = now.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const dayNum = now.getDate();
  const monthShort = now.toLocaleDateString("en-US", { month: "short" });
  const weekdayShort = now.toLocaleDateString("zh-CN", { weekday: "short" });

  // 按当前小时给一句温柔的问候
  const hour = now.getHours();
  const greeting =
    hour < 6
      ? "夜深了，屋子里一切都好"
      : hour < 11
        ? "早上好呀"
        : hour < 14
          ? "午后时光"
          : hour < 18
            ? "下午好"
            : hour < 22
              ? "晚上好"
              : "夜色温柔";

  // —— 分区标题：扇贝边 + 斜贴胶带 + 手写下划线 —— //
  const renderSection = (opts: {
    themeKey: SectionThemeKey;
    title: string;
    count: number;
    body: string;
    overflow: number;
    idx: number;
  }) => {
    const theme = SECTION_THEMES[opts.themeKey];
    const tilt = opts.idx % 2 === 0 ? -1.2 : 1.2; // 交替轻微旋转

    return `
      <tr>
        <td style="padding:0 30px;">
          <!-- 分区标题：贴纸风 -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:36px 0 14px 0;">
            <tr>
              <td>
                <!-- 顶部装饰：washi 胶带 + 枝桠 -->
                <div style="text-align:center; margin-bottom:10px; line-height:1;">
                  ${washiTape(theme.tape, -6, 64)}
                  <span style="display:inline-block; margin:0 10px; font-size:16px; color:${theme.accent}; opacity:.75; vertical-align:middle;">${escapeHtml(theme.sprig)}</span>
                  ${washiTape(theme.tape, 6, 64)}
                </div>

                <!-- 扇贝卡（用扇贝 SVG 边） -->
                <div style="position:relative; padding:22px 24px 18px 24px; background:${theme.bgSoft}; background-image:linear-gradient(135deg, ${theme.bgSoft} 0%, ${theme.bgDeep} 100%); border-radius:22px; transform:rotate(${tilt}deg); -ms-transform:rotate(${tilt}deg); box-shadow:0 6px 20px rgba(120,95,70,0.08), inset 0 0 0 1px rgba(255,253,247,0.5);">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <div style="font-size:11px; color:${theme.text}; letter-spacing:6px; opacity:.62; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                          ${escapeHtml(theme.label)}
                        </div>
                        <div style="margin-top:6px; font-size:22px; font-weight:700; color:${theme.text}; letter-spacing:1.5px; font-family:'Kaiti SC','STKaiti','Noto Serif SC','Songti SC',Georgia,serif;">
                          ${escapeHtml(theme.emoji)}&nbsp;&nbsp;${escapeHtml(opts.title)}
                        </div>
                        <!-- 手写下划线 -->
                        <div style="margin-top:4px; margin-left:30px;">
                          ${scribbleUnderline(theme.accent, 120)}
                        </div>
                        <div style="margin-top:8px; font-size:12.5px; color:${theme.text}; opacity:.72; font-style:italic;">
                          ${escapeHtml(theme.zh)}
                        </div>
                      </td>
                      <td style="vertical-align:middle; text-align:right; white-space:nowrap; width:90px;">
                        <!-- 邮票/日历贴纸风的计数 -->
                        <div style="display:inline-block; width:72px; height:72px; background:#fffdf7; border:1.5px dashed ${theme.accent}66; border-radius:50%; text-align:center; box-shadow:0 4px 12px ${theme.glow}; transform:rotate(${-tilt * 3}deg); -ms-transform:rotate(${-tilt * 3}deg);">
                          <div style="padding-top:14px; font-size:28px; font-weight:700; color:${theme.text}; line-height:1; font-family:'Kaiti SC','STKaiti','Playfair Display',Georgia,serif;">
                            ${opts.count}
                          </div>
                          <div style="margin-top:4px; font-size:10.5px; color:${theme.text}; opacity:.6; letter-spacing:2px;">件</div>
                        </div>
                      </td>
                    </tr>
                  </table>
                </div>
              </td>
            </tr>
          </table>

          <!-- 分区内容 -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            ${opts.body}
          </table>

          ${
            opts.overflow > 0
              ? `<div style="margin:8px 0 4px 0; text-align:center;">
                   ${dottedLine(theme.accent + "aa", 180)}
                   <div style="margin-top:8px; color:${theme.text}; opacity:.65; font-size:12px; letter-spacing:.6px; font-style:italic; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                     还有 ${opts.overflow} 样静静等你
                   </div>
                 </div>`
              : ""
          }

          <!-- 分区间波浪分隔 -->
          <div style="margin:24px auto 0 auto; text-align:center;">
            ${wavyDivider(theme.accent + "55", 160)}
          </div>
        </td>
      </tr>
    `;
  };

  const sections: string[] = [];

  if (input.expiredItems.length > 0) {
    sections.push(
      renderSection({
        themeKey: "expired",
        title: "该说再见了",
        count: input.expiredItems.length,
        body: renderExpired,
        overflow: Math.max(0, input.expiredItems.length - 20),
        idx: sections.length,
      }),
    );
  }

  if (input.expiringItems.length > 0) {
    sections.push(
      renderSection({
        themeKey: "expiring",
        title: "优先享用",
        count: input.expiringItems.length,
        body: renderExpiring,
        overflow: Math.max(0, input.expiringItems.length - 20),
        idx: sections.length,
      }),
    );
  }

  if (input.lowStockItems.length > 0) {
    sections.push(
      renderSection({
        themeKey: "lowStock",
        title: "记得补货",
        count: input.lowStockItems.length,
        body: renderLowStock,
        overflow: Math.max(0, input.lowStockItems.length - 20),
        idx: sections.length,
      }),
    );
  }

  // —— 数据一览：拍立得风格三连 —— //
  const polaroid = (
    value: number,
    label: string,
    emoji: string,
    tape: string,
    color: string,
    bgSoft: string,
    rotate: number,
  ) => `
    <td style="width:33.33%; padding:10px 6px; vertical-align:top;">
      <div style="position:relative; background:#fffdf7; padding:14px 10px 18px 10px; border-radius:10px; box-shadow:0 6px 16px rgba(120,95,70,0.1), 0 1px 0 rgba(255,253,247,0.8) inset; transform:rotate(${rotate}deg); -ms-transform:rotate(${rotate}deg);">
        <!-- 顶部胶带贴纸 -->
        <div style="text-align:center; margin-top:-22px; margin-bottom:4px; line-height:1;">
          ${washiTape(tape, rotate * 4, 52)}
        </div>
        <!-- 内框：像照片一样 -->
        <div style="padding:14px 6px 10px 6px; background:${bgSoft}; border-radius:6px;">
          <div style="font-size:22px; line-height:1;">${emoji}</div>
          <div style="margin-top:10px; font-size:30px; font-weight:700; color:${color}; line-height:1; font-family:'Kaiti SC','STKaiti','Playfair Display',Georgia,serif;">
            ${value}
          </div>
        </div>
        <!-- 底部手写 label（像拍立得下方手写字） -->
        <div style="margin-top:10px; text-align:center; font-size:12.5px; color:${color}; opacity:.8; letter-spacing:2px; font-family:'Kaiti SC','STKaiti','Noto Serif SC',Georgia,serif;">
          ${escapeHtml(label)}
        </div>
      </div>
    </td>
  `;

  const stats = `
    <tr>
      <td style="padding:14px 22px 0 22px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            ${polaroid(
              input.expiredItems.length,
              "温柔告别",
              SECTION_THEMES.expired.emoji,
              SECTION_THEMES.expired.tape,
              SECTION_THEMES.expired.text,
              SECTION_THEMES.expired.bgSoft,
              -2,
            )}
            ${polaroid(
              input.expiringItems.length,
              "优先享用",
              SECTION_THEMES.expiring.emoji,
              SECTION_THEMES.expiring.tape,
              SECTION_THEMES.expiring.text,
              SECTION_THEMES.expiring.bgSoft,
              1.5,
            )}
            ${polaroid(
              input.lowStockItems.length,
              "记得补货",
              SECTION_THEMES.lowStock.emoji,
              SECTION_THEMES.lowStock.tape,
              SECTION_THEMES.lowStock.text,
              SECTION_THEMES.lowStock.bgSoft,
              -1,
            )}
          </tr>
        </table>
      </td>
    </tr>
  `;

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(input.appName)} · 囤囤鼠的碎碎念</title>
</head>
<body style="margin:0; padding:0; background:#f6efe4; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif; color:#3f3832;">
  <!-- 外层：斜线阳光光晕 + 淡淡网格 -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6efe4; background-image: radial-gradient(at 8% 0%, #fbeadc 0%, transparent 42%), radial-gradient(at 90% 8%, #f1e6cf 0%, transparent 38%), radial-gradient(at 50% 100%, #e7efd9 0%, transparent 40%), radial-gradient(circle at center, #d8c4a5 0.6px, transparent 1px); background-size: auto, auto, auto, 24px 24px; padding:36px 16px;">
    <tr>
      <td align="center">

        <!-- 主"纸"：一张日记页 -->
        <table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px; background:#fffdf7; background-image:linear-gradient(180deg, rgba(255,253,247,0) 0px, rgba(255,253,247,0) 47px, rgba(216,196,165,0.14) 48px, rgba(255,253,247,0) 49px); background-size:100% 48px; border-radius:6px; box-shadow:0 20px 60px rgba(120, 95, 70, 0.14), 0 4px 12px rgba(120, 95, 70, 0.08), inset 22px 0 0 #fffdf7, inset 24px 0 0 rgba(232, 133, 138, 0.38), inset 26px 0 0 rgba(232, 133, 138, 0.38), inset 28px 0 0 #fffdf7; position:relative; overflow:hidden;">

          <!-- 顶部三条 washi 胶带装饰（左/中/右） -->
          <tr>
            <td style="padding:0; height:0; line-height:0; font-size:0;">
              <div style="height:0; position:relative; text-align:left; padding:0 0 0 60px;">
                <div style="display:inline-block; margin-top:-6px; line-height:1;">
                  ${washiTape(SECTION_THEMES.expiring.tape, -8, 120)}
                </div>
              </div>
              <div style="height:0; position:relative; text-align:right; padding:0 40px 0 0; margin-top:-14px;">
                <div style="display:inline-block; margin-top:-6px; line-height:1;">
                  ${washiTape(SECTION_THEMES.lowStock.tape, 7, 96)}
                </div>
              </div>
            </td>
          </tr>

          <!-- 顶部：问候 + 日历贴纸 -->
          <tr>
            <td style="padding:56px 44px 20px 60px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:top;">
                    <div style="font-size:11px; color:#a58864; letter-spacing:6px; text-transform:uppercase; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                      A Letter From Home
                    </div>
                    <div style="margin-top:14px; font-size:30px; font-weight:700; color:#5a4734; line-height:1.35; letter-spacing:1.5px; font-family:'Kaiti SC','STKaiti','Noto Serif SC','Songti SC','Source Han Serif CN',Georgia,serif;">
                      ${escapeHtml(greeting)}，<br/>
                      囤囤鼠有些小事想告诉你
                    </div>
                    <!-- 手写下划线 -->
                    <div style="margin-top:6px;">
                      ${scribbleUnderline("#c2684a", 220)}
                    </div>
                    <div style="margin-top:14px; font-size:12.5px; color:#8b7456; letter-spacing:1px; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                      ${escapeHtml(dateLabel)}
                    </div>
                  </td>
                  <td style="vertical-align:top; text-align:right; width:108px;">
                    <!-- 日历贴纸：Polaroid 味 -->
                    <div style="display:inline-block; position:relative; transform:rotate(4deg); -ms-transform:rotate(4deg);">
                      <div style="text-align:center; margin-bottom:-4px; line-height:1;">
                        ${washiTape("#f2c0a8", -14, 56)}
                      </div>
                      <div style="width:82px; background:#fffdf7; padding:10px 8px 12px 8px; border-radius:6px; box-shadow:0 6px 14px rgba(165,136,100,0.2);">
                        <div style="background:#c2684a; color:#fffdf7; font-size:10px; letter-spacing:3px; padding:3px 0; border-radius:4px 4px 0 0; text-transform:uppercase; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                          ${escapeHtml(monthShort)}
                        </div>
                        <div style="font-size:36px; font-weight:700; color:#5a4734; line-height:1.1; margin-top:6px; font-family:'Kaiti SC','STKaiti','Playfair Display',Georgia,serif;">
                          ${dayNum}
                        </div>
                        <div style="font-size:10px; color:#b59973; letter-spacing:2px; margin-top:2px;">
                          ${escapeHtml(weekdayShort)}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- 波浪分割线 + 中间一枝叶 -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                <tr>
                  <td style="text-align:center; vertical-align:middle;">
                    <span style="display:inline-block; vertical-align:middle;">${wavyDivider("#d8c4a5", 200)}</span>
                    <span style="display:inline-block; vertical-align:middle; margin:0 10px; font-size:14px; color:#b59973;">✦</span>
                    <span style="display:inline-block; vertical-align:middle;">${wavyDivider("#d8c4a5", 200)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 囤囤鼠便签 · 真·sticky note -->
          <tr>
            <td style="padding:6px 44px 6px 60px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <!-- 顶部夹子效果：小胶带 -->
                    <div style="text-align:center; margin-bottom:-8px; line-height:1;">
                      ${washiTape("#f0d79b", -3, 84)}
                    </div>
                    <div style="position:relative; padding:28px 26px 24px 26px; background:#fff7de; background-image:linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 35%), linear-gradient(180deg, rgba(255,253,247,0) 0px, rgba(255,253,247,0) 31px, rgba(216,196,165,0.2) 32px, rgba(255,253,247,0) 33px); background-size:100%, 100% 32px; border-radius:4px 4px 16px 16px; box-shadow:0 10px 24px rgba(165,136,100,0.15), inset 0 0 0 1px rgba(255,255,255,0.35); transform:rotate(-0.4deg); -ms-transform:rotate(-0.4deg);">
                      <!-- 小标签 -->
                      <div style="display:inline-block; padding:4px 14px; background:#fbeadc; color:#a5734b; font-size:13px; font-weight:600; letter-spacing:2px; border-radius:999px; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                        ✿ &nbsp;囤囤鼠的便签
                      </div>
                      <p style="margin:16px 0 0 0; font-size:15.5px; color:#4b3f32; line-height:2; font-family:'Kaiti SC','STKaiti','Noto Serif SC','Songti SC','Source Han Serif CN',Georgia,serif; letter-spacing:.6px;">
                        ${escapeHtml(input.editorNote)}
                      </p>
                      <div style="margin-top:14px; text-align:right; font-size:13px; color:#b59973; letter-spacing:1px; font-style:italic; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                        — 属鼠 🐹
                      </div>

                      <!-- 右下角叶子枝桠 -->
                      <div style="position:absolute; right:10px; bottom:6px; opacity:.6;">
                        ${leafSprig("#b59973")}
                      </div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 拍立得统计三连 -->
          ${stats}

          <!-- 正文分区 -->
          ${sections.join("")}

          <!-- CTA：印章式圆形 + 手写下划线 -->
          ${
            input.dashboardUrl
              ? `<tr>
                   <td style="padding:44px 40px 12px 40px; text-align:center;">
                     <div style="margin-bottom:14px;">
                       ${wavyDivider("#d8c4a5", 180)}
                     </div>
                     <a href="${input.dashboardUrl}" style="display:inline-block; padding:7px 22px; background:linear-gradient(135deg, #c2684a 0%, #a85535 100%); color:#fffdf7; text-decoration:none; font-size:15px; font-weight:700; letter-spacing:1px; border-radius:999px; box-shadow:0 8px 20px rgba(194, 104, 74, 0.32), inset 0 -3px 0 rgba(0,0,0,0.08); font-family:'Kaiti SC','STKaiti','Noto Serif SC',Georgia,serif;">
                       🏡 &nbsp;前排围观
                     </a>
                     <div style="margin-top:14px; font-size:12.5px; color:#b59973; letter-spacing:1px; font-style:italic; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                       点一下，属鼠带你去现场
                     </div>
                   </td>
                 </tr>`
              : ""
          }

          <!-- 页脚：手账式 -->
          <tr>
            <td style="padding:30px 40px 10px 60px;">
              <div style="text-align:center;">
                ${dottedLine("#d8c4a5", 360)}
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:12px 44px 40px 60px; text-align:center;">
              <div style="display:inline-block; margin-bottom:10px; font-size:14px; color:#b59973; letter-spacing:4px;">
                ✿ &nbsp; ❀ &nbsp; ❦
              </div>
              <p style="margin:0; font-size:13px; color:#8b7e6f; line-height:1.9; font-family:'Kaiti SC','STKaiti','Noto Serif SC','Songti SC',Georgia,serif;">
                今天也是囤货的一天～
              </p>
              <p style="margin:10px 0 0 0; font-size:11px; color:#b6a898; letter-spacing:1.5px; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                ${escapeHtml(input.appName)} · 来自囤囤鼠的手写信 · 请勿直接回复
              </p>
            </td>
          </tr>

        </table>

        <!-- 纸下方的"邮票"印章 -->
        <div style="margin-top:20px; display:inline-block; position:relative;">
          <div style="display:inline-block; margin-top:-6px; line-height:1;">
            ${washiTape("#c2d6ac", -4, 54)}
          </div>
          <div style="display:inline-block; margin-left:-36px; vertical-align:middle;"></div>
        </div>
        <div style="margin-top:-2px; display:inline-block; padding:8px 18px; background:#fffdf7; border-radius:3px; font-size:11px; color:#7a9b7a; letter-spacing:3px; box-shadow:0 2px 8px rgba(120, 95, 70, 0.08), inset 0 0 0 1.5px rgba(122,155,122,0.35); font-family:'Kaiti SC','STKaiti','Noto Serif SC',Georgia,serif;">
          🌿 &nbsp; MADE WITH CARE AT HOME &nbsp; 🌿
        </div>
      </td>
    </tr>
  </table>
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
  const [expiredTips, expiringTips, lowStockTips, editorNote] =
    await Promise.all([
      generateAiTipsForItems(expiredItems, "expired"),
      generateAiTipsForItems(expiringItems, "expiring"),
      generateAiTipsForItems(lowStockItems, "lowStock"),
      generateEditorNote({
        expiredCount: expiredItems.length,
        expiringCount: expiringItems.length,
        lowStockCount: lowStockItems.length,
      }),
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
      const creativeConfig = {
        ...aiConfig,
        temperature: 1.0,
        maxTokens: 200,
      };

      const titleStyles = pickRandomStyles(2).join("、");
      const titleSeed = Math.random().toString(36).slice(2, 10).toUpperCase();
      const nowLabel = new Date().toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      });

      const titlePrompt = `你是一个幽默风趣抽象的家庭管家助手"囤囤鼠"。请为库存提醒邮件生成一个幽默、有梗、吸引人的标题。

当前库存情况：${summarySubject.join("，")}

【本次随机指令】
- 生成时间：${nowLabel}
- 变化种子：${titleSeed}（每次不同，请产出与历史不同的全新标题）
- 本次风格倾向：${titleStyles}
- 不要复用示例中的任何原句，只参考语气

要求：
1. 标题要简短，15-25字
2. 要幽默、有梗、抽象，但不要太离谱
3. 可以用网络流行语、谐音梗、夸张手法
4. 语气要像朋友发消息，轻松活泼
5. 可以用 emoji 但不要太多（最多2个）
6. 不要出现"标题："等前缀，直接输出标题内容

示例风格（仅示意语气，禁止照抄）：
- 报～前方囤囤鼠传来急报～
- 🚨 你的冰箱发来了求救信号
- 警告！有东西要造反了
- 囤囤鼠请求支援：库存告急！
- 你的食物们在召唤你
- 快醒醒！有些东西等不及了
- 你的保质期在偷偷倒计时
- 🧊 冰箱里的"居民"有话说
- 紧急通知：你的库存正在"蒸发"

请直接输出标题，不要其他内容：`;

      const titleResponse = await adapter.chat(
        [{ role: "user", content: titlePrompt }],
        creativeConfig,
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
    editorNote,
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
    editorNote,
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
