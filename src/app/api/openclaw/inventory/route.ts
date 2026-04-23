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
  items?: Array<{
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
  type: "decrease" | "increase" | "query";
  itemName: string;
  quantity: number;
}> {
  const systemPrompt = `你是一个智能物资管理助手。解析用户的自然语言指令，提取操作类型、物品名称和数量。如果没有找到用户可能说的物品就说没找到，不要凭空虚构物品，以数据库表中的为准。

操作类型：
- decrease: 减少/消耗/用了/吃了
- increase: 增加/买了/补充了
- query: 查询/还有多少/剩余

返回 JSON 格式：
{
  "type": "decrease",
  "itemName": "纸",
  "quantity": 1
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

    // 2. 查询所有物资
    const items = await listItems(db, {
      status: "all",
      limit: 1000,
      offset: 0,
    });
    const publicItems = items.map((item) => toPublicItem(item));

    // 3. 使用 AI 自然语言查询找到匹配的物品
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

    // 如果只是查询，直接返回结果
    if (parsedAction.type === "query") {
      return NextResponse.json({
        success: true,
        message: queryResult.answer,
        items: queryResult.relatedItems,
      } as InventoryOperationResult);
    }

    // 4. 更新第一个匹配的物品数量
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
    const message = `已将"${targetItem.name}"的数量${operationType} ${parsedAction.quantity} ${targetItem.unit}，当前剩余 ${newQuantity} ${targetItem.unit}`;

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
