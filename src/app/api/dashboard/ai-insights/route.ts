import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth/authorization";
import { AuthError } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db/client";
import { getAiConfig, getAiAdapter } from "@/lib/ai/index";
import { AiMessage } from "@/lib/ai/types";

export const runtime = "edge";

interface ItemRecord {
  id: string;
  name: string;
  brand: string | null;
  quantity: number;
  unit: string | null;
  expiry_date: string | null;
  category: string | null;
  location: string | null;
  status: string;
}

function daysUntil(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const target = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function extractJSON(content: string): unknown {
  let cleaned = content.trim();
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
    }
    throw new Error("无法解析 AI 响应");
  }
}

export async function POST(request: Request) {
  try {
    await requireActiveUser(request);

    const db = getDb();
    const aiConfig = await getAiConfig(db);

    if (!aiConfig) {
      return NextResponse.json(
        { error: "AI 功能未启用或未配置。", code: "AI_NOT_CONFIGURED" },
        { status: 400 },
      );
    }

    // 获取所有在库物资
    const result = await db
      .prepare(
        `SELECT i.id,
                i.name,
                i.brand,
                i.quantity,
                i.unit,
                i.expiry_date,
                c.name AS category,
                l.name AS location,
                i.status
         FROM items i
         LEFT JOIN categories c ON c.id = CAST(i.category AS INTEGER)
         LEFT JOIN locations l ON l.id = CAST(i.location AS INTEGER)
         WHERE i.status = 'active'
         ORDER BY i.expiry_date ASC NULLS LAST, i.quantity ASC
         LIMIT 100`,
      )
      .bind()
      .all<ItemRecord>();

    const items = result.results;

    if (items.length === 0) {
      return NextResponse.json({
        data: {
          healthScore: 100,
          summary: "库存空空如也，快去添加一些物资吧！",
          alerts: [],
          suggestions: [],
          highlights: [],
          generatedAt: new Date().toISOString(),
        },
      });
    }

    // 构建物资摘要给 AI
    const now = new Date();
    const itemsSummary = items.map((item) => {
      const days = daysUntil(item.expiry_date);
      const daysText =
        days === null
          ? "无保质期"
          : days < 0
            ? `已过期 ${Math.abs(days)} 天`
            : days === 0
              ? "今天到期"
              : `还有 ${days} 天到期`;

      return `- ${item.name}${item.brand ? `（${item.brand}）` : ""}：库存 ${item.quantity} ${item.unit ?? "件"}，${daysText}，分类：${item.category ?? "未分类"}，位置：${item.location ?? "未知"}`;
    });

    const expiredCount = items.filter((i) => {
      const d = daysUntil(i.expiry_date);
      return d !== null && d < 0;
    }).length;

    const warningCount = items.filter((i) => {
      const d = daysUntil(i.expiry_date);
      return d !== null && d >= 0 && d <= 30;
    }).length;

    const lowStockCount = items.filter((i) => i.quantity <= 1).length;

    const systemPrompt = `你是一个专业的家庭库存管理 AI 助手，风格幽默、接地气，善用网络热梗，但不失专业。
你需要分析用户的家庭库存数据，给出健康评分和智能建议。

今天日期：${now.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}

返回严格的 JSON 格式（不要有任何额外文字）：
{
  "healthScore": 85,
  "summary": "一句话总结库存整体状况，幽默风趣",
  "alerts": [
    {
      "type": "expired|expiring|low_stock",
      "level": "critical|warning|info",
      "itemName": "物品名称",
      "message": "具体提醒，幽默但实用",
      "action": "建议操作"
    }
  ],
  "suggestions": [
    "整体建议1（字符串）",
    "整体建议2",
    "整体建议3"
  ],
  "highlights": [
    {
      "emoji": "🎉",
      "text": "亮点或好消息"
    }
  ]
}

规则：
- healthScore：0-100，综合考虑过期、临期、库存不足情况
- alerts：最多返回 6 条，优先级：已过期 > 临期 > 库存不足
- suggestions：3-4 条整体建议
- highlights：0-2 条正面信息（如果有的话）
- 语气要像朋友聊天，可以用"主公"、"囤囤鼠"等项目特色称呼`;

    const userPrompt = `当前库存共 ${items.length} 件物资，其中：
- 已过期：${expiredCount} 件
- 30天内临期：${warningCount} 件  
- 库存不足（≤1）：${lowStockCount} 件

详细清单：
${itemsSummary.slice(0, 50).join("\n")}
${items.length > 50 ? `\n（还有 ${items.length - 50} 件未列出）` : ""}

请分析并给出库存健康报告。`;

    const messages: AiMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const adapter = getAiAdapter(aiConfig.provider);
    const response = await adapter.chat(messages, {
      ...aiConfig,
      maxTokens: 1500,
      temperature: 0.7,
    });

    const parsed = extractJSON(response.content) as {
      healthScore: number;
      summary: string;
      alerts: Array<{
        type: string;
        level: string;
        itemName: string;
        message: string;
        action: string;
      }>;
      suggestions: string[];
      highlights: Array<{ emoji: string; text: string }>;
    };

    return NextResponse.json({
      data: {
        healthScore: Math.min(100, Math.max(0, parsed.healthScore ?? 75)),
        summary: parsed.summary ?? "AI 正在思考中...",
        alerts: (parsed.alerts ?? []).slice(0, 6),
        suggestions: (parsed.suggestions ?? []).slice(0, 4),
        highlights: (parsed.highlights ?? []).slice(0, 2),
        generatedAt: new Date().toISOString(),
        provider: aiConfig.provider,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    console.error("[POST /api/dashboard/ai-insights]", error);

    const message =
      error instanceof Error ? error.message : "AI 分析失败，请稍后重试。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
