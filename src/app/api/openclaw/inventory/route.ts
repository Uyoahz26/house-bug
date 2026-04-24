import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import {
  getAiConfig,
  getAiAdapter,
  type AiAdapter,
  type AiConfig,
  type AiMessage,
} from "@/lib/ai";
import { processNaturalLanguageQuery } from "@/lib/ai/features";
import {
  listItems,
  toPublicItem,
  getItemById,
  updateItemQuantity,
  updateItemStatus,
} from "@/lib/db/queries/items";
import type { PublicItem } from "@/types/item";

export const runtime = "edge";

interface OpenClawInventoryRequest {
  action: string; // 用户的自然语言指令，如 "我用了一包纸"
  token?: string; // OpenClaw API Token（可选，也可以通过 Header 传递）
}

interface InventoryOperationResult {
  success: boolean;
  message: string;
  operation?: {
    type: "decrease" | "increase" | "query";
    itemName: string;
    itemId: string;
    previousQuantity: number;
    newQuantity: number;
    unit: string;
  };
  items?:
    | PublicItem[]
    | Array<{
        id: string;
        name: string;
        quantity: number;
        unit: string;
        location: string | null;
      }>;
}

/**
 * 验证 OpenClaw API Token
 */
async function validateOpenClawToken(
  request: Request,
): Promise<boolean | string> {
  // 从 Header 或 Body 中获取 token
  const authHeader = request.headers.get("Authorization");
  const headerToken = authHeader?.replace("Bearer ", "");

  const db = getDb();

  // 从系统配置中获取 OpenClaw Token
  const result = await db
    .prepare("SELECT value FROM system_config WHERE key = ?")
    .bind("openclaw.api_token")
    .first<{ value: string }>();

  const configuredToken = result?.value;

  if (!configuredToken) {
    return "OpenClaw 集成未配置，请在系统设置中启用";
  }

  if (headerToken !== configuredToken) {
    return false;
  }

  return true;
}

/**
 * 解析自然语言指令，提取操作类型、物品名称和数量
 */
async function parseInventoryAction(
  action: string,
  adapter: AiAdapter,
  config: AiConfig,
): Promise<{
  type:
    | "decrease"
    | "increase"
    | "query"
    | "query_expired"
    | "query_expiring"
    | "query_location";
  itemName?: string;
  quantity: number;
  location?: string;
  daysThreshold?: number;
}> {
  const systemPrompt = `你是一个智能物资管理助手。解析用户的自然语言指令，提取操作类型、物品名称和数量。如果没有找到用户可能说的物品就说没找到，不要凭空虚构物品，以数据库表中的为准。

操作类型：
- decrease: 减少/消耗/用了/吃了/喝了
- increase: 增加/买了/补充了/添加了
- query: 查询/还有多少/剩余（查询特定物品）
- query_expired: 查询已过期的物品
- query_expiring: 查询即将过期的物品（快过期了/快到期了）
- query_location: 查询特定位置的物品（冰箱里有什么/厨房有哪些）

返回 JSON 格式示例：

减少操作：
{
  "type": "decrease",
  "itemName": "纸",
  "quantity": 1
}

查询特定物品：
{
  "type": "query",
  "itemName": "牛奶",
  "quantity": 0
}

查询已过期：
{
  "type": "query_expired",
  "quantity": 0
}

查询快要过期（默认 30天内）：
{
  "type": "query_expiring",
  "quantity": 0,
  "daysThreshold": 30
}

查询特定位置：
{
  "type": "query_location",
  "location": "冰箱",
  "quantity": 0
}`;

  const userPrompt = `用户指令：${action}

请解析这个指令。`;

  const messages: AiMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const response = await adapter.chat(messages, config);

  // 提取 JSON
  let content = response.content.trim();
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    content = codeBlockMatch[1].trim();
  }

  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    content = content.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(content);
}

/**
 * POST /api/openclaw/inventory
 * OpenClaw 库存操作接口
 */
export async function POST(request: Request) {
  try {
    // 验证 Token
    const tokenValidation = await validateOpenClawToken(request);
    if (tokenValidation !== true) {
      return NextResponse.json(
        {
          error:
            typeof tokenValidation === "string"
              ? tokenValidation
              : "无效的 API Token",
        },
        { status: 401 },
      );
    }

    const db = getDb();

    // 检查 AI 配置
    const aiConfig = await getAiConfig(db);
    if (!aiConfig) {
      return NextResponse.json(
        { error: "AI 功能未启用，OpenClaw 集成需要 AI 支持" },
        { status: 412 },
      );
    }

    const body = (await request.json()) as OpenClawInventoryRequest;
    const { action } = body;

    if (!action || !action.trim()) {
      return NextResponse.json({ error: "操作指令不能为空" }, { status: 400 });
    }

    const adapter = getAiAdapter(aiConfig.provider);

    // 1. 解析用户指令
    const parsedAction = await parseInventoryAction(
      action.trim(),
      adapter,
      aiConfig,
    );

    // 2. 处理查询已过期物品
    if (parsedAction.type === "query_expired") {
      const expiredItems = await listItems(db, {
        status: "expired",
        limit: 1000,
        offset: 0,
      });
      const publicExpiredItems = expiredItems.map((item) => toPublicItem(item));

      if (publicExpiredItems.length === 0) {
        // 使用 AI 生成幽默的无过期物品消息
        const noExpiredPrompt = `生成一条幽默有趣的消息，告诉用户家里没有过期物品。要求：
1. 语言风格像方大同的歌词那样莫名其妙但又很有意境
2. 可以适当使用网络热梗（如"绝绝子"、"yyds"、"栓Q"等）
3. 保持积极正能量
4. 控制在50字以内
5. 只返回消息文本，不要其他内容`;

        const noExpiredMessages: AiMessage[] = [
          { role: "user", content: noExpiredPrompt },
        ];

        const noExpiredResponse = await adapter.chat(
          noExpiredMessages,
          aiConfig,
        );
        const noExpiredMessage = noExpiredResponse.content.trim();

        return NextResponse.json({
          success: true,
          message: noExpiredMessage,
          items: [],
        } as InventoryOperationResult);
      }

      const itemList = publicExpiredItems
        .map(
          (item) =>
            `- ${item.name}${item.brand ? `（${item.brand}）` : ""}：${item.quantity} ${item.unit}，过期日期 ${item.expiryDate}${item.locationName ? `，存放在${item.locationName}` : ""}`,
        )
        .join("\n");

      // 使用 AI 生成幽默的过期物品消息
      const expiredPrompt = `生成一条幽默有趣的消息，告诉用户发现了 ${publicExpiredItems.length} 件过期物品。要求：
1. 语言风格像方大同的歌词那样莫名其妙但又很有意境
2. 可以适当使用网络热梗
3. 要有一点点调侃但不要太过分
4. 开头部分控制在80字以内，然后换行加上物品列表
5. 只返回开头消息文本，不要包含物品列表

物品信息供参考：${publicExpiredItems.map((i) => i.name).join("、")}`;

      const expiredMessages: AiMessage[] = [
        { role: "user", content: expiredPrompt },
      ];

      const expiredResponse = await adapter.chat(expiredMessages, aiConfig);
      const expiredMessage = expiredResponse.content.trim();

      return NextResponse.json({
        success: true,
        message: `${expiredMessage}\n\n${itemList}`,
        items: publicExpiredItems,
      } as InventoryOperationResult);
    }

    // 3. 处理查询即将过期物品
    if (parsedAction.type === "query_expiring") {
      const daysThreshold = parsedAction.daysThreshold || 30;
      const today = new Date();
      const thresholdDate = new Date(today);
      thresholdDate.setDate(today.getDate() + daysThreshold);

      const allActiveItems = await listItems(db, {
        status: "active",
        limit: 1000,
        offset: 0,
      });

      const expiringItems = allActiveItems
        .filter((item) => {
          if (!item.expiry_date) return false;
          const expiryDate = new Date(item.expiry_date);
          return expiryDate >= today && expiryDate <= thresholdDate;
        })
        .map((item) => toPublicItem(item))
        .sort((a, b) => {
          if (!a.expiryDate || !b.expiryDate) return 0;
          return (
            new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
          );
        });

      if (expiringItems.length === 0) {
        // 使用 AI 生成幽默的无即将过期物品消息
        const noExpiringPrompt = `生成一条幽默有趣的消息，告诉用户未来 ${daysThreshold} 天内没有即将过期的物品。要求：
1. 语言风格像方大同的歌词那样莫名其妙但又很有意境
2. 可以适当使用网络热梗
3. 表达一种"岁月静好"的感觉
4. 控制在50字以内
5. 只返回消息文本，不要其他内容`;

        const noExpiringMessages: AiMessage[] = [
          { role: "user", content: noExpiringPrompt },
        ];

        const noExpiringResponse = await adapter.chat(
          noExpiringMessages,
          aiConfig,
        );
        const noExpiringMessage = noExpiringResponse.content.trim();

        return NextResponse.json({
          success: true,
          message: noExpiringMessage,
          items: [],
        } as InventoryOperationResult);
      }

      const itemList = expiringItems
        .map((item) => {
          const daysLeft = Math.ceil(
            (new Date(item.expiryDate!).getTime() - today.getTime()) /
              (1000 * 60 * 60 * 24),
          );
          return `- ${item.name}${item.brand ? `（${item.brand}）` : ""}：${item.quantity} ${item.unit}，还有 ${daysLeft} 天过期${item.locationName ? `，存放在${item.locationName}` : ""}`;
        })
        .join("\n");

      // 使用 AI 生成幽默的即将过期物品消息
      const expiringPrompt = `生成一条幽默有趣的消息，告诉用户发现了 ${expiringItems.length} 件物品将在 ${daysThreshold} 天内过期。要求：
1. 语言风格像方大同的歌词那样莫名其妙但又很有意境
2. 可以适当使用网络热梗
3. 要有紧迫感但不要太焦虑，可以调侃一下
4. 开头部分控制在80字以内，然后换行加上物品列表
5. 只返回开头消息文本，不要包含物品列表

物品信息供参考：${expiringItems.map((i) => i.name).join("、")}`;

      const expiringMessages: AiMessage[] = [
        { role: "user", content: expiringPrompt },
      ];

      const expiringResponse = await adapter.chat(expiringMessages, aiConfig);
      const expiringMessage = expiringResponse.content.trim();

      return NextResponse.json({
        success: true,
        message: `${expiringMessage}\n\n${itemList}`,
        items: expiringItems,
      } as InventoryOperationResult);
    }

    // 4. 处理查询特定位置的物品
    if (parsedAction.type === "query_location" && parsedAction.location) {
      const allItems = await listItems(db, {
        status: "active",
        limit: 1000,
        offset: 0,
      });

      const locationItems = allItems
        .filter(
          (item) =>
            item.location &&
            item.location
              .toLowerCase()
              .includes(parsedAction.location!.toLowerCase()),
        )
        .map((item) => toPublicItem(item));

      if (locationItems.length === 0) {
        // 使用 AI 生成幽默的空位置消息
        const emptyLocationPrompt = `生成一条幽默有趣的消息，告诉用户"${parsedAction.location}"里目前没有物品。要求：
1. 语言风格像方大同的歌词那样莫名其妙但又很有意境
2. 可以适当使用网络热梗
3. 可以调侃一下这个空空如也的状态
4. 控制在50字以内
5. 只返回消息文本，不要其他内容`;

        const emptyLocationMessages: AiMessage[] = [
          { role: "user", content: emptyLocationPrompt },
        ];

        const emptyLocationResponse = await adapter.chat(
          emptyLocationMessages,
          aiConfig,
        );
        const emptyLocationMessage = emptyLocationResponse.content.trim();

        return NextResponse.json({
          success: true,
          message: emptyLocationMessage,
          items: [],
        } as InventoryOperationResult);
      }

      const itemList = locationItems
        .map((item) => {
          let info = `- ${item.name}${item.brand ? `（${item.brand}）` : ""}：${item.quantity} ${item.unit}`;
          if (item.expiryDate) {
            const daysLeft = Math.ceil(
              (new Date(item.expiryDate).getTime() - new Date().getTime()) /
                (1000 * 60 * 60 * 24),
            );
            if (daysLeft < 0) {
              info += `，已过期 ${Math.abs(daysLeft)} 天`;
            } else if (daysLeft <= 7) {
              info += `，还有 ${daysLeft} 天过期`;
            }
          }
          return info;
        })
        .join("\n");

      // 使用 AI 生成幽默的位置物品消息
      const locationPrompt = `生成一条幽默有趣的消息，告诉用户"${parsedAction.location}"里有 ${locationItems.length} 件物品。要求：
1. 语言风格像方大同的歌词那样莫名其妙但又很有意境
2. 可以适当使用网络热梗
3. 可以根据物品数量调侃一下（多了就说"囤货小能手"，少了就说"极简主义"）
4. 开头部分控制在80字以内，然后换行加上物品列表
5. 只返回开头消息文本，不要包含物品列表

物品信息供参考：${locationItems.map((i) => i.name).join("、")}`;

      const locationMessages: AiMessage[] = [
        { role: "user", content: locationPrompt },
      ];

      const locationResponse = await adapter.chat(locationMessages, aiConfig);
      const locationMessage = locationResponse.content.trim();

      return NextResponse.json({
        success: true,
        message: `${locationMessage}\n\n${itemList}`,
        items: locationItems,
      } as InventoryOperationResult);
    }

    // 5. 查询所有物资（用于物品匹配）
    const items = await listItems(db, {
      status: "all",
      limit: 1000,
      offset: 0,
    });
    const publicItems = items.map((item) => toPublicItem(item));

    // 6. 使用 AI 自然语言查询找到匹配的物品
    const queryResult = await processNaturalLanguageQuery(
      adapter,
      aiConfig,
      `查找${parsedAction.itemName}`,
      publicItems,
    );

    if (queryResult.relatedItems.length === 0) {
      return NextResponse.json({
        success: false,
        message: `未找到物品"${parsedAction.itemName}"，请先添加到库存中`,
      } as InventoryOperationResult);
    }

    // 如果只是查询特定物品，直接返回结果
    if (parsedAction.type === "query") {
      return NextResponse.json({
        success: true,
        message: queryResult.answer,
        items: queryResult.relatedItems,
      } as InventoryOperationResult);
    }

    // 7. 更新第一个匹配的物品数量
    const targetItem = queryResult.relatedItems[0];
    const currentItem = await getItemById(db, targetItem.id);

    if (!currentItem) {
      return NextResponse.json({ error: "物品不存在" }, { status: 404 });
    }

    const previousQuantity = Number(currentItem.quantity);
    const delta =
      parsedAction.type === "decrease"
        ? -parsedAction.quantity
        : parsedAction.quantity;
    const newQuantity = Math.max(0, previousQuantity + delta);

    // 更新数量
    await updateItemQuantity(db, {
      id: targetItem.id,
      quantity: newQuantity,
    });

    // 如果数量为 0，更新状态为已消耗
    if (newQuantity === 0 && currentItem.status !== "discarded") {
      await updateItemStatus(db, {
        id: targetItem.id,
        status: "consumed",
      });
    }

    const operationType = parsedAction.type === "decrease" ? "减少" : "增加";

    // 使用 AI 生成幽默的操作结果消息
    const operationPrompt = `生成一条幽默有趣的消息，告诉用户已将"${targetItem.name}"的数量${operationType} ${parsedAction.quantity} ${targetItem.unit}，当前剩余 ${newQuantity} ${targetItem.unit}。要求：
1. 语言风格像方大同的歌词那样莫名其妙但又很有意境
2. 可以适当使用网络热梗
3. 如果数量变为0，要调侃一下"空了"的状态
4. 如果数量很多，可以说"富得流油"之类的
5. 控制在80字以内
6. 只返回消息文本，不要其他内容`;

    const operationMessages: AiMessage[] = [
      { role: "user", content: operationPrompt },
    ];

    const operationResponse = await adapter.chat(operationMessages, aiConfig);
    const message = operationResponse.content.trim();

    return NextResponse.json({
      success: true,
      message,
      operation: {
        type: parsedAction.type,
        itemName: targetItem.name,
        itemId: targetItem.id,
        previousQuantity,
        newQuantity,
        unit: targetItem.unit,
      },
    } as InventoryOperationResult);
  } catch (error) {
    console.error("[POST /api/openclaw/inventory]", error);
    return NextResponse.json(
      {
        success: false,
        message:
          "操作失败：" + (error instanceof Error ? error.message : "未知错误"),
      } as InventoryOperationResult,
      { status: 500 },
    );
  }
}
