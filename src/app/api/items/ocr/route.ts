import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { requireActiveUser } from "@/lib/auth/authorization";
import { AuthError } from "@/lib/auth/middleware";
import { parseOCRText, ParsedOcrData } from "@/lib/ocr/parse";

export const runtime = "edge";

interface OcrRequest {
  image?: string;
}

interface WorkersAiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

interface CustomParsedData {
  productionDate?: string | null;
  shelfLife?: number | null;
  unit?: string | null;
}

const WORKER_OCR_MODEL =
  process.env.WORKER_OCR_MODEL || "@cf/llava-hf/llava-1.5-7b-hf";
const WORKER_OCR_TIMEOUT_MS = (() => {
  const raw = process.env.WORKER_OCR_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20_000;
})();

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

function decodeBase64ToBytes(base64: string): Uint8Array {
  let binary = "";
  try {
    binary = atob(base64);
  } catch {
    throw new Error("图片 base64 解码失败。");
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function getWorkersAiBinding(): WorkersAiBinding {
  const { env } = getRequestContext();
  const ai = (env as Record<string, unknown>)?.AI;
  if (!ai || typeof (ai as WorkersAiBinding).run !== "function") {
    throw new Error("Workers AI 绑定 AI 不可用，请检查 wrangler 配置。");
  }

  return ai as WorkersAiBinding;
}

class WorkerOcrTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerOcrTimeoutError";
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new WorkerOcrTimeoutError(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

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
    objectPayload.response,
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

    let imageBytes: Uint8Array;
    try {
      imageBytes = decodeBase64ToBytes(extractBase64Image(image));
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

    const ai = getWorkersAiBinding();

    const payload = await withTimeout(
      ai.run(WORKER_OCR_MODEL, {
        image: [...imageBytes],
        prompt: "提取图片中的全部可读文字，保持原始顺序输出，不要解释。",
        max_tokens: 700,
        temperature: 0,
      }),
      WORKER_OCR_TIMEOUT_MS,
      "Worker OCR 请求超时，请稍后重试。",
    );

    const rawText = extractRawText(payload).trim();
    const parsedFromProvider = extractParsed(payload);
    const parsedFromText = parseOCRText(rawText);

    return NextResponse.json({
      data: {
        provider: "workerocr",
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

    if (error instanceof WorkerOcrTimeoutError) {
      return NextResponse.json({ error: error.message }, { status: 504 });
    }

    if (
      error instanceof Error &&
      error.message.includes("Workers AI 绑定 AI")
    ) {
      return NextResponse.json(
        {
          error: "Workers AI 未启用，请检查部署环境绑定。",
          code: "SERVER_OCR_NOT_CONFIGURED",
        },
        { status: 412 },
      );
    }

    console.error("[POST /api/items/ocr]", error);
    return NextResponse.json({ error: "OCR 识别失败。" }, { status: 500 });
  }
}
