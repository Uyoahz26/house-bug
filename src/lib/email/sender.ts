import { D1DatabaseLike } from "@/lib/db/client";
import { getSystemConfigByKey } from "@/lib/db/queries/config";

const TEXT_ENCODER = new TextEncoder();

type ConnectFn = (address: SocketAddress, options?: SocketOptions) => Socket;

export interface EmailProviderConfig {
  appName: string;
  provider: string;
  from: string;
  resendApiKey: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
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

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parsePort(rawPort: string): number {
  const parsed = Number.parseInt(rawPort, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("email.smtp.port 配置无效，请填写 1-65535 的端口号。");
  }
  return parsed;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function loadCloudflareSocketConnect(): Promise<ConnectFn> {
  try {
    const module = (await import(
      /* webpackIgnore: true */ "cloudflare:sockets"
    )) as {
      connect?: ConnectFn;
    };

    if (typeof module.connect !== "function") {
      throw new Error("cloudflare:sockets.connect 不可用。");
    }

    return module.connect;
  } catch {
    throw new Error(
      "当前运行环境不支持 SMTP 直连。请使用 pnpm dev:worker 在 Cloudflare Worker 本地环境调试 SMTP，或将 email.provider 切换为 resend。",
    );
  }
}

export async function loadEmailProviderConfig(
  db: D1DatabaseLike,
): Promise<EmailProviderConfig> {
  const [
    appName,
    provider,
    from,
    resendApiKey,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPassword,
  ] = await Promise.all([
    getSystemConfigByKey(db, "app.name"),
    getSystemConfigByKey(db, "email.provider"),
    getSystemConfigByKey(db, "email.from"),
    getSystemConfigByKey(db, "email.resend.api_key"),
    getSystemConfigByKey(db, "email.smtp.host"),
    getSystemConfigByKey(db, "email.smtp.port"),
    getSystemConfigByKey(db, "email.smtp.user"),
    getSystemConfigByKey(db, "email.smtp.password"),
  ]);

  return {
    appName: normalizeString(appName?.value) || "HomeBug",
    provider: normalizeString(provider?.value || "none").toLowerCase(),
    from: normalizeString(from?.value),
    resendApiKey: normalizeString(resendApiKey?.value),
    smtpHost: normalizeString(smtpHost?.value),
    smtpPort: normalizeString(smtpPort?.value || "587"),
    smtpUser: normalizeString(smtpUser?.value),
    smtpPassword: normalizeString(smtpPassword?.value),
  };
}

async function sendViaResend(input: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<string | null> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

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
  text: string;
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
    if (allowedCodes.includes(reply.code)) return;
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
    if (!input.username || !input.password) {
      throw new Error("email.smtp.user 或 email.smtp.password 未配置。");
    }

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
    expectReply(await readReply(), [250], "MAIL FROM");

    await sendLine(`RCPT TO:<${sanitizeHeaderValue(input.to)}>`);
    expectReply(await readReply(), [250, 251], "RCPT TO");

    await sendLine("DATA");
    expectReply(await readReply(), [354], "DATA 准备");

    const messageId = `<${crypto.randomUUID()}@${input.host}>`;
    const bodyBase64 = foldByLength(toBase64Utf8(input.text));

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
    expectReply(await readReply(), [250], "DATA 提交");

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

export async function sendEmailWithProvider(input: {
  config: EmailProviderConfig;
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ provider: string; messageId: string | null }> {
  const provider = input.config.provider;
  const to = normalizeString(input.to).toLowerCase();

  if (!isValidEmail(to)) {
    throw new Error("收件人邮箱格式不正确。");
  }

  if (!isValidEmail(input.config.from)) {
    throw new Error("email.from 未配置或格式不正确。");
  }

  if (provider === "none") {
    throw new Error(
      "当前邮件提供商为 none，请先在系统配置中将 email.provider 设置为 resend 或 smtp。",
    );
  }

  if (provider === "resend") {
    if (!input.config.resendApiKey) {
      throw new Error("email.resend.api_key 未配置。");
    }

    const messageId = await sendViaResend({
      apiKey: input.config.resendApiKey,
      from: input.config.from,
      to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? `<pre>${escapeHtml(input.text)}</pre>`,
    });

    return { provider, messageId };
  }

  if (provider === "smtp") {
    if (!isValidHost(input.config.smtpHost)) {
      throw new Error("email.smtp.host 未配置或格式不正确。");
    }

    const messageId = await sendViaSmtp({
      host: input.config.smtpHost,
      port: parsePort(input.config.smtpPort || "587"),
      username: input.config.smtpUser,
      password: input.config.smtpPassword,
      from: input.config.from,
      to,
      subject: input.subject,
      text: input.text,
    });

    return { provider, messageId };
  }

  throw new Error(
    `不支持的邮件提供商: ${provider}。当前仅支持 resend 或 smtp。`,
  );
}
