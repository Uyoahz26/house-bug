import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth/authorization";
import { AuthError } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db/client";
import { getConfigValues } from "@/lib/config/system";
import { parseOCRText, ParsedOcrData } from "@/lib/ocr/parse";

export const runtime = "edge";

interface OcrRequest {
  image?: string;
}

interface CustomParsedData {
  productionDate?: string | null;
  shelfLife?: number | null;
  unit?: string | null;
}

const OCR_CONFIG_KEYS = [
  "ocr.provider",
  "ocr.custom.endpoint",
  "ocr.custom.api_key",
] as const;

function normalizeParsedData(input: unknown): ParsedOcrData | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const objectInput = input as CustomParsedData;
  const productionDate =
    typeof objectInput.productionDate === "string" && objectInput.productionDate
      ? objectInput.productionDate
      : null;

  const shelfLifeValue =
    typeof objectInput.shelfLife === "number" &&
    Number.isFinite(objectInput.shelfLife)
      ? Math.floor(objectInput.shelfLife)
      : null;

  const normalizedUnit =
    objectInput.unit === "day" ||
    objectInput.unit === "month" ||
    objectInput.unit === "year"
      ? objectInput.unit
      : null;

  if (!productionDate && shelfLifeValue === null && !normalizedUnit) {
    return null;
  }

  return {
    productionDate,
    shelfLife: shelfLifeValue,
    unit: normalizedUnit,
  };
}

function extractRawText(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return "";
  }

  const objectPayload = payload as Record<string, unknown>;
  const directCandidates = [
    objectPayload.rawText,
    objectPayload.text,
    objectPayload.ocrText,
    objectPayload.content,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  const data = objectPayload.data;
  if (data && typeof data === "object") {
    const objectData = data as Record<string, unknown>;
    const nestedCandidates = [
      objectData.rawText,
      objectData.text,
      objectData.ocrText,
      objectData.content,
    ];

    for (const candidate of nestedCandidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }
  }

  return "";
}

function extractParsed(payload: unknown): ParsedOcrData | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const direct = normalizeParsedData(payload);
  if (direct) {
    return direct;
  }

  const objectPayload = payload as Record<string, unknown>;
  const nestedData = objectPayload.data;
  if (nestedData && typeof nestedData === "object") {
    const dataObject = nestedData as Record<string, unknown>;
    const nestedParsed = normalizeParsedData(dataObject.parsed);
    if (nestedParsed) {
      return nestedParsed;
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    await requireActiveUser(request);

    const body = (await request.json()) as OcrRequest;
    const image = typeof body.image === "string" ? body.image.trim() : "";

    if (!image) {
      return NextResponse.json({ error: "缺少图片内容。" }, { status: 400 });
    }

    const db = getDb();
    const config = await getConfigValues(db, [...OCR_CONFIG_KEYS]);

    const provider = config["ocr.provider"] || "tesseract";
    const endpoint = config["ocr.custom.endpoint"];
    const apiKey = config["ocr.custom.api_key"];

    if (provider !== "custom" || !endpoint) {
      return NextResponse.json(
        {
          error: "未配置可用的服务端 OCR 接口，请使用前端 OCR 识别。",
          code: "SERVER_OCR_NOT_CONFIGURED",
        },
        { status: 412 },
      );
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ image }),
    });

    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      return NextResponse.json(
        {
          error: "服务端 OCR 调用失败。",
          detail: payload,
        },
        { status: 502 },
      );
    }

    const rawText = extractRawText(payload).trim();
    const parsedFromProvider = extractParsed(payload);
    const parsedFromText = parseOCRText(rawText);

    return NextResponse.json({
      data: {
        provider,
        rawText,
        parsed: {
          productionDate:
            parsedFromProvider?.productionDate ?? parsedFromText.productionDate,
          shelfLife: parsedFromProvider?.shelfLife ?? parsedFromText.shelfLife,
          unit: parsedFromProvider?.unit ?? parsedFromText.unit,
        },
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    console.error("[POST /api/items/ocr]", error);
    return NextResponse.json({ error: "OCR 识别失败。" }, { status: 500 });
  }
}
