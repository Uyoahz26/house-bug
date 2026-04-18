import { NextResponse } from "next/server";
import { requireAdmin, ForbiddenError } from "@/lib/auth/authorization";
import { AuthError } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db/client";
import { getSystemConfigByKey } from "@/lib/db/queries/config";

export const runtime = "edge";

const SECRET_MASK = "***";
const TEXT_ENCODER = new TextEncoder();
const EMAIL_SEND_TIMEOUT_MS = 25_000;

class OperationTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationTimeoutError";
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
      reject(new OperationTimeoutError(message));
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

const EMAIL_CONFIG_KEYS = [
  "app.name",
  "email.provider",
  "email.from",
  "email.resend.api_key",
  "email.smtp.host",
  "email.smtp.port",
  "email.smtp.user",
  "email.smtp.password",
] as const;

interface ConfigOverrideItem {
  key?: string;
  value?: string;
}

interface TestEmailInput {
  to?: string;
  subject?: string;
  configOverrides?: ConfigOverrideItem[];
}

interface ResendPayload {
  id?: string;
  error?: {
    message?: string;
  };
}

interface SmtpReply {
  code: number;
  lines: string[];
}

type ConnectFn = (address: SocketAddress, options?: SocketOptions) => Socket;

type ConfigRecordMap = Record<string, { value: string; isSecret: boolean }>;

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidHost(value: string): boolean {
  if (!value) return false;
  if (value.length > 253) return false;
  if (/\s/.test(value)) return false;
  return /^[a-z0-9.-]+$/i.test(value);
}

function parsePort(rawPort: string): number {
  const parsed = Number.parseInt(rawPort, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("email.smtp.port 配置无效，请填写 1-65535 的端口号。");
  }
  return parsed;
}

function toBase64Utf8(value: string): string {
  const bytes = TEXT_ENCODER.encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function toMimeSubject(subject: string): string {
  return `=?UTF-8?B?${toBase64Utf8(subject)}?=`;
}

function foldByLength(value: string, maxLength = 76): string {
  if (!value) return "";

  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += maxLength) {
    chunks.push(value.slice(index, index + maxLength));
  }

  return chunks.join("\r\n");
}

function dotStuff(value: string): string {
  return value.replace(/(^|\r\n)\./g, "$1..");
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

async function loadCloudflareSocketConnect(): Promise<ConnectFn> {
  try {
    const socketsModule = (await import(
      /* webpackIgnore: true */ "cloudflare:sockets"
    )) as {
      connect?: ConnectFn;
    };

    if (typeof socketsModule.connect !== "function") {
      throw new Error("cloudflare:sockets.connect 不可用。");
    }

    return socketsModule.connect;
  } catch {
    throw new Error(
      "当前运行环境不支持 SMTP 直连。请使用 `pnpm dev:worker` 在 Cloudflare Worker 本地环境调试 SMTP，或将 email.provider 切换为 resend。",
    );
  }
}

function sanitizeSubject(input: string, appName: string): string {
  if (input.trim()) {
    return input.trim().slice(0, 120);
  }

  return `[${appName}] 邮箱配置测试`;
}

function buildPlainText(input: {
  appName: string;
  to: string;
  provider: string;
}): string {
  const timestamp = new Date().toISOString();

  return [
    `${input.appName} 邮箱测试邮件`,
    "",
    "这是一封系统配置页发送的测试邮件。",
    `收件人: ${input.to}`,
    `邮件提供商: ${input.provider}`,
    `时间(UTC): ${timestamp}`,
  ].join("\n");
}

function buildHtml(input: {
  appName: string;
  to: string;
  provider: string;
}): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #18181b; line-height: 1.6;">
  <h2 style="margin: 0 0 12px;">${input.appName} 邮箱测试邮件</h2>
  <p style="margin: 0 0 8px;">这是一封系统配置页发送的测试邮件。</p>
  <p style="margin: 0 0 8px;"><strong>收件人:</strong> ${input.to}</p>
  <p style="margin: 0;"><strong>邮件提供商:</strong> ${input.provider}</p>
</div>`.trim();
}

async function loadConfigMap(): Promise<ConfigRecordMap> {
  const db = getDb();
  const records = await Promise.all(
    EMAIL_CONFIG_KEYS.map((key) => getSystemConfigByKey(db, key)),
  );

  const map: ConfigRecordMap = {};
  EMAIL_CONFIG_KEYS.forEach((key, index) => {
    const record = records[index];
    map[key] = {
      value: record?.value?.trim() ?? "",
      isSecret: record?.is_secret === 1,
    };
  });

  return map;
}

function applyOverrides(
  configMap: ConfigRecordMap,
  overrides: ConfigOverrideItem[] | undefined,
): void {
  if (!Array.isArray(overrides)) return;

  for (const item of overrides) {
    const key = normalizeString(item.key);
    if (!key.startsWith("email.")) continue;

    const target = configMap[key];
    if (!target) continue;

    const nextValue = normalizeString(item.value);
    if (target.isSecret && nextValue === SECRET_MASK) {
      continue;
    }

    target.value = nextValue;
  }
}

async function sendViaResend(input: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  appName: string;
}): Promise<string | null> {
  const response = await withTimeout(
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        text: buildPlainText({
          appName: input.appName,
          to: input.to,
          provider: "resend",
        }),
        html: buildHtml({
          appName: input.appName,
          to: input.to,
          provider: "resend",
        }),
      }),
    }),
    EMAIL_SEND_TIMEOUT_MS,
    "Resend 请求超时，请检查网络或稍后重试。",
  );

  const raw = await response.text();
  let payload: ResendPayload = {};

  try {
    payload = (JSON.parse(raw) as ResendPayload) ?? {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const detail = payload.error?.message ?? raw.slice(0, 180) ?? "未知错误";
    throw new Error(`Resend 发送失败（${response.status}）：${detail}`);
  }

  return payload.id ?? null;
}

async function sendViaSmtp(input: {
  host: string;
  port: number;
  username: string;
  password: string;
  from: string;
  to: string;
  subject: string;
  appName: string;
}): Promise<string> {
  const connect = await loadCloudflareSocketConnect();

  const initialTransport: "on" | "starttls" =
    input.port === 465 ? "on" : "starttls";

  let socket = connect(
    {
      hostname: input.host,
      port: input.port,
    },
    {
      secureTransport: initialTransport,
      allowHalfOpen: false,
    },
  );

  let reader = socket.readable.pipeThrough(new TextDecoderStream()).getReader();
  let writer = socket.writable.getWriter();
  let buffer = "";

  const readReply = async (): Promise<SmtpReply> => {
    const lines: string[] = [];

    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex >= 0) {
        const rawLine = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const line = rawLine.replace(/\r$/, "");
        lines.push(line);

        if (/^\d{3}\s/.test(line)) {
          return {
            code: Number.parseInt(line.slice(0, 3), 10),
            lines,
          };
        }

        continue;
      }

      const { value, done } = await reader.read();
      if (done) {
        if (lines.length > 0) {
          const finalLine = lines[lines.length - 1];
          const code = /^\d{3}/.test(finalLine)
            ? Number.parseInt(finalLine.slice(0, 3), 10)
            : 0;
          return { code, lines };
        }

        throw new Error("SMTP 连接已关闭，未收到完整响应。");
      }

      buffer += value;
    }
  };

  const sendLine = async (line: string) => {
    await writer.write(TEXT_ENCODER.encode(`${line}\r\n`));
  };

  const sendRaw = async (raw: string) => {
    await writer.write(TEXT_ENCODER.encode(raw));
  };

  const expectReply = (
    reply: SmtpReply,
    allowedCodes: number[],
    context: string,
  ) => {
    if (allowedCodes.includes(reply.code)) {
      return;
    }

    const detail = reply.lines.join(" | ").slice(0, 220) || "无响应详情";
    throw new Error(`SMTP ${context} 失败（${reply.code}）：${detail}`);
  };

  const getCapabilities = (reply: SmtpReply): string[] => {
    return reply.lines
      .map((line) => line.replace(/^\d{3}[ -]?/, "").trim())
      .filter(Boolean);
  };

  const hasCapability = (caps: string[], target: string): boolean => {
    return caps.some((line) => line.toUpperCase() === target.toUpperCase());
  };

  const authMethodsFromCaps = (caps: string[]): string[] => {
    const authLine = caps.find((line) => /^AUTH\s+/i.test(line));
    if (!authLine) return [];

    return authLine
      .replace(/^AUTH\s+/i, "")
      .split(/\s+/)
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
  };

  try {
    const greeting = await readReply();
    expectReply(greeting, [220], "连接");

    await sendLine(`EHLO ${sanitizeHeaderValue(input.host)}`);
    let ehloReply = await readReply();
    expectReply(ehloReply, [250], "EHLO");
    let capabilities = getCapabilities(ehloReply);

    if (socket.secureTransport !== "on") {
      if (hasCapability(capabilities, "STARTTLS")) {
        await sendLine("STARTTLS");
        const startTlsReply = await readReply();
        expectReply(startTlsReply, [220], "STARTTLS");

        socket = socket.startTls({ expectedServerHostname: input.host });
        reader = socket.readable
          .pipeThrough(new TextDecoderStream())
          .getReader();
        writer = socket.writable.getWriter();
        buffer = "";

        await sendLine(`EHLO ${sanitizeHeaderValue(input.host)}`);
        ehloReply = await readReply();
        expectReply(ehloReply, [250], "TLS 后 EHLO");
        capabilities = getCapabilities(ehloReply);
      } else if (input.port === 587) {
        throw new Error("SMTP 服务器未提供 STARTTLS，587 端口要求启用 TLS。");
      }
    }

    if (!input.username || !input.password) {
      throw new Error("email.smtp.user 或 email.smtp.password 未配置。");
    }

    const authMethods = authMethodsFromCaps(capabilities);
    if (authMethods.includes("PLAIN")) {
      const authPayload = btoa(
        `\u0000${input.username}\u0000${input.password}`,
      );
      await sendLine(`AUTH PLAIN ${authPayload}`);
      const authReply = await readReply();
      expectReply(authReply, [235], "AUTH PLAIN");
    } else {
      await sendLine("AUTH LOGIN");
      const authLoginReply = await readReply();
      expectReply(authLoginReply, [334], "AUTH LOGIN 初始化");

      await sendLine(btoa(input.username));
      const authUserReply = await readReply();
      expectReply(authUserReply, [334], "AUTH LOGIN 用户名");

      await sendLine(btoa(input.password));
      const authPasswordReply = await readReply();
      expectReply(authPasswordReply, [235], "AUTH LOGIN 密码");
    }

    await sendLine(`MAIL FROM:<${sanitizeHeaderValue(input.from)}>`);
    const mailFromReply = await readReply();
    expectReply(mailFromReply, [250], "MAIL FROM");

    await sendLine(`RCPT TO:<${sanitizeHeaderValue(input.to)}>`);
    const rcptReply = await readReply();
    expectReply(rcptReply, [250, 251], "RCPT TO");

    await sendLine("DATA");
    const dataReadyReply = await readReply();
    expectReply(dataReadyReply, [354], "DATA 准备");

    const messageId = `<${crypto.randomUUID()}@${input.host}>`;
    const textBody = buildPlainText({
      appName: input.appName,
      to: input.to,
      provider: "smtp",
    });

    const bodyBase64 = foldByLength(toBase64Utf8(textBody));
    const mimeMessage = [
      `From: <${sanitizeHeaderValue(input.from)}>`,
      `To: <${sanitizeHeaderValue(input.to)}>`,
      `Subject: ${toMimeSubject(sanitizeHeaderValue(input.subject))}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: ${messageId}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      bodyBase64,
    ].join("\r\n");

    await sendRaw(`${dotStuff(mimeMessage)}\r\n.\r\n`);
    const dataSentReply = await readReply();
    expectReply(dataSentReply, [250], "DATA 提交");

    await sendLine("QUIT");
    await readReply();

    return messageId;
  } finally {
    try {
      await writer.close();
    } catch {
      // Ignore writer close failures.
    }

    try {
      await socket.close();
    } catch {
      // Ignore socket close failures.
    }
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);

    let body: TestEmailInput = {};
    try {
      body = (await request.json()) as TestEmailInput;
    } catch {
      body = {};
    }

    const to = normalizeString(body.to).toLowerCase();
    if (!to || !isValidEmail(to)) {
      return NextResponse.json(
        { error: "请填写有效的测试收件邮箱地址。" },
        { status: 400 },
      );
    }

    const configMap = await loadConfigMap();
    applyOverrides(configMap, body.configOverrides);

    const appName = configMap["app.name"]?.value || "HomeBug";
    const provider = (
      configMap["email.provider"]?.value || "none"
    ).toLowerCase();
    const subject = sanitizeSubject(normalizeString(body.subject), appName);

    if (provider === "none") {
      return NextResponse.json(
        {
          error:
            "当前邮件提供商为 none，请先在邮箱配置中将 email.provider 设置为 resend 或 smtp。",
        },
        { status: 400 },
      );
    }

    if (provider !== "resend" && provider !== "smtp") {
      return NextResponse.json(
        {
          error: `不支持的邮件提供商: ${provider}。当前仅支持 resend 或 smtp。`,
        },
        { status: 400 },
      );
    }

    const from = configMap["email.from"]?.value || "";

    if (!from || !isValidEmail(from)) {
      return NextResponse.json(
        { error: "email.from 未配置或格式不正确。" },
        { status: 400 },
      );
    }

    let messageId: string | null = null;

    if (provider === "resend") {
      const apiKey = configMap["email.resend.api_key"]?.value || "";
      if (!apiKey) {
        return NextResponse.json(
          { error: "email.resend.api_key 未配置。" },
          { status: 400 },
        );
      }

      messageId = await sendViaResend({
        apiKey,
        from,
        to,
        subject,
        appName,
      });
    }

    if (provider === "smtp") {
      const host = normalizeString(configMap["email.smtp.host"]?.value);
      const port = parsePort(
        normalizeString(configMap["email.smtp.port"]?.value || "587"),
      );
      const username = normalizeString(configMap["email.smtp.user"]?.value);
      const password = normalizeString(configMap["email.smtp.password"]?.value);

      if (!isValidHost(host)) {
        return NextResponse.json(
          { error: "email.smtp.host 未配置或格式不正确。" },
          { status: 400 },
        );
      }

      messageId = await withTimeout(
        sendViaSmtp({
          host,
          port,
          username,
          password,
          from,
          to,
          subject,
          appName,
        }),
        EMAIL_SEND_TIMEOUT_MS,
        "SMTP 发送超时，请检查 SMTP 地址、端口、TLS 配置及网络连通性。",
      );
    }

    return NextResponse.json({
      data: {
        to,
        provider,
        messageId,
      },
    });
  } catch (error) {
    if (error instanceof OperationTimeoutError) {
      return NextResponse.json({ error: error.message }, { status: 504 });
    }

    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "无管理员权限。" }, { status: 403 });
    }

    console.error("[POST /api/admin/config/test-email]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "测试邮件发送失败。",
      },
      { status: 500 },
    );
  }
}
