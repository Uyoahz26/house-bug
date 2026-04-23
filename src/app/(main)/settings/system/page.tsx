"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Tag,
  TagGroup,
  Input,
  Label,
  NumberField,
  Spinner,
  Switch,
} from "@heroui/react";
import {
  ChevronRight,
  Clock,
  HardDrive,
  Mail,
  MessageSquare,
  ScanText,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";

type ConfigCategory =
  | "general"
  | "storage"
  | "ocr"
  | "email"
  | "cron"
  | "ai"
  | "openclaw";
type UserRole = "admin" | "user";

interface ConfigItem {
  key: string;
  value: string;
  description: string | null;
  category: ConfigCategory;
  isSecret: boolean;
  hasValue: boolean;
}

interface AuthMeResponse {
  data?: {
    role?: UserRole;
    email?: string;
  };
  error?: string;
}

interface ConfigListResponse {
  data?: ConfigItem[];
  error?: string;
}

interface TestEmailResponse {
  data?: {
    to: string;
    provider: string;
    messageId: string | null;
  };
  error?: string;
}

const CATEGORY_TABS = [
  {
    id: "general",
    label: "通用配置",
    icon: Settings2,
    desc: "应用基础参数与偏好",
  },
  { id: "ai", label: "AI 配置", icon: Sparkles, desc: "AI 识别与智能功能" },
  {
    id: "openclaw",
    label: "OpenClaw",
    icon: MessageSquare,
    desc: "OpenClaw 助手集成",
  },
  { id: "storage", label: "存储配置", icon: HardDrive, desc: "本地与云端图床" },
  { id: "ocr", label: "OCR 配置", icon: ScanText, desc: "文字识别引擎参数" },
  { id: "email", label: "邮件配置", icon: Mail, desc: "提醒与通知发送参数" },
  { id: "cron", label: "定时任务", icon: Clock, desc: "自动检查与任务开关" },
] as const;

const DICTIONARY_CONFIG_KEYS = new Set([
  "inventory.category.options",
  "inventory.location.options",
  "inventory.unit.options",
]);

function parseDictionaryValues(rawValue: string): string[] {
  const source = rawValue.trim();
  const deduped = new Set<string>();

  if (source.startsWith("[")) {
    try {
      const parsed = JSON.parse(source) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === "string") {
            const next = item.trim();
            if (next) deduped.add(next);
          }
        }
      }
    } catch {
      // Fall through to delimiter parsing.
    }
  }

  if (deduped.size === 0 && source) {
    for (const segment of source.split(/[\n,，|]/)) {
      const next = segment.trim();
      if (next) deduped.add(next);
    }
  }

  return Array.from(deduped);
}

function serializeDictionaryValues(values: string[]): string {
  return JSON.stringify(values);
}

function isBooleanLike(item: ConfigItem, value: string): boolean {
  if (item.isSecret) return false;

  const normalized = value.trim().toLowerCase();
  if (["0", "1", "true", "false"].includes(normalized)) {
    return true;
  }

  return /(enabled?|allow|switch|toggle|flag)$/i.test(item.key);
}

function toBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function isNumericLike(item: ConfigItem, value: string): boolean {
  if (item.isSecret) return false;
  if (value.trim().includes(",") || value.trim().includes("\n")) return false;
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

export default function SystemConfigPage() {
  const router = useRouter();

  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [category, setCategory] = useState<ConfigCategory>("general");
  const [items, setItems] = useState<ConfigItem[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dictionaryInputs, setDictionaryInputs] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [generatingToken, setGeneratingToken] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function fetchCurrentUser() {
    setAuthLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/me");
      const payload = (await response.json()) as AuthMeResponse;

      if (!response.ok || !payload.data?.role) {
        setError(payload.error ?? "无法获取当前用户信息。");
        setIsAdmin(false);
        return;
      }

      setIsAdmin(payload.data.role === "admin");
      setTestEmailTo((prev) => prev || (payload.data?.email ?? "").trim());
    } catch {
      setError("网络异常，无法校验管理员权限。");
      setIsAdmin(false);
    } finally {
      setAuthLoading(false);
    }
  }

  async function fetchConfigs(nextCategory: ConfigCategory) {
    if (!isAdmin) return;

    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/config?category=${nextCategory}`,
      );
      const payload = (await response.json()) as ConfigListResponse;
      if (!response.ok || !payload.data) {
        setError(payload.error ?? "读取配置失败。");
        return;
      }

      setItems(payload.data);
      const nextDraft: Record<string, string> = {};
      for (const item of payload.data) {
        nextDraft[item.key] = item.value;
      }
      setDraft(nextDraft);
      setDictionaryInputs({});
    } catch {
      setError("网络异常，读取配置失败。");
    } finally {
      setLoading(false);
    }
  }

  function addDictionaryEntry(key: string) {
    const raw = dictionaryInputs[key] ?? "";
    const normalized = raw.trim();
    if (!normalized) return;

    setDraft((prev) => {
      const currentValues = parseDictionaryValues(prev[key] ?? "");
      if (!currentValues.includes(normalized)) {
        return {
          ...prev,
          [key]: serializeDictionaryValues([...currentValues, normalized]),
        };
      }
      return prev;
    });

    setDictionaryInputs((prev) => ({
      ...prev,
      [key]: "",
    }));
  }

  function removeDictionaryEntry(key: string, valueToDelete: string) {
    setDraft((prev) => {
      const currentValues = parseDictionaryValues(prev[key] ?? "");
      const nextValues = currentValues.filter((item) => item !== valueToDelete);
      return {
        ...prev,
        [key]: serializeDictionaryValues(nextValues),
      };
    });
  }

  useEffect(() => {
    void fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void fetchConfigs(category);
  }, [category, isAdmin]);

  const changedItems = useMemo(() => {
    return items
      .filter((item) => draft[item.key] !== undefined)
      .filter((item) => draft[item.key] !== item.value)
      .map((item) => ({ key: item.key, value: draft[item.key] }));
  }, [draft, items]);

  async function saveChanges() {
    if (!isAdmin) {
      setError("仅管理员可以修改系统配置。");
      return;
    }

    if (changedItems.length === 0) {
      setNotice("没有可保存的变更。");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: changedItems }),
      });
      const payload = (await response.json()) as ConfigListResponse;
      if (!response.ok || !payload.data) {
        setError(payload.error ?? "保存失败。");
        return;
      }

      setNotice("配置已保存。");
      await fetchConfigs(category);
    } catch {
      setError("网络异常，保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function sendTestEmail() {
    if (!isAdmin) {
      setError("仅管理员可以发送测试邮件。");
      return;
    }

    const receiver = testEmailTo.trim().toLowerCase();
    if (!receiver) {
      setError("请输入测试收件邮箱。");
      return;
    }

    const configOverrides = items
      .filter((item) => item.category === "email")
      .map((item) => ({
        key: item.key,
        value: draft[item.key] ?? "",
      }));

    setTestEmailSending(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/config/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: receiver,
          configOverrides,
        }),
      });

      const payload = (await response.json()) as TestEmailResponse;
      if (!response.ok || !payload.data) {
        setError(payload.error ?? "测试邮件发送失败。");
        return;
      }

      setNotice(
        payload.data.messageId
          ? `测试邮件已发送至 ${payload.data.to}（消息 ID: ${payload.data.messageId}）。`
          : `测试邮件已发送至 ${payload.data.to}。`,
      );
    } catch {
      setError("网络异常，测试邮件发送失败。");
    } finally {
      setTestEmailSending(false);
    }
  }

  function generateApiToken() {
    setGeneratingToken(true);
    setError("");
    setNotice("");

    try {
      // 生成一个安全的随机 token (32 字节 = 64 个十六进制字符)
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const token = Array.from(array, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");

      setDraft((prev) => ({
        ...prev,
        "openclaw.api_token": token,
      }));

      setNotice("已生成新的 API Token，请记得保存配置。");
    } catch {
      setError("生成 Token 失败。");
    } finally {
      setGeneratingToken(false);
    }
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-center">
          <Card className="w-full max-w-md border border-zinc-200 bg-white/80 shadow-sm">
            <Card.Content className="flex items-center justify-center gap-3 p-8 text-zinc-500">
              <Spinner size="sm" />
              正在校验访问权限...
            </Card.Content>
          </Card>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <Card className="border border-zinc-200 bg-white shadow-sm">
            <Card.Content className="space-y-4 p-6">
              <div className="flex items-center gap-2 text-zinc-900">
                <ShieldCheck className="h-5 w-5" />
                <h1 className="text-lg font-semibold">系统配置</h1>
              </div>
              <p className="text-sm leading-6 text-zinc-600">
                当前账号没有管理员权限，无法访问系统配置模块。
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" onPress={() => router.back()}>
                  返回上一页
                </Button>
                <Button onPress={() => router.push("/dashboard")}>
                  回到首页
                </Button>
              </div>
            </Card.Content>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 pb-10 text-zinc-900">
      <div className="border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-semibold">
                <SlidersHorizontal className="h-5 w-5" />
                系统配置中心
              </h1>
              <p className="text-xs text-zinc-500">
                仅管理员可编辑，修改后立即影响系统行为
              </p>
            </div>
          </div>

          <Button
            onPress={() => void saveChanges()}
            isPending={saving}
            isDisabled={changedItems.length === 0 || loading}
          >
            {saving
              ? "保存中..."
              : changedItems.length > 0
                ? `保存变更 (${changedItems.length})`
                : "无可保存变更"}
          </Button>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:px-8">
        <aside className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <h2 className="px-2 text-xs font-semibold tracking-wide text-zinc-500">
            配置分组
          </h2>

          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCategory(tab.id as ConfigCategory)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                category === tab.id
                  ? "border-zinc-300 bg-zinc-100/70 text-zinc-900"
                  : "border-transparent text-zinc-600 hover:bg-zinc-100/60"
              }`}
            >
              <div
                className={`rounded-lg p-1.5 ${
                  category === tab.id
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-500"
                }`}
              >
                <tab.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{tab.label}</p>
                <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                  {tab.desc}
                </p>
              </div>
            </button>
          ))}
        </aside>

        <section className="space-y-4">
          {error ? (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
              <ShieldCheck className="h-4 w-4" />
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              {notice}
            </div>
          ) : null}

          {category === "email" ? (
            <Card className="border border-zinc-200 bg-white shadow-sm">
              <Card.Content className="space-y-3 p-4 sm:p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                  <Send className="h-4 w-4" />
                  测试邮件发送
                </div>

                <p className="text-xs leading-5 text-zinc-500">
                  按当前页面中的邮件配置（包含未保存修改）发送测试邮件，用于快速校验配置是否可用。
                </p>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Input
                    type="email"
                    aria-label="测试收件邮箱"
                    placeholder="请输入测试收件邮箱"
                    value={testEmailTo}
                    onChange={(event) => setTestEmailTo(event.target.value)}
                    className="w-full"
                  />

                  <Button
                    variant="secondary"
                    onPress={() => void sendTestEmail()}
                    isPending={testEmailSending}
                    isDisabled={loading || testEmailTo.trim().length === 0}
                  >
                    {testEmailSending ? "发送中..." : "发送测试邮件"}
                  </Button>
                </div>
              </Card.Content>
            </Card>
          ) : null}

          {category === "openclaw" ? (
            <Card className="border border-zinc-200 bg-white shadow-sm">
              <Card.Content className="space-y-4 p-4 sm:p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                  <MessageSquare className="h-4 w-4" />
                  OpenClaw 集成配置
                </div>

                <div className="space-y-3 rounded-lg bg-zinc-50 p-4 text-xs leading-6 text-zinc-600">
                  <p className="font-medium text-zinc-900">
                    🤖 什么是 OpenClaw？
                  </p>
                  <p>
                    OpenClaw 是一个开源的个人 AI 助手，可以连接到
                    WhatsApp、Telegram、Slack 等多个消息平台。
                  </p>
                  <p className="font-medium text-zinc-900">
                    ✨ 集成后可以做什么？
                  </p>
                  <ul className="list-inside list-disc space-y-1 pl-2">
                    <li>对 OpenClaw 说"我用了一包纸"，自动减少库存</li>
                    <li>询问"家里还有多少牛奶"，即时查询库存</li>
                    <li>说"买了 5 个鸡蛋"，自动增加库存</li>
                  </ul>
                  <p className="font-medium text-zinc-900">📋 配置步骤：</p>
                  <ol className="list-inside list-decimal space-y-1 pl-2">
                    <li>点击下方"生成 API Token"按钮</li>
                    <li>保存配置</li>
                    <li>
                      将{" "}
                      <code className="rounded bg-zinc-200 px-1 py-0.5">
                        openclaw-skills/homebug-inventory/SKILL.md
                      </code>{" "}
                      文件复制到 OpenClaw 的 skills 目录
                    </li>
                    <li>配置 OpenClaw 环境变量（详见 Skill 文件说明）</li>
                  </ol>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    onPress={generateApiToken}
                    isPending={generatingToken}
                    isDisabled={loading}
                  >
                    {generatingToken ? "生成中..." : "生成 API Token"}
                  </Button>
                </div>
              </Card.Content>
            </Card>
          ) : null}

          <Card className="overflow-hidden border border-zinc-200 bg-white shadow-sm">
            <Card.Content className="divide-y divide-zinc-100 p-0">
              {loading ? (
                <div className="flex h-44 items-center justify-center gap-3 text-zinc-500">
                  <Spinner size="sm" />
                  正在加载配置项...
                </div>
              ) : items.length === 0 ? (
                <div className="px-6 py-14 text-center text-sm text-zinc-500">
                  当前分组暂无配置项。
                </div>
              ) : (
                items.map((item) => {
                  const currentValue = draft[item.key] ?? "";
                  const isDictionary = DICTIONARY_CONFIG_KEYS.has(item.key);
                  const isBoolean = isBooleanLike(item, currentValue);
                  const isNumeric = isNumericLike(item, currentValue);
                  const dictionaryValues = isDictionary
                    ? parseDictionaryValues(currentValue)
                    : [];

                  return (
                    <div
                      key={item.key}
                      className={`grid gap-4 p-4 transition-colors hover:bg-zinc-50 ${
                        isDictionary
                          ? "sm:grid-cols-1"
                          : "sm:grid-cols-[1.2fr_1fr] sm:items-center"
                      }`}
                    >
                      <div className="min-w-0">
                        <label
                          htmlFor={item.key}
                          className="block text-sm font-semibold text-zinc-900"
                        >
                          {item.key}
                        </label>

                        <p className="mt-1 text-xs leading-5 text-zinc-500">
                          {item.description || "暂无描述"}
                        </p>

                        {item.isSecret ? (
                          <span className="mt-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500">
                            敏感字段
                          </span>
                        ) : null}
                      </div>

                      <div
                        className={`sm:w-full ${
                          isDictionary
                            ? "sm:max-w-none"
                            : "sm:justify-self-end sm:max-w-md"
                        }`}
                      >
                        {isDictionary ? (
                          <div className="space-y-3">
                            <Input
                              aria-label={`${item.key} 选项输入`}
                              placeholder="输入后按回车添加"
                              value={dictionaryInputs[item.key] ?? ""}
                              onChange={(event) =>
                                setDictionaryInputs((prev) => ({
                                  ...prev,
                                  [item.key]: event.target.value,
                                }))
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  addDictionaryEntry(item.key);
                                }
                              }}
                              className="w-full"
                            />

                            {dictionaryValues.length > 0 ? (
                              <TagGroup
                                aria-label={`${item.key} 数据字典`}
                                onRemove={(keys) => {
                                  keys.forEach((key) => {
                                    removeDictionaryEntry(
                                      item.key,
                                      String(key),
                                    );
                                  });
                                }}
                                className="w-full"
                              >
                                <TagGroup.List className="flex flex-wrap gap-2">
                                  {dictionaryValues.map((value) => (
                                    <Tag
                                      key={`${item.key}-${value}`}
                                      id={value}
                                      textValue={value}
                                    >
                                      {value}
                                    </Tag>
                                  ))}
                                </TagGroup.List>
                              </TagGroup>
                            ) : (
                              <p className="text-xs text-zinc-500">
                                暂无选项，输入后按回车添加。
                              </p>
                            )}
                          </div>
                        ) : isBoolean ? (
                          <Switch
                            isSelected={toBoolean(currentValue)}
                            onChange={(selected) =>
                              setDraft((prev) => ({
                                ...prev,
                                [item.key]: selected ? "1" : "0",
                              }))
                            }
                          >
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                            <Switch.Content>
                              <Label className="text-sm text-zinc-700">
                                {toBoolean(currentValue) ? "已开启" : "已关闭"}
                              </Label>
                            </Switch.Content>
                          </Switch>
                        ) : isNumeric ? (
                          <NumberField
                            minValue={0}
                            value={Number(currentValue)}
                            onChange={(value) =>
                              setDraft((prev) => ({
                                ...prev,
                                [item.key]:
                                  value === undefined
                                    ? ""
                                    : String(Math.floor(value)),
                              }))
                            }
                            variant="secondary"
                          >
                            <NumberField.Group>
                              <NumberField.DecrementButton />
                              <NumberField.Input className="w-full" />
                              <NumberField.IncrementButton />
                            </NumberField.Group>
                          </NumberField>
                        ) : (
                          <Input
                            id={item.key}
                            type={item.isSecret ? "password" : "text"}
                            placeholder={
                              item.isSecret && item.hasValue
                                ? "***"
                                : "请输入参数值"
                            }
                            value={currentValue}
                            onChange={(event) =>
                              setDraft((prev) => ({
                                ...prev,
                                [item.key]: event.target.value,
                              }))
                            }
                            className="w-full"
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </Card.Content>
          </Card>
        </section>
      </div>
    </main>
  );
}
