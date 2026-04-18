import { D1DatabaseLike } from "@/lib/db/client";
import { getConfigValues } from "@/lib/config/system";

const TEXT_ENCODER = new TextEncoder();

const COS_CONFIG_KEYS = [
  "storage.type",
  "storage.cos.secret_id",
  "storage.cos.secret_key",
  "storage.cos.bucket",
  "storage.cos.region",
  "storage.cos.cdn_url",
] as const;

interface CosConfig {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  cdnUrl: string;
}

interface BuildAuthorizationInput {
  method: "PUT" | "DELETE";
  objectKey: string;
  host: string;
  secretId: string;
  secretKey: string;
  uriEncodingMode?: "encoded" | "raw";
}

export interface UploadCosImageInput {
  fileName: string;
  categoryName: string;
  itemName: string;
  mimeType: string;
  content: ArrayBuffer;
}

export interface UploadCosImageResult {
  imageUrl: string;
  objectKey: string;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    TEXT_ENCODER.encode(input),
  );
  return toHex(digest);
}

async function hmacSha1Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(key),
    {
      name: "HMAC",
      hash: "SHA-1",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    TEXT_ENCODER.encode(message),
  );

  return toHex(signature);
}

function inferFileExtension(fileName: string, mimeType: string): string {
  const lowerName = fileName.toLowerCase();
  const suffixMatch = lowerName.match(/\.([a-z0-9]{2,8})$/);
  if (suffixMatch) {
    return `.${suffixMatch[1]}`;
  }

  const normalizedMimeType = mimeType.toLowerCase();
  if (normalizedMimeType.includes("png")) return ".png";
  if (normalizedMimeType.includes("jpeg") || normalizedMimeType.includes("jpg"))
    return ".jpg";
  if (normalizedMimeType.includes("webp")) return ".webp";
  if (normalizedMimeType.includes("gif")) return ".gif";

  return ".jpg";
}

function sanitizePathSegment(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/[<>:"|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 80);

  return sanitized || fallback;
}

function encodeObjectKey(objectKey: string): string {
  return objectKey
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildObjectKey(input: {
  categoryName: string;
  itemName: string;
  fileName: string;
  mimeType: string;
}): string {
  const categorySegment = sanitizePathSegment(input.categoryName, "未分类");
  const itemSegment = sanitizePathSegment(input.itemName, "未命名商品");
  const extension = inferFileExtension(input.fileName, input.mimeType);

  return `${categorySegment}/${itemSegment}_${Date.now()}${extension}`;
}

function normalizeCdnUrl(rawCdnUrl: string): string {
  const trimmed = rawCdnUrl.trim();
  if (!trimmed) {
    return "";
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const parsed = new URL(withProtocol);
  return parsed.origin;
}

function buildPublicUrl(config: CosConfig, objectKey: string): string {
  const normalizedCdnUrl = normalizeCdnUrl(config.cdnUrl);
  if (normalizedCdnUrl) {
    return `${normalizedCdnUrl}/${encodeObjectKey(objectKey)}`;
  }

  return `https://${config.bucket}.cos.${config.region}.myqcloud.com/${encodeObjectKey(objectKey)}`;
}

async function buildAuthorization(
  input: BuildAuthorizationInput,
): Promise<string> {
  const startAt = Math.floor(Date.now() / 1000) - 60;
  const endAt = startAt + 7200;
  const signTime = `${startAt};${endAt}`;

  const canonicalUri =
    input.uriEncodingMode === "raw"
      ? `/${input.objectKey.replace(/^\/+/, "")}`
      : `/${encodeObjectKey(input.objectKey)}`;
  const httpString = `${input.method.toLowerCase()}\n${canonicalUri}\n\nhost=${input.host}\n`;
  const httpStringSha1 = await sha1Hex(httpString);

  const stringToSign = `sha1\n${signTime}\n${httpStringSha1}\n`;
  const signKey = await hmacSha1Hex(input.secretKey, signTime);
  const signature = await hmacSha1Hex(signKey, stringToSign);

  return `q-sign-algorithm=sha1&q-ak=${input.secretId}&q-sign-time=${signTime}&q-key-time=${signTime}&q-header-list=host&q-url-param-list=&q-signature=${signature}`;
}

async function getCosConfig(db: D1DatabaseLike): Promise<CosConfig | null> {
  const values = await getConfigValues(db, [...COS_CONFIG_KEYS]);
  if (values["storage.type"] !== "cos") {
    return null;
  }

  return {
    secretId: values["storage.cos.secret_id"],
    secretKey: values["storage.cos.secret_key"],
    bucket: values["storage.cos.bucket"],
    region: values["storage.cos.region"],
    cdnUrl: values["storage.cos.cdn_url"],
  };
}

function assertCosConfig(config: CosConfig | null): CosConfig {
  if (!config) {
    throw new Error(
      "系统未启用腾讯云 COS 存储。请先将 storage.type 配置为 cos。",
    );
  }

  if (
    !config.secretId ||
    !config.secretKey ||
    !config.bucket ||
    !config.region
  ) {
    throw new Error(
      "腾讯云 COS 配置不完整，请检查 SecretId、SecretKey、Bucket 与 Region。",
    );
  }

  return config;
}

async function cosRequest(
  config: CosConfig,
  input: {
    method: "PUT" | "DELETE";
    objectKey: string;
    body?: ArrayBuffer;
    mimeType?: string;
    uriEncodingMode?: "encoded" | "raw";
  },
): Promise<Response> {
  const host = `${config.bucket}.cos.${config.region}.myqcloud.com`;
  const encodedObjectKey = encodeObjectKey(input.objectKey);
  const authorization = await buildAuthorization({
    method: input.method,
    objectKey: input.objectKey,
    host,
    secretId: config.secretId,
    secretKey: config.secretKey,
    uriEncodingMode: input.uriEncodingMode,
  });

  return fetch(`https://${host}/${encodedObjectKey}`, {
    method: input.method,
    headers: {
      Authorization: authorization,
      ...(input.mimeType ? { "Content-Type": input.mimeType } : {}),
    },
    body: input.body,
  });
}

function isSignatureMismatch(status: number, detail: string): boolean {
  return status === 403 && detail.includes("SignatureDoesNotMatch");
}

export async function uploadImageToCos(
  db: D1DatabaseLike,
  input: UploadCosImageInput,
): Promise<UploadCosImageResult> {
  const config = assertCosConfig(await getCosConfig(db));
  const objectKey = buildObjectKey({
    categoryName: input.categoryName,
    itemName: input.itemName,
    fileName: input.fileName,
    mimeType: input.mimeType,
  });

  const response = await cosRequest(config, {
    method: "PUT",
    objectKey,
    mimeType: input.mimeType,
    body: input.content,
  });

  if (!response.ok) {
    let detail = await response.text();

    if (isSignatureMismatch(response.status, detail)) {
      const retryResponse = await cosRequest(config, {
        method: "PUT",
        objectKey,
        mimeType: input.mimeType,
        body: input.content,
        uriEncodingMode: "raw",
      });

      if (retryResponse.ok) {
        return {
          imageUrl: buildPublicUrl(config, objectKey),
          objectKey,
        };
      }

      detail = await retryResponse.text();
      const signatureHint = detail.includes("SignatureDoesNotMatch")
        ? "（签名不匹配：请检查 SecretId/SecretKey、Bucket、Region，并确认对象路径编码与签名一致）"
        : "";
      throw new Error(
        `上传图片到 COS 失败（${retryResponse.status}）${signatureHint}。${detail.slice(0, 220)}`,
      );
    }

    const signatureHint = detail.includes("SignatureDoesNotMatch")
      ? "（签名不匹配：请检查 SecretId/SecretKey、Bucket、Region，并确认对象路径编码与签名一致）"
      : "";
    throw new Error(
      `上传图片到 COS 失败（${response.status}）${signatureHint}。${detail.slice(0, 220)}`,
    );
  }

  return {
    imageUrl: buildPublicUrl(config, objectKey),
    objectKey,
  };
}

function extractObjectKey(imageUrl: string): string | null {
  const trimmed = imageUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const objectKey = decodeURIComponent(url.pathname)
      .replace(/^\/+/, "")
      .trim();
    return objectKey || null;
  } catch {
    return null;
  }
}

export async function deleteImageFromCosByUrl(
  db: D1DatabaseLike,
  imageUrl: string,
): Promise<void> {
  const objectKey = extractObjectKey(imageUrl);
  if (!objectKey) {
    return;
  }

  const config = assertCosConfig(await getCosConfig(db));
  const response = await cosRequest(config, {
    method: "DELETE",
    objectKey,
  });

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    let detail = await response.text();

    if (isSignatureMismatch(response.status, detail)) {
      const retryResponse = await cosRequest(config, {
        method: "DELETE",
        objectKey,
        uriEncodingMode: "raw",
      });

      if (retryResponse.ok || retryResponse.status === 404) {
        return;
      }

      detail = await retryResponse.text();
      const signatureHint = detail.includes("SignatureDoesNotMatch")
        ? "（签名不匹配：请检查 SecretId/SecretKey、Bucket、Region，并确认对象路径编码与签名一致）"
        : "";
      throw new Error(
        `删除 COS 图片失败（${retryResponse.status}）${signatureHint}。${detail.slice(0, 220)}`,
      );
    }

    const signatureHint = detail.includes("SignatureDoesNotMatch")
      ? "（签名不匹配：请检查 SecretId/SecretKey、Bucket、Region，并确认对象路径编码与签名一致）"
      : "";
    throw new Error(
      `删除 COS 图片失败（${response.status}）${signatureHint}。${detail.slice(0, 220)}`,
    );
  }
}
