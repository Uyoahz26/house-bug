"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, Button, Card, Input, Spinner } from "@heroui/react";
import {
  AlertTriangle,
  Clock,
  Package,
  PackageMinus,
  Search,
  ChevronRight,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  TrendingUp,
  Zap,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";
import { useRouter } from "next/navigation";

type ItemStatus = "active" | "consumed" | "discarded" | "expired";
type ExpiryFilterType = "all" | "warning" | "expired";

interface Item {
  id: string;
  name: string;
  brand: string | null;
  specification: string | null;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  purchaseDate: string | null;
  status: ItemStatus;
  categoryName: string | null;
  locationName: string | null;
  createdAt: string;
}

interface DashboardStats {
  totalActive: number;
  warningCount: number;
  expiredCount: number;
  lowStockCount: number;
}

interface AiAlert {
  type: string;
  level: "critical" | "warning" | "info";
  itemName: string;
  message: string;
  action: string;
}

interface AiHighlight {
  emoji: string;
  text: string;
}

interface AiInsights {
  healthScore: number;
  summary: string;
  alerts: AiAlert[];
  suggestions: string[];
  highlights: AiHighlight[];
  generatedAt: string;
  provider: string;
}

function getDaysUntil(dateText: string | null): number | null {
  if (!dateText) return null;
  const target = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((target.getTime() - now.getTime()) / msPerDay);
}

function getExpiryStatus(
  dateText: string | null,
): "safe" | "warning" | "expired" {
  const days = getDaysUntil(dateText);
  if (days === null) return "safe";
  if (days < 0) return "expired";
  if (days <= 30) return "warning";
  return "safe";
}

function HealthScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference - (score / 100) * circumference;

  const color =
    score >= 80
      ? "#22c55e"
      : score >= 60
        ? "#f59e0b"
        : score >= 40
          ? "#f97316"
          : "#ef4444";

  const label =
    score >= 80 ? "健康" : score >= 60 ? "良好" : score >= 40 ? "注意" : "告急";

  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <svg className="-rotate-90" width="96" height="96" viewBox="0 0 96 96">
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          className="text-zinc-100 dark:text-zinc-800"
        />
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeDasharray={circumference}
          strokeDashoffset={progress}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-xl font-bold leading-none text-zinc-900 dark:text-white">
          {score}
        </span>
        <span className="mt-0.5 text-[10px] font-medium" style={{ color }}>
          {label}
        </span>
      </div>
    </div>
  );
}

function AlertLevelIcon({ level }: { level: AiAlert["level"] }) {
  if (level === "critical")
    return <XCircle className="h-4 w-4 shrink-0 text-rose-500" />;
  if (level === "warning")
    return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />;
  return <Info className="h-4 w-4 shrink-0 text-blue-500" />;
}

function alertBg(level: AiAlert["level"]) {
  if (level === "critical")
    return "border-rose-200/60 bg-rose-50/60 dark:border-rose-900/30 dark:bg-rose-900/10";
  if (level === "warning")
    return "border-amber-200/60 bg-amber-50/60 dark:border-amber-900/30 dark:bg-amber-900/10";
  return "border-blue-200/60 bg-blue-50/60 dark:border-blue-900/30 dark:bg-blue-900/10";
}

function alertText(level: AiAlert["level"]) {
  if (level === "critical") return "text-rose-700 dark:text-rose-400";
  if (level === "warning") return "text-amber-700 dark:text-amber-400";
  return "text-blue-700 dark:text-blue-400";
}

function alertActionText(level: AiAlert["level"]) {
  if (level === "critical") return "text-rose-500 dark:text-rose-400";
  if (level === "warning") return "text-amber-500 dark:text-amber-400";
  return "text-blue-500 dark:text-blue-400";
}

function providerLabel(provider: string) {
  const map: Record<string, string> = {
    deepseek: "DeepSeek",
    doubao: "豆包",
    openai: "OpenAI",
    anthropic: "Claude",
    custom: "自定义",
  };
  return map[provider] ?? provider;
}

function getQQAvatar(email: string): string | null {
  const match = email.match(/^(\d+)@qq\.com$/i);
  if (match) {
    const qqNumber = match[1];
    return `https://q1.qlogo.cn/g?b=qq&nk=${qqNumber}&s=100`;
  }
  return null;
}

export default function DashboardPage() {
  const router = useRouter();

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<{
    id: string;
    username: string;
    email: string;
    role: string;
  } | null>(null);

  const [searchExpiry, setSearchExpiry] = useState("");
  const [filterExpiry, setFilterExpiry] = useState<ExpiryFilterType>("all");

  // AI 洞察状态
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);

  function isAuthExpiredStatus(status: number): boolean {
    return status === 401 || status === 403;
  }

  useEffect(() => {
    async function init() {
      try {
        const [authRes, itemsRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/items"),
        ]);

        if (
          isAuthExpiredStatus(authRes.status) ||
          isAuthExpiredStatus(itemsRes.status)
        ) {
          router.replace("/login?next=/dashboard");
          return;
        }

        if (authRes.ok) {
          const authData = (await authRes.json()) as {
            data?: {
              id: string;
              username: string;
              email: string;
              role: string;
            };
          };
          if (authData.data) setUser(authData.data);
        }

        if (!itemsRes.ok) {
          throw new Error("获取物资失败");
        }

        const data = (await itemsRes.json()) as { data?: Item[] };
        setItems(data.data ?? []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "请求失败";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void init();
  }, [router]);

  const fetchAiInsights = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/dashboard/ai-insights", { method: "POST" });
      if (res.status === 400) {
        const body = (await res.json()) as { code?: string };
        if (body.code === "AI_NOT_CONFIGURED") {
          setAiUnavailable(true);
          return;
        }
      }
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "AI 分析失败");
      }
      const body = (await res.json()) as { data: AiInsights };
      setAiInsights(body.data);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : "AI 分析失败，请稍后重试",
      );
    } finally {
      setAiLoading(false);
    }
  }, []);

  const activeItems = useMemo(
    () => items.filter((item) => item.status === "active"),
    [items],
  );

  const stats = useMemo<DashboardStats>(() => {
    let warningCount = 0;
    let expiredCount = 0;
    let lowStockCount = 0;

    activeItems.forEach((item) => {
      const state = getExpiryStatus(item.expiryDate);
      if (state === "expired") expiredCount += 1;
      if (state === "warning") warningCount += 1;
      if (item.quantity <= 1) lowStockCount += 1;
    });

    return {
      totalActive: activeItems.length,
      warningCount,
      expiredCount,
      lowStockCount,
    };
  }, [activeItems]);

  const expiryAlertItems = useMemo(() => {
    const keyword = searchExpiry.trim().toLowerCase();

    return activeItems
      .filter((item) => {
        const matchesSearch =
          !keyword ||
          item.name.toLowerCase().includes(keyword) ||
          (item.brand?.toLowerCase().includes(keyword) ?? false) ||
          (item.categoryName?.toLowerCase().includes(keyword) ?? false) ||
          (item.locationName?.toLowerCase().includes(keyword) ?? false);

        if (!matchesSearch) return false;

        const status = getExpiryStatus(item.expiryDate);
        if (filterExpiry === "warning") return status === "warning";
        if (filterExpiry === "expired") return status === "expired";
        return status !== "safe";
      })
      .sort(
        (a, b) =>
          (getDaysUntil(a.expiryDate) ?? 9999) -
          (getDaysUntil(b.expiryDate) ?? 9999),
      )
      .slice(0, 8);
  }, [activeItems, filterExpiry, searchExpiry]);

  const lowStockAlertItems = useMemo(() => {
    return activeItems
      .filter((item) => item.quantity <= 1)
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 8);
  }, [activeItems]);

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4 py-8">
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <Spinner size="lg" color="current" />
          <p className="text-sm tracking-tight text-zinc-400">
            正在分析库存数据...
          </p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md border border-rose-200/50 bg-white/60 shadow-sm backdrop-blur-xl dark:border-rose-900/40 dark:bg-zinc-950/60">
          <Card.Content className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100/50 text-rose-500 dark:bg-rose-500/20">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="text-[14px] text-zinc-600 dark:text-zinc-400">
              {error}
            </p>
            <Button
              onPress={() => window.location.reload()}
              className="mt-2 bg-zinc-900 text-[13px] font-medium text-white shadow-md transition-transform hover:scale-105 active:scale-95 dark:bg-white dark:text-black"
            >
              尝试修复并重新加载
            </Button>
          </Card.Content>
        </Card>
      </main>
    );
  }

  return (
    <main className="px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
      <section className="mx-auto max-w-6xl space-y-8">
        {/* 页头 */}
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-3">
            {user?.email && (
              <div className="relative">
                <Avatar size="lg">
                  {getQQAvatar(user.email) ? (
                    <Avatar.Image
                      alt={user.username}
                      src={getQQAvatar(user.email)!}
                    />
                  ) : null}
                  <Avatar.Fallback>
                    {user.username.slice(0, 1).toUpperCase()}
                  </Avatar.Fallback>
                </Avatar>
                <span className="absolute right-0 bottom-0 size-3 rounded-full bg-green-500 ring-2 ring-background" />
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
                你好, {user?.username || "admin"} 👋
              </h2>
              <p className="mt-1.5 text-[14px] text-zinc-500 dark:text-zinc-400 sm:text-[15px]">
                全局囤货概览与补货预警，实时守护属鼠的物资。
              </p>
            </div>
          </div>
          <Button
            onPress={() => router.push("/items")}
            className="h-9 w-full bg-zinc-900 px-4 text-xs font-medium text-white shadow-lg shadow-zinc-900/10 transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] dark:bg-white dark:text-zinc-900 sm:w-auto sm:text-sm"
          >
            查看所有物资
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </header>

        {/* 顶部四联统计卡片 */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 md:gap-5">
          <Card className="group relative overflow-hidden border border-zinc-200/80 bg-gradient-to-br from-white to-zinc-50/50 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:border-zinc-800/80 dark:from-zinc-900/90 dark:to-zinc-950/30">
            <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-zinc-100/50 transition-transform duration-500 group-hover:scale-125 dark:bg-zinc-800/40" />
            <Card.Content className="relative flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="pl-2 text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  {stats.totalActive}
                </p>
                <div className="flex items-center">
                  <p className="mr-2 text-[14px] font-medium text-zinc-500 dark:text-zinc-400">
                    在库物资
                  </p>
                  <Package className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                </div>
              </div>
            </Card.Content>
          </Card>

          <Card className="group relative overflow-hidden border border-blue-200/60 bg-gradient-to-br from-blue-50/50 to-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:border-blue-900/40 dark:from-blue-900/10 dark:to-zinc-900/40">
            <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-blue-100/40 transition-transform duration-500 group-hover:scale-125 dark:bg-blue-900/20" />
            <Card.Content className="relative flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="pl-2 text-4xl font-bold tracking-tight text-blue-950 dark:text-blue-100">
                  {stats.lowStockCount}
                </p>
                <div className="flex items-center">
                  <p className="mr-2 text-[14px] font-medium text-blue-600 dark:text-blue-500">
                    库存告急
                  </p>
                  <PackageMinus className="h-5 w-5 text-blue-600 dark:text-blue-500" />
                </div>
              </div>
            </Card.Content>
          </Card>

          <Card className="group relative overflow-hidden border border-amber-200/60 bg-gradient-to-br from-amber-50/50 to-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:border-amber-900/40 dark:from-amber-900/10 dark:to-zinc-900/40">
            <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-amber-100/40 transition-transform duration-500 group-hover:scale-125 dark:bg-amber-900/20" />
            <Card.Content className="relative flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="pl-2 text-4xl font-bold tracking-tight text-amber-950 dark:text-amber-100">
                  {stats.warningCount}
                </p>
                <div className="flex items-center">
                  <p className="mr-2 text-[14px] font-medium text-amber-600 dark:text-amber-500">
                    临期预警
                  </p>
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-500" />
                </div>
              </div>
            </Card.Content>
          </Card>

          <Card className="group relative overflow-hidden border border-rose-200/60 bg-gradient-to-br from-rose-50/50 to-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:border-rose-900/40 dark:from-rose-900/10 dark:to-zinc-900/40">
            <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-rose-100/40 transition-transform duration-500 group-hover:scale-125 dark:bg-rose-900/20" />
            <Card.Content className="relative flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="pl-2 text-4xl font-bold tracking-tight text-rose-950 dark:text-rose-100">
                  {stats.expiredCount}
                </p>
                <div className="flex items-center">
                  <p className="mr-2 text-[14px] font-medium text-rose-600 dark:text-rose-500">
                    已过期
                  </p>
                  <ShieldAlert className="h-5 w-5 text-rose-600 dark:text-rose-500" />
                </div>
              </div>
            </Card.Content>
          </Card>
        </div>

        {/* AI 智能洞察板块 */}
        <div className="relative overflow-hidden rounded-2xl border border-violet-200/60 bg-gradient-to-br from-violet-50/80 via-white to-indigo-50/60 shadow-sm dark:border-violet-900/30 dark:from-violet-950/20 dark:via-zinc-900/80 dark:to-indigo-950/20">
          {/* 背景装饰 */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-100/40 blur-3xl dark:bg-violet-900/20" />
          <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-indigo-100/40 blur-2xl dark:bg-indigo-900/20" />

          <div className="relative p-4 sm:p-4">
            {/* 板块标题行 */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-violet-500/20">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">
                    AI 分析
                  </h2>
                  {aiInsights && (
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      由 {providerLabel(aiInsights.provider)} 分析 ·{" "}
                      {new Date(aiInsights.generatedAt).toLocaleTimeString(
                        "zh-CN",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </p>
                  )}
                </div>
              </div>

              <Button
                onPress={fetchAiInsights}
                isDisabled={aiLoading || aiUnavailable}
                size="sm"
                className="h-8 gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 px-3 text-[12px] font-medium text-white shadow-md shadow-violet-500/20 transition-all hover:scale-[1.03] hover:shadow-lg active:scale-[0.97] disabled:opacity-50"
              >
                {aiLoading ? (
                  <Spinner size="sm" color="current" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {aiInsights ? "重新分析" : "开始分析"}
              </Button>
            </div>

            {/* AI 未配置提示 */}
            {aiUnavailable && (
              <div className="flex items-center gap-3 rounded-xl border border-zinc-200/60 bg-white/60 p-4 dark:border-zinc-700/40 dark:bg-zinc-800/40">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-700">
                  <Zap className="h-4 w-4 text-zinc-400" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                    AI 功能尚未配置
                  </p>
                  <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                    前往{" "}
                    <button
                      onClick={() => router.push("/settings/system")}
                      className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
                    >
                      系统设置
                    </button>{" "}
                    配置 AI 提供商后即可使用智能分析功能
                  </p>
                </div>
              </div>
            )}

            {/* AI 加载中 */}
            {aiLoading && !aiInsights && (
              <div className="flex flex-col items-center justify-center gap-3 py-10">
                <div className="relative">
                  <div className="h-12 w-12 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600 dark:border-violet-800 dark:border-t-violet-400" />
                  <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-violet-500" />
                </div>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                  AI 正在分析你的库存数据...
                </p>
              </div>
            )}

            {/* AI 错误 */}
            {aiError && !aiLoading && (
              <div className="flex items-center gap-3 rounded-xl border border-rose-200/60 bg-rose-50/60 p-4 dark:border-rose-900/30 dark:bg-rose-900/10">
                <XCircle className="h-5 w-5 shrink-0 text-rose-500" />
                <p className="text-[13px] text-rose-700 dark:text-rose-400">
                  {aiError}
                </p>
              </div>
            )}

            {/* 未触发时的引导 */}
            {!aiInsights && !aiLoading && !aiError && !aiUnavailable && (
              <div className="flex flex-col items-center gap-4 py-2 text-center sm:flex-row sm:text-left">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30">
                  <Sparkles className="h-7 w-7 text-violet-500" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-zinc-800 dark:text-zinc-200">
                    让 AI 帮你把脉库存健康
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    点击「开始分析」，AI 将检查哪些物资快过期、哪些库存不足，
                    <br className="hidden sm:block" />
                    并给出个性化的补货建议和库存健康评分。
                  </p>
                </div>
              </div>
            )}

            {/* AI 分析结果 */}
            {aiInsights && !aiLoading && (
              <div className="space-y-5">
                {/* 健康评分 + 总结 */}
                <div className="flex items-center gap-5 rounded-xl border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur-sm dark:border-zinc-700/40 dark:bg-zinc-800/40">
                  <HealthScoreRing score={aiInsights.healthScore} />
                  <div className="flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                      库存健康评分
                    </p>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                      {aiInsights.summary}
                    </p>
                    {aiInsights.highlights.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {aiInsights.highlights.map((h, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/20 dark:text-emerald-400"
                          >
                            {h.emoji} {h.text}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 预警列表 + 建议 两列 */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* 左：AI 预警 */}
                  {aiInsights.alerts.length > 0 && (
                    <div className="space-y-2">
                      <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        智能预警
                      </p>
                      <div className="space-y-2">
                        {aiInsights.alerts.map((alert, i) => (
                          <div
                            key={i}
                            className={`flex items-start gap-3 rounded-xl border p-3 ${alertBg(alert.level)}`}
                          >
                            <AlertLevelIcon level={alert.level} />
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-[13px] font-semibold ${alertText(alert.level)}`}
                              >
                                {alert.itemName}
                              </p>
                              <p className="mt-0.5 text-[12px] text-zinc-600 dark:text-zinc-400">
                                {alert.message}
                              </p>
                              {alert.action && (
                                <p
                                  className={`mt-1 text-[11px] font-medium ${alertActionText(alert.level)}`}
                                >
                                  → {alert.action}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 右：AI 建议 */}
                  {aiInsights.suggestions.length > 0 && (
                    <div className="space-y-2">
                      <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                        <TrendingUp className="h-3.5 w-3.5" />
                        智能建议
                      </p>
                      <div className="space-y-2">
                        {aiInsights.suggestions.map((suggestion, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-3 rounded-xl border border-violet-200/50 bg-violet-50/50 p-3 dark:border-violet-900/20 dark:bg-violet-900/10"
                          >
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                            <p className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                              {suggestion}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 双列功能核心关注区 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
          {/* 左列：保质期告急 */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="flex items-center gap-2 text-[16px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100/70 text-amber-600 dark:bg-amber-500/20">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                保质期管理
              </h2>
            </div>

            <Card className="p-0 flex flex-col overflow-hidden border border-zinc-200/50 bg-white/60 shadow-sm backdrop-blur-xl dark:border-zinc-800/50 dark:bg-zinc-900/40">
              <div className="flex items-center gap-3 border-b border-zinc-200/40 bg-zinc-50/30 p-3 dark:border-zinc-800/40 dark:bg-zinc-900/20 sm:p-4">
                <div className="relative flex-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
                    <Search className="h-3.5 w-3.5 text-zinc-400" />
                  </div>
                  <Input
                    aria-label="搜索保质期预警物资"
                    value={searchExpiry}
                    onChange={(event) => setSearchExpiry(event.target.value)}
                    placeholder="在预警列表中搜索..."
                    className="h-8 w-full rounded-md border border-zinc-200/60 bg-white pl-8 text-[12px] shadow-sm transition-all focus:border-amber-400 focus:ring-1 focus:ring-amber-400 dark:border-zinc-700/60 dark:bg-zinc-900 dark:focus:border-amber-500/50"
                  />
                </div>
                <div className="flex shrink-0 items-center justify-end gap-1 rounded-lg bg-zinc-100/50 p-1 dark:bg-zinc-800/50">
                  {(["all", "warning", "expired"] as ExpiryFilterType[]).map(
                    (f) => (
                      <button
                        key={f}
                        onClick={() => setFilterExpiry(f)}
                        className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-all ${
                          filterExpiry === f
                            ? "bg-white text-amber-600 shadow-sm dark:bg-zinc-700 dark:text-amber-400"
                            : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                        }`}
                      >
                        {f === "all"
                          ? "全部"
                          : f === "warning"
                            ? "临期"
                            : "已过期"}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <Card.Content className="flex-1 p-0">
                {expiryAlertItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20">
                      <Clock className="h-5 w-5 text-emerald-500/70" />
                    </div>
                    <p className="text-[13px] font-medium text-zinc-600 dark:text-zinc-300">
                      暂时没有任何临期或过期的囤囤货
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      囤囤鼠的囤囤货非常健康👍
                    </p>
                  </div>
                ) : (
                  <ul className="flex max-h-[380px] flex-col divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800/40">
                    {expiryAlertItems.map((item) => {
                      const days = getDaysUntil(item.expiryDate);
                      const state = getExpiryStatus(item.expiryDate);

                      return (
                        <li key={item.id} className="group">
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 sm:px-5"
                            onClick={() => router.push("/items")}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14px] font-medium text-zinc-900 transition-colors group-hover:text-amber-600 dark:text-zinc-100 dark:group-hover:text-amber-400">
                                {item.name}
                              </p>
                              <p className="mt-1 flex items-center gap-1.5 truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                                {item.categoryName || "未分类"}
                                <span className="opacity-40 text-[10px]">
                                  |
                                </span>
                                库存 {item.quantity} {item.unit}
                              </p>
                            </div>
                            <div className="shrink-0">
                              {state === "expired" ? (
                                <span className="inline-flex items-center rounded-md border border-rose-200/50 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-600 shadow-sm dark:border-rose-900/30 dark:bg-rose-900/20 dark:text-rose-400">
                                  已过期 {Math.abs(days ?? 0)} 天
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-md border border-amber-200/50 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-600 shadow-sm dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-400">
                                  极少 {days ?? "-"} 天
                                </span>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card.Content>
            </Card>
          </div>

          {/* 右列：需要采购清单 */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="flex items-center gap-2 text-[16px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100/70 text-blue-600 dark:bg-blue-500/20">
                  <PackageMinus className="h-4 w-4" />
                </span>
                补货采购清单
              </h2>
            </div>

            <Card className="p-0 flex flex-col overflow-hidden border border-zinc-200/50 bg-white/60 shadow-sm backdrop-blur-xl dark:border-zinc-800/50 dark:bg-zinc-900/40">
              <div className="border-b border-zinc-200/40 bg-blue-50/20 p-3 dark:border-zinc-800/40 dark:bg-blue-900/10 sm:p-4 sm:pb-3.5">
                <p className="flex items-center gap-1.5 text-[12px] font-medium tracking-wide text-blue-800/60 dark:text-blue-300">
                  <span className="relative flex h-2 w-2">
                    {lowStockAlertItems.length > 0 && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                    )}
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
                  </span>
                  自动追踪库存 ≤ 1 的物资记录
                </p>
              </div>
              <Card.Content className="flex-1 p-0">
                {lowStockAlertItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/20">
                      <Package className="h-5 w-5 text-blue-400/70" />
                    </div>
                    <p className="text-[13px] font-medium text-zinc-600 dark:text-zinc-300">
                      库存充足，不要再当囤囤鼠了
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      当前没有短缺风险
                    </p>
                  </div>
                ) : (
                  <ul className="flex max-h-[380px] flex-col divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800/40">
                    {lowStockAlertItems.map((item) => (
                      <li key={item.id} className="group">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 sm:px-5"
                          onClick={() => router.push("/items")}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-medium text-zinc-900 transition-colors group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400">
                              {item.name}
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                              {item.categoryName || "未分类"}
                              {item.brand && (
                                <>
                                  <span className="opacity-40 text-[10px]">
                                    |
                                  </span>
                                  <span className="truncate">{item.brand}</span>
                                </>
                              )}
                            </p>
                          </div>
                          <div className="shrink-0">
                            {item.quantity === 0 ? (
                              <span className="inline-flex items-center rounded-md border border-rose-200/50 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-600 shadow-sm dark:border-rose-900/30 dark:bg-rose-900/20 dark:text-rose-400">
                                已耗尽 (0)
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md border border-blue-200/50 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-600 shadow-sm dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-400">
                                不足 (1)
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card.Content>
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}
