import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth/authorization";
import { AuthError } from "@/lib/auth/middleware";
import { parseOCRText, ParsedOcrData } from "@/lib/ocr/parse";
import { getDb } from "@/lib/db/client";
import { getAiConfig, getAiAdapter } from "@/lib/ai";

export const runtime = "edge";

interface OcrRequest {
  image?: string;
}

function extractBase64Image(image: string): string {
  const value = image.trim();
  if (!value) {
    throw new Error("缺少图片内容。");
  }

  if (value.startsWith("data:")) {
    const commaIndex = value.indexOf(",");
    if (commaIndex < 0) {
      throw new Error("图片数据格式不正确。");
    }

    const header = value.slice(0, commaIndex).toLowerCase();
    if (!header.includes(";base64")) {
      throw new Error("仅支持 base64 Data URL 图片。");
    }

    return value.slice(commaIndex + 1);
  }

  return value;
}

function estimateBase64Bytes(base64: string): number {
  const normalized = base64.replace(/\s+/g, "");
  if (!normalized) {
    return 0;
  }

  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

export async function POST(request: Request) {
  try {
    await requireActiveUser(request);

    const body = (await request.json()) as OcrRequest;
    const image = typeof body.image === "string" ? body.image.trim() : "";

    if (!image) {
      return NextResponse.json({ error: "缺少图片内容。" }, { status: 400 });
    }

    let base64Image = "";
    try {
      base64Image = extractBase64Image(image);
      const imageBytesLength = estimateBase64Bytes(base64Image);
      if (!Number.isFinite(imageBytesLength) || imageBytesLength <= 0) {
        throw new Error("图片 base64 解码失败。");
      }
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "图片数据格式不正确。",
          code: "INVALID_IMAGE_DATA",
        },
        { status: 400 },
      );
    }

    // 检查是否启用了 AI 配置
    const db = getDb();
    const aiConfig = await getAiConfig(db);

    if (aiConfig) {
      // 使用 AI 进行识别
      try {
        const adapter = getAiAdapter(aiConfig.provider);
        const result = await adapter.extractFromImage(base64Image, aiConfig);

        return NextResponse.json({
          data: {
            provider: aiConfig.provider,
            rawText: result.rawText,
            extracted: {
              name: result.name,
              brand: result.brand,
              category: result.category,
              specification: result.specification,
              quantity: result.quantity,
              itemUnit: result.itemUnit,
              manufacturer: result.manufacturer,
              barcode: result.barcode,
              notes: result.notes,
            },
            parsed: {
              productionDate: result.productionDate,
              shelfLife: result.shelfLife,
              unit: result.shelfLifeUnit,
            },
          },
        });
      } catch (aiError) {
        console.error("[POST /api/items/ocr] AI 识别失败:", aiError);

        // 提取更友好的错误信息
        let errorMessage = "AI 识别失败";
        let errorCode = "AI_OCR_ERROR";

        if (aiError instanceof Error) {
          const message = aiError.message;

          // OpenAI 配额不足
          if (
            message.includes("insufficient_quota") ||
            message.includes("exceeded your current quota")
          ) {
            errorMessage =
              "OpenAI 账户余额不足，请充值后重试。或切换到豆包/关闭 AI 功能使用免费识别。";
            errorCode = "INSUFFICIENT_QUOTA";
          }
          // OpenAI 速率限制
          else if (message.includes("rate_limit") || message.includes("429")) {
            errorMessage = "OpenAI API 请求过于频繁，请稍后重试。";
            errorCode = "RATE_LIMIT";
          }
          // API Key 无效
          else if (
            message.includes("401") ||
            message.includes("invalid_api_key")
          ) {
            errorMessage = "AI API Key 无效，请检查配置。";
            errorCode = "INVALID_API_KEY";
          }
          // DeepSeek 不支持图片
          else if (message.includes("DeepSeek") && message.includes("不支持")) {
            errorMessage = message;
            errorCode = "UNSUPPORTED_PROVIDER";
          }
          // 其他错误
          else {
            errorMessage = `AI 识别失败: ${message}`;
          }
        }

        // AI 失败时返回错误，让前端使用 Tesseract.js 备选方案
        return NextResponse.json(
          {
            error: errorMessage,
            code: errorCode,
          },
          { status: 500 },
        );
      }
    }

    // 未启用 AI，返回 412 让前端使用 Tesseract.js
    return NextResponse.json(
      {
        error: "服务端 OCR 未配置，请使用浏览器端识别。",
        code: "SERVER_OCR_NOT_CONFIGURED",
      },
      { status: 412 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    console.error("[POST /api/items/ocr]", error);
    return NextResponse.json(
      {
        error: `OCR 识别失败：${error instanceof Error ? error.message : "未知错误"}`,
        code: "OCR_INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}
