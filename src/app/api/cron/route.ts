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

interface SectionCopy {
  kicker: string; // 小字眉头，如 "FAREWELL"
  title: string; // 分区主标题
  subtitle: string; // 分区副标题
}

/**
 * 邮件全文文案包 —— 所有可见文字都由 AI 动态生成（诙谐幽默 / 吐槽达人风），
 * 不写死。仅在 AI 失败时回退到 FALLBACK_COPY。
 */
interface EmailCopyPack {
  subject: string; // 邮件标题
  kicker: string; // 顶部英文小字眉头
  greeting: string; // 顶部问候语
  heroTitle: string; // 主标题（可含一个 \n 换行）
  editorNote: string; // 囤囤鼠便签正文
  signature: string; // 便签署名，如 "— 属鼠 🐹"
  healthHeadline: string; // 健康度概览大字结论
  healthSummary: string; // 健康度概览补充说明
  top3Title: string; // TOP3 区块标题
  top3Intro: string; // TOP3 区块引导语
  tipTitle: string; // 小贴士标题
  tip: string; // 小贴士 / 行动建议正文
  ctaText: string; // CTA 按钮文字
  ctaSubtext: string; // CTA 下方小字
  footer: string; // 页脚一句话
  stampText: string; // 底部"邮票"印章文字（英文短语）
  sections: {
    expired: SectionCopy;
    expiring: SectionCopy;
    lowStock: SectionCopy;
  };
}

const FALLBACK_COPY: EmailCopyPack = {
  subject: "报～ 前方囤囤鼠发来急报",
  kicker: "A LETTER FROM HOME",
  greeting: "嘿，老大",
  heroTitle: "囤囤鼠巡逻完毕\n有几件小事得跟你唠唠",
  editorNote:
    "翻了翻你的橱柜和冰箱，有些选手快不行了，有些已经凉了。不急，先看完这封信再说。",
  signature: "— 属鼠 🐹",
  healthHeadline: "家里库存，体检报告出炉",
  healthSummary: "整体还行，就是有几个小情况需要你抬抬手。",
  top3Title: "今日最该出手的三位",
  top3Intro: "其他的可以缓缓，这三位真的等不起了。",
  tipTitle: "囤囤鼠的小锦囊",
  tip: "临期的先吃、缺货的顺手补、过期的果断扔，三连击搞定，今天就清爽。",
  ctaText: "🏡 去现场看看",
  ctaSubtext: "点一下，属鼠带你直达库存现场",
  footer: "今天也是被囤囤鼠惦记的一天～",
  stampText: "MADE WITH CARE AT HOME",
  sections: {
    expired: {
      kicker: "FAREWELL",
      title: "该说再见了",
      subtitle: "它们陪你走了一程，是时候温柔告别",
    },
    expiring: {
      kicker: "EAT ME FIRST",
      title: "优先享用",
      subtitle: "正好是把它们消灭掉的最佳时机",
    },
    lowStock: {
      kicker: "RESTOCK",
      title: "记得补货",
      subtitle: "顺手加进购物清单，别等到断粮",
    },
  },
};

// 从 AI 返回内容中稳健地提取 JSON 对象（兼容 ```json 围栏 / 前后多余文字）
function extractJsonObject(raw: string): unknown {
  const text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("响应中未找到 JSON 对象");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function pickString(value: unknown, fallback: string, max = 200): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().replace(/^["「『]/, "").replace(/["」』]$/, "");
  if (!trimmed || trimmed.length > max) return fallback;
  return trimmed;
}

function mergeSectionCopy(value: unknown, fallback: SectionCopy): SectionCopy {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    kicker: pickString(v.kicker, fallback.kicker, 40),
    title: pickString(v.title, fallback.title, 40),
    subtitle: pickString(v.subtitle, fallback.subtitle, 60),
  };
}

/**
 * 一次性生成整封邮件的全部文案（标题、问候、各分区标题、便签、健康度、TOP3、贴士、页脚……）。
 * 全部诙谐幽默、吐槽达人风，每次随机不同。失败时回退 FALLBACK_COPY。
 */
async function generateCopyPack(input: {
  appName: string;
  expiredCount: number;
  expiringCount: number;
  lowStockCount: number;
  healthScore: number;
  topPreview: string[]; // 最紧急物品的简短描述，供 AI 点名吐槽
}): Promise<EmailCopyPack> {
  try {
    const db = getDb();
    const aiConfig = await getAiConfig(db);
    if (!aiConfig) return FALLBACK_COPY;

    const adapter = getAiAdapter(aiConfig.provider);
    const creativeConfig = {
      ...aiConfig,
      temperature: 1.0,
      maxTokens: Math.max(aiConfig.maxTokens || 2000, 1600),
    };

    const totalCount =
      input.expiredCount + input.expiringCount + input.lowStockCount;

    const situationParts: string[] = [];
    if (input.expiredCount > 0)
      situationParts.push(`${input.expiredCount} 样已经过期`);
    if (input.expiringCount > 0)
      situationParts.push(`${input.expiringCount} 样即将过期`);
    if (input.lowStockCount > 0)
      situationParts.push(`${input.lowStockCount} 样库存告急`);
    const situation = situationParts.join("，") || "一切安好";

    const styles = pickRandomStyles(3).join("、");
    const seed = Math.random().toString(36).slice(2, 10).toUpperCase();
    const nowLabel = new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
    });
    const topPreview =
      input.topPreview.length > 0
        ? input.topPreview.map((t, i) => `${i + 1}. ${t}`).join("\n")
        : "（暂无特别紧急的）";

    const prompt = `你是"囤囤鼠"，一只住在主人家、嘴碎又贴心的仓鼠管家。你要给主人写一封家庭库存提醒邮件，我会用你的文案去渲染一封吉卜力治愈风的精美邮件。请你一次性产出邮件里所有需要的文字。

【家里现在的情况】
- 概况：${situation}（共 ${totalCount} 件需要关注）
- 库存健康分：${input.healthScore} / 100（越低越糟）
- 最紧急的几位（可以点名吐槽，但别编造不存在的物品）：
${topPreview}

【本次随机指令】
- 生成时间：${nowLabel}
- 变化种子：${seed}（每次都要产出与历史完全不同的文案）
- 风格倾向：${styles}（可混搭）

【整体风格要求】
1. 诙谐幽默、吐槽达人、有梗、有画面感，像损友又像贴心管家
2. 所有字段都要有变化，不要套用模板句式，不要"亲爱的主人"这种俗套，可以叫老大/老板/大哥/打工人等
3. 中文为主，emoji 少量点缀即可（每个字段最多 1 个）
4. 不要出现"第X个""字段名"之类的元信息
5. 严格按下面的 JSON 结构输出，只输出 JSON，不要任何解释或 markdown 围栏

【各字段含义与字数】
- subject：邮件标题，15-25 字，有梗能勾人点开
- kicker：顶部英文小字眉头，2-4 个英文单词全大写（如 "A LETTER FROM HOME"）
- greeting：开场称呼，6-12 字
- heroTitle：主标题，可用一个 \\n 分成两行，总 12-26 字
- editorNote：囤囤鼠便签正文，2-3 句，40-80 字，最口语最好笑的一段
- signature：便签署名，5-12 字，带点角色感（如 "— 你的囤囤鼠 🐹"）
- healthHeadline：库存健康度大字结论，8-16 字，结合健康分调侃
- healthSummary：健康度补充说明，14-28 字
- top3Title：最紧急 TOP3 区块标题，8-16 字
- top3Intro：TOP3 引导语，14-26 字
- tipTitle：小贴士区块标题，6-14 字
- tip：一条实用又好笑的行动建议，20-45 字，要真的有用（如临期搭配、补货节奏、丢弃提醒）
- ctaText：按钮文字，5-12 字，可带 1 个 emoji
- ctaSubtext：按钮下方小字，10-20 字
- footer：页脚一句话，10-20 字，温暖收尾
- stampText：底部邮票印章英文短语，2-4 个英文单词全大写
- sections：三个分区各自的文案，结构为 { expired:{kicker,title,subtitle}, expiring:{...}, lowStock:{...} }
  · expired = 已过期（温柔告别/果断丢弃）
  · expiring = 即将过期（鼓励尽快吃掉用掉）
  · lowStock = 库存不足（提醒补货）
  · 每个分区：kicker 为 2-3 个英文单词全大写；title 主标题 4-8 字；subtitle 副标题 10-22 字

请直接输出 JSON：
{
  "subject": "",
  "kicker": "",
  "greeting": "",
  "heroTitle": "",
  "editorNote": "",
  "signature": "",
  "healthHeadline": "",
  "healthSummary": "",
  "top3Title": "",
  "top3Intro": "",
  "tipTitle": "",
  "tip": "",
  "ctaText": "",
  "ctaSubtext": "",
  "footer": "",
  "stampText": "",
  "sections": {
    "expired": { "kicker": "", "title": "", "subtitle": "" },
    "expiring": { "kicker": "", "title": "", "subtitle": "" },
    "lowStock": { "kicker": "", "title": "", "subtitle": "" }
  }
}`;

    const response = await adapter.chat(
      [{ role: "user", content: prompt }],
      creativeConfig,
    );

    const parsed = extractJsonObject(response.content) as Record<
      string,
      unknown
    >;
    const sections = (parsed.sections ?? {}) as Record<string, unknown>;

    return {
      subject: pickString(parsed.subject, FALLBACK_COPY.subject, 50),
      kicker: pickString(parsed.kicker, FALLBACK_COPY.kicker, 40),
      greeting: pickString(parsed.greeting, FALLBACK_COPY.greeting, 40),
      heroTitle: pickString(parsed.heroTitle, FALLBACK_COPY.heroTitle, 60),
      editorNote: pickString(parsed.editorNote, FALLBACK_COPY.editorNote, 200),
      signature: pickString(parsed.signature, FALLBACK_COPY.signature, 40),
      healthHeadline: pickString(
        parsed.healthHeadline,
        FALLBACK_COPY.healthHeadline,
        40,
      ),
      healthSummary: pickString(
        parsed.healthSummary,
        FALLBACK_COPY.healthSummary,
        80,
      ),
      top3Title: pickString(parsed.top3Title, FALLBACK_COPY.top3Title, 40),
      top3Intro: pickString(parsed.top3Intro, FALLBACK_COPY.top3Intro, 60),
      tipTitle: pickString(parsed.tipTitle, FALLBACK_COPY.tipTitle, 40),
      tip: pickString(parsed.tip, FALLBACK_COPY.tip, 120),
      ctaText: pickString(parsed.ctaText, FALLBACK_COPY.ctaText, 40),
      ctaSubtext: pickString(parsed.ctaSubtext, FALLBACK_COPY.ctaSubtext, 60),
      footer: pickString(parsed.footer, FALLBACK_COPY.footer, 60),
      stampText: pickString(parsed.stampText, FALLBACK_COPY.stampText, 40),
      sections: {
        expired: mergeSectionCopy(
          sections.expired,
          FALLBACK_COPY.sections.expired,
        ),
        expiring: mergeSectionCopy(
          sections.expiring,
          FALLBACK_COPY.sections.expiring,
        ),
        lowStock: mergeSectionCopy(
          sections.lowStock,
          FALLBACK_COPY.sections.lowStock,
        ),
      },
    };
  } catch (error) {
    console.error("[generateCopyPack] AI 文案生成失败:", error);
    return FALLBACK_COPY;
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

// 库存健康分：过期最伤，临期次之，缺货再次；保底 8 分，避免显示过于难看
function computeHealthScore(input: {
  expiredCount: number;
  expiringCount: number;
  lowStockCount: number;
}): number {
  const raw =
    100 -
    input.expiredCount * 9 -
    input.expiringCount * 4 -
    input.lowStockCount * 3;
  return Math.max(8, Math.min(100, Math.round(raw)));
}

// 一件物品在某分类下的状态徽标文字（HTML / 纯文本共用）
function badgeTextFor(item: ReminderItemView, category: SectionThemeKey): string {
  if (category === "lowStock") {
    return item.quantity === 0 ? "已无货" : `仅剩 ${item.quantity}${item.unit}`;
  }
  if (item.daysLeft === null) return "日期未知";
  if (item.daysLeft < 0) return `过期 ${Math.abs(item.daysLeft)} 天`;
  if (item.daysLeft === 0) return "今天到期";
  return `还有 ${item.daysLeft} 天`;
}

interface RankedItem {
  item: ReminderItemView;
  category: SectionThemeKey;
  urgency: number;
}

// 跨三类挑出最紧急的 TOP3：过期 > 临期（越近越急）> 缺货（无货优先）
function selectTopUrgent(
  expired: ReminderItemView[],
  expiring: ReminderItemView[],
  lowStock: ReminderItemView[],
  limit = 3,
): RankedItem[] {
  const ranked: RankedItem[] = [
    ...expired.map((item) => ({
      item,
      category: "expired" as SectionThemeKey,
      urgency: 1000 + Math.abs(item.daysLeft ?? 0),
    })),
    ...expiring.map((item) => ({
      item,
      category: "expiring" as SectionThemeKey,
      urgency: 500 - (item.daysLeft ?? 0),
    })),
    ...lowStock.map((item) => ({
      item,
      category: "lowStock" as SectionThemeKey,
      urgency: 100 + (item.quantity === 0 ? 50 : 0),
    })),
  ];

  return ranked.sort((a, b) => b.urgency - a.urgency).slice(0, limit);
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

// 吉卜力治愈系配色 —— 天空蓝 / 草地绿 / 奶油白为底，三类各取一段柔和色温
// label / zh 仅作 AI 文案失败时的兜底，正常情况下由 copyPack 动态生成
const SECTION_THEMES = {
  expired: {
    emoji: "🍂",
    label: "温柔告别",
    zh: "该和它们说再见啦",
    bgSoft: "#fbeae3",
    bgDeep: "#f2cdbf",
    tape: "#eebfae",
    text: "#9a5a44",
    accent: "#d07f63",
    glow: "rgba(208, 127, 99, 0.16)",
    sprig: "❀",
  },
  expiring: {
    emoji: "🌻",
    label: "优先享用",
    zh: "正好是吃掉它们的时候",
    bgSoft: "#fdf1d4",
    bgDeep: "#f7e2a8",
    tape: "#f2d894",
    text: "#8a6420",
    accent: "#e0b24a",
    glow: "rgba(224, 178, 74, 0.16)",
    sprig: "✿",
  },
  lowStock: {
    emoji: "🌱",
    label: "记得补货",
    zh: "是时候把它们加进购物清单",
    bgSoft: "#e7f1d8",
    bgDeep: "#cde0b4",
    tape: "#c0d6a0",
    text: "#4d6b3f",
    accent: "#82ab63",
    glow: "rgba(130, 171, 99, 0.16)",
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

// —— 吉卜力主视觉装饰件 —— //

// 主视觉小仓鼠"囤囤鼠"（内联 SVG 手绘 Q 版，圆滚滚、腮红、捧着一颗种子）
function hamsterSvg(size = 104): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120" style="display:block;">
      <ellipse cx="60" cy="108" rx="34" ry="6" fill="#6b9b54" opacity="0.18"/>
      <g>
        <!-- 耳朵 -->
        <circle cx="36" cy="34" r="13" fill="#e7c9a0"/>
        <circle cx="84" cy="34" r="13" fill="#e7c9a0"/>
        <circle cx="36" cy="34" r="7" fill="#e7a9a0"/>
        <circle cx="84" cy="34" r="7" fill="#e7a9a0"/>
        <!-- 身体 -->
        <ellipse cx="60" cy="64" rx="42" ry="40" fill="#f3dcb6"/>
        <ellipse cx="60" cy="72" rx="27" ry="27" fill="#fff7e8"/>
        <!-- 腮红 -->
        <ellipse cx="34" cy="70" rx="9" ry="6.5" fill="#f6a9a4" opacity="0.55"/>
        <ellipse cx="86" cy="70" rx="9" ry="6.5" fill="#f6a9a4" opacity="0.55"/>
        <!-- 眼睛 -->
        <circle cx="46" cy="58" r="4.6" fill="#4a3a28"/>
        <circle cx="74" cy="58" r="4.6" fill="#4a3a28"/>
        <circle cx="47.4" cy="56.4" r="1.5" fill="#fffef9"/>
        <circle cx="75.4" cy="56.4" r="1.5" fill="#fffef9"/>
        <!-- 鼻子 + 嘴 -->
        <ellipse cx="60" cy="67" rx="3" ry="2.2" fill="#c98b6b"/>
        <path d="M60 69 Q 56 73, 52 70 M60 69 Q 64 73, 68 70" fill="none" stroke="#c98b6b" stroke-width="1.4" stroke-linecap="round"/>
        <!-- 胡须 -->
        <g stroke="#d8b88a" stroke-width="1.2" stroke-linecap="round" opacity="0.8">
          <path d="M30 62 L 16 59 M30 67 L 15 67 M90 62 L 104 59 M90 67 L 105 67"/>
        </g>
        <!-- 小手捧种子 -->
        <ellipse cx="60" cy="92" rx="7" ry="5.5" fill="#c79a5c"/>
        <circle cx="48" cy="92" r="6" fill="#f3dcb6"/>
        <circle cx="72" cy="92" r="6" fill="#f3dcb6"/>
      </g>
    </svg>
  `.trim();
}

// 柔和云朵
function cloudSvg(width = 96, color = "#fffefb"): string {
  const h = Math.round(width * 0.58);
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 96 56" style="display:block;">
      <g fill="${color}">
        <circle cx="30" cy="34" r="20"/>
        <circle cx="54" cy="26" r="24"/>
        <circle cx="76" cy="36" r="17"/>
        <rect x="22" y="38" width="58" height="16" rx="8"/>
      </g>
    </svg>
  `.trim();
}

// 暖阳光晕
function sunSvg(size = 70): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 70 70" style="display:block;">
      <circle cx="35" cy="35" r="16" fill="#f7d488"/>
      <g stroke="#f3c569" stroke-width="3" stroke-linecap="round" opacity="0.85">
        <path d="M35 6 L35 14 M35 56 L35 64 M6 35 L14 35 M56 35 L64 35 M14 14 L20 20 M50 50 L56 56 M56 14 L50 20 M14 56 L20 50"/>
      </g>
    </svg>
  `.trim();
}

// 一排起伏的草地小山丘（页眉底边）
function hillSvg(width = 620, color = "#bcdc98", deep = "#9cc47f"): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="46" viewBox="0 0 620 46" preserveAspectRatio="none" style="display:block;">
      <path d="M0 46 L0 26 Q 90 4, 190 22 Q 300 42, 410 18 Q 520 -2, 620 24 L620 46 Z" fill="${color}"/>
      <path d="M0 46 L0 34 Q 120 18, 250 32 Q 400 48, 520 30 Q 580 22, 620 32 L620 46 Z" fill="${deep}" opacity="0.85"/>
    </svg>
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
  copy: EmailCopyPack;
  healthScore: number;
  topUrgent: RankedItem[];
  expiringItems: ReminderItemView[];
  expiredItems: ReminderItemView[];
  lowStockItems: ReminderItemView[];
}): string {
  const { copy } = input;
  const dateLabel = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const lines: string[] = [
    `🏠 ${copy.kicker}`,
    `${copy.greeting}，${copy.heroTitle.replace(/\n/g, " ")}`,
    dateLabel,
    "",
    "· · · · · · · · · · · · · · · · · ·",
    "",
    `🐹 ${copy.editorNote}`,
    `   ${copy.signature}`,
    "",
    "· · · · · · · · · · · · · · · · · ·",
    "",
    `📊 ${copy.healthHeadline}（库存健康分 ${input.healthScore}/100）`,
    `   ${copy.healthSummary}`,
    "",
  ];

  if (input.topUrgent.length > 0) {
    lines.push("· · · · · · · · · · · · · · · · · ·");
    lines.push("");
    lines.push(`⭐ ${copy.top3Title}`);
    lines.push(`   ${copy.top3Intro}`);
    lines.push("");
    input.topUrgent.forEach((ranked, idx) => {
      const item = ranked.item;
      const displayName = item.brand
        ? `${item.brand} ${item.name}`
        : item.name;
      lines.push(
        `   ${idx + 1}. ${displayName} —— ${badgeTextFor(item, ranked.category)}`,
      );
      if (item.aiTip) lines.push(`      ❝ ${item.aiTip} ❞`);
    });
    lines.push("");
  }

  lines.push("· · · · · · · · · · · · · · · · · ·");
  lines.push("");

  const pushSection = (
    emoji: string,
    section: SectionCopy,
    items: ReminderItemView[],
    formatter: (item: ReminderItemView) => string,
  ) => {
    if (items.length === 0) return;
    lines.push(`${emoji}  ${section.title} · ${items.length} 件`);
    lines.push(`   ${section.subtitle}`);
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
    SECTION_THEMES.expired.emoji,
    copy.sections.expired,
    input.expiredItems,
    formatExpiryLine,
  );
  pushSection(
    SECTION_THEMES.expiring.emoji,
    copy.sections.expiring,
    input.expiringItems,
    formatExpiryLine,
  );
  pushSection(
    SECTION_THEMES.lowStock.emoji,
    copy.sections.lowStock,
    input.lowStockItems,
    formatStockLine,
  );

  lines.push("· · · · · · · · · · · · · · · · · ·");
  lines.push("");
  lines.push(`💡 ${copy.tipTitle}`);
  lines.push(`   ${copy.tip}`);
  lines.push("");
  lines.push("· · · · · · · · · · · · · · · · · ·");
  lines.push("");
  lines.push(copy.footer);
  lines.push(`${input.appName} · 来自囤囤鼠的手写信 · 请勿直接回复`);

  return lines.join("\n");
}

function toHtmlSummary(input: {
  appName: string;
  copy: EmailCopyPack;
  healthScore: number;
  topUrgent: RankedItem[];
  expiringItems: ReminderItemView[];
  expiredItems: ReminderItemView[];
  lowStockItems: ReminderItemView[];
  dashboardUrl?: string;
}): string {
  const { copy } = input;

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

  const heroTitleHtml = escapeHtml(copy.heroTitle).replace(/\n/g, "<br/>");

  // —— 页眉吉卜力天空场景：暖阳 + 云朵 + 小仓鼠 + 草坡 —— //
  const heroScene = `
    <tr>
      <td style="padding:0;">
        <div style="position:relative; background:linear-gradient(180deg, #bfe3f2 0%, #d8eef7 45%, #eef8f3 100%); padding:26px 0 0 0; text-align:center;">
          <!-- 暖阳（左上） -->
          <div style="position:absolute; left:26px; top:18px; opacity:.9;">
            ${sunSvg(58)}
          </div>
          <!-- 云朵（右上 / 左中） -->
          <div style="position:absolute; right:30px; top:22px; opacity:.95;">
            ${cloudSvg(92)}
          </div>
          <div style="position:absolute; left:64px; top:74px; opacity:.8;">
            ${cloudSvg(64)}
          </div>
          <!-- 主视觉小仓鼠 -->
          <div style="position:relative; display:inline-block; padding-top:6px;">
            ${hamsterSvg(112)}
          </div>
          <!-- 草坡底边 -->
          <div style="line-height:0; margin-top:-6px;">
            ${hillSvg(620)}
          </div>
        </div>
      </td>
    </tr>
  `;

  // —— 标题区：眉头 + 问候/主标题 + 手账日历贴纸 —— //
  const headerBlock = `
    <tr>
      <td style="padding:22px 44px 4px 48px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="vertical-align:top;">
              <div style="font-size:11px; color:#6b9b54; letter-spacing:5px; text-transform:uppercase; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                ${escapeHtml(copy.kicker)}
              </div>
              <div style="margin-top:12px; font-size:27px; font-weight:700; color:#4a6b3e; line-height:1.4; letter-spacing:1px; font-family:'Kaiti SC','STKaiti','Noto Serif SC','Songti SC','Source Han Serif CN',Georgia,serif;">
                ${escapeHtml(copy.greeting)}，<br/>${heroTitleHtml}
              </div>
              <div style="margin-top:6px;">
                ${scribbleUnderline("#82ab63", 210)}
              </div>
              <div style="margin-top:13px; font-size:12.5px; color:#7d9a6a; letter-spacing:1px; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                ${escapeHtml(dateLabel)}
              </div>
            </td>
            <td style="vertical-align:top; text-align:right; width:104px;">
              <div style="display:inline-block; position:relative; transform:rotate(4deg); -ms-transform:rotate(4deg);">
                <div style="text-align:center; margin-bottom:-4px; line-height:1;">
                  ${washiTape("#a9d3ea", -14, 56)}
                </div>
                <div style="width:80px; background:#fffef9; padding:9px 8px 11px 8px; border-radius:7px; box-shadow:0 6px 14px rgba(108,142,92,0.22);">
                  <div style="background:#7aa85f; color:#fffef9; font-size:10px; letter-spacing:3px; padding:3px 0; border-radius:5px 5px 0 0; text-transform:uppercase; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                    ${escapeHtml(monthShort)}
                  </div>
                  <div style="font-size:34px; font-weight:700; color:#4a6b3e; line-height:1.1; margin-top:6px; font-family:'Kaiti SC','STKaiti','Playfair Display',Georgia,serif;">
                    ${dayNum}
                  </div>
                  <div style="font-size:10px; color:#9bb487; letter-spacing:2px; margin-top:2px;">
                    ${escapeHtml(weekdayShort)}
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // —— 库存健康度概览：体检报告卡 + 进度条 —— //
  const score = input.healthScore;
  const healthAccent =
    score >= 75 ? "#7aa85f" : score >= 45 ? "#e0b24a" : "#d07f63";
  const healthBg =
    score >= 75 ? "#e7f1d8" : score >= 45 ? "#fdf1d4" : "#fbeae3";
  const healthBlock = `
    <tr>
      <td style="padding:24px 30px 4px 30px;">
        <div style="position:relative; padding:20px 22px; background:${healthBg}; background-image:linear-gradient(135deg, rgba(255,254,249,0.6) 0%, rgba(255,254,249,0) 60%); border-radius:20px; box-shadow:0 6px 18px rgba(108,142,92,0.1), inset 0 0 0 1px rgba(255,254,249,0.55);">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align:middle;">
                <div style="font-size:11px; color:${healthAccent}; letter-spacing:4px; text-transform:uppercase; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                  HOME HEALTH
                </div>
                <div style="margin-top:6px; font-size:18px; font-weight:700; color:#4a4034; letter-spacing:.5px; font-family:'Kaiti SC','STKaiti','Noto Serif SC','Songti SC',Georgia,serif;">
                  ${escapeHtml(copy.healthHeadline)}
                </div>
                <div style="margin-top:6px; font-size:12.5px; color:#6f6450; line-height:1.7;">
                  ${escapeHtml(copy.healthSummary)}
                </div>
              </td>
              <td style="vertical-align:middle; text-align:right; width:96px; white-space:nowrap;">
                <div style="display:inline-block; text-align:center;">
                  <span style="font-size:42px; font-weight:700; color:${healthAccent}; line-height:1; font-family:'Kaiti SC','STKaiti','Playfair Display',Georgia,serif;">${score}</span>
                  <span style="font-size:14px; color:${healthAccent}; opacity:.7;"> /100</span>
                </div>
              </td>
            </tr>
          </table>
          <!-- 进度条 -->
          <div style="margin-top:14px; height:10px; background:rgba(255,254,249,0.8); border-radius:999px; box-shadow:inset 0 1px 3px rgba(108,142,92,0.18); overflow:hidden;">
            <div style="width:${score}%; height:10px; background:linear-gradient(90deg, ${healthAccent} 0%, ${healthAccent}cc 100%); border-radius:999px;"></div>
          </div>
        </div>
      </td>
    </tr>
  `;

  // —— 最紧急 TOP3 置顶 —— //
  const renderTop3Card = (ranked: RankedItem, idx: number) => {
    const theme = SECTION_THEMES[ranked.category];
    const item = ranked.item;
    const displayName = item.brand
      ? `${item.brand} ${item.name}`
      : item.name;
    const badge = badgeTextFor(item, ranked.category);
    const tilt = idx % 2 === 0 ? -0.8 : 0.8;
    return `
      <tr>
        <td style="padding:7px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffef9; border-radius:16px; box-shadow:0 4px 14px ${theme.glow}, inset 0 0 0 1.5px ${theme.bgDeep}; transform:rotate(${tilt}deg); -ms-transform:rotate(${tilt}deg);">
            <tr>
              <td style="width:54px; padding:16px 0 16px 16px; vertical-align:middle;">
                <div style="width:38px; height:38px; background:${theme.bgDeep}; color:${theme.text}; border-radius:50%; text-align:center; line-height:38px; font-size:18px; font-weight:700; box-shadow:0 2px 0 ${theme.glow}; font-family:'Kaiti SC','STKaiti','Playfair Display',Georgia,serif;">
                  ${idx + 1}
                </div>
              </td>
              <td style="padding:14px 18px 14px 12px; vertical-align:middle;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <div style="font-size:15px; font-weight:600; color:#3f3832; letter-spacing:.3px;">
                        ${escapeHtml(displayName)}
                      </div>
                    </td>
                    <td style="vertical-align:middle; text-align:right; white-space:nowrap;">
                      <span style="display:inline-block; padding:5px 12px; background:${theme.bgDeep}; color:${theme.text}; font-size:11.5px; font-weight:600; border-radius:999px; letter-spacing:.3px;">
                        ${escapeHtml(theme.emoji)} ${escapeHtml(badge)}
                      </span>
                    </td>
                  </tr>
                </table>
                ${
                  item.aiTip
                    ? `<div style="margin-top:8px; font-size:12.5px; color:#6f6450; line-height:1.7; font-style:italic; font-family:'Kaiti SC','STKaiti','Noto Serif SC','Songti SC',Georgia,serif;">❝ ${escapeHtml(item.aiTip)} ❞</div>`
                    : ""
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  };

  const top3Block =
    input.topUrgent.length > 0
      ? `
    <tr>
      <td style="padding:26px 30px 4px 30px;">
        <div style="text-align:center; margin-bottom:10px; line-height:1;">
          ${washiTape("#f2d894", -5, 60)}
          <span style="display:inline-block; margin:0 8px; font-size:15px; color:#e0b24a; vertical-align:middle;">⭐</span>
          ${washiTape("#f2d894", 5, 60)}
        </div>
        <div style="text-align:center;">
          <div style="font-size:20px; font-weight:700; color:#5a4734; letter-spacing:1px; font-family:'Kaiti SC','STKaiti','Noto Serif SC','Songti SC',Georgia,serif;">
            ${escapeHtml(copy.top3Title)}
          </div>
          <div style="margin-top:6px; font-size:12.5px; color:#8b7456; font-style:italic;">
            ${escapeHtml(copy.top3Intro)}
          </div>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
          ${input.topUrgent.map((r, i) => renderTop3Card(r, i)).join("")}
        </table>
      </td>
    </tr>
  `
      : "";

  // —— 分区标题：贴纸风（由 copy.sections 动态填充） —— //
  const renderSection = (opts: {
    themeKey: SectionThemeKey;
    section: SectionCopy;
    count: number;
    body: string;
    overflow: number;
    idx: number;
  }) => {
    const theme = SECTION_THEMES[opts.themeKey];
    const tilt = opts.idx % 2 === 0 ? -1.2 : 1.2;

    return `
      <tr>
        <td style="padding:0 30px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:34px 0 14px 0;">
            <tr>
              <td>
                <div style="text-align:center; margin-bottom:10px; line-height:1;">
                  ${washiTape(theme.tape, -6, 64)}
                  <span style="display:inline-block; margin:0 10px; font-size:16px; color:${theme.accent}; opacity:.75; vertical-align:middle;">${escapeHtml(theme.sprig)}</span>
                  ${washiTape(theme.tape, 6, 64)}
                </div>

                <div style="position:relative; padding:22px 24px 18px 24px; background:${theme.bgSoft}; background-image:linear-gradient(135deg, ${theme.bgSoft} 0%, ${theme.bgDeep} 100%); border-radius:22px; transform:rotate(${tilt}deg); -ms-transform:rotate(${tilt}deg); box-shadow:0 6px 20px rgba(108,142,92,0.08), inset 0 0 0 1px rgba(255,254,249,0.5);">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <div style="font-size:11px; color:${theme.text}; letter-spacing:5px; opacity:.6; text-transform:uppercase; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                          ${escapeHtml(opts.section.kicker)}
                        </div>
                        <div style="margin-top:6px; font-size:22px; font-weight:700; color:${theme.text}; letter-spacing:1.5px; font-family:'Kaiti SC','STKaiti','Noto Serif SC','Songti SC',Georgia,serif;">
                          ${escapeHtml(theme.emoji)}&nbsp;&nbsp;${escapeHtml(opts.section.title)}
                        </div>
                        <div style="margin-top:4px; margin-left:30px;">
                          ${scribbleUnderline(theme.accent, 120)}
                        </div>
                        <div style="margin-top:8px; font-size:12.5px; color:${theme.text}; opacity:.72; font-style:italic;">
                          ${escapeHtml(opts.section.subtitle)}
                        </div>
                      </td>
                      <td style="vertical-align:middle; text-align:right; white-space:nowrap; width:90px;">
                        <div style="display:inline-block; width:72px; height:72px; background:#fffef9; border:1.5px dashed ${theme.accent}66; border-radius:50%; text-align:center; box-shadow:0 4px 12px ${theme.glow}; transform:rotate(${-tilt * 3}deg); -ms-transform:rotate(${-tilt * 3}deg);">
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
        section: copy.sections.expired,
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
        section: copy.sections.expiring,
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
        section: copy.sections.lowStock,
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
      <div style="position:relative; background:#fffef9; padding:14px 10px 18px 10px; border-radius:10px; box-shadow:0 6px 16px rgba(108,142,92,0.1), 0 1px 0 rgba(255,254,249,0.8) inset; transform:rotate(${rotate}deg); -ms-transform:rotate(${rotate}deg);">
        <div style="text-align:center; margin-top:-22px; margin-bottom:4px; line-height:1;">
          ${washiTape(tape, rotate * 4, 52)}
        </div>
        <div style="padding:14px 6px 10px 6px; background:${bgSoft}; border-radius:6px;">
          <div style="font-size:22px; line-height:1;">${emoji}</div>
          <div style="margin-top:10px; font-size:30px; font-weight:700; color:${color}; line-height:1; font-family:'Kaiti SC','STKaiti','Playfair Display',Georgia,serif;">
            ${value}
          </div>
        </div>
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
              copy.sections.expired.title,
              SECTION_THEMES.expired.emoji,
              SECTION_THEMES.expired.tape,
              SECTION_THEMES.expired.text,
              SECTION_THEMES.expired.bgSoft,
              -2,
            )}
            ${polaroid(
              input.expiringItems.length,
              copy.sections.expiring.title,
              SECTION_THEMES.expiring.emoji,
              SECTION_THEMES.expiring.tape,
              SECTION_THEMES.expiring.text,
              SECTION_THEMES.expiring.bgSoft,
              1.5,
            )}
            ${polaroid(
              input.lowStockItems.length,
              copy.sections.lowStock.title,
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

  // —— 囤囤鼠便签 —— //
  const editorNoteBlock = `
    <tr>
      <td style="padding:6px 44px 6px 48px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
              <div style="text-align:center; margin-bottom:-8px; line-height:1;">
                ${washiTape("#f0d79b", -3, 84)}
              </div>
              <div style="position:relative; padding:26px 26px 24px 26px; background:#fff7de; background-image:linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 35%); border-radius:4px 4px 16px 16px; box-shadow:0 10px 24px rgba(165,136,100,0.15), inset 0 0 0 1px rgba(255,255,255,0.35); transform:rotate(-0.4deg); -ms-transform:rotate(-0.4deg);">
                <div style="display:inline-block; padding:4px 14px; background:#eaf3df; color:#5e7c4c; font-size:13px; font-weight:600; letter-spacing:2px; border-radius:999px; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                  🐹 &nbsp;囤囤鼠的便签
                </div>
                <p style="margin:16px 0 0 0; font-size:15.5px; color:#4b3f32; line-height:2; font-family:'Kaiti SC','STKaiti','Noto Serif SC','Songti SC','Source Han Serif CN',Georgia,serif; letter-spacing:.6px;">
                  ${escapeHtml(copy.editorNote)}
                </p>
                <div style="margin-top:14px; text-align:right; font-size:13px; color:#9bb487; letter-spacing:1px; font-style:italic; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                  ${escapeHtml(copy.signature)}
                </div>
                <div style="position:absolute; right:10px; bottom:6px; opacity:.6;">
                  ${leafSprig("#9bb487")}
                </div>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // —— 小贴士 / 行动建议 —— //
  const tipBlock = `
    <tr>
      <td style="padding:30px 30px 4px 30px;">
        <div style="position:relative; padding:18px 20px 18px 22px; background:#eef6e6; background-image:linear-gradient(135deg, #eef6e6 0%, #e2efd2 100%); border-radius:16px 4px 16px 16px; box-shadow:0 5px 16px rgba(108,142,92,0.12), inset 0 0 0 1px rgba(255,254,249,0.5);">
          <div style="font-size:12px; color:#5e7c4c; letter-spacing:2px; font-weight:600; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
            💡 &nbsp;${escapeHtml(copy.tipTitle)}
          </div>
          <p style="margin:8px 0 0 0; font-size:14px; color:#4d6b3f; line-height:1.85; letter-spacing:.3px; font-family:'Kaiti SC','STKaiti','Noto Serif SC','Songti SC',Georgia,serif;">
            ${escapeHtml(copy.tip)}
          </p>
        </div>
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
<body style="margin:0; padding:0; background:#eaf6fb; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif; color:#3f3832;">
  <!-- 外层：天空 + 云霞光晕 -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eaf6fb; background-image: radial-gradient(at 12% 0%, #fdf3d6 0%, transparent 38%), radial-gradient(at 88% 4%, #cfe9f6 0%, transparent 40%), radial-gradient(at 50% 100%, #e3f1d6 0%, transparent 42%); padding:34px 16px;">
    <tr>
      <td align="center">

        <!-- 主卡片 -->
        <table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px; background:#fffef9; border-radius:22px; box-shadow:0 22px 60px rgba(96, 128, 80, 0.16), 0 4px 14px rgba(96, 128, 80, 0.08); overflow:hidden;">

          <!-- 页眉天空场景 -->
          ${heroScene}

          <!-- 标题区 -->
          ${headerBlock}

          <!-- 库存健康度概览 -->
          ${healthBlock}

          <!-- 最紧急 TOP3 -->
          ${top3Block}

          <!-- 囤囤鼠便签 -->
          ${editorNoteBlock}

          <!-- 拍立得统计三连 -->
          ${stats}

          <!-- 正文分区 -->
          ${sections.join("")}

          <!-- 小贴士 -->
          ${tipBlock}

          <!-- CTA -->
          ${
            input.dashboardUrl
              ? `<tr>
                   <td style="padding:36px 40px 12px 40px; text-align:center;">
                     <div style="margin-bottom:14px;">
                       ${wavyDivider("#bcdc98", 180)}
                     </div>
                     <a href="${input.dashboardUrl}" style="display:inline-block; padding:9px 26px; background:linear-gradient(135deg, #7aa85f 0%, #5e8a46 100%); color:#fffef9; text-decoration:none; font-size:15px; font-weight:700; letter-spacing:1px; border-radius:999px; box-shadow:0 8px 20px rgba(108, 142, 92, 0.32), inset 0 -3px 0 rgba(0,0,0,0.08); font-family:'Kaiti SC','STKaiti','Noto Serif SC',Georgia,serif;">
                       ${escapeHtml(copy.ctaText)}
                     </a>
                     <div style="margin-top:14px; font-size:12.5px; color:#9bb487; letter-spacing:1px; font-style:italic; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                       ${escapeHtml(copy.ctaSubtext)}
                     </div>
                   </td>
                 </tr>`
              : ""
          }

          <!-- 页脚 -->
          <tr>
            <td style="padding:28px 40px 10px 48px;">
              <div style="text-align:center;">
                ${dottedLine("#cfe0be", 360)}
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:12px 44px 36px 48px; text-align:center;">
              <div style="display:inline-block; margin-bottom:10px; font-size:14px; color:#9bb487; letter-spacing:4px;">
                ✿ &nbsp; ❀ &nbsp; ❦
              </div>
              <p style="margin:0; font-size:13px; color:#6f7a63; line-height:1.9; font-family:'Kaiti SC','STKaiti','Noto Serif SC','Songti SC',Georgia,serif;">
                ${escapeHtml(copy.footer)}
              </p>
              <p style="margin:10px 0 0 0; font-size:11px; color:#a6b69a; letter-spacing:1.5px; font-family:'Kaiti SC','STKaiti',Georgia,serif;">
                ${escapeHtml(input.appName)} · 来自囤囤鼠的手写信 · 请勿直接回复
              </p>
            </td>
          </tr>

        </table>

        <!-- 卡片下方"邮票"印章 -->
        <div style="margin-top:20px; display:inline-block;">
          <div style="display:inline-block; margin-top:-6px; line-height:1;">
            ${washiTape("#c2d6ac", -4, 54)}
          </div>
        </div>
        <div style="margin-top:-2px; display:inline-block; padding:8px 18px; background:#fffef9; border-radius:3px; font-size:11px; color:#5e8a46; letter-spacing:3px; box-shadow:0 2px 8px rgba(96, 128, 80, 0.1), inset 0 0 0 1.5px rgba(122,168,95,0.35); font-family:'Kaiti SC','STKaiti','Noto Serif SC',Georgia,serif;">
          🌿 &nbsp; ${escapeHtml(copy.stampText)} &nbsp; 🌿
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

  // 使用 AI 生成每个物品的幽默吐槽文案
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

  // 计算库存健康度 + 跨类挑选最紧急 TOP3
  const healthScore = computeHealthScore({
    expiredCount: expiredItems.length,
    expiringCount: expiringItems.length,
    lowStockCount: lowStockItems.length,
  });
  const topUrgent = selectTopUrgent(expiredItems, expiringItems, lowStockItems);
  const topPreview = topUrgent.map((ranked) => {
    const item = ranked.item;
    const displayName = item.brand ? `${item.brand} ${item.name}` : item.name;
    return `${displayName}（${badgeTextFor(item, ranked.category)}）`;
  });

  // 一次性生成整封邮件的全部文案（标题/问候/分区/便签/健康度/TOP3/贴士/页脚……）
  const copy = await generateCopyPack({
    appName: emailConfig.appName,
    expiredCount: expiredItems.length,
    expiringCount: expiringItems.length,
    lowStockCount: lowStockItems.length,
    healthScore,
    topPreview,
  });

  const subject = copy.subject;
  const text = toTextSummary({
    appName: emailConfig.appName,
    copy,
    healthScore,
    topUrgent,
    expiringItems,
    expiredItems,
    lowStockItems,
  });

  // 获取系统 URL 配置用于"查看详情"按钮
  const dashboardUrl = "https://homebug.uyoahz.cc.cd/dashboard";

  const html = toHtmlSummary({
    appName: emailConfig.appName,
    copy,
    healthScore,
    topUrgent,
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
