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

interface AiExtractedData {
  name: string | null;
  brand: string | null;
  quantity: number | null;
  itemUnit: string | null;
  productionDate: string | null;
  shelfLife: number | null;
  unit: "day" | "month" | "year" | null;
}

interface AiExtractedRawData {
  name?: unknown;
  brand?: unknown;
  quantity?: unknown;
  itemUnit?: unknown;
  productionDate?: unknown;
  shelfLife?: unknown;
  unit?: unknown;
  rawText?: unknown;
}

const WORKER_OCR_MODEL =
  process.env.WORKER_OCR_MODEL || "@cf/llava-hf/llava-1.5-7b-hf";
const WORKER_OCR_TIMEOUT_MS = (() => {
  const raw = process.env.WORKER_OCR_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20_000;
})();
const WORKER_OCR_MAX_IMAGE_BYTES = (() => {
  const raw = process.env.WORKER_OCR_MAX_IMAGE_BYTES;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1_200_000;
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

function toDataUrl(image: string, base64: string): string {
  const value = image.trim();
  if (value.startsWith("data:")) {
    return value;
  }

  // Default to JPEG when mime type is unknown.
  return `data:image/jpeg;base64,${base64}`;
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

function decodeBase64ToBytes(base64: string): Uint8Array<ArrayBufferLike> {
  const normalized = base64.replace(/\s+/g, "");
  if (!normalized) {
    throw new Error("图片 base64 解码失败。");
  }

  let binary = "";
  try {
    binary = atob(normalized);
  } catch {
    throw new Error("图片 base64 解码失败。");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "未知错误";
}

function inferWorkerAiStatus(message: string): number {
  const lower = message.toLowerCase();

  if (lower.includes("429") || lower.includes("rate limit")) {
    return 429;
  }

  if (lower.includes("401") || lower.includes("403")) {
    return 502;
  }

  if (lower.includes("timeout") || lower.includes("gateway")) {
    return 504;
  }

  if (lower.includes("bad request") || lower.includes("400")) {
    return 400;
  }

  if (
    lower.includes("oneof") ||
    lower.includes("type mismatch") ||
    lower.includes("required properties") ||
    lower.includes("not met, 0 matches")
  ) {
    return 400;
  }

  if (
    lower.includes("tensor error") ||
    lower.includes("decode u8") ||
    lower.includes("invalid image")
  ) {
    return 400;
  }

  return 502;
}

function isWorkerAiLikeError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("workers ai") ||
    lower.includes("ai.run") ||
    lower.includes("model") ||
    lower.includes("neuron") ||
    lower.includes("gateway") ||
    lower.includes("upstream") ||
    lower.includes("rate limit") ||
    lower.includes("invalid image") ||
    lower.includes("tensor error") ||
    lower.includes("decode u8") ||
    lower.includes("failed to decode") ||
    lower.includes("oneof") ||
    lower.includes("type mismatch") ||
    lower.includes("required properties") ||
    lower.includes("not met, 0 matches")
  );
}

function shouldRetryWithAnotherImageFormat(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("tensor error") ||
    lower.includes("decode u8") ||
    lower.includes("failed to decode") ||
    lower.includes("invalid image") ||
    lower.includes("oneof") ||
    lower.includes("type mismatch") ||
    lower.includes("required properties") ||
    lower.includes("not met, 0 matches")
  );
}

async function runWorkersAiOcrWithFallback(
  ai: WorkersAiBinding,
  input: {
    model: string;
    prompt: string;
    imageDataUrl: string;
    imageBytes: Uint8Array<ArrayBufferLike>;
  },
): Promise<unknown> {
  const candidates: Array<{
    name: string;
    image: string | Uint8Array | number[];
  }> = [
    { name: "number-array", image: Array.from(input.imageBytes) },
    { name: "uint8array", image: input.imageBytes },
    { name: "data-url", image: input.imageDataUrl },
  ];

  let lastError: unknown = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];

    try {
      return await withTimeout(
        ai.run(input.model, {
          image: candidate.image,
          prompt: input.prompt,
          max_tokens: 700,
          temperature: 0,
        }),
        WORKER_OCR_TIMEOUT_MS,
        "Worker OCR 请求超时，请稍后重试。",
      );
    } catch (error) {
      lastError = error;
      const message = getErrorMessage(error);
      const isLast = index === candidates.length - 1;
      if (isLast || !shouldRetryWithAnotherImageFormat(message)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Worker OCR 调用失败。");
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

function normalizeExtractedData(input: unknown): AiExtractedData | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const source = input as Record<string, unknown>;

  const name =
    typeof source.name === "string" && source.name.trim()
      ? source.name.trim()
      : null;
  const brand =
    typeof source.brand === "string" && source.brand.trim()
      ? source.brand.trim()
      : null;

  const quantityRaw = source.quantity;
  const quantity =
    typeof quantityRaw === "number" && Number.isFinite(quantityRaw)
      ? Math.max(0, Math.floor(quantityRaw))
      : null;

  const itemUnit =
    typeof source.itemUnit === "string" && source.itemUnit.trim()
      ? source.itemUnit.trim()
      : null;

  const productionDate =
    typeof source.productionDate === "string" && source.productionDate.trim()
      ? source.productionDate.trim()
      : null;

  const shelfLifeRaw = source.shelfLife;
  const shelfLife =
    typeof shelfLifeRaw === "number" && Number.isFinite(shelfLifeRaw)
      ? Math.max(0, Math.floor(shelfLifeRaw))
      : null;

  const unitRaw = source.unit;
  const unit =
    unitRaw === "day" || unitRaw === "month" || unitRaw === "year"
      ? unitRaw
      : null;

  if (
    !name &&
    !brand &&
    quantity === null &&
    !itemUnit &&
    !productionDate &&
    shelfLife === null &&
    !unit
  ) {
    return null;
  }

  return {
    name,
    brand,
    quantity,
    itemUnit,
    productionDate,
    shelfLife,
    unit,
  };
}

function extractJsonObjectFromText(
  text: string,
): Record<string, unknown> | null {
  const source = text.trim();
  if (!source) {
    return null;
  }

  const candidates: string[] = [];
  candidates.push(source);

  const fencedMatch = source.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1]);
  }

  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore invalid JSON candidates and continue.
    }
  }

  return null;
}

function extractRawText(payload: unknown): string {
  if (typeof payload === "string") {
    const jsonObject = extractJsonObjectFromText(payload);
    if (jsonObject) {
      const candidate = jsonObject.rawText;
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }
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

function extractStructuredData(payload: unknown): AiExtractedData | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const direct = normalizeExtractedData(payload);
  if (direct) {
    return direct;
  }

  const objectPayload = payload as Record<string, unknown>;

  const parsedDirect = normalizeExtractedData(objectPayload.parsed);
  if (parsedDirect) {
    return parsedDirect;
  }

  const data = objectPayload.data;
  if (data && typeof data === "object") {
    const objectData = data as Record<string, unknown>;
    const parsedData =
      normalizeExtractedData(objectData) ||
      normalizeExtractedData(objectData.parsed);
    if (parsedData) {
      return parsedData;
    }
  }

  const rawText = extractRawText(payload);
  const jsonObject = extractJsonObjectFromText(rawText);
  if (jsonObject) {
    return normalizeExtractedData(jsonObject);
  }

  return null;
}

function pickAiRawFields(
  source: Record<string, unknown>,
): AiExtractedRawData | null {
  const picked: AiExtractedRawData = {};

  const keys: Array<keyof AiExtractedRawData> = [
    "name",
    "brand",
    "quantity",
    "itemUnit",
    "productionDate",
    "shelfLife",
    "unit",
    "rawText",
  ];

  for (const key of keys) {
    if (key in source) {
      picked[key] = source[key];
    }
  }

  return Object.keys(picked).length > 0 ? picked : null;
}

function extractStructuredRawData(payload: unknown): AiExtractedRawData | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const objectPayload = payload as Record<string, unknown>;
  const direct = pickAiRawFields(objectPayload);
  if (direct) {
    return direct;
  }

  const parsedDirect =
    objectPayload.parsed && typeof objectPayload.parsed === "object"
      ? pickAiRawFields(objectPayload.parsed as Record<string, unknown>)
      : null;
  if (parsedDirect) {
    return parsedDirect;
  }

  const data = objectPayload.data;
  if (data && typeof data === "object") {
    const objectData = data as Record<string, unknown>;
    const nestedData = pickAiRawFields(objectData);
    if (nestedData) {
      return nestedData;
    }

    const nestedParsed =
      objectData.parsed && typeof objectData.parsed === "object"
        ? pickAiRawFields(objectData.parsed as Record<string, unknown>)
        : null;
    if (nestedParsed) {
      return nestedParsed;
    }
  }

  const rawText = extractRawText(payload);
  const jsonObject = extractJsonObjectFromText(rawText);
  if (jsonObject) {
    return pickAiRawFields(jsonObject);
  }

  return null;
}

export async function POST(request: Request) {
  let debugImageBytesLength = 0;

  try {
    await requireActiveUser(request);

    const body = (await request.json()) as OcrRequest;
    const image = typeof body.image === "string" ? body.image.trim() : "";

    if (!image) {
      return NextResponse.json({ error: "缺少图片内容。" }, { status: 400 });
    }

    let imageBytesLength = 0;
    let imageBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
    let aiImageInput = "";
    try {
      const base64 = extractBase64Image(image);
      imageBytesLength = estimateBase64Bytes(base64);
      debugImageBytesLength = imageBytesLength;
      if (!Number.isFinite(imageBytesLength) || imageBytesLength <= 0) {
        throw new Error("图片 base64 解码失败。");
      }
      imageBytes = decodeBase64ToBytes(base64);
      aiImageInput = toDataUrl(image, base64);
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

    if (imageBytesLength > WORKER_OCR_MAX_IMAGE_BYTES) {
      const maxMb = (WORKER_OCR_MAX_IMAGE_BYTES / (1024 * 1024)).toFixed(1);
      return NextResponse.json(
        {
          error: `图片过大，请压缩到 ${maxMb}MB 内后重试。`,
          code: "IMAGE_TOO_LARGE",
        },
        { status: 413 },
      );
    }

    const ai = getWorkersAiBinding();

    const payload = await runWorkersAiOcrWithFallback(ai, {
      model: WORKER_OCR_MODEL,
      imageDataUrl: aiImageInput,
      imageBytes,
      prompt:
        '你是商品信息识别助手。请先识别图片中的文字，再只输出 JSON（不要 markdown、不要解释）。JSON 结构: {"name": string|null, "brand": string|null, "quantity": number|null, "itemUnit": string|null, "productionDate": "YYYY-MM-DD"|null, "shelfLife": number|null, "unit": "day"|"month"|"year"|null, "rawText": string}。若无法确定请用 null，日期必须是 YYYY-MM-DD。',
    });

    const rawText = extractRawText(payload).trim();
    const extractedFromProvider = extractStructuredData(payload);
    const extractedRawFromProvider = extractStructuredRawData(payload);
    const parsedFromProvider = extractParsed(payload);
    const parsedFromText = parseOCRText(rawText);

    return NextResponse.json({
      data: {
        provider: "workerocr",
        rawText,
        extracted: {
          name: extractedFromProvider?.name ?? null,
          brand: extractedFromProvider?.brand ?? null,
          quantity: extractedFromProvider?.quantity ?? null,
          itemUnit: extractedFromProvider?.itemUnit ?? null,
        },
        extractedRaw: extractedRawFromProvider,
        parsed: {
          productionDate:
            parsedFromProvider?.productionDate ??
            extractedFromProvider?.productionDate ??
            parsedFromText.productionDate,
          shelfLife:
            parsedFromProvider?.shelfLife ??
            extractedFromProvider?.shelfLife ??
            parsedFromText.shelfLife,
          unit:
            parsedFromProvider?.unit ??
            extractedFromProvider?.unit ??
            parsedFromText.unit,
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

    const message = getErrorMessage(error);
    if (isWorkerAiLikeError(message)) {
      const status = inferWorkerAiStatus(message);
      return NextResponse.json(
        {
          error: `Worker AI 调用失败：${message}`,
          code: "WORKER_OCR_UPSTREAM_ERROR",
        },
        { status },
      );
    }

    console.error("[POST /api/items/ocr]", {
      error,
      message,
      model: WORKER_OCR_MODEL,
      imageBytes: debugImageBytesLength,
    });
    return NextResponse.json(
      {
        error: `OCR 识别失败：${message}`,
        code: "OCR_INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}
