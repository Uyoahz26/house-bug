/**
 * AI 智能功能模块
 * 提供过期提醒、采购建议、自然语言查询、食谱推荐等功能
 */

import { AiAdapter, AiConfig, AiMessage } from "./types";
import { PublicItem } from "@/types/item";

/**
 * 从 AI 响应中提取 JSON
 * 处理 markdown 代码块包裹的情况
 */
function extractJSON(content: string): unknown {
  // 移除可能的 markdown 代码块标记
  let cleaned = content.trim();

  // 匹配 ```json ... ``` 或 ``` ... ```
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  // 尝试解析 JSON
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    // 如果解析失败，尝试查找第一个 { 和最后一个 }
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonStr = cleaned.substring(firstBrace, lastBrace + 1);
      return JSON.parse(jsonStr);
    }

    throw error;
  }
}

/**
 * 智能过期提醒结果
 */
export interface SmartExpiryReminder {
  itemId: string;
  itemName: string;
  daysRemaining: number;
  message: string;
  suggestions: string[];
  urgency: "low" | "medium" | "high" | "critical";
}

/**
 * 智能采购建议结果
 */
export interface SmartPurchaseSuggestion {
  itemName: string;
  category: string | null;
  currentStock: number;
  averageConsumptionDays: number;
  suggestedPurchaseDate: string;
  suggestedQuantity: number;
  priceRange: {
    min: number;
    max: number;
    suggested: number;
  } | null;
  reasoning: string;
}

/**
 * 自然语言查询结果
 */
export interface NaturalLanguageQueryResult {
  query: string;
  answer: string;
  relatedItems: Array<{
    id: string;
    name: string;
    quantity: number;
    unit: string;
    location: string | null;
  }>;
  summary: string;
}

/**
 * 智能食谱推荐结果
 */
export interface SmartRecipeRecommendation {
  recipeName: string;
  ingredients: string[];
  expiringIngredients: string[];
  difficulty: "easy" | "medium" | "hard";
  cookingTime: string;
  description: string;
  instructions?: string[];
}

/**
 * 生成智能过期提醒
 */
export async function generateSmartExpiryReminder(
  adapter: AiAdapter,
  config: AiConfig,
  item: PublicItem,
  daysRemaining: number,
  userConsumptionPattern?: {
    averageUsageFrequency: string; // e.g., "每周2次"
    estimatedDaysToFinish: number;
  },
): Promise<SmartExpiryReminder> {
  const systemPrompt = `你是一个智能家庭物资管理助手。你的任务是生成个性化的过期提醒文案。

要求：
1. 语气友好、高级幽默感，可以抽象幽默。谐音梗等网络热梗都可以。
2. 根据剩余天数和使用频率，给出实用建议
3. 如果已经过期，建议尽快处理
4. 保持简洁，不超过100字

返回 JSON 格式：
{
  "message": "提醒文案",
  "suggestions": ["建议1", "建议2" , ....],
  "urgency": "low|medium|high|critical"
}`;

  const userPrompt = `物资信息：
- 名称：${item.name}
- 品牌：${item.brand || "未知"}
- 规格：${item.specification || "未知"}
- 数量：${item.quantity} ${item.unit}
- 剩余天数：${daysRemaining}天${daysRemaining < 0 ? "（已过期）" : ""}
${userConsumptionPattern ? `- 使用频率：${userConsumptionPattern.averageUsageFrequency}\n- 预计用完时间：${userConsumptionPattern.estimatedDaysToFinish}天` : ""}

请生成个性化提醒。`;

  const messages: AiMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const response = await adapter.chat(messages, config);
  const result = extractJSON(response.content) as {
    message: string;
    suggestions: string[];
    urgency: string;
  };

  return {
    itemId: item.id,
    itemName: item.name,
    daysRemaining,
    message: result.message,
    suggestions: result.suggestions || [],
    urgency: result.urgency || "medium",
  } as SmartExpiryReminder;
}

/**
 * 生成智能采购建议
 */
export async function generateSmartPurchaseSuggestion(
  adapter: AiAdapter,
  config: AiConfig,
  itemName: string,
  category: string | null,
  consumptionHistory: Array<{
    date: string;
    quantity: number;
    price?: number;
  }>,
  currentStock: number,
): Promise<SmartPurchaseSuggestion> {
  const systemPrompt = `你是一个智能采购助手。根据用户的历史消费数据，预测最佳采购时机和数量。

要求：
1. 分析消费频率，计算平均多少天用完
2. 根据当前库存，建议何时采购
3. 如果有价格历史，分析价格趋势并给出建议价格
4. 给出清晰的理由说明

返回 JSON 格式：
{
  "averageConsumptionDays": 45,
  "suggestedPurchaseDate": "2026-05-10",
  "suggestedQuantity": 2,
  "priceRange": {
    "min": 15,
    "max": 25,
    "suggested": 20
  },
  "reasoning": "根据您的使用频率..."
}`;

  const historyText = consumptionHistory
    .map(
      (h) =>
        `${h.date}: 消耗 ${h.quantity} 个${h.price ? `，价格 ¥${h.price}` : ""}`,
    )
    .join("\n");

  const userPrompt = `物资信息：
- 名称：${itemName}
- 分类：${category || "未知"}
- 当前库存：${currentStock}

消费历史：
${historyText || "暂无历史数据"}

请分析并给出采购建议。`;

  const messages: AiMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const response = await adapter.chat(messages, config);
  const result = extractJSON(response.content) as {
    averageConsumptionDays: number;
    suggestedPurchaseDate: string;
    suggestedQuantity: number;
    priceRange?: {
      min: number;
      max: number;
      suggested: number;
    };
    reasoning: string;
  };

  return {
    itemName,
    category,
    currentStock,
    averageConsumptionDays: result.averageConsumptionDays || 30,
    suggestedPurchaseDate: result.suggestedPurchaseDate,
    suggestedQuantity: result.suggestedQuantity || 1,
    priceRange: result.priceRange || null,
    reasoning: result.reasoning,
  };
}

/**
 * 自然语言查询
 */
export async function processNaturalLanguageQuery(
  adapter: AiAdapter,
  config: AiConfig,
  query: string,
  allItems: PublicItem[],
): Promise<NaturalLanguageQueryResult> {
  const systemPrompt = `你是一个智能家庭物资查询助手。用户会用自然语言提问，你需要：

1. 理解用户意图（查询数量、位置、过期时间等）
2. 从物资列表中找到相关物资
3. 用友好的语气回答问题
4. 提供清晰的汇总信息

返回 JSON 格式：
{
  "answer": "您家目前有...",
  "relatedItemIds": ["id1", "id2"],
  "summary": "总计约 16.8L 饮用水"
}`;

  const itemsText = allItems
    .map(
      (item) =>
        `ID: ${item.id}, 名称: ${item.name}, 数量: ${item.quantity} ${item.unit}, 位置: ${item.locationName || "未知"}`,
    )
    .join("\n");

  const userPrompt = `用户问题：${query}

物资列表：
${itemsText}

请回答用户的问题。`;

  const messages: AiMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const response = await adapter.chat(messages, config);
  const result = extractJSON(response.content) as {
    answer: string;
    relatedItemIds: string[];
    summary: string;
  };

  const relatedItems = (result.relatedItemIds || [])
    .map((id: string) => allItems.find((item) => item.id === id))
    .filter((item): item is PublicItem => item !== undefined)
    .map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      location: item.locationName,
    }));

  return {
    query,
    answer: result.answer,
    relatedItems,
    summary: result.summary || "",
  };
}

/**
 * 智能食谱推荐
 */
export async function generateSmartRecipeRecommendations(
  adapter: AiAdapter,
  config: AiConfig,
  expiringItems: PublicItem[],
  maxRecipes: number = 3,
): Promise<SmartRecipeRecommendation[]> {
  const systemPrompt = `你是一个智能食谱推荐助手。根据即将过期的食材，推荐合适的食谱。

要求：
1. 优先使用即将过期的食材
2. 推荐简单易做的家常菜
3. 考虑食材搭配的合理性
4. 提供清晰的烹饪步骤

返回 JSON 格式（数组）：
[
  {
    "recipeName": "法式吐司",
    "ingredients": ["鸡蛋", "牛奶", "面包"],
    "expiringIngredients": ["鸡蛋", "牛奶"],
    "difficulty": "easy",
    "cookingTime": "15分钟",
    "description": "简单美味的早餐",
    "instructions": ["步骤1", "步骤2"]
  }
]`;

  const itemsText = expiringItems
    .map(
      (item) =>
        `${item.name}（${item.brand || ""}${item.specification || ""}）- 剩余 ${item.quantity} ${item.unit}`,
    )
    .join("\n");

  const userPrompt = `即将过期的食材：
${itemsText}

请推荐 ${maxRecipes} 个食谱，优先使用这些食材。`;

  const messages: AiMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const response = await adapter.chat(messages, config);
  const recipes = extractJSON(response.content) as
    | SmartRecipeRecommendation
    | SmartRecipeRecommendation[];

  return Array.isArray(recipes) ? recipes : [recipes];
}
